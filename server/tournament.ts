import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { AUTH_FIELD_LENGTH, INVALID_CHARACTERS, MAX_TOURNAMENT_ID_LENGTH, SUFFIX_LENGTH } from "../web/common/limits.js";
import * as Bracket from "./bracket.ts";
import { supportedGames } from "./buffer.ts";
import Player from "./player.ts";
import { activePlayers, activeRaces, inactiveRaces, Race } from "./race.ts";
import { LowSecurityHasher } from "./security.ts";
import { Slots, SlotType } from "./slots.ts";
import { ValidationError } from "./wrapper.ts";

export const TOURNAMENT_PATH = path.join(import.meta.dirname, "..", "tournaments");

export const tournaments: Map<string, Tournament> = new Map();

export class Tournament {
    path: string;
    queue: Promise<void>;
    hash: string;
    id: string;
    game: string;
    timeout: number;
    players: string[];
    playerPasswords: Map<string, string>;
    rounds: Bracket.Round[];
    races: string[];

    constructor(password: string, id: string, game: string, players: string[], type: number, arg?: number) {
        this.path = "";
        this.queue = Promise.resolve();
        this.hash = LowSecurityHasher.hash(password)!;
        this.id = "";
        this.game = game;
        this.timeout = Date.now() + 24 * 3600 * 1000;
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

        this.path = path.join(TOURNAMENT_PATH, this.id);
        this.write();

        for (const player of this.players)
            activePlayers.set(player, undefined);

        tournaments.set(this.id, this);
    }

    finished() {
        if (Date.now() > this.timeout && !activeRaces.has(this.races.at(-1)!))
            Slots.deregister(this.id, SlotType.TOURNAMENT);

        if (this.races.length === 0)
            return false;

        const last = this.rounds[this.races.length - 1];
        const before = last.finished;
        const finished = this.calculatePlacements(this.races.length - 1) && Boolean(this.rounds.at(-1)?.finished);

        if (!before && last.finished)
            this.write();

        if (finished)
            Slots.deregister(this.id, SlotType.TOURNAMENT);

        return finished;
    }

    serialize() {
        return JSON.stringify(this, (_, v) => v instanceof Map ? [...v] : v);
    }

    static from(obj: Record<string, unknown>) {
        const tournament = Object.create(Tournament.prototype) as Tournament;
        tournament.queue = Promise.resolve();
        tournament.hash = obj.hash as string;
        tournament.id = obj.id as string;
        tournament.path = path.join(TOURNAMENT_PATH, tournament.id);
        tournament.game = obj.game as string;
        tournament.timeout = obj.timeout as number;
        tournament.players = obj.players as string[];
        tournament.playerPasswords = new Map(obj.playerPasswords as [string, string][]);
        tournament.rounds = obj.rounds as Bracket.Round[];
        tournament.races = obj.races as string[];

        Slots.register(tournament.id, SlotType.TOURNAMENT, true);
        for (const id of tournament.races)
            Slots.deregister(id, SlotType.RACE);

        for (const player of tournament.players)
            if (!activePlayers.has(player))
                activePlayers.set(player, undefined);

        return tournament;
    }

    write() {
        return this.queue = this.queue.then(() => fs.promises.writeFile(this.path, this.serialize()));
    }

    calculatePlacements(i: number, force = false) {
        const name = this.races[i];
        const race = activeRaces.get(name) ?? inactiveRaces.get(name)!;
        const round = this.rounds[i];

        if ((force || !round.finished) && race.finished()) {
            const data = race.getStatic();
            if (data == null)
                return false;

            const finish = round.players.map((v) => {
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
        case "revert": {
            if (this.races.length === 0)
                throw new ValidationError("No race has been started yet.");

            const round = this.rounds[this.races.length - 1];
            if (!round.finished)
                throw new ValidationError("There is still an ongoing race.");

            round.finished = false;
            round.players = [];
            round.placements = [];
            this.races.pop();
            if (this.races.length > 0)
                Bracket.regenerate(this.rounds, true);
            else
                this.rounds = Bracket.generate(round.type, this.players.length, this.rounds.length);
            break;
        } case "next": {
            if (this.races.length > 0 && !this.rounds[this.races.length - 1].finished)
                throw new ValidationError("There is still an ongoing race.");

            Slots.register(this.id, SlotType.TOURNAMENT);

            Bracket.reduce(this.players, this.rounds);
            const round = this.rounds[this.races.length];
            if (round == null) {
                this.write();
                throw new ValidationError("There are no more rounds.");
            }

            const players = round.players;
            const race = new Race(this.hash, `${this.id.slice(0, -SUFFIX_LENGTH)}-${round.id}`, this.game, players, true, players.map(v => this.playerPasswords.get(v)!));
            this.races.push(race.id);
            break;
        } case "reload":
            for (let i = 0; i < this.races.length; i++)
                if (!this.calculatePlacements(i, true))
                    throw new ValidationError("Race data is currently unavailable. Try again later.", 503);
            break;
        default:
            throw new ValidationError("Command does not exist.");
        }

        return this.write();
    }
}
