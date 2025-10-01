import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

import { supportedGames } from "./buffer.ts";
import Player from "./player.ts";

const TIMEOUTS = {
    "default": 30 * 60 * 1000,
    "smb1_any%": 15 * 60 * 1000,
    "smb1_warpless": 45 * 60 * 1000,
};

const FILE_BUFFER = 240;

interface PlayerResponseObject {
    splits: number[];
    time: number;
    dnf: number;
    frames: string[];
    length: number;
};

export const activePlayers: Map<string, Player> = new Map();
export const activeRaces: Map<string, Race> = new Map();
export const inactiveRaces: Map<string, AbstractRace> = new Map();

export interface AbstractRace {
    game: string;

    getData: (start: number, length: number) => Promise<{
        game: string,
        finished: boolean,
        players: { [key: string]: PlayerResponseObject },
    } | null>;
}

export class Race implements AbstractRace {
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
        return this.players.findIndex(v => !v.finished) === -1;
    }

    constructor(id: string = "", game: string = "", players: string[] = []) {
        id = id.replace(/[^0-9A-Za-z_-]/g, "");
        if (id.length > 56)
            return;
        if (!supportedGames.has(game))
            return;
        this.game = game;
        const timeout_ms = TIMEOUTS[game] ?? TIMEOUTS.default;
        this.timeout = Date.now() + timeout_ms;
        this.players = [];

        for (let player of players) {
            player = player.replace(/[^0-9A-Za-z_-]/g, "");
            if (player.length > 24)
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
        console.log(activeRaces);
    }

    static from(obj: any) {
        const race = new Race();
        race.id = obj.id;
        race.game = obj.game;
        race.timeout = obj.timeout ?? Infinity;
        race.players = obj.players.map((v: any) => Player.from(v));
        for (const player of race.players)
            if (player.end !== player.end && player.dnf !== player.dnf)
                activePlayers.set(player.username, player);
        return race;
    }

    async getData(start: number, length: number) {
        const response: { [key: string]: PlayerResponseObject } = {};

        for (const player of this.players) {
            if (player.start !== player.start)
                response[player.username] = null;
            const playerObj = {
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

    serialize() {
        for (const player of this.players)
            player.minimize();
        return JSON.stringify(this, (_, v) => {
            if (v instanceof Buffer)
                return v.toString("base64");
            return v;
        });
    }
}

export class RaceData implements AbstractRace {
    path: string;
    game: string;

    constructor(racePath: string) {
        this.path = racePath;
        if (fs.existsSync(this.path)) {
            fs.readFile(path.join(this.path, "static"), { encoding: "utf8" }, (error, data) => {
                if (error) {
                    console.error(error);
                    return;
                }

                this.game = JSON.parse(data).game;
            });
        }
    }

    // assumes all players have been minimized()
    async write(race: Race) {
        this.game = race.game;

        if (!fs.existsSync(this.path))
            await fs.promises.mkdir(this.path);

        const staticData = {
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

        await fs.promises.writeFile(path.join(this.path, "static"), JSON.stringify(staticData));

        const length = Math.max(...Object.values(staticData.players).map(v => v.length));

        for (let i = 0; i < length; i += FILE_BUFFER) {
            const frames = {};
            for (const player of race.players) {
                const slice = player.frames.slice(i, i + FILE_BUFFER);
                if (slice.length > 0)
                    frames[player.username] = slice.map(v => v.data.toString("base64"));
            }

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

    async getData(start: number, length: number) {
        if (!fs.existsSync(this.path))
            return null;
        const response = JSON.parse(await fs.promises.readFile(path.join(this.path, "static"), { encoding: "utf8" }));

        let i = FILE_BUFFER * Math.floor(start / FILE_BUFFER);
        for (; i < start + length; i += FILE_BUFFER) {
            const file = path.join(this.path, i.toString());
            if (!fs.existsSync(file))
                break;

            const data = await fs.promises.readFile(file);
            const frames: { [key: string]: string[] } = await new Promise((resolve, reject) => {
                zlib.gunzip(data, (error, data) => {
                    if (error)
                        reject(error);
                    else
                        resolve(JSON.parse(data.toString("utf8")));
                });
            });

            for (const player in frames)
                response.players[player].frames.push(...frames[player].slice(Math.max(start - i, 0), start + length - i));
        }

        return response;
    }
}
