import { MAX_PLAYER_BYTES } from "../env.ts";
import { INVALID_CHARACTERS, MAX_PLAYER_NAME_LENGTH } from "../web/common/limits.js";
import { bufferHandler, type Frame, type PlayerEvent } from "./buffer.ts";
import { ValidationError } from "./wrapper.ts";

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
    totalLength: number;

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
        this.totalLength = 0;
    }

    finished(): boolean {
        return this.end === this.end || this.dnf === this.dnf;
    }

    static validateNames(names: string[]) {
        for (const name of names) {
            if (name.length === 0)
                throw new ValidationError("Player names cannot be empty.");
            if (name.length > MAX_PLAYER_NAME_LENGTH)
                throw new ValidationError(`The player name ${name} is too long; the maximum allowed length is ${MAX_PLAYER_NAME_LENGTH} characters.`);
            if (INVALID_CHARACTERS.test(name))
                throw new ValidationError(`The player name ${name} contains forbidden characters (allowed characters are numbers, letters, hyphens, and underscores).`);
        }
    }

    static from(obj: Record<string, unknown>) {
        const player = new Player();
        player.username = obj.username as string;
        player.password = obj.password as string;
        player.game = obj.game as string;
        player.frames = (obj.frames as Record<string, unknown>[]).map(v => ({
            data: Buffer.from(v.data as string, "base64"),
            count: v.count as number,
            ram: Buffer.from(v.ram as string, "base64"),
        }));
        player.start = obj.start as number ?? NaN;
        player.end = obj.end as number ?? NaN;
        player.dnf = obj.dnf as number ?? NaN;
        player.splits = (obj.splits as number[]).map(v => v ?? NaN);
        player.buffers = (obj.buffers as string[])?.map(v => Buffer.from(v, "base64"));
        player.totalLength = obj.totalLength as number;
        return player;
    }

    add(chunk: Buffer) {
        if (this.finished() || chunk.length === 0)
            return;

        if (chunk.length > MAX_PLAYER_BYTES - this.totalLength) {
            this.eventHandler({ code: "DNF", data: null });
            this.buffers = [];
            return;
        }

        const buffer = Buffer.concat([...this.buffers, chunk]);
        this.totalLength += chunk.length;
        const { buffer: remaining, events } = bufferHandler(buffer, this.frames, this.game);

        this.buffers = remaining.length === 0 ? [] : [remaining];

        for (const event of events)
            this.eventHandler(event);
    }

    eventHandler(event: PlayerEvent) {
        if (this.finished())
            return;

        switch (event.code) {
        case "START":
            if (this.start !== this.start)
                this.start = event.data;
            break;
        case "END":
            if (this.start === this.start) {
                this.end = event.data;
                this.frames.length = this.end + 1;
            }
            break;
        case "SPLIT":
            if (this.start === this.start && event.data[0] >= 0 && (this.splits[event.data[0]] == null || Number.isNaN(this.splits[event.data[0]])))
                this.splits[event.data[0]] = event.data[1];
            break;
        case "DNF":
            if (event.data == null || this.start === this.start) {
                this.dnf = event.data ?? this.frames.length - 1;
                if (!(this.start <= this.dnf))
                    this.start = this.dnf + 1;
                this.frames.length = this.dnf + 1;
            }
            break;
        }
    }

    minimize() {
        if (this.finished()) {
            this.password = "";
            this.frames = this.frames.slice(this.start, (this.end === this.end ? this.end : this.dnf) + 1);
            this.end -= this.start;
            this.dnf -= this.start;
            this.splits = this.splits.map(v => v - this.start);
            this.buffers = [];
            this.totalLength = 0;
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
