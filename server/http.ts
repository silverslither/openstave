import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import * as util from "node:util";
import * as zlib from "node:zlib";

import { HTTP_PORT, MAX_BODY_SIZE_BYTES, TCP_ADDRESS, TCP_PORT } from "../env.ts";
import { activeRaces, inactiveRaces, Race, RaceData } from "./race.ts";
import { LowSecurityHasher } from "./security.ts";
import { Tournament, tournaments } from "./tournament.ts";
import { tryAsync, ValidationError } from "./wrapper.ts";

const zlib_promises_gzip = util.promisify(zlib.gzip);

const MIME_TYPES: Record<string, string> = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "text/javascript",
    ".png": "image/png",
    ".lua": "application/octet-stream",
    ".opus": "audio/ogg",
    ".woff2": "font/woff2",
};

const WEB_PATH = path.join(import.meta.dirname, "..", "web");

const validateKey = async (key: string) => {
    try {
        const keys = (await fs.promises.readFile("key", "utf8")).trim().split(/\r?\n/);
        return keys.includes(key);
    } catch {
        await fs.promises.writeFile("key", crypto.randomBytes(24).toString("base64"), "utf8");
    }
};

const queryCache: Map<string, Buffer> = new Map();
const playerTokens: Map<string, string> = new Map();

const server = http.createServer(tryAsync(async (request: http.IncomingMessage, response: http.ServerResponse) => {
    let url: string;
    try {
        url = decodeURI(request.url ?? "%");
    } catch {
        response.writeHead(400).end();
        return;
    }

    if (request.method === "GET") {
        const query = url.split("?");
        const parts = query[0].split("/").filter(v => v !== "");

        let file: string;
        if (parts.length === 0) {
            file = path.join(WEB_PATH, "root", "index.html");
        } else if (parts.length === 1) {
            const race = activeRaces.get(parts[0]) ?? inactiveRaces.get(parts[0]);
            if (race != null)
                file = path.join(WEB_PATH, race.game.split("_")[0], "index.html");
        } else if (parts.length === 2) {
            if (parts[0] === "dashboard" && (activeRaces.has(parts[1]) || inactiveRaces.has(parts[1]))) {
                file = path.join(WEB_PATH, "dashboard", "race", "index.html");
            } else if (parts[0] === "tournament" && tournaments.has(parts[1])) {
                file = path.join(WEB_PATH, "tournament", "index.html");
            }
        } else if (parts.length === 3 && parts[0] === "dashboard" && parts[1] === "tournament" && tournaments.has(parts[2])) {
            file = path.join(WEB_PATH, "dashboard", "tournament", "index.html");
        }

        file ??= path.join(WEB_PATH, ...parts);

        try {
            file = await fs.promises.realpath(file);
            if (!file.startsWith(WEB_PATH + path.sep) || !Object.hasOwn(MIME_TYPES, path.extname(file).toLowerCase()) || !(await fs.promises.stat(file)).isFile()) {
                response.writeHead(404).end();
                return;
            }
        } catch {
            response.writeHead(404).end();
            return;
        }

        const prepend = queryCache.get(query[1]) ?? Buffer.allocUnsafe(0);

        const ext = path.extname(file).toLowerCase();
        const mime = MIME_TYPES[ext];

        const data = Buffer.concat([prepend, await fs.promises.readFile(file)]);
        response.writeHead(200, {
            "Content-Length": data.length,
            "Content-Type": mime,
        }).end(data);

        return;
    }

    if (request.method !== "POST") {
        response.writeHead(404).end();
        return;
    }

    const chunks: Buffer[] = [];
    let bytesReceived = 0;
    request.on("data", (data) => {
        if (bytesReceived > MAX_BODY_SIZE_BYTES)
            return;

        chunks.push(data);
        bytesReceived += data.length;

        if (bytesReceived > MAX_BODY_SIZE_BYTES)
            response.writeHead(413).end();
    });

    request.on("end", tryAsync(async () => {
        if (bytesReceived > MAX_BODY_SIZE_BYTES)
            return;

        let requestBody: Record<string, unknown>;
        try {
            const body = Buffer.concat(chunks).toString();
            requestBody = body.length === 0 ? {} : JSON.parse(body);
        } catch {
            response.writeHead(400).end("Invalid input.");
            return;
        }

        if (requestBody == null) {
            response.writeHead(400).end("Invalid input.");
            return;
        }

        const parts = url.split("/").filter(v => v !== "");

        if (parts.length === 0 && (requestBody.create === "race" || requestBody.create === "tournament")) { // create
            const key = requestBody.key;
            const password = requestBody.password;
            const id = requestBody.id;
            const game = requestBody.game;
            const type = requestBody.type;
            const arg = requestBody.arg;
            const players = requestBody.players;

            if (typeof key !== "string" ||
                typeof password !== "string" ||
                typeof id !== "string" ||
                typeof game !== "string" ||
                !Array.isArray(players) ||
                players.some(v => typeof v !== "string")
                || (requestBody.create === "tournament" &&
                    (typeof type !== "number" ||
                    (arg !== undefined && typeof arg !== "number"))))
            {
                response.writeHead(400).end("Invalid input.");
                return;
            }

            if (!await validateKey(key)) {
                response.writeHead(400).end("The entered key is incorrect.");
                return;
            }

            try {
                const created = requestBody.create === "race" ?
                    new Race(password, id, game, players) :
                    new Tournament(password, id, game, players, type as number, arg as (number | undefined));

                console.log(`created ${requestBody.create} ${created.id} with key ${key}`);
                response.writeHead(200).end(created.id);
            } catch (e) {
                if (!(e instanceof ValidationError))
                    throw e;
                response.writeHead(e.status).end(e.message);
            }

            return;
        }

        if (parts.length === 2 && parts[0] === "auth") { // get race authentication
            const id = parts[1];
            const race = activeRaces.get(id);

            if (race == null) {
                response.writeHead(404).end();
                return;
            }

            if (typeof requestBody.password !== "string") {
                response.writeHead(400).end("Invalid input.");
                return;
            }

            switch (LowSecurityHasher.verify(requestBody.password, race.hash)) {
            case 1:
                response.writeHead(401).end();
                return;
            case 2:
                response.writeHead(429).end();
                return;
            }

            const auth: string[][] = [];
            for (const player of race.players) {
                let token = playerTokens.get(player.username);
                if (token == null) {
                    do {
                        token = crypto.randomBytes(24).toString("base64url");
                    } while (queryCache.has(token));

                    queryCache.set(token, Buffer.from(player.getAuthString(TCP_ADDRESS, TCP_PORT), "utf8"));
                    playerTokens.set(player.username, token);
                }

                auth.push([
                    player.username,
                    `lua/${race.game.split("_")[0]}.lua?${token}`,
                ]);
            }

            response.writeHead(200).end(JSON.stringify(auth));
            return;
        }

        if (parts.length === 2 && parts[0] === "exec") { // exec command on race
            const id = parts[1];
            const race = activeRaces.get(id) ?? inactiveRaces.get(id);

            if (race == null) {
                response.writeHead(404).end();
                return;
            }

            if (race instanceof RaceData && race.static == null) {
                response.writeHead(503).end();
                return;
            }

            if (typeof requestBody.password !== "string") {
                response.writeHead(400).end("Invalid input.");
                return;
            }

            switch (LowSecurityHasher.verify(requestBody.password, race.hash)) {
            case 1:
                response.writeHead(401).end();
                return;
            case 2:
                response.writeHead(429).end();
                return;
            }

            const name = requestBody.name;
            const command = requestBody.command;
            const args = requestBody.args;

            if (typeof name !== "string" || typeof command !== "string" || !Array.isArray(args) || args.some(v => typeof v !== "string")) {
                response.writeHead(400).end("Invalid input.");
                return;
            }

            try {
                await race.exec(name, command, args);
                response.writeHead(200).end();
            } catch (e) {
                if (!(e instanceof ValidationError))
                    throw e;
                response.writeHead(e.status).end(e.message);
            }

            return;
        }

        if (parts.length === 3 && parts[0] === "exec" && parts[1] === "tournament") { // exec command on tournament
            const id = parts[2];
            const tournament = tournaments.get(id);

            if (tournament == null) {
                response.writeHead(404).end();
                return;
            }

            if (typeof requestBody.password !== "string") {
                response.writeHead(400).end("Invalid input.");
                return;
            }

            switch (LowSecurityHasher.verify(requestBody.password, tournament.hash)) {
            case 1:
                response.writeHead(401).end();
                return;
            case 2:
                response.writeHead(429).end();
                return;
            }

            const command = requestBody.command;
            const args = requestBody.args;

            if (typeof command !== "string" || !Array.isArray(args) || args.some(v => typeof v !== "string")) {
                response.writeHead(400).end("Invalid input.");
                return;
            }

            try {
                tournament.exec(command, args);
                response.writeHead(200).end();
            } catch (e) {
                if (!(e instanceof ValidationError))
                    throw e;
                response.writeHead(e.status).end(e.message);
            }

            return;
        }

        if (parts.length === 2 && parts[0] === "tournament") { // get tournament data
            const id = parts[1];
            const tournament = tournaments.get(id);

            if (tournament == null) {
                response.writeHead(404).end();
                return;
            }

            const data = tournament.getData();
            response.writeHead(200).end(JSON.stringify(data));

            return;
        }

        // get race data
        const start = requestBody.start;
        const length = requestBody.length;

        if (typeof start !== "number" || typeof length !== "number") {
            response.writeHead(400).end("Invalid input.");
            return;
        }

        const id = parts[0];
        const race = activeRaces.get(id) ?? inactiveRaces.get(id);

        if (race == null) {
            response.writeHead(404).end();
            return;
        }

        let responseBody: Awaited<ReturnType<Race["getData"]>> | null;
        try {
            responseBody = await race.getData(start, length);
        } catch (e) {
            if (!(e instanceof ValidationError))
                throw e;
            response.writeHead(e.status).end(e.message);
            return;
        }

        if (responseBody == null) {
            response.writeHead(503).end();
            return;
        }

        const data = await zlib_promises_gzip(JSON.stringify(responseBody), { level: 1 });
        response.writeHead(200, {
            "Content-Encoding": "gzip",
            "Content-Length": data.length,
            "Content-Type": "application/json",
        }).end(data);
    }, () => response.writeHead(500).end()));
}, args => args[1].writeHead(500).end()));

server.listen(HTTP_PORT, "0.0.0.0", () => {
    console.log("HTTP server running on port", HTTP_PORT);
});
