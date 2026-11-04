import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import * as util from "node:util";
import * as zlib from "node:zlib";

import { MAX_BODY_SIZE_BYTES, TCP_ADDRESS, TCP_PORT } from "../env.ts";
import { activeRaces, inactiveRaces, Race, RaceData } from "./race.ts";
import { LowSecurityHasher, VerificationResult } from "./security.ts";
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

const HTTP_RESPONSE_MESSAGES: Record<number, string> = {
    200: "The requested operation completed successfully.",
    400: "Invalid input.",
    401: "The entered password is incorrect.",
    404: "The requested resource was not found.",
    413: "Request body exceeds the maximum allowed size.",
    429: "Password guessing is limited to one try per second.",
    500: "An unexpected server error occurred.",
    503: "The server is currently busy. Try again later.",
};

const PASSWORD_VERIFICATION_STATUS: Record<VerificationResult, number> = {
    [VerificationResult.CORRECT]: 200,
    [VerificationResult.INCORRECT]: 401,
    [VerificationResult.RATE_LIMITED]: 429,
};

const sendResponse = (
    response: http.ServerResponse,
    status: number,
    message = HTTP_RESPONSE_MESSAGES[status] ?? "",
    contentType = "text/plain; charset=utf-8",
) => response.writeHead(status, { "Content-Type": contentType }).end(message);

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

export const httpServer = http.createServer(tryAsync(async (request: http.IncomingMessage, response: http.ServerResponse) => {
    let url: string;
    try {
        url = decodeURI(request.url ?? "%");
    } catch {
        sendResponse(response, 400);
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
                sendResponse(response, 404);
                return;
            }
        } catch {
            sendResponse(response, 404);
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
        sendResponse(response, 404);
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
            sendResponse(response, 413);
    });

    request.on("end", tryAsync(async () => {
        if (!httpServer.listening)
            return;

        if (bytesReceived > MAX_BODY_SIZE_BYTES)
            return;

        let requestBody: Record<string, unknown>;
        try {
            const body = Buffer.concat(chunks).toString();
            requestBody = body.length === 0 ? {} : JSON.parse(body);
        } catch {
            sendResponse(response, 400);
            return;
        }

        if (requestBody == null) {
            sendResponse(response, 400);
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
                sendResponse(response, 400);
                return;
            }

            if (!await validateKey(key)) {
                sendResponse(response, 400, "The entered key is incorrect.");
                return;
            }

            if (!httpServer.listening)
                return;

            try {
                const created = requestBody.create === "race" ?
                    new Race(password, id, game, players) :
                    new Tournament(password, id, game, players, type as number, arg as (number | undefined));

                console.log(`created ${requestBody.create} ${created.id} with key ${key}`);
                sendResponse(response, 200, created.id);
            } catch (e) {
                if (!(e instanceof ValidationError))
                    throw e;
                sendResponse(response, e.status, e.message);
            }

            return;
        }

        if (parts.length === 2 && parts[0] === "auth") { // get race authentication
            const id = parts[1];
            const race = activeRaces.get(id);

            if (race == null) {
                sendResponse(response, 404, "The race is no longer active.");
                return;
            }

            if (typeof requestBody.password !== "string") {
                sendResponse(response, 400);
                return;
            }

            const result = LowSecurityHasher.verify(requestBody.password, race.hash);
            if (result !== VerificationResult.CORRECT) {
                sendResponse(response, PASSWORD_VERIFICATION_STATUS[result]);
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

            sendResponse(response, 200, JSON.stringify(auth), "application/json; charset=utf-8");
            return;
        }

        if (parts.length === 2 && parts[0] === "exec") { // exec command on race
            const id = parts[1];
            const race = activeRaces.get(id) ?? inactiveRaces.get(id);

            if (race == null) {
                sendResponse(response, 404);
                return;
            }

            if (race instanceof RaceData && race.static == null) {
                sendResponse(response, 503);
                return;
            }

            if (typeof requestBody.password !== "string") {
                sendResponse(response, 400);
                return;
            }

            const result = LowSecurityHasher.verify(requestBody.password, race.hash);
            if (result !== VerificationResult.CORRECT) {
                sendResponse(response, PASSWORD_VERIFICATION_STATUS[result]);
                return;
            }

            const name = requestBody.name;
            const command = requestBody.command;
            const args = requestBody.args;

            if (typeof name !== "string" || typeof command !== "string" || !Array.isArray(args) || args.some(v => typeof v !== "string")) {
                sendResponse(response, 400);
                return;
            }

            try {
                await race.exec(name, command, args);
                sendResponse(response, 200);
            } catch (e) {
                if (!(e instanceof ValidationError))
                    throw e;
                sendResponse(response, e.status, e.message);
            }

            return;
        }

        if (parts.length === 3 && parts[0] === "exec" && parts[1] === "tournament") { // exec command on tournament
            const id = parts[2];
            const tournament = tournaments.get(id);

            if (tournament == null) {
                sendResponse(response, 404);
                return;
            }

            if (typeof requestBody.password !== "string") {
                sendResponse(response, 400);
                return;
            }

            const result = LowSecurityHasher.verify(requestBody.password, tournament.hash);
            if (result !== VerificationResult.CORRECT) {
                sendResponse(response, PASSWORD_VERIFICATION_STATUS[result]);
                return;
            }

            const command = requestBody.command;
            const args = requestBody.args;

            if (typeof command !== "string" || !Array.isArray(args) || args.some(v => typeof v !== "string")) {
                sendResponse(response, 400);
                return;
            }

            try {
                await tournament.exec(command, args);
                sendResponse(response, 200);
            } catch (e) {
                if (!(e instanceof ValidationError))
                    throw e;
                sendResponse(response, e.status, e.message);
            }

            return;
        }

        if (parts.length === 2 && parts[0] === "tournament") { // get tournament data
            const id = parts[1];
            const tournament = tournaments.get(id);

            if (tournament == null) {
                sendResponse(response, 404);
                return;
            }

            const data = tournament.getData();
            sendResponse(response, 200, JSON.stringify(data), "application/json; charset=utf-8");

            return;
        }

        // get race data
        const start = requestBody.start;
        const length = requestBody.length;

        if (typeof start !== "number" || typeof length !== "number") {
            sendResponse(response, 400);
            return;
        }

        const id = parts[0];
        const race = activeRaces.get(id) ?? inactiveRaces.get(id);

        if (race == null) {
            sendResponse(response, 404);
            return;
        }

        let responseBody: Awaited<ReturnType<Race["getData"]>> | null;
        try {
            responseBody = await race.getData(start, length);
        } catch (e) {
            if (!(e instanceof ValidationError))
                throw e;
            sendResponse(response, e.status, e.message);
            return;
        }

        if (responseBody == null) {
            sendResponse(response, 503);
            return;
        }

        const data = await zlib_promises_gzip(JSON.stringify(responseBody), { level: 1 });
        response.writeHead(200, {
            "Content-Encoding": "gzip",
            "Content-Length": data.length,
            "Content-Type": "application/json",
        }).end(data);
    }, () => sendResponse(response, 500)));
}, args => sendResponse(args[1], 500)));
