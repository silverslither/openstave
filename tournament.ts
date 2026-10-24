import * as crypto from "node:crypto";

import * as Bracket from "./bracket.ts";
import { supportedGames } from "./buffer.ts";
import { activePlayers, activeRaces, inactiveRaces, Race } from "./race.ts";
import { LowSecurityHasher } from "./security.ts";

export const tournaments: Map<string, Tournament> = new Map();

export class Tournament {
    hash: string;
    id: string;
    game: string;
    players: string[];
    playerPasswords: Map<string, string>;
    rounds: Bracket.Round[];
    races: string[];

    constructor(password: string = "", id: string = "", game: string = "", players: string[] = [], type: Bracket.Type, arg?: number) {
        this.hash = LowSecurityHasher.hash(password)!;
        this.id = "";
        this.game = game;
        this.players = [];
        this.playerPasswords = new Map();
        this.rounds = [];
        this.races = [];

        id = id.replace(/[^0-9A-Za-z_-]/g, "");
        if (id.length > 56)
            return;
        if (!supportedGames.has(game))
            return;

        for (let i = 0; i < players.length; i++) {
            const player = players[i];
            if (player === "" || player.length > 24)
                return;

            let username = "";
            while (username.length === 0 || activePlayers.get(username) != null)
                username = player + crypto.randomBytes(6).toString("base64");
            const password = crypto.randomBytes(24).toString("base64");

            this.players.push(username);
            this.playerPasswords.set(username, password);
        }

        for (const player of this.players)
            activePlayers.set(player, undefined);

        this.rounds = Bracket.generate(type, players.length, arg);

        do {
            this.id = id + crypto.randomBytes(6).toString("base64url");
        } while (tournaments.has(this.id));

        tournaments.set(this.id, this);
    }

    exec(command: string, _args: string[]): [number, string] {
        const i = this.races.at(-1) ?? "";
        const last = activeRaces.get(i) ?? inactiveRaces.get(i) ?? null;

        switch (command.toLowerCase()) {
        case "next": {
            if (last != null && !last.finished())
                return [400, "There is still an ongoing race."];
            Bracket.reduce(this.players, this.rounds);
            const players = this.rounds[this.races.length].players as string[];

            const race = new Race(this.hash, "", this.game, players, true, players.map(v => this.playerPasswords.get(v)!));
            this.races.push(race.id);
            return [200, ""];
        } case "restart": // TODO
        default:
            return [400, "Command does not exist."];
        }
    }
}
