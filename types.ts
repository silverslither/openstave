export interface Frame {
    data: Buffer;
    count: number;
    ram: Buffer;
}

export interface PlayerEvent {
    code: "START" | "END" | "SPLIT" | "DNF";
    data: any;
}
