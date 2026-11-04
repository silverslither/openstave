import * as crypto from "node:crypto";

import { AUTH_FIELD_LENGTH, INVALID_CHARACTERS, MAX_TOURNAMENT_ID_LENGTH, SUFFIX_LENGTH } from "../web/common/limits.js";
import * as Bracket from "./bracket.ts";
import { supportedGames } from "./buffer.ts";
import Player from "./player.ts";
import { activePlayers, activeRaces, inactiveRaces, Race } from "./race.ts";
import { LowSecurityHasher } from "./security.ts";
import { Slots, SlotType } from "./slots.ts";
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

        do {
            this.id = id + crypto.randomBytes(0.75 * SUFFIX_LENGTH).toString("base64url");
        } while (tournaments.has(this.id));

        Slots.register(this.id, SlotType.TOURNAMENT);

        for (const player of this.players)
            activePlayers.set(player, undefined);

        tournaments.set(this.id, this);
    }

    finished() {
        if (this.races.length === 0)
            return false;

        const finished = this.calculatePlacements(this.races.length - 1) && Boolean(this.rounds.at(-1)?.finished);
        if (finished)
            Slots.deregister(this.id, SlotType.TOURNAMENT);
        return finished;
    }

    calculatePlacements(i: number, force = false) {
        const name = this.races[i];
        const race = activeRaces.get(name) ?? inactiveRaces.get(name)!;
        const round = this.rounds[i];

        if ((force || !round.finished) && race.finished()) {
            const data = race.getStatic();
            if (data == null)
                return false;

            const finish = (round.players as string[]).map((v) => {
                const time = data.players[v]?.time;
                return Number.isFinite(time) ? time : Infinity;
            }) as number[];
            const placements = finish.toSorted((a, b) => a - b);

            round.placements = [];
            for (let j = 0; j < finish.length; j++) {
                if (!Number.isFinite(finish[j]))
                    round.placements.push(finish.length - 1);
                else
                    round.placements.push(placements.indexOf(finish[j]));
            }

            round.finished = true;
        }

        return true;
    }

    getData() {
        return {
            finished: this.finished(),
            points: Bracket.points(this.players, this.rounds),
            rounds: this.rounds,
            races: this.races,
        };
    }

    exec(command: string, _args: string[]) {
        switch (command.toLowerCase()) {
        case "restart": {
            if (this.races.length === 0)
                throw new ValidationError("No race has been started yet.");

            const round = this.rounds[this.races.length - 1];
            if (!round.finished)
                throw new ValidationError("There is still an ongoing race.");

            Slots.register(this.id, SlotType.TOURNAMENT);

            round.finished = false;
            round.placements = [];
            this.races.pop();
            // fallthrough
        } case "next": {
            if (this.races.length > 0 && !this.rounds[this.races.length - 1].finished)
                throw new ValidationError("There is still an ongoing race.");

            Bracket.reduce(this.players, this.rounds);
            const round = this.rounds[this.races.length];
            const players = round.players as string[];
            const race = new Race(this.hash, `${this.id.slice(0, -SUFFIX_LENGTH)}-${round.id}`, this.game, players, true, players.map(v => this.playerPasswords.get(v)!));
            this.races.push(race.id);
            return;
        } case "reload":
            for (let i = 0; i < this.races.length; i++)
                this.calculatePlacements(i, true);
            return;
        default:
            throw new ValidationError("Command does not exist.");
        }
    }
}
