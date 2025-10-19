import TILES from "./tiles.js";
import NES_COLOURS from "./palette.js";

const FRAME_TIME_MS = 655171 / 39375;

const COMPONENT_NES_COLOURS = NES_COLOURS.map(v => v.slice(1).match(/../g).map(w => parseInt(w, 16)));
const OUTLINE_COLOURS = ["#ff0000", "#00ffff", "#00ff00", "#ff00ff", "#0000ff", "#ffff00", "#ffffff", "#000000"];
const COMPONENT_OUTLINE_COLOURS = OUTLINE_COLOURS.map(v => v.slice(1).match(/../g).map(w => parseInt(w, 16)));

const maps = {};
const text = {};

export async function init() {
    const promises = [];

    for (const i of ["00", "01", "02", "09", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "2a", "2b", "2c", "2d", "2e", "2f", "30", "31", "32", "33", "34", "35", "40", "41", "42", "44", "60", "61", "62", "63", "64", "65"]) {
        promises.push(new Promise((resolve) => {
            const image = new Image();
            image.addEventListener("load", async () => {
                maps[i] = await window.createImageBitmap(image);
                resolve();
            });
            image.src = `smb1/maps/${i}.png`;
        }));
    }

    for (const i of ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "+", "-", ".", ";", "[", "]"]) {
        promises.push(new Promise((resolve) => {
            const image = new Image();
            image.addEventListener("load", async () => {
                text[i] = await window.createImageBitmap(image);
                resolve();
            });
            image.src = `smb1/text/${i}.png`;
        }));
    }

    await Promise.all(promises);
}

class Outline {
    constructor() {
        this.selection = new Set();
        this.outline = new Set();
    }

    reset() {
        this.selection.clear();
        this.outline.clear();
    }

    add(x, y) {
        this.selection.add(this.#pair(x, y));
        this.outline.add(this.#pair(x + 1, y));
        this.outline.add(this.#pair(x - 1, y));
        this.outline.add(this.#pair(x, y + 1));
        this.outline.add(this.#pair(x, y - 1));
    }

    iterator() {
        const pixels = [];
        for (const pair of this.outline) {
            if (this.selection.has(pair))
                continue;
            const x = pair >>> 16;
            const y = pair & 0xffff;
            pixels.push([x, y]);
        }
        return pixels;
    }

    #pair(x, y) {
        return 65536 * x + y;
    }
}

class RendererCanvas {
    createBuffer(colour_components) {
        const c = new Uint32Array(new Uint8Array([...colour_components, 255]).buffer);

        if (this.buffer?.width === this.canvas.width && this.buffer?.height === this.canvas.height) {
            new Uint32Array(this.buffer.data.buffer).fill(c);
            return;
        }

        this.buffer = new ImageData(
            new Uint8ClampedArray(new Uint32Array(this.canvas.width * this.canvas.height).fill(c).buffer),
            this.canvas.width,
            this.canvas.height,
        );
    }

    toBuffer() {
        this.buffer = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height);
    }

    fromBuffer() {
        this.context.putImageData(this.buffer, 0, 0);
    }

    renderTileToBuffer(x, y, tile, attributes, palette, alpha) {
        const vflip = attributes >>> 7;
        const hflip = (attributes >>> 6) & 1;
        const p = attributes & 3;
        tile = TILES[tile];

        for (let j = 0; j < 8; j++) {
            for (let i = 0; i < 8; i++) {
                const o = ((vflip ? 7 - j : j) << 3) + (hflip ? 7 - i : i);
                if (tile[o] === 0)
                    continue;
                this.drawPixelToBuffer(x + i, y + j, palette[0x10 + (p << 2) + tile[o]], alpha);
            }
        }
    }

    drawOutline(colour_id, alpha) {
        if (this.outline == null)
            return;
        for (const [x, y] of this.outline.iterator())
            this.drawPixelToBuffer(x, y, colour_id, alpha);
    }

    drawPixelToBuffer(x, y, colour_id, alpha) {
        if (x < 0 || x >= this.buffer.width || y < 0 || y >= this.buffer.height)
            return;
        if (this.outline != null)
            this.outline.add(x, y);

        const invAlpha = 1.0 - alpha;
        const colour = typeof colour_id === "number" ? COMPONENT_NES_COLOURS[colour_id] : colour_id;
        const i = 4 * (y * this.buffer.width + x);
        if (alpha === 1.0) {
            for (let j = 0; j < 3; j++)
                this.buffer.data[i + j] = colour[j];
        } else {
            for (let j = 0; j < 3; j++)
                this.buffer.data[i + j] = colour[j] * alpha + this.buffer.data[i + j] * invAlpha + 0.5;
        }
    }

    drawText(x, y, str, align = "left") {
        str = str.toUpperCase().normalize("NFKD").replace(/:/g, ";");

        this.context.save();
        this.context.translate({ left: 0, right: -8, center: -4 }[align] * str.length, 0);

        for (let i = 0; i < str.length; i++)
            if (str[i] in text)
                this.context.drawImage(text[str[i]], x + i * 8, y);

        this.context.restore();
    }
}

export class PlayerCanvas extends RendererCanvas {
    constructor(id, players, following = "") {
        super();

        this.id = id;
        this.players = players;
        this.following = following;
        this.count = 0;

        this.canvas = document.createElement("canvas");
        this.canvas.id = `player${id}`;
        if (this.id === 0) {
            window.addEventListener("resize", () => this.resize().render(this.count));
            this.resize();
        } else {
            this.canvas.className = "floating";
            this.canvas.width = 384;
            this.canvas.height = 240;
        }
        this.canvas.addEventListener("mousedown", () => this.onclick());
        document.getElementById(id === 0 ? "screen" : "renderer").append(this.canvas);

        this.context = this.canvas.getContext("2d", { alpha: false, willReadFrequently: true });
        this.outline = new Outline();
    }

    onclick() {
        const players = Object.keys(this.players);
        const index = players.indexOf(this.following);
        if (index >= 0) {
            this.following = players[(index + 1) % players.length];
            this.render(this.count);
        }
    }

    resize() {
        this.scale = Math.max(Math.min(Math.floor(window.innerHeight / 240), Math.round(window.innerWidth / 240)), 1);
        const width = Math.ceil(window.innerWidth / this.scale);
        const height = 240;
        this.canvas.width = width;
        this.canvas.height = height;
        this.canvas.style.width = `${width * this.scale}px`;
        this.canvas.style.height = `${height * this.scale}px`;
        return this;
    }

    render(count) {
        this.count = count;
        this.xOffset = Math.floor((this.canvas.width - 256) / 2);

        this.following = this.following || Object.keys(this.players)[0];
        if (this.players[this.following] == null)
            return true;

        let frame = this.players[this.following].frames[count];
        let pframe = this.players[this.following].frames[count - 1] ?? frame;

        if (frame == null) {
            frame = this.players[this.following].frames.at(-1);
            pframe = this.players[this.following].frames.at(-2) ?? frame;
        }

        if (frame == null) {
            this.context.fillStyle = "#000000";
            this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.renderHUD();
            return true;
        }

        const gPalette = frame.subarray(0, 32);
        const gPlayerState = frame[32 + 256];
        const [
            ,
            gAreaId,
            ,
            gWorldNumber,
            gStageNumber,
            gAreaPage,
            gAreaPixel,
            gScreenPixel,
        ] = pframe.subarray(32 + 256);

        const q_gAreaPage = gPlayerState === 7 ? frame[32 + 256 + 5] : gAreaPage;
        const xOffset = this.xOffset - ((q_gAreaPage << 8) + gAreaPixel - gScreenPixel);

        if (gPlayerState === 0) {
            this.context.fillStyle = NES_COLOURS[gPalette[0]];
            this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.renderHUD();
            return false;
        }

        const outlineOrder = Object.keys(this.players);
        const drawOrder = [...outlineOrder];
        drawOrder.push(drawOrder.splice(drawOrder.indexOf(this.following), 1)[0]);

        const above = {};
        this.createBuffer(COMPONENT_NES_COLOURS[gPalette[0]]);
        for (const name of drawOrder) {
            const deferred = [];
            above[name] = deferred;

            let frame = this.players[name].frames[count];
            let pframe = this.players[name].frames[count - 1] ?? frame;

            if (frame == null) {
                frame = this.players[name].frames.at(-1);
                pframe = this.players[name].frames.at(-2) ?? frame;
            }

            if (frame == null)
                continue;

            const palette = frame.subarray(0, 32);
            const sprites = frame.subarray(32, 32 + 256);
            const playerState = frame[32 + 256];
            const [
                ,
                areaId,
                ,
                worldNumber,
                stageNumber,
                areaPage,
                areaPixel,
                screenPixel,
            ] = pframe.subarray(32 + 256);

            const q_areaPage = playerState === 7 ? frame[32 + 256 + 5] : areaPage;

            if (playerState === 0)
                continue;

            if (areaId !== gAreaId || worldNumber !== gWorldNumber || stageNumber !== gStageNumber)
                continue;

            let xOffset = this.xOffset;
            xOffset += (q_areaPage << 8) + areaPixel - screenPixel;
            xOffset -= (q_gAreaPage << 8) + gAreaPixel - gScreenPixel;

            const alpha = name === this.following ? 1.0 : 0.6;
            this.outline.reset();
            for (let i = 252; i >= 0; i -= 4) {
                const y = sprites[i];
                const tile = sprites[i + 1];
                const attributes = sprites[i + 2];
                const x = sprites[i + 3];

                if (tile !== 0xff && y < 240) {
                    if ((attributes >>> 5) & 1)
                        this.renderTileToBuffer(xOffset + x, y, tile, attributes, palette, alpha);
                    else
                        deferred.push([xOffset + x, y, tile, attributes, palette, alpha]);
                }
            }
            const o = outlineOrder.indexOf(name);
            this.drawOutline(COMPONENT_OUTLINE_COLOURS[o], name === this.following ? 1.0 : 0.8);
        }
        this.fromBuffer();

        const map = gAreaId.toString(16).padStart(2, "0");
        if (map in maps)
            this.context.drawImage(maps[map], xOffset, 0);

        this.toBuffer();
        for (const name of drawOrder) {
            const deferred = above[name];
            this.outline.reset();
            for (const sprite of deferred)
                this.renderTileToBuffer(...sprite);
            const o = outlineOrder.indexOf(name);
            this.drawOutline(COMPONENT_OUTLINE_COLOURS[o], name === this.following ? 1.0 : 0.8);
        }
        this.fromBuffer();

        this.renderHUD();
        return false;
    }

    renderHUD() {
        this.context.fillStyle = "#000000";
        this.context.fillRect(4, this.canvas.height - 20, this.following.length * 8 + 8, 16);
        this.drawText(8, this.canvas.height - 16, this.following);
        if (this.id === 0)
            this.drawText(this.canvas.width - 8, 8, formatTime(FRAME_TIME_MS * this.count), "right");
    }
}

export class LeaderboardCanvas extends RendererCanvas {
    constructor(players, playerCanvas) {
        super();

        this.players = players;
        this.playerCanvas = playerCanvas;
        this.count = 0;

        this.canvas = document.createElement("canvas");
        this.canvas.id = "leaderboard";
        window.addEventListener("resize", () => this.resize().render(this.count));
        this.resize();

        this.canvas.addEventListener("mousedown", (event) => {
            const y = (event.clientY - this.canvas.getBoundingClientRect().top) / this.scale - 16;
            const lines = this.getLines(this.count);
            if (event.clientX >= 8 && y >= 0 && y < 8 * lines.length) {
                this.playerCanvas.following = lines[Math.floor(y / 8)][1];
                this.playerCanvas.render(this.playerCanvas.count);
            } else {
                this.playerCanvas.onclick();
            }
        }, true);

        document.getElementById("screen").append(this.canvas);
        this.context = this.canvas.getContext("2d");
    }

    resize() {
        this.scale = Math.max(Math.min(Math.floor(window.innerHeight / 240), Math.round(window.innerWidth / 240)), 1);
        const width = 180;
        const height = 240;
        this.canvas.width = 2 * width;
        this.canvas.height = height;
        this.canvas.style.width = `${width * this.scale}px`;
        this.canvas.style.height = `${height * this.scale}px`;
        return this;
    }

    render(count) {
        this.count = count;

        const lines = this.getLines(count);
        const outlineOrder = Object.keys(this.players);

        this.context.fillStyle = "#000000";
        this.context.fillRect(8, 4, 8 * 44, 16 + 8 * lines.length);

        this.drawText(16, 8, "LEADERBOARD");

        for (let i = 0; i < lines.length; i++) {
            const y = 16 + 8 * i;
            const line = lines[i];
            const time = `${line[2]}${typeof line[3] === "string" ? line[3] : formatTime(FRAME_TIME_MS * line[3])}`;

            this.drawText(8 * 2, y, line[0]);
            this.drawText(8 * 5, y, line[1]);
            this.drawText(8 * (40 - time.length), y, time);
            this.drawText(8 * (44 - line[4].length), y, line[4]);
        }

        for (let i = 0; i < lines.length; i++) {
            this.context.fillStyle = "#a0a0a0";
            this.context.fillRect(8 * 4, 16 + 8 * i, 7, 7);
            this.context.fillStyle = OUTLINE_COLOURS[outlineOrder.indexOf(lines[i][1])];
            this.context.fillRect(8 * 4 + 2, 17 + 8 * i, 3, 5);
        }
    }

    getLines(count) {
        const lines = [];
        const leaderboard = Object.entries(this.players).map(v => {
            const splits = v[1].splits.slice(0, v[1].splits.findLastIndex(w => w != null && w <= count) + 1);
            if (v[1].time <= count)
                splits.push(v[1].time);
            splits.unshift(0);
            return [v[0], splits];
        }).sort((a, b) => b[1].length - a[1].length || a[1].at(-1) - b[1].at(-1));

        const nodnf = [], dnf = [];
        for (const entry of leaderboard) {
            if (this.players[entry[0]].dnf <= count)
                dnf.push([entry[0], this.players[entry[0]].dnf]);
            else
                nodnf.push(entry);
        }

        let comparison = nodnf[0]?.[1];
        let cumulative = 0;
        for (const [name, splits] of nodnf) {
            const line = [name];

            if (this.players[name].time <= count) {
                line.push("", this.players[name].time);
            } else if (splits.length === comparison.length) {
                cumulative += splits.at(-1) - comparison.at(-1);
                line.push("+", cumulative);
            } else {
                cumulative += Math.max(count - comparison.at(-1), splits.at(-1) - comparison[splits.length - 1]);
                line.push("+", cumulative);
            }

            comparison = splits;
            lines.push(line);
        }

        for (const [name] of dnf.sort((a, b) => b[1] - a[1])) {
            const line = [];
            line.push(name, "", "DNF");
            lines.push(line);
        }

        // placement
        let i = 1;
        let _i = 1;
        lines[0].unshift(i.toString());
        for (let j = 1; j < lines.length; j++) {
            _i += 1;
            if (lines[j - 1].at(-1) !== lines[j].at(-1))
                i = _i;
            lines[j].unshift(i.toString());
        }

        // remainders
        for (const line of lines) {
            const data = this.players[line[1]]?.frames[count];
            if (data != null && data[32 + 256 + 8] !== 0xff)
                line.push(`R${data[32 + 256 + 8].toString().padStart(2, "0")}`);
            else
                line.push("R--");
        }

        return lines;
    }
}

function formatTime(ms) {
    ms = Math.round(ms);
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    let t = "";
    t += `${(m % 60).toString().padStart(2, "0")}:`;
    t += `${(s % 60).toString().padStart(2, "0")}.`;
    t += (ms % 1000).toString().padStart(3, "0");
    return t;
}
