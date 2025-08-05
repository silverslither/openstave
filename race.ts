import { randomBytes } from "node:crypto";
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

export class Race {
    ok: boolean;
    game: string;
    players: Player[];

    constructor(players: string[], game: string) {
        this.ok = false;

        if (!supportedGames.has(game))
            return;
        this.game = game;
        this.players = [];

        for (const player of players) {
            if (player.length > 24)
                return;

            let username = "";
            while (username.length === 0 || activePlayers.has(username))
                username = player + randomBytes(6).toString("base64");

            let password = randomBytes(24).toString("base64");

            // FIXME: whatever tf this is
            username = player;
            password = "password";

            this.players.push(new Player(username, password, game));
        }

        for (const player of this.players)
            activePlayers.set(player.username, player);

        this.ok = true;
    }

    getData(start: number, length: number) {
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
        return response;
    }
}
