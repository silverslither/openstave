import * as http from "node:http";
import * as zlib from "node:zlib";
import * as fs from "node:fs";
import * as path from "node:path";
import { activeRaces, Race } from "./race.ts";
import "./tcp.ts";

const PORT = 61125;
const MIME_TYPES = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "text/javascript",
    ".png": "image/png",
};

// FIXME: proper global error handling middleware
// FIXME: create races through another HTTP endpoint
activeRaces.set("debug", new Race(["slither", "slither2"], "smb1_any%"));
if (!activeRaces.get("debug").ok) {
    throw "race didnt work";
}

const server = http.createServer((request, response) => {
    if (request.method === "GET") {
        const parts = request.url.split("/").slice(1);

        let file: string;
        if (parts.length === 1) {
            if (!activeRaces.has(parts[0])) {
                response.writeHead(404).end();
                return;
            }
            file = path.join(import.meta.dirname, activeRaces.get(parts[0]).game.split("_")[0], "index.html");
        } else {
            file = path.join(import.meta.dirname, ...parts);
        }

        if (!file.startsWith(import.meta.dirname) || !fs.existsSync(file) || !fs.lstatSync(file).isFile()) {
            response.writeHead(404).end();
            return;
        }

        const ext = path.extname(file).toLowerCase();
        const mime = MIME_TYPES[ext] ?? "";

        fs.readFile(file, (error, data) => {
            if (error) {
                console.error(error);
                response.writeHead(500).end();
                return;
            }
            response.writeHead(200, {
                "Content-Length": data.length,
                "Content-Type": mime,
            });
            response.end(data);
        });

        return;
    }

    if (request.method !== "POST") {
        response.statusCode = 404;
        response.end();
        return;
    }

    const chunks = [];
    request.on("data", (data) => {
        chunks.push(data);
    });

    request.on("end", () => {
        const requestBody = JSON.parse(Buffer.concat(chunks).toString());

        if (requestBody == null) {
            response.statusCode = 400;
            response.end();
            return;
        }

        const race = request.url.slice(1);
        if (!activeRaces.has(race)) {
            response.writeHead(404).end();
            return;
        }

        const start = requestBody.start;
        const length = requestBody.length;

        if (typeof start !== "number" || typeof length !== "number" || !Number.isInteger(start) || !Number.isInteger(length)) {
            response.writeHead(400).end();
            return;
        }

        const raceObject = activeRaces.get(race);
        const responseBody = { game: raceObject.game, players: raceObject.getData(start, length) };
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
            });
            response.end(data);
        });
    });
});

server.listen(PORT, "0.0.0.0", () => {
    console.log("HTTP server running on port", PORT);
});
