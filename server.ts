import * as fs from "node:fs";
import * as path from "node:path";

import { CRASH_TIMEOUT_MS, HTTP_PORT, TCP_PORT, VACUUM_INTERVAL_MS } from "./env.ts";
import { httpServer } from "./server/http.ts";
import { activeRaces, inactiveRaces, Race, RACE_PATH, RaceData } from "./server/race.ts";
import { openConnections, tcpServer } from "./server/tcp.ts";
import { Tournament, TOURNAMENT_PATH, tournaments } from "./server/tournament.ts";

const CRASH_PATH = path.join(import.meta.dirname, "crash");

let lock = false;
async function cleanup() {
    if (lock)
        return;
    lock = true;

    try {
        console.error("gracefully shutting down");

        const httpClosed = new Promise(r => httpServer.close(r));
        httpServer.closeAllConnections();

        const tcpClosed = new Promise(r => tcpServer.close(r));
        for (const client of openConnections)
            client.resetAndDestroy();

        await Promise.any([
            Promise.all([
                httpClosed,
                tcpClosed,
                ...Array.from(tournaments.values(), tournament => tournament.queue),
            ]),
            new Promise(r => setTimeout(r, CRASH_TIMEOUT_MS)),
        ]);

        if (!fs.existsSync(CRASH_PATH))
            fs.mkdirSync(CRASH_PATH);
        for (const [key, value] of activeRaces)
            fs.writeFileSync(path.join(CRASH_PATH, key), value.serialize(), "utf8");
        for (const [key, value] of inactiveRaces)
            if (value instanceof Race)
                fs.writeFileSync(path.join(CRASH_PATH, key), value.serialize(), "utf8");

    } catch (e) {
        console.error(e);
        console.error("error in cleanup handler - forcefully shutting down");
    }
}

process.on("SIGINT", async () => {
    await cleanup();
    process.exit(0);
});
process.on("SIGTERM", async () => {
    await cleanup();
    process.exit(0);
});
process.on("uncaughtException", async (e) => {
    console.error(e);
    await cleanup();
    process.exit(1);
});

if (fs.existsSync(CRASH_PATH)) {
    const keys = fs.readdirSync(CRASH_PATH);
    for (const key of keys) {
        const value = JSON.parse(fs.readFileSync(path.join(CRASH_PATH, key), "utf8"));
        activeRaces.set(key, Race.from(value));
        fs.rmSync(path.join(CRASH_PATH, key));
    }
}

const raceImports = [];
if (!fs.existsSync(RACE_PATH)) {
    fs.mkdirSync(RACE_PATH);
} else {
    const keys = fs.readdirSync(RACE_PATH);
    for (const key of keys) {
        if (activeRaces.has(key))
            continue;
        const race = new RaceData(path.join(RACE_PATH, key));
        raceImports.push(race.import().then(() => {
            inactiveRaces.set(key, race);
        }).catch(e => console.error(e)));
    }
}

await Promise.all(raceImports);

if (!fs.existsSync(TOURNAMENT_PATH)) {
    fs.mkdirSync(TOURNAMENT_PATH);
} else {
    const keys = fs.readdirSync(TOURNAMENT_PATH);
    for (const key of keys) {
        try {
            const data = await fs.promises.readFile(path.join(TOURNAMENT_PATH, key), "utf8");
            tournaments.set(key, Tournament.from(JSON.parse(data)));
        } catch (e) {
            console.error(e);
        }
    }
}

httpServer.listen(HTTP_PORT, "0.0.0.0", () => {
    console.log("HTTP server running on port", HTTP_PORT);
});

tcpServer.listen(TCP_PORT, "0.0.0.0", () => {
    console.log("TCP server running on port", TCP_PORT);
});

while (true) {
    if (lock)
        break;

    for (const race of activeRaces.values())
        void race.finished();

    for (const tournament of tournaments.values())
        void tournament.finished();

    await new Promise(r => setTimeout(r, VACUUM_INTERVAL_MS));
}
