import type { Frame, PlayerEvent } from "./types.ts";
import { bufferHandler } from "./buffer.ts";

import { MAX_PLAYER_BYTES } from "./env.ts";

export default class Player {
    connected: boolean;
    username: string;
    password: string;
    game: string;
    frames: Frame[];
    start: number;
    end: number;
    dnf: number;
    splits: number[];
    buffers: Buffer[];
    total_length: number;

    get finished(): boolean {
        return this.end === this.end || this.dnf === this.dnf;
    }

    constructor(game: string = "", username: string = "", password: string = "") {
        this.connected = false;
        this.username = username;
        this.password = password;
        this.game = game;
        this.frames = [];
        this.start = NaN;
        this.end = NaN;
        this.dnf = NaN;
        this.splits = [];
        this.buffers = [];
        this.total_length = 0;
    }

    static from(obj: Record<string, any>) {
        const player = new Player();
        player.username = obj.username;
        player.password = obj.password;
        player.game = obj.game;
        if (typeof obj.frames[0] === "string")
            player.frames = obj.frames.map((v: any) => ({ data: Buffer.from(v, "base64") }));
        else
            player.frames = obj.frames.map((v: any) => ({ data: Buffer.from(v.data, "base64"), count: v.count, ram: Buffer.from(v.ram, "base64") }));
        player.start = obj.start ?? NaN;
        player.end = obj.end ?? NaN;
        player.dnf = obj.dnf ?? NaN;
        player.splits = obj.splits.map((v: number | null) => v ?? NaN);
        player.buffers = obj?.buffers?.map((v: string) => Buffer.from(v, "base64"));
        player.total_length = obj.total_length;
        return player;
    }

    add(chunk: Buffer) {
        if (this.finished || chunk.length === 0)
            return;

        if (chunk.length > MAX_PLAYER_BYTES - this.total_length) {
            this.eventHandler({ code: "DNF", data: null });
            this.buffers = [];
            return;
        }

        const buffer = Buffer.concat([...this.buffers, chunk]);
        this.total_length += chunk.length;
        const { buffer: remaining, events } = bufferHandler(buffer, this.frames, this.game);

        this.buffers = remaining.length === 0 ? [] : [remaining];

        for (const event of events)
            this.eventHandler(event);
    }

    eventHandler(event: PlayerEvent) {
        if (this.finished)
            return;

        switch (event.code) {
            case "START":
                if (this.start !== this.start)
                    this.start = event.data;
                break;
            case "END":
                if (this.start === this.start && this.end !== this.end) {
                    this.end = event.data;
                    this.frames.length = this.end + 1;
                }
                break;
            case "SPLIT":
                if (this.start === this.start && this.end !== this.end && event.data[0] >= 0 && (this.splits[event.data[0]] == null || Number.isNaN(this.splits[event.data[0]])))
                    this.splits[event.data[0]] = event.data[1];
                break;
            case "DNF":
                if (event.data == null || (this.start === this.start && this.end !== this.end)) {
                    if (this.start !== this.start)
                        this.start = this.frames.length;
                    this.dnf = event.data ?? this.frames.length - 1;
                    this.frames.length = this.dnf + 1;
                }
                break;
        }
    }

    minimize() {
        if (this.finished) {
            this.password = "";
            this.frames = this.frames.slice(this.start, (this.end === this.end ? this.end : this.dnf) + 1);
            this.end -= this.start;
            this.dnf -= this.start;
            this.splits = this.splits.map(v => v - this.start);
            this.buffers = [];
            this.total_length = 0;
            this.start = 0;
        }

        this.buffers = [Buffer.concat(this.buffers)];
    }

    getAuthString(address: string, port: number) {
        let str = `SERVER = { "${address}", ${port} }\n`;
        str += `USERNAME = "${this.username}"\n`;
        str += `PASSWORD = "${this.password}"\n\n`;
        return str;
    }
}
