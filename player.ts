import type { Frame, PlayerEvent } from "./types.ts";
import { bufferHandler } from "./buffer.ts";

import { PLAYER_BUFFER } from "./env.ts";

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
    buffer_length: number;

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
        this.buffer_length = 0;
    }

    static from(obj: any) {
        const player = new Player();
        player.username = obj.username;
        player.password = obj.password;
        player.game = obj.game;
        player.frames = obj.frames.map((v: any) => ({ data: Buffer.from(v.data, "base64"), count: v.count, ram: Buffer.from(v.ram, "base64") }));
        player.start = obj.start ?? NaN;
        player.end = obj.end ?? NaN;
        player.dnf = obj.dnf ?? NaN;
        player.splits = obj.splits;
        player.buffers = obj.buffers.map((v: string) => Buffer.from(v, "base64"));
        player.buffer_length = obj.buffer_length;
        return player;
    }

    add(buffer: Buffer) {
        if (this.finished)
            return;

        this.buffers.push(buffer);
        this.buffer_length += buffer.length;
        if (this.buffer_length > PLAYER_BUFFER) {
            const buffer: Buffer = Buffer.concat(this.buffers);
            const { buffer: _buffer, events } = bufferHandler(buffer, this.frames, this.game);

            this.buffers.length = 0;
            this.buffers.push(_buffer);
            this.buffer_length = _buffer.length;

            for (const event of events)
                this.eventHandler(event);
        }
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
                if (this.start === this.start && this.end !== this.end && event.data[0] >= 0 && this.splits[event.data[0]] == null)
                    this.splits[event.data[0]] = event.data[1];
                break;
            case "DNF":
                if (this.start === this.start && this.end !== this.end) {
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
            this.splits = this.splits.map(v => v -= this.start);
            this.buffers = [];
            this.buffer_length = 0;
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
