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
        if (id.length > 36)
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

    finished() {
        if (this.races.length === 0)
            return false;

        const i = this.races.at(-1)!;
        const race = activeRaces.get(i) ?? inactiveRaces.get(i)!;
        const round = this.rounds[this.races.length - 1];

        if (!round.finished && race.finished()) {
            const data = race.getStatic();
            if (data == null)
                return false;

            const finish = (round.players as string[]).map((v) => {
                const time = data.players[v]?.time;
                return Number.isFinite(time) ? time : Infinity;
            }) as number[];
            const placements = finish.toSorted((a, b) => a - b);

            round.finished = true;

            for (let j = 0; j < finish.length; j++) {
                if (!Number.isFinite(finish[j]))
                    round.placements.push(finish.length - 1);
                else
                    round.placements.push(placements.indexOf(finish[j]));
            }

            this.rounds[this.races.length - 1].finished = true;
        }

        return Boolean(this.rounds.at(-1)?.finished);
    }

    getData() {
        return {
            finished: this.finished(),
            rounds: this.rounds,
            races: this.races,
        };
    }

    exec(command: string, _args: string[]): [number, string] {
        switch (command.toLowerCase()) {
        case "next": {
            if (this.races.length > 0 && !this.rounds[this.races.length - 1].finished)
                return [400, "There is still an ongoing race."];

            Bracket.reduce(this.players, this.rounds);
            const round = this.rounds[this.races.length];
            const players = round.players as string[];

            const race = new Race(this.hash, `${this.id.slice(0, -8)}-${round.id}`, this.game, players, true, players.map(v => this.playerPasswords.get(v)!));
            this.races.push(race.id);
            return [200, ""];
        } case "restart": // TODO
        default:
            return [400, "Command does not exist."];
        }
    }
}
