import * as crypto from "node:crypto";

import { AUTH_FIELD_LENGTH, INVALID_CHARACTERS, MAX_TOURNAMENT_ID_LENGTH, SUFFIX_LENGTH } from "../web/common/limits.js";
import * as Bracket from "./bracket.ts";
import { supportedGames } from "./buffer.ts";
import Player from "./player.ts";
import { activePlayers, activeRaces, inactiveRaces, Race } from "./race.ts";
import { LowSecurityHasher } from "./security.ts";
import { ValidationError } from "./wrapper.ts";

export const tournaments: Map<string, Tournament> = new Map();

export class Tournament {
    hash: string;
    id: string;
    game: string;
    players: string[];
    playerPasswords: Map<string, string>;
    rounds: Bracket.Round[];
    races: string[];

    constructor(password: string, id: string, game: string, players: string[], type: number, arg?: number) {
        this.hash = LowSecurityHasher.hash(password)!;
        this.id = "";
        this.game = game;
        this.players = [];
        this.playerPasswords = new Map();
        this.rounds = [];
        this.races = [];

        if (id.length > MAX_TOURNAMENT_ID_LENGTH || INVALID_CHARACTERS.test(id))
            throw new ValidationError(`Tournament ID must contain at most ${MAX_TOURNAMENT_ID_LENGTH} characters, and contain only numbers, letters, hyphens, or underscores.`);
        if (!supportedGames.has(game))
            throw new ValidationError("Unsupported category.");

        Player.validateNames(players);

        if (new Set(players).size !== players.length)
            throw new ValidationError("All players must have unique names.");

        for (let i = 0; i < players.length; i++) {
            const player = players[i];
            let username = "";
            while (username.length === 0 || activePlayers.has(username))
                username = player + crypto.randomBytes(0.75 * SUFFIX_LENGTH).toString("base64");
            const password = crypto.randomBytes(0.75 * AUTH_FIELD_LENGTH).toString("base64");

            this.players.push(username);
            this.playerPasswords.set(username, password);
        }

        const rounds = Bracket.generate(type, players.length, arg);
        this.rounds = rounds;

        for (const player of this.players)
            activePlayers.set(player, undefined);

        do {
            this.id = id + crypto.randomBytes(0.75 * SUFFIX_LENGTH).toString("base64url");
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

    exec(command: string, _args: string[]) {
        switch (command.toLowerCase()) {
        case "next": {
            if (this.races.length > 0 && !this.rounds[this.races.length - 1].finished)
                throw new ValidationError("There is still an ongoing race.");

            Bracket.reduce(this.players, this.rounds);
            const round = this.rounds[this.races.length];
            const players = round.players as string[];
            const race = new Race(this.hash, `${this.id.slice(0, -SUFFIX_LENGTH)}-${round.id}`, this.game, players, true, players.map(v => this.playerPasswords.get(v)!));
            this.races.push(race.id);
            return;
        } case "restart": // TODO
            return;
        default:
            throw new ValidationError("Command does not exist.");
        }
    }
}
