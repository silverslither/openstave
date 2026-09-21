import * as fs from "node:fs";
import * as path from "node:path";

import { Race, RaceData, activePlayers, activeRaces, inactiveRaces } from "./race.ts";
import { openConnections, server } from "./tcp.ts";
import { getKey, setKey } from "./http.ts";

import { CRASH_TIMEOUT_MS, VACUUM_INTERVAL_MS } from "./env.ts";
const CRASH_PATH = path.join(import.meta.dirname, "crash");
const RACE_PATH = path.join(import.meta.dirname, "races");

let lock = false;
async function cleanup() {
    if (lock)
        return;
    lock = true;

    try {
        console.error("gracefully shutting down");

        const closed = new Promise(r => server.close(r));

        for (const client of openConnections)
            client.resetAndDestroy();

        await Promise.any([closed, new Promise(r => setTimeout(r, CRASH_TIMEOUT_MS))]);

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

if (!fs.existsSync(RACE_PATH)) {
    fs.mkdirSync(RACE_PATH);
} else {
    const keys = fs.readdirSync(RACE_PATH);
    for (const key of keys) {
        const race = new RaceData(path.join(RACE_PATH, key));
        race.import().then(() => {
            inactiveRaces.set(key, race);
        });
    }
}

while (true) {
    if (lock)
        break;

    try {
        try {
            setKey((await fs.promises.readFile("key", "utf8")).trim());
        } catch (e) {
            void e;
            await fs.promises.writeFile("key", getKey(), "utf8");
        }

        for (const [id, race] of activeRaces) {
            if (!race.finished)
                continue;
            for (const player of race.players) {
                activePlayers.delete(player.username);
                player.connected = false;
            }
            activeRaces.delete(id);
            inactiveRaces.set(id, race);
        }

        for (const [key, value] of inactiveRaces) {
            if (!(value instanceof Race))
                continue;
            console.log("vacuuming race", key);
            const data = new RaceData(path.join(RACE_PATH, key));
            await data.write(value);
            inactiveRaces.set(key, data);
        }
    } catch (e) {
        console.error(e);
    }

    await new Promise(r => setTimeout(r, VACUUM_INTERVAL_MS));
}
