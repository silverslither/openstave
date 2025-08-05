import type { Frame, PlayerEvent } from "./types.ts";
import { bufferHandler } from "./buffer.ts";

const BUFFER = 32767;

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

    constructor(username: string, password: string, game: string) {
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

    add(buffer: Buffer) {
        if (this.dnf === this.dnf)
            return;

        this.buffers.push(buffer);
        this.buffer_length += buffer.length;
        if (this.buffer_length > BUFFER) {
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
        if (this.dnf === this.dnf)
            return;

        switch (event.code) {
            case "START":
                if (this.start !== this.start)
                    this.start = event.data;
                break;
            case "END":
                if (this.end !== this.end)
                    this.end = event.data;
                break;
            case "SPLIT":
                if (this.start === this.start && this.end !== this.end)
                    this.splits.push(event.data);
                break;
            case "DNF":
                if (this.start === this.start && this.end !== this.end) {
                    this.dnf = event.data;
                    this.frames.length = this.dnf;
                }
                break;
        }
    }

    // FIXME: for race generation through HTTP endpoint, return lua files one time
    getScript() {
        return "";
    }
}
