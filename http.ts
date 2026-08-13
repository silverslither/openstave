import * as crypto from "node:crypto";
import * as http from "node:http";
import * as zlib from "node:zlib";
import * as fs from "node:fs";
import * as path from "node:path";

import { Race, activeRaces, inactiveRaces } from "./race.ts";
import { LowSecurityHasher } from "./security.ts";

import { HTTP_PORT, MAX_ACTIVE_RACES, MAX_BODY_SIZE_BYTES, TCP_ADDRESS, TCP_PORT } from "./env.ts";

const MIME_TYPES: Record<string, string> = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "text/javascript",
    ".png": "image/png",
    ".lua": "application/octet-stream",
};

const MAX_REQUEST_BUFFER_FRAMES = 240;

let gKey = crypto.randomBytes(24).toString("base64");
export const getKey = () => gKey;
export const setKey = (key: string) => gKey = key;

const server = http.createServer((request, response) => {
    try {
        let url: string;
        try {
            url = decodeURI(request.url ?? "%");
        } catch (e) {
            void e;
            response.writeHead(400).end();
            return;
        }

        if (request.method === "GET") {
            const query = url.split("?");
            const parts = query[0].split("/").filter(v => v !== "");

            let file: string;
            if (parts.length === 0) {
                file = path.join(import.meta.dirname, "root", "index.html");
            } else if (parts.length === 1) {
                const race = activeRaces.get(parts[0]) ?? inactiveRaces.get(parts[0]);
                if (race == null) {
                    response.writeHead(404).end();
                    return;
                }
                file = path.join(import.meta.dirname, race.game.split("_")[0], "index.html");
            } else if (parts[0] === "dashboard" && (activeRaces.has(parts[1]) || inactiveRaces.has(parts[1]))) {
                file = path.join(import.meta.dirname, "dashboard", "index.html");
            } else {
                file = path.join(import.meta.dirname, ...parts);
            }

            if (!file.startsWith(import.meta.dirname) || !fs.existsSync(file) || !fs.lstatSync(file).isFile()) {
                response.writeHead(404).end();
                return;
            }

            let prepend = Buffer.allocUnsafe(0);
            if (query.length > 1)
                prepend = Buffer.from(query[1], "base64url");

            const ext = path.extname(file).toLowerCase();
            const mime = MIME_TYPES[ext] ?? "";

            fs.readFile(file, (error, data) => {
                if (error) {
                    console.error(error);
                    response.writeHead(500).end();
                    return;
                }
                data = Buffer.concat([prepend, data]);
                response.writeHead(200, {
                    "Content-Length": data.length,
                    "Content-Type": mime,
                }).end(data);
            });

            return;
        }

        if (request.method !== "POST") {
            response.writeHead(404).end();
            return;
        }

        const chunks: Buffer[] = [];
        let bytesReceived = 0;
        request.on("data", (data) => {
            chunks.push(data);
            bytesReceived += data.length;

            if (bytesReceived > MAX_BODY_SIZE_BYTES)
                response.writeHead(400).end();
        });

        request.on("end", () => {
            let requestBody;
            try {
                requestBody = JSON.parse(Buffer.concat(chunks).toString());
            } catch (e) {
                void e;
                response.writeHead(400).end();
                return;
            }

            if (requestBody == null) {
                response.writeHead(400).end();
                return;
            }

            const parts = url.split("/").filter(v => v !== "");

            if (parts.length === 0) {
                const key = requestBody.key;
                const password = requestBody.password;
                const id = requestBody.id;
                const game = requestBody.game;
                let players = requestBody.players;

                if (key !== gKey) {
                    response.writeHead(400).end("The entered key is incorrect.");
                    return;
                }

                if (typeof password !== "string" || password.length < 8 || password.length > 64) {
                    response.writeHead(400).end("Dashboard password must be at least 8 characters long.");
                    return;
                }

                if (typeof id !== "string" || typeof game !== "string" || !Array.isArray(players) || players.length === 0 || players.some(v => typeof v !== "string")) {
                    response.writeHead(400).end("You must fill out all form elements.");
                    return;
                }

                players = players.map(v => v.replace(/[^0-9A-Za-z_-]/g, ""));
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

                response.writeHead(200).end(race.id);
                return;
            }

            if (parts.length === 2 && parts[0] === "authentication") {
                const id = parts[1];
                const race = activeRaces.get(id);

                if (race == null) {
                    response.writeHead(404).end();
                    return;
                }

                if (!LowSecurityHasher.verify(requestBody.password, race.hash)) {
                    response.writeHead(401).end();
                    return;
                }

                response.writeHead(200).end(JSON.stringify(
                    race.players.map(v => [
                        v.username,
                        `lua/${race.game.split("_")[0]}.lua?${Buffer.from(v.getAuthString(TCP_ADDRESS, TCP_PORT)).toString("base64url")}`,
                    ]),
                ));

                return;
            }

            const start = requestBody.start;
            const length = requestBody.length;

            if (typeof start !== "number" || typeof length !== "number" || !Number.isInteger(start) || !Number.isInteger(length) || length > MAX_REQUEST_BUFFER_FRAMES) {
                response.writeHead(400).end();
                return;
            }

            const id = parts[0];
            const race = activeRaces.get(id) ?? inactiveRaces.get(id);

            if (race == null) {
                response.writeHead(404).end();
                return;
            }

            race.getData(start, length).then((responseBody) => {
                if (responseBody == null) {
                    response.writeHead(404).end();
                    return;
                }

                zlib.gzip(JSON.stringify(responseBody), { level: 1 }, (error, data) => {
                    if (error) {
                        console.error(error);
                        response.writeHead(500).end();
                        return;
                    }
                    response.writeHead(200, {
                        "Content-Encoding": "gzip",
                        "Content-Length": data.length,
                        "Content-Type": "application/json",
                    }).end(data);
                });
            }).catch((e) => {
                console.error(e);
                response.writeHead(500).end();
            });
        });
    } catch (e) {
        console.error(e);
        console.error("error in request handler - resuming execution");
    }
});

server.listen(HTTP_PORT, "0.0.0.0", () => {
    console.log("HTTP server running on port", HTTP_PORT);
});
