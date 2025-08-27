import * as crypto from "node:crypto";

import { supportedGames } from "./buffer.ts";
import Player from "./player.ts";

interface PlayerResponseObject {
    splits: number[];
    time: number;
    dnf: number;
    frames: string[];
    length: number;
};

export const activePlayers: Map<string, Player> = new Map();
export const activeRaces: Map<string, Race> = new Map();
export const inactiveRaces: Map<string, Race> = new Map();

export class Race {
    id: string;
    game: string;
    timeout: number;
    players: Player[];

    get finished(): boolean {
        if (Date.now() > this.timeout) {
            for (const player of this.players)
                player.eventHandler({ code: "DNF", data: null })
            this.timeout = Infinity;
            return true;
        }
        return this.players.findIndex(v => !v.finished) === -1;
    }

    // FIXME: game-dependent timeout
    constructor(game: string = "", players: string[] = [], timeout_ms: number = 10 * 60 * 1000) {
        if (!supportedGames.has(game))
            return;
        this.game = game;
        this.timeout = Date.now() + timeout_ms;
        this.players = [];

        for (const player of players) {
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

        this.id = crypto.randomBytes(24).toString("base64url");
        activeRaces.set(this.id, this);
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

    getData(start: number, length: number) {
        const finished = this.finished;

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

        return { game: this.game, finished, players: response };
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
