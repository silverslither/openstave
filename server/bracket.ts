export const Type = {
    ROUND_ROBIN: 0,
    SINGLE_ELIM: 1,
    DOUBLE_ELIM: 2,
} as const;

export type Type = typeof Type[keyof typeof Type];

type PlayerReference = {
    round: number;
    placementRange: [number, number];
};

type ClampedAffineTransform = {
    multiplier: number;
    adder: number;
    minimum: number;
    maximum: number;
};

export type Round = {
    type: Type;
    id: string;
    expected: number;
    pointsTransform: ClampedAffineTransform;
} & ({
    finished: true;
    players: string[];
    placements: number[];
} | {
    finished: false;
    players: (string | PlayerReference)[];
    placements: [];
});

type DoubleEliminationAfter = {
    w: number;
    l: number;
    streak: number;
    winners: (string | PlayerReference)[];
    losers: (string | PlayerReference)[];
};

type DoubleEliminationRound = Round & {
    type: typeof Type.DOUBLE_ELIM;
    after: DoubleEliminationAfter;
};

function affineTransform(n: number, multiplier: number = 1, adder = 0): ClampedAffineTransform {
    return {
        multiplier: -multiplier,
        adder: adder + n * multiplier,
        minimum: -Number.MAX_VALUE,
        maximum: Number.MAX_VALUE,
    };
}

function stepTransform(n: number, advancing: number = 1, other = 0): ClampedAffineTransform {
    const difference = advancing - other;
    if (difference === 0)
        return affineTransform(n, 0, other);

    return {
        multiplier: -difference,
        adder: other + difference * Math.ceil(0.5 * n),
        minimum: Math.min(advancing, other),
        maximum: Math.max(advancing, other),
    };
}

export function generate(type: Type, players: number, arg?: number) {
    switch (type) {
    case Type.ROUND_ROBIN:
        return generateRoundRobin(players, arg);
    case Type.SINGLE_ELIM:
        return generateSingleElimination(players);
    case Type.DOUBLE_ELIM:
        return generateDoubleElimination(players);
    }
}

export function reduce(seeding: string[], rounds: Round[]) {
    const start = Math.max(0, rounds.findLastIndex(round => round.finished));

    for (let i = start; i < rounds.length; i++) {
        const round = rounds[i];

        if (!round.finished) {
            round.players = round.players.flatMap<string | PlayerReference>((player) => {
                if (typeof player === "string")
                    return player;

                const [minimum, maximum] = player.placementRange;
                if (player.round === -1)
                    return seeding.slice(minimum, maximum);

                const previous = rounds[player.round];
                if (!previous.finished)
                    return player;

                return previous.players.filter((_, j) => {
                    const placement = previous.placements[j];
                    return placement >= minimum && placement < maximum;
                });
            });

            continue;
        }

        switch (round.type) {
        case Type.SINGLE_ELIM:
            regenerateSingleElimination(rounds, i);
            break;
        case Type.DOUBLE_ELIM:
            regenerateDoubleElimination(rounds as DoubleEliminationRound[], i);
            break;
        }
    }
}

export function points(rounds: Round[]): Record<string, number> {
    const scores: Record<string, number> = Object.create(null);

    for (const round of rounds) {
        if (!round.finished)
            continue;

        const { multiplier, adder, minimum, maximum } = round.pointsTransform;

        for (let i = 0; i < round.players.length; i++) {
            const player = round.players[i];

            const score = Math.min(
                maximum,
                Math.max(
                    minimum,
                    multiplier * round.placements[i] + adder,
                ),
            );

            scores[player] ??= 0;
            scores[player] += score;
        }
    }

    return scores;
}

function generateRoundRobin(n: number, c: number = 2 * Math.ceil(Math.log2(n))): Round[] {
    const rounds: Round[] = [];

    for (let i = 0; i < c; i++) {
        rounds.push({
            type: Type.ROUND_ROBIN,
            id: `R${rounds.length + 1}`,
            finished: false,
            expected: n,
            players: [
                { round: -1, placementRange: [0, n] },
            ],
            placements: [],
            pointsTransform: affineTransform(n),
        });
    }

    return rounds;
}

function generateSingleElimination(n: number, rounds: Round[] = []): Round[] {
    let players: (string | PlayerReference)[] = [{ round: -1, placementRange: [0, n] }];

    if (rounds.length > 0) {
        const previous = rounds.at(-1)!;
        players = [{ round: rounds.length - 1, placementRange: [0, Math.ceil(0.5 * previous.expected)] }];
    }

    while (n > 2) {
        const i = rounds.length;
        const next = Math.ceil(0.5 * n);

        rounds.push({
            type: Type.SINGLE_ELIM,
            id: `R${rounds.length + 1}`,
            finished: false,
            expected: n,
            players,
            placements: [],
            pointsTransform: next <= 2 ? affineTransform(n) : stepTransform(n, 2, 1),
        });

        players = [{ round: i, placementRange: [0, next] }];
        n = next;
    }

    return rounds;
}

function regenerateSingleElimination(rounds: Round[], i: number) {
    const round = rounds[i];
    if (!round.finished || i === rounds.length - 1)
        return;

    const cutoff = Math.ceil(0.5 * round.expected);
    const actual = round.placements.reduce((a, v) => a + Number(v < cutoff), 0);
    const extra = actual - rounds[i + 1].expected;
    if (extra === 0)
        return;

    rounds.length = i + 1;

    generateSingleElimination(actual, rounds);
}

function generateDoubleElimination(w: number, l: number = 0, rounds: DoubleEliminationRound[] = []): DoubleEliminationRound[] {
    let last = "L";
    let streak = 0;
    let prev: number | undefined;
    let winners: (string | PlayerReference)[] = [{ round: -1, placementRange: [0, w] }];
    let losers: (string | PlayerReference)[] = [{ round: -1, placementRange: [w, w + l] }];

    if (rounds.length > 0) {
        const node = rounds.at(-1)!;
        last = node.id[0];
        streak = node.after.streak;
        prev = node.players.length;
        winners = node.after.winners;
        losers = node.after.losers;
    }

    type Result = [bigint, string];
    const cache = new Map<string, Result>();

    function recurse(w: number, l: number, last: string, streak: number, prev?: number): Result {
        if (w + l === 4)
            return [0n, ""];
        if (w < 2)
            return [1n << 127n, ""];

        const key = `${w} ${l} ${last} ${streak} ${prev}`;
        if (cache.has(key))
            return cache.get(key)!;

        let result: Result = [1n << 127n, ""];

        if (w >= 3 && (prev == null || Math.max(prev, w) <= 2 * Math.min(prev, w) + 2)) {
            const wAfter = Math.ceil(0.5 * w);
            const tail = recurse(wAfter, l + w - wAfter, "W", 1, w);
            const cost = tail[0] + (last === "W" ? 1n << 96n : 0n) + (1n << 64n);
            result = [cost, `W${tail[1]}`];
        }

        if (l >= 3 && (prev == null || Math.max(prev, l) <= 2 * Math.min(prev, l) + 2)) {
            const lAfter = Math.ceil(0.5 * l);
            const tail = recurse(w, lAfter, "L", last === "L" ? Math.min(streak + 1, 2) : 1, l);
            const cost = tail[0] + (last === "L" && streak >= 2 ? 1n << 96n : 0n)
                + (1n << 64n) + (BigInt(l) << 40n) + BigInt(l * l);
            if (cost < result[0])
                result = [cost, `L${tail[1]}`];
        }

        cache.set(key, result);
        return result;
    }

    const sequence = recurse(w, l, last, streak, prev)[1];

    for (const c of sequence) {
        const i = rounds.length;

        if (c === "W") {
            const round: Round = {
                type: 2,
                id: `W${rounds.length + 1}`,
                finished: false,
                expected: w,
                players: winners,
                placements: [],
                pointsTransform: affineTransform(w, 0),
            };

            const wAfter = Math.ceil(0.5 * w);

            losers = [...losers, { round: i, placementRange: [wAfter, w] }];
            winners = [{ round: i, placementRange: [0, wAfter] }];

            l += w - wAfter;
            w = wAfter;
            streak = 1;
            last = "W";

            (round as DoubleEliminationRound).after = { w, l, streak, winners, losers };
            rounds.push(round as DoubleEliminationRound);
        } else {
            const round: Round = {
                type: 2,
                id: `L${rounds.length + 1}`,
                finished: false,
                expected: l,
                players: losers,
                placements: [],
                pointsTransform: affineTransform(l, 0),
            };

            l = Math.ceil(0.5 * l);
            losers = [{ round: i, placementRange: [0, l] }];
            streak = last === "L" ? Math.min(streak + 1, 2) : 1;
            last = "L";

            (round as DoubleEliminationRound).after = { w, l, streak, winners, losers };
            rounds.push(round as DoubleEliminationRound);
        }
    }

    let carry = 1;
    for (let i = rounds.length - 1; i > 0; i--) {
        const round = rounds[i];
        const losers = round.id[0] === "L";
        round.pointsTransform = stepTransform(
            round.expected,
            losers ? 1 : carry,
            losers ? 0 : -1,
        );
        carry = losers ? carry + 1 : 0;
    }

    rounds[0].pointsTransform = stepTransform(rounds[0].expected, carry + 2, 1);

    const players = [...winners, ...losers];
    const after = { w, l, streak, winners, losers };
    for (let i = 0; i < 3; i++) {
        rounds.push({
            type: 2,
            id: `F${i + 1}`,
            after,
            finished: false,
            expected: 4,
            players,
            placements: [],
            pointsTransform: affineTransform(4),
        });
    }

    return rounds;
}

function regenerateDoubleElimination(rounds: DoubleEliminationRound[], i: number) {
    const round = rounds[i];
    if (!round.finished || round.id[0] === "F")
        return;

    const cutoff = Math.ceil(0.5 * round.expected);
    const actual = round.placements.reduce((a, v) => a + Number(v < cutoff), 0);
    const extra = actual - (round.id[0] === "W" ? round.after.w : round.after.l);
    if (extra === 0)
        return;

    if (round.id[0] === "W") {
        round.after.w += extra;
        round.after.l -= extra;
    } else {
        round.after.l += extra;
    }
    rounds.length = i + 1;

    generateDoubleElimination(round.after.w, round.after.l, rounds);
}
