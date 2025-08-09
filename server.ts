import * as fs from "node:fs";
import * as path from "node:path";

import { Race, activeRaces } from "./race.ts";
import { openConnections, server } from "./tcp.ts";
import "./http.ts";

import { CRASH_TIMEOUT_MS } from "./env.ts";
const CRASH_PATH = path.join(import.meta.dirname, "crash");

let lock = false;
process.on("uncaughtException", async (error) => {
    if (lock)
        return;
    lock = true;

    try {
        console.error(error);
        console.error("uncaught exception - gracefully shutting down");

        const closed = new Promise(r => server.close(r));

        for (const client of openConnections)
            client.resetAndDestroy();

        await Promise.any([closed, new Promise(r => setTimeout(r, CRASH_TIMEOUT_MS))]);

        if (!fs.existsSync(CRASH_PATH))
            fs.mkdirSync(CRASH_PATH);
        for (const [key, value] of activeRaces.entries())
            fs.writeFileSync(path.join(CRASH_PATH, key), value.serialize(), { encoding: "utf8" });
    } catch (e) {
        console.error(e);
        console.error("error in exception handler - forcefully shutting down");
    }

    process.exit(1);
});

if (fs.existsSync(CRASH_PATH)) {
    const keys = fs.readdirSync(CRASH_PATH);
    for (const key of keys) {
        const value = JSON.parse(fs.readFileSync(path.join(CRASH_PATH, key), { encoding: "utf8" }));
        activeRaces.set(key, Race.from(value));
        fs.rmSync(path.join(CRASH_PATH, key));
    }
}
