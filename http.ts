import * as crypto from "node:crypto";
import * as http from "node:http";
import * as zlib from "node:zlib";
import * as fs from "node:fs";
import * as path from "node:path";

import { supportedGames } from "./buffer.ts";
import { Race, activeRaces, inactiveRaces } from "./race.ts";

import { HTTP_PORT, MAX_ACTIVE_RACES, TCP_ADDRESS, TCP_PORT } from "./env.ts";

const MIME_TYPES = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "text/javascript",
    ".png": "image/png",
    ".lua": "application/octet-stream",
};

const MAX_REQUEST_BUFFER = 240;

let gKey = crypto.randomBytes(24).toString("base64");
export const getKey = () => gKey;
export const setKey = (key: string) => gKey = key;

const server = http.createServer((request, response) => {
    if (request.method === "GET") {
        const query = request.url.split("?");
        const parts = query[0].split("/").filter(v => v !== "");

        let file: string;
        if (parts.length === 0) {
            file = path.join(import.meta.dirname, "root", "index.html");
        } else if (parts.length === 1) {
            if (!activeRaces.has(parts[0]) && !inactiveRaces.has(parts[0])) {
                response.writeHead(404).end();
                return;
            }
            file = path.join(import.meta.dirname, (activeRaces.get(parts[0]) ?? inactiveRaces.get(parts[0])).game.split("_")[0], "index.html");
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

    const chunks = [];
    request.on("data", (data) => {
        chunks.push(data);
    });

    request.on("end", () => {
        const requestBody = JSON.parse(Buffer.concat(chunks).toString());

        if (requestBody == null) {
            response.writeHead(400).end();
            return;
        }

        if (request.url === "/") {
            const key = requestBody.key;
            const id = requestBody.id;
            const game = requestBody.game;
            const players = requestBody.players;

            if (key !== gKey) {
                response.writeHead(400).end("The entered key is incorrect.");
                return;
            }

            if (!supportedGames.has(game) || !Array.isArray(players) || players.length < 2 || players.length > 8 || players.findIndex(v => typeof v !== "string" || v === "" || v.length > 24) !== -1) {
                response.writeHead(400).end("You must fill out all form elements.");
                return;
            }

            if (new Set(players).size !== players.length) {
                response.writeHead(400).end("All players must have unique names.");
                return;
            }

            if (activeRaces.size >= MAX_ACTIVE_RACES) {
                response.writeHead(418).end("The server is currently busy. Try again later.");
                return;
            }

            const race = new Race(id, game, players);
            if (typeof race.id !== "string") {
                response.writeHead(400).end("Check that all inputs are valid and contain only basic characters.");
                return;
            }

            response.writeHead(200).end(JSON.stringify({
                link: race.id,
                authentication: race.players.map(v => [
                    v.username,
                    `lua/${game.split("_")[0]}.lua?${Buffer.from(v.getAuthString(TCP_ADDRESS, TCP_PORT)).toString("base64url")}`,
                ]),
            }));

            return;
        }

        const start = requestBody.start;
        const length = requestBody.length;

        if (typeof start !== "number" || typeof length !== "number" || !Number.isInteger(start) || !Number.isInteger(length) || length > MAX_REQUEST_BUFFER) {
            response.writeHead(400).end();
            return;
        }

        const race = request.url.slice(1);
        if (!activeRaces.has(race) && !inactiveRaces.has(race)) {
            response.writeHead(404).end();
            return;
        }

        const raceObject = activeRaces.get(race) ?? inactiveRaces.get(race);
        raceObject.getData(start, length).then((responseBody) => {
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
        }).catch((error) => {
            console.error(error);
            response.writeHead(500).end();
        });
    });
});

server.listen(HTTP_PORT, "0.0.0.0", () => {
    console.log("HTTP server running on port", HTTP_PORT);
});
