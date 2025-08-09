import tiles from "./tiles.js";
import colours from "./palette.js";

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

    for (const i of ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", ".", ";", "[", "]"]) {
        text[i] = new Image();
        promises.push(new Promise(resolve => text[i].addEventListener("load", () => resolve())));
        text[i].src = `smb1/text/${i}.png`;
    }

    await Promise.all(promises);
}

export class PlayerCanvas {
    constructor(id, players, following = "") {
        this.id = id;
        this.players = players;
        this.following = following;
        this.count = 0;

        this.canvas = document.createElement("canvas");
        this.canvas.id = `canvas${id}`;
        if (this.id === 0) {
            window.addEventListener("resize", () => this.resize());
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
        document.getElementById("player").append(this.canvas);

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
    }

    render(count) {
        this.count = count;
        this.xOffset = (this.canvas.width - 256) >>> 1;

        // FIXME: add follow first place feature, after splits have been implemented
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

        const xOffset = this.xOffset - ((gAreaPage << 8) + gAreaPixel - gScreenPixel);

        this.context.fillStyle = colours[gPalette[0]];
        this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);

        if (gPlayerState === 0) {
            this.renderHUD();
            return false;
        }

        const above = [];
        for (const player in this.players) {
            let frame = this.players[player].frames[count];
            let pframe = this.players[player].frames[count - 1] ?? frame;

            if (frame == null) {
                frame = this.players[player].frames.at(-1);
                pframe = this.players[player].frames.at(-2) ?? frame;
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

            if (playerState === 0)
                continue;

            if (areaId !== gAreaId || worldNumber !== gWorldNumber || stageNumber !== gStageNumber)
                continue;

            let xOffset = this.xOffset;
            xOffset += (areaPage << 8) + areaPixel - screenPixel;
            xOffset -= (gAreaPage << 8) + gAreaPixel - gScreenPixel;

            for (let i = 252; i >= 0; i -= 4) {
                const y = sprites[i];
                const tile = sprites[i + 1];
                const attributes = sprites[i + 2];
                const x = sprites[i + 3];

                if (tile !== 0xff && y < 240) {
                    if ((attributes >>> 5) & 1)
                        this.renderTile(xOffset + x, y, tile, attributes, palette);
                    else
                        above.push([xOffset + x, y, tile, attributes, palette]);
                }
            }
        }

        const map = gAreaId.toString(16).padStart(2, "0");
        if (map in maps)
            this.context.drawImage(maps[map], xOffset, 0);

        for (const sprite of above)
            this.renderTile(...sprite);

        this.renderHUD();
        return false;
    }

    renderHUD() {
        this.drawText(8, 8, this.following);
        if (this.id === 0)
            this.drawText(this.canvas.width - 8, 8, `time ${this.time(FRAME_TIME_MS * this.count)}`, "right");
    }

    // FIXME: optimize rendering to use ImageData, this is copied straight from code written years ago
    renderTile(x, y, tile, attributes, palette) {
        const vflip = attributes >>> 7;
        const hflip = (attributes >>> 6) & 1;
        const p = attributes & 3;
        tile = tiles[tile];

        for (let j = 0; j < 8; j++) {
            for (let i = 0; i < 8; i++) {
                const o = ((vflip ? 7 - j : j) << 3) + (hflip ? 7 - i : i);
                if (tile[o] === 0)
                    continue;
                this.drawPixel(x + i, y + j, colours[palette[0x10 + (p << 2) + tile[o]]]);
            }
        }
    }

    drawPixel(x, y, c) {
        this.context.fillStyle = c;
        this.context.fillRect(x, y, 1, 1);
    }

    drawText(x, y, str, align = "left") {
        str = str.toUpperCase().normalize("NFKD").replace(/:/g, ";").replace(/[^0-9A-Z ;.[\]]/g, "");

        this.context.save();
        this.context.translate({ left: 0, right: -8, center: -4 }[align] * str.length, 0);

        for (let i = 0; i < str.length; i++)
            if (str[i] in text)
                this.context.drawImage(text[str[i]], x + i * 8, y);

        this.context.restore();
    }

    time(ms) {
        ms = Math.round(ms);
        const s = Math.floor(ms / 1000);
        const m = Math.floor(s / 60);
        let t = "";
        t += `${(m % 60).toString().padStart(2, "0")}:`;
        t += `${(s % 60).toString().padStart(2, "0")}.`;
        t += (ms % 1000).toString().padStart(3, "0");
        return t;
    }
}
