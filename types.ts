export interface Frame {
    data: Buffer;
    count: number;
    ram: Buffer;
}

export type PlayerEvent =
    | { code: "START"; data: number }
    | { code: "END"; data: number }
    | { code: "SPLIT"; data: [index: number, frame: number] }
    | { code: "DNF"; data: number | null };
