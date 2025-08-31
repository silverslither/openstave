import TILES from "./tiles.js";
import COLOURS from "./palette.js";

const COMPONENT_COLOURS = COLOURS.map(v => v.slice(1).match(/../g).map(w => parseInt(w, 16)));
const FRAME_TIME_MS = 655171 / 39375;

const maps = {};
const text = {};

export async function init() {
    const promises = [];

    for (const i of ["00", "01", "02", "09", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "2a", "2b", "2c", "2d", "2e", "2f", "30", "31", "32", "33", "34", "35", "40", "41", "42", "44", "60", "61", "62", "63", "64", "65"]) {
        maps[i] = new Image();
        promises.push(new Promise(resolve => maps[i].addEventListener("load", () => resolve())));
        maps[i].src = `smb1/maps/${i}.png`;
    }

    for (const i of ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "+", "-", ".", ";", "[", "]"]) {
        text[i] = new Image();
        promises.push(new Promise(resolve => text[i].addEventListener("load", () => resolve())));
        text[i].src = `smb1/text/${i}.png`;
    }

    await Promise.all(promises);
}

class RendererCanvas {
    toBuffer() {
        this.buffer = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height);
    }

    fromBuffer() {
        this.context.putImageData(this.buffer, 0, 0);
    }

    renderTileToBuffer(x, y, tile, attributes, palette) {
        const vflip = attributes >>> 7;
        const hflip = (attributes >>> 6) & 1;
        const p = attributes & 3;
        tile = TILES[tile];

        for (let j = 0; j < 8; j++) {
            for (let i = 0; i < 8; i++) {
                const o = ((vflip ? 7 - j : j) << 3) + (hflip ? 7 - i : i);
                if (tile[o] === 0)
                    continue;
                this.drawPixelToBuffer(x + i, y + j, palette[0x10 + (p << 2) + tile[o]]);
            }
        }
    }

    drawPixelToBuffer(x, y, colour_index) {
        if (x < 0 || x >= this.buffer.width || y < 0 || y >= this.buffer.height)
            return;
        const colour = COMPONENT_COLOURS[colour_index];
        const i = 4 * (y * this.buffer.width + x);
        this.buffer.data[i + 0] = colour[0];
        this.buffer.data[i + 1] = colour[1];
        this.buffer.data[i + 2] = colour[2];
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
        this.canvas.addEventListener("mousedown", () => {
            const players = Object.keys(this.players);
            const index = players.indexOf(this.following);
            if (index >= 0) {
                this.following = players[(index + 1) % players.length];
                this.render(this.count);
            }
        });
        document.getElementById(id === 0 ? "screen" : "renderer").append(this.canvas);

        this.context = this.canvas.getContext("2d");
    }

    resize() {
        const scale = Math.max(Math.min(Math.floor(window.innerHeight / 240), Math.round(window.innerWidth / 240)), 1);
        const width = Math.ceil(window.innerWidth / scale);
        const height = 240;
        this.canvas.width = width;
        this.canvas.height = height;
        this.canvas.style.width = `${width * scale}px`;
        this.canvas.style.height = `${height * scale}px`;
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

        this.context.fillStyle = COLOURS[gPalette[0]];
        this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);

        if (gPlayerState === 0) {
            this.renderHUD();
            return false;
        }

        const above = [];
        this.toBuffer();
        for (const name in this.players) {
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

            for (let i = 252; i >= 0; i -= 4) {
                const y = sprites[i];
                const tile = sprites[i + 1];
                const attributes = sprites[i + 2];
                const x = sprites[i + 3];

                if (tile !== 0xff && y < 240) {
                    if ((attributes >>> 5) & 1)
                        this.renderTileToBuffer(xOffset + x, y, tile, attributes, palette);
                    else
                        above.push([xOffset + x, y, tile, attributes, palette]);
                }
            }
        }
        this.fromBuffer();

        const map = gAreaId.toString(16).padStart(2, "0");
        if (map in maps)
            this.context.drawImage(maps[map], xOffset, 0);

        this.toBuffer();
        for (const sprite of above)
            this.renderTileToBuffer(...sprite);
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
    constructor(players) {
        super();

        this.players = players;
        this.count = 0;

        this.canvas = document.createElement("canvas");
        this.canvas.id = "leaderboard";
        window.addEventListener("resize", () => this.resize().render(this.count));
        this.resize();
        document.getElementById("screen").append(this.canvas);

        this.context = this.canvas.getContext("2d");
    }

    resize() {
        const scale = Math.max(Math.min(Math.floor(window.innerHeight / 240), Math.round(window.innerWidth / 240)), 1);
        const width = Math.ceil(window.innerWidth / scale);
        const height = 240;
        this.canvas.width = 2 * width;
        this.canvas.height = height;
        this.canvas.style.width = `${width * scale}px`;
        this.canvas.style.height = `${height * scale}px`;
        return this;
    }

    render(count) {
        this.count = count;

        const lines = this.formatLines(this.getLines(count));

        this.context.fillStyle = "#000000";
        this.context.fillRect(8, 4, lines[0].join(" ").length * 8 + 16, 8 * lines.length + 16);

        this.drawText(16, 8, "LEADERBOARD");

        for (let i = 0; i < lines.length; i++)
            this.drawText(16, i * 8 + 16, lines[i].join(" "));
    }

    getLines(count) {
        const lines = [];
        const leaderboard = Object.entries(this.players).map(v => {
            const splits = v[1].splits.slice(0, v[1].splits.findLastIndex(w => w != null && w <= count) + 1);
            if (v[1].time <= count)
                splits.push(v[1].time);
            return [v[0], splits];
        }).sort((a, b) => b[1].length - a[1].length || a[1].at(-1) - b[1].at(-1));

        const leader = leaderboard.find(v => !(this.players[v[0]].dnf <= count))?.[1];
        const leaderSplit = leader?.at(-1) ?? 0;
        const dnf = [];
        for (const [name, splits] of leaderboard) {
            if (this.players[name].dnf <= count) {
                dnf.push([name, this.players[name].dnf]);
                continue;
            }

            const line = [];
            line.push(name);
            if (this.players[name].time <= count)
                line.push(["", this.players[name].time]);
            else if (splits.length === leader.length)
                line.push(["+", (splits.at(-1) ?? 0) - leaderSplit]);
            else
                line.push(["+", count - leaderSplit]);
            lines.push(line);
        }
        for (const [name] of dnf.sort((a, b) => b[1] - a[1])) {
            const line = [];
            line.push(name);
            line.push(["", "DNF"]);
            lines.push(line);
        }

        // placement
        let i = 1;
        lines[0].unshift(i.toString());
        for (let j = 1; j < lines.length; j++) {
            if (lines[j - 1].at(-1) !== lines[j].at(-1))
                i += 1;
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

    formatLines(lines) {
        return lines.map(v => [
            v[0].padEnd(2),
            v[1].padEnd(25),
            (typeof v[2][1] === "string" ? v[2].join("") : `${v[2][0]}${formatTime(FRAME_TIME_MS * v[2][1])}`).padStart(10),
            v[3].padStart(4),
        ]);
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

