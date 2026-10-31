import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import * as util from "node:util";
import * as zlib from "node:zlib";

import { HTTP_PORT, MAX_ACTIVE_RACES, MAX_BODY_SIZE_BYTES, TCP_ADDRESS, TCP_PORT } from "../env.ts";
import { activeRaces, inactiveRaces, Race, RaceData } from "./race.ts";
import { LowSecurityHasher } from "./security.ts";
import { tryAsync } from "./wrapper.ts";
import { Tournament, tournaments } from "./tournament.ts";

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

const MAX_REQUEST_BUFFER_FRAMES = 240;

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
            requestBody = JSON.parse(Buffer.concat(chunks).toString());
        } catch {
            requestBody = {};
        }

        if (requestBody == null) {
            response.writeHead(400).end();
            return;
        }

        const parts = url.split("/").filter(v => v !== "");

        if (parts.length === 0 && requestBody.create === "race") { // race creation
            const key = requestBody.key;
            const password = requestBody.password;
            const id = requestBody.id;
            const game = requestBody.game;
            const rawPlayers = requestBody.players;

            if (!await validateKey(key as string)) {
                response.writeHead(400).end("The entered key is incorrect.");
                return;
            }

            if (typeof password !== "string" || password.length < 8 || password.length > 64) {
                response.writeHead(400).end("Dashboard password must be at least 8 characters long.");
                return;
            }

            if (typeof id !== "string" || typeof game !== "string" || !Array.isArray(rawPlayers) || rawPlayers.length < 1 || rawPlayers.length > 16 || rawPlayers.some(v => typeof v !== "string")) {
                response.writeHead(400).end("You must fill out all form elements.");
                return;
            }

            const players = (rawPlayers as string[]).map(v => v.replace(/[^0-9A-Za-z_-]/g, ""));
            if (new Set(players).size !== players.length) {
                response.writeHead(400).end("All players must have unique names.");
                return;
            }

            if (activeRaces.size >= MAX_ACTIVE_RACES) {
                response.writeHead(418).end("The server is currently busy. Try again later.");
                return;
            }

            const race = new Race(password, id, game, players);
            if (!activeRaces.has(race.id)) {
                response.writeHead(400).end("Check that all inputs are valid and contain only basic characters.");
                return;
            }

            console.log(`created race ${race.id} with key ${key}`);
            response.writeHead(200).end(race.id);

            return;
        }

        if (parts.length === 0 && requestBody.create === "tournament") { // tournament creation
            const key = requestBody.key;
            const password = requestBody.password;
            const id = requestBody.id;
            const game = requestBody.game;
            const type = requestBody.type;
            const arg = requestBody.arg ?? undefined;
            const rawPlayers = requestBody.players;

            if (!await validateKey(key as string)) {
                response.writeHead(400).end("The entered key is incorrect.");
                return;
            }

            if (typeof password !== "string" || password.length < 8 || password.length > 64) {
                response.writeHead(400).end("Dashboard password must be at least 8 characters long.");
                return;
            }

            if (typeof id !== "string" || typeof game !== "string" || !Array.isArray(rawPlayers) || rawPlayers.length < 1 || rawPlayers.length > 16 || rawPlayers.some(v => typeof v !== "string") || typeof type !== "number" || (arg != null && typeof arg !== "number")) {
                response.writeHead(400).end("You must fill out all form elements.");
                return;
            }

            const players = (rawPlayers as string[]).map(v => v.replace(/[^0-9A-Za-z_-]/g, ""));
            if (new Set(players).size !== players.length) {
                response.writeHead(400).end("All players must have unique names.");
                return;
            }

            if (activeRaces.size >= MAX_ACTIVE_RACES) {
                response.writeHead(418).end("The server is currently busy. Try again later.");
                return;
            }

            const tournament = new Tournament(password, id, game, players, type, arg);
            if (!tournaments.has(tournament.id)) {
                response.writeHead(400).end("Check that all inputs are valid and contain only basic characters.");
                return;
            }

            console.log(`created tournament ${tournament.id} with key ${key}`);
            response.writeHead(200).end(tournament.id);

            return;
        }

        if (parts.length === 2 && parts[0] === "auth") { // get race authentication
            const id = parts[1];
            const race = activeRaces.get(id);

            if (race == null) {
                response.writeHead(404).end();
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
                response.writeHead(400).end("Invalid request.");
                return;
            }

            let status = 500, message = "";
            try {
                [status, message] = await race.exec(name, command, args);
            } catch (e) {
                console.error(e);
            } finally {
                response.writeHead(status).end(message);
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

            switch (LowSecurityHasher.verify(requestBody.password, tournament.hash)) {
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
                response.writeHead(400).end("Invalid request.");
                return;
            }

            let status = 500, message = "";
            try {
                [status, message] = tournament.exec(command, args);
            } catch (e) {
                console.error(e);
            } finally {
                response.writeHead(status).end(message);
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

        if (typeof start !== "number" || typeof length !== "number" || !Number.isSafeInteger(start) || !Number.isSafeInteger(length) || start < 0 || length < 0 || length > MAX_REQUEST_BUFFER_FRAMES || !Number.isSafeInteger(start + length)) {
            response.writeHead(400).end();
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
            console.error(e);
            response.writeHead(500).end();
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
