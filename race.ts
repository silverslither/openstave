import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

import { supportedGames } from "./buffer.ts";
import Player from "./player.ts";
import { LowSecurityHasher } from "./security.ts";

const MINUTE = 60 * 1000;
const TIMEOUTS: Record<string, number> = {
    "default": 30 * MINUTE,
    "smb1_any%": 15 * MINUTE,
    "smb1_warpless": 45 * MINUTE,
    "smb2j_any%": 20 * MINUTE,
    "smb2j_warpless": 50 * MINUTE,
    "smb3_any%nww": 25 * MINUTE,
};

const FILE_BUFFER = 240;

interface PlayerResponseObject {
    splits: number[];
    time: number;
    dnf: number;
    frames: string[];
    length: number;
};

interface StaticRaceData {
    hash: string | null;
    game: string;
    finished: boolean;
    players: Record<string, PlayerResponseObject>;
}

export const activePlayers: Map<string, Player> = new Map();
export const activeRaces: Map<string, Race> = new Map();
export const inactiveRaces: Map<string, AbstractRace> = new Map();

export interface AbstractRace {
    hash: string | null;
    game: string;

    getData: (start: number, length: number) => Promise<{
        game: string,
        finished: boolean,
        players: Record<string, PlayerResponseObject | null>,
    } | null>;

    exec: (name: string, command: string, args: string[]) => Promise<[number, string]>;
}

export class Race implements AbstractRace {
    hash: string | null;
    id: string;
    game: string;
    timeout: number;
    players: Player[];

    get finished(): boolean {
        if (Date.now() > this.timeout) {
            for (const player of this.players)
                player.eventHandler({ code: "DNF", data: null });
            this.timeout = Infinity;
            return true;
        }
        return this.players.every(v => v.finished);
    }

    constructor(password: string = "", id: string = "", game: string = "", players: string[] = []) {
        this.hash = LowSecurityHasher.hash(password);
        this.id = "";
        this.game = game;
        this.timeout = 0;
        this.players = [];

        id = id.replace(/[^0-9A-Za-z_-]/g, "");
        if (id.length > 56)
            return;
        if (!supportedGames.has(game))
            return;
        const timeout_ms = TIMEOUTS[game] ?? TIMEOUTS.default;
        this.timeout = Date.now() + timeout_ms;
        this.players = [];

        for (const player of players) {
            if (player === "" || player.length > 24)
                return;

            let username = "";
            while (username.length === 0 || activePlayers.has(username))
                username = player + crypto.randomBytes(6).toString("base64");
            const password = crypto.randomBytes(24).toString("base64");

            this.players.push(new Player(game, username, password));
        }

        for (const player of this.players)
            activePlayers.set(player.username, player);

        do {
            this.id = id + crypto.randomBytes(6).toString("base64url");
        } while (activeRaces.has(this.id) || inactiveRaces.has(this.id));

        activeRaces.set(this.id, this);
        console.log(`created race ${this.id}`);
    }

    async getData(start: number, length: number) {
        const response: Record<string, PlayerResponseObject | null> = {};

        for (const player of this.players) {
            if (player.start !== player.start)
                response[player.username] = null;
            const playerObj = {
                connected: player.connected,
                splits: player.splits.map(v => v - player.start),
                dnf: player.dnf - player.start,
                time: player.end - player.start,
                frames: player.frames.slice(player.start + start, player.start + start + length).map(v => v.data.toString("base64")),
                length: player.frames.length - player.start,
            };
            response[player.username] = playerObj;
        }

        return { game: this.game, finished: this.finished, players: response };
    }

    minimize() {
        for (const player of this.players)
            player.minimize();
    }

    serialize() {
        this.minimize();
        return JSON.stringify(this, (_, v) => {
            if (typeof v !== "object")
                return v;
            if (Array.isArray(v))
                v = [...v];
            else
                v = { ...v };
            for (const [key, value] of Object.entries(v))
                if (value instanceof Buffer)
                    v[key] = value.toString("base64");
            return v;
        });
    }

    static from(obj: Record<string, any>) {
        const race = new Race();
        race.hash = obj.hash;
        race.id = obj.id;
        race.game = obj.game;
        race.timeout = obj.timeout ?? -Infinity;
        race.players = obj.players.map((v: any) => Player.from(v));
        for (const player of race.players)
            if (player.end !== player.end && player.dnf !== player.dnf)
                activePlayers.set(player.username, player);
        return race;
    }

    async exec(name: string, command: string, _args: string[]): Promise<[number, string]> {
        const player = this.players.find(v => v.username === name);
        if (player == null)
            return [400, "Player does not exist."];

        switch (command.toLowerCase()) {
            case "dnf":
                player.eventHandler({ code: "DNF", data: null });
                return [200, ""];
            default:
                return [400, "Command does not exist."];
        }
    }
}

export class RaceData implements AbstractRace {
    path: string;
    static: StaticRaceData;
    game: string;

    constructor(racePath: string) {
        this.path = racePath;
        this.static = null;
        this.game = "";
    }

    get hash() {
        return this.static?.hash ?? null;
    }

    async import() {
        try {
            const data = await fs.promises.readFile(path.join(this.path, "static"), "utf8");
            this.static = JSON.parse(data);
            this.game = this.static.game;

            for (const name in this.static.players) {
                const player = this.static.players[name];
                player.splits = player.splits.map(v => v ?? NaN);
                player.time ??= NaN;
                player.dnf ??= NaN;
            }
        } catch (e) {
            void e;
        }
    }

    async write(race: Race) {
        race.minimize();

        await fs.promises.mkdir(this.path, { recursive: true });

        this.static = {
            hash: race.hash,
            game: race.game,
            finished: true,
            players: Object.fromEntries(race.players.map(v => ([v.username, {
                splits: v.splits,
                dnf: v.dnf,
                time: v.end,
                frames: [],
                length: v.frames.length,
            }]))),
        };
        this.game = race.game;

        await this.writeStatic();

        const length = Math.max(...Object.values(this.static.players).map(v => v.length));

        for (let i = 0; i < length; i += FILE_BUFFER) {
            const frames: Record<string, string[]> = {};
            for (const player of race.players) {
                const slice = player.frames.slice(i, i + FILE_BUFFER);
                if (slice.length > 0)
                    frames[player.username] = slice.map(v => v.data.toString("base64"));
            }

            await this.writeChunk(i, frames);
        }
    }

    async getData(start: number, length: number) {
        if (this.static == null)
            return null;
        const response = structuredClone(this.static);
        const maxLength = Math.max(...Object.values(this.static.players).map(v => v.length));

        for (let i = FILE_BUFFER * Math.floor(start / FILE_BUFFER), j = Math.min(start + length, maxLength); i < j; i += FILE_BUFFER) {
            const frames = await this.readChunk(i);
            for (const player in frames)
                response.players[player].frames.push(...frames[player].slice(Math.max(start - i, 0), start + length - i));
        }

        return response;
    }

    async exec(name: string, command: string, args: string[]): Promise<[number, string]> {
        const player = this.static.players[name];
        if (player == null)
            return [400, "Player does not exist."];

        switch (command.toLowerCase()) {
            case "trim":
                const start = parseInt(args[0]);
                const end = parseInt(args[1]);
                if (start < 0 || end >= player.length || start > end)
                    return [400, "Invalid trim bounds."];

                await this.trim(name, start, end);
                return [200, ""];
            case "remove":
                await this.remove(name);
                return [200, ""];
            default:
                return [400, "Command does not exist."];
        }
    }

    async trim(name: string, start: number, end: number) {
        end += 1;

        const s = this.static;
        this.static = null;

        const player = s.players[name];
        const length = end - start;

        let ptr = 0;
        let chunk: Record<string, string[]> = await this.readChunk(0);
        chunk[name] = [];

        for (let i = FILE_BUFFER * Math.floor(start / FILE_BUFFER); i < player.length; i += FILE_BUFFER) {
            const frames = await this.readChunk(i);
            const left = frames[name].slice(Math.max(start - i, 0), Math.max(end - i, 0));

            if (i >= length) {
                delete frames[name];
                if (Object.keys(frames).length === 0)
                    await fs.promises.rm(path.join(this.path, i.toString()));
                else
                    await this.writeChunk(i, frames);
            }

            if (left.length === 0)
                continue;

            chunk[name].push(...left);

            if (chunk[name].length > 240) {
                const right = chunk[name].slice(240);
                chunk[name].length = 240;
                await this.writeChunk(ptr, chunk);

                ptr += 240;
                chunk = await this.readChunk(ptr);
                chunk[name] = right;
            }
        }

        await this.writeChunk(ptr, chunk);

        player.splits = player.splits.map(v => v - start < length ? v - start : NaN);
        player.time -= player.length - length;
        player.dnf -= player.length - length;
        player.length = length;

        this.static = s;
        await this.writeStatic();
    }

    async remove(name: string) {
        const s = this.static;
        this.static = null;

        const length = Math.max(...Object.values(s.players).map(v => v.length));

        for (let i = 0; i < length; i += FILE_BUFFER) {
            const frames = await this.readChunk(i);
            delete frames[name];

            if (Object.keys(frames).length === 0)
                await fs.promises.rm(path.join(this.path, i.toString()));
            else
                await this.writeChunk(i, frames);
        }

        delete s.players[name];

        this.static = s;
        await this.writeStatic();
    }

    async writeStatic() {
        await fs.promises.writeFile(path.join(this.path, "static"), JSON.stringify(this.static));
    }

    async readChunk(i: number) {
        const data = await fs.promises.readFile(path.join(this.path, i.toString()));

        const frames: Record<string, string[]> = await new Promise((resolve, reject) => { // TODO
            zlib.gunzip(data, (error, data) => {
                if (error)
                    reject(error);
                else
                    resolve(JSON.parse(data.toString("utf8")));
            });
        });

        return frames;
    }

    async writeChunk(i: number, frames: Record<string, string[]>) {
        const data: Buffer = await new Promise((resolve, reject) => {
            zlib.gzip(JSON.stringify(frames), { level: 9 }, (error, data) => {
                if (error)
                    reject(error);
                else
                    resolve(data);
            });
        });

        await fs.promises.writeFile(path.join(this.path, i.toString()), data);
    }
}
