import { COMPONENT_NES_COLOURS, COMPONENT_OUTLINE_COLOURS, NES_COLOURS } from "./colours.js";
import { formatTime, getPlacements, DEFAULT_COLUMNS } from "./leaderboard.js";
import { Outline, RendererCanvas } from "./renderer_2d.js";

export const FRAME_TIME_MS = 655171 / 39375;

let TILES;

const CHARACTERS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "-", "_", "+", ".", ";", "[", "]", "%"];
const SMB1_MAPS = ["00", "01", "02", "09", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "2a", "2b", "2c", "2d", "2e", "2f", "30", "31", "32", "33", "34", "35", "40", "41", "42", "44", "60", "61", "62", "63", "64", "65"];
const SMB2J_MAPS = ["00", "01", "02", "03", "04", "05", "06", "07", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "2a", "2b", "2c", "2d", "2e", "2f", "30", "31", "32", "33", "34", "35", "36", "38", "3b", "3c", "40", "41", "42", "43", "44", "60", "61", "62", "63", "64", "65", "66", "67", "68", "69", "80", "a0", "a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8", "a9", "aa", "ab", "c0", "c1", "e0", "e1", "e2", "e3"];

const maps = {};
const text = {};

let hide_sprite_zero = false;

export const LEADERBOARD_COLUMNS = [
    ...DEFAULT_COLUMNS,
    {
        align: "right",
        width: 4,
        field: (_line, player, count) => {
            const data = player.frames[count];
            if (data != null && data[32 + 256 + 8] !== 0xff)
                return `R${data[32 + 256 + 8].toString().padStart(2, "0")}`;
            return "R--";
        },
    },
];

export async function renderer_init(game) {
    if (game === "smb1")
        hide_sprite_zero = true;

    const promises = [];

    TILES = (await import(`/${game}/tiles.js`)).default.split(" ");

    for (let i = 0; i < TILES.length; i++) {
        let c = BigInt(`0x${TILES[i]}`);
        const a = [];
        for (let j = 0; j < 64; j++) {
            a.push(Number(c & 3n));
            c >>= 2n;
        }
        TILES[i] = a;
    }

    for (const i of (game === "smb1" ? SMB1_MAPS : SMB2J_MAPS)) {
        promises.push(new Promise((resolve) => {
            const image = new Image();
            image.addEventListener("load", async () => {
                maps[i] = await createImageBitmap(image);
                resolve();
            });
            image.src = encodeURI(`/${game}/maps/${i}.png`);
        }));
    }

    for (const i of CHARACTERS) {
        promises.push(new Promise((resolve) => {
            const image = new Image();
            image.addEventListener("load", async () => {
                text[i] = await createImageBitmap(image);
                resolve();
            });
            image.src = encodeURI(`/common/text/${i}.png`);
        }));
    }

    await Promise.all(promises);
}

export class PlayerCanvas extends RendererCanvas {
    constructor(id, players, following = 0) {
        super(text);

        this.alt = "";
        this.id = id;
        this.players = players;
        this.following = following;
        this.count = -1;

        this.canvas = document.createElement("canvas");
        this.canvas.id = `player${id}`;
        if (this.id === 0)
            window.addEventListener("resize", () => this.resize().render(this.count));
        this.resize();

        this.canvas.addEventListener("mousedown", event => this.onclick(event));
        this.canvas.addEventListener("contextmenu", event => event.preventDefault(), false);

        document.getElementById(id === 0 ? "screen" : "renderer").append(this.canvas);

        this.context = this.canvas.getContext("2d", { alpha: false, willReadFrequently: true });
        this.outline = new Outline();
    }

    renderBGTileToBuffer(x, y, tile, p, palette, alpha) {
        tile = TILES[tile];

        for (let j = 0; j < 8; j++) {
            for (let i = 0; i < 8; i++) {
                const o = (j << 3) + i;
                if (tile[o] === 0)
                    this.drawPixelToBuffer(x + i, y + j, palette[0], alpha);
                else
                    this.drawPixelToBuffer(x + i, y + j, palette[(p << 2) + tile[o]], alpha);
            }
        }
    }

    renderFGTileToBuffer(x, y, tile, attributes, palette, alpha) {
        const vflip = attributes >>> 7;
        const hflip = (attributes >>> 6) & 1;
        const u0 = (attributes >>> 2) & 1;
        const p = attributes & 3;
        tile = TILES[0x100 + tile + 0x8a * u0];

        for (let j = 0; j < 8; j++) {
            for (let i = 0; i < 8; i++) {
                const o = ((vflip ? 7 - j : j) << 3) + (hflip ? 7 - i : i);
                if (tile[o] !== 0)
                    this.drawPixelToBuffer(x + i, y + j + 1, palette[0x10 + (p << 2) + tile[o]], alpha);
            }
        }
    }

    getFollowing(count) {
        return typeof this.following === "string" ?
            this.following :
            getPlacements(this.players, Math.max(count, 0)).flat()[this.following]?.[0];
    }

    onclick(event) {
        if (event.button === 1) {
            this.following = 0;
        } else if (event.button === 2) {
            this.following = (typeof this.following === "string") ? 0 : this.following + 1;
            this.following %= Object.keys(this.players).length;
        } else {
            const players = Object.keys(this.players);
            const index = players.indexOf(this.following);
            if (index >= 0)
                this.following = players[(index + 1) % players.length];
            else
                this.following = players[0];
        }
        this.render(this.count);
    }

    resize() {
        if (this.id !== 0) {
            this.canvas.className = "floating";
            this.canvas.width = 384;
            this.canvas.height = 240;
            return this;
        }

        this.canvas.height = 240;
        this.scale = Math.max(Math.min(Math.floor(innerHeight / this.canvas.height), Math.round(innerWidth / 240)), 1);
        this.canvas.width = Math.ceil(innerWidth / this.scale);
        this.canvas.style.width = `${this.canvas.width * this.scale}px`;
        this.canvas.style.height = `${this.canvas.height * this.scale}px`;

        document.getElementById("size").innerText = `Size: ${2 * this.canvas.width}x${2 * this.canvas.height}`;
        return this;
    }

    clear(following) {
        this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.renderHUD(following);
    }

    render(count) {
        this.count = count;
        this.context.fillStyle = "#000000";

        const following = this.getFollowing(count);
        if (following == null)
            return true;

        if (count < 0) {
            this.clear(following);
            return true;
        }

        this.xOffset = Math.floor((this.canvas.width - 240) / 2);

        if (this.players[following] == null)
            return true;

        let frame = this.players[following].frames[count];
        let pframe = this.players[following].frames[count - 1] ?? frame;

        if (frame == null) {
            frame = this.players[following].frames.at(-1);
            pframe = this.players[following].frames.at(-2) ?? frame;
        }

        if (frame == null) {
            this.clear(following);
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

        if (gPlayerState === 0) {
            this.context.fillStyle = NES_COLOURS[gPalette[0]];
            this.clear(following);
            return false;
        }

        const q_gAreaPage = (gPlayerState === 7 ? frame[32 + 256 + 5] : gAreaPage) + (gScreenPixel === 255);
        const gLeftEdge = (q_gAreaPage << 8) + gAreaPixel - gScreenPixel;
        const gXOffset = this.xOffset - gLeftEdge;

        const outlineOrder = Object.keys(this.players);
        const drawOrder = [...outlineOrder];
        drawOrder.push(drawOrder.splice(drawOrder.indexOf(following), 1)[0]);

        const above = Object.create(null);
        const background = Object.create(null);
        this.createBuffer(COMPONENT_NES_COLOURS[gPalette[0]]);
        for (const name of drawOrder) {
            above[name] = [];
            background[name] = [];

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

            if (playerState === 0 || areaId !== gAreaId || worldNumber !== gWorldNumber || stageNumber !== gStageNumber)
                continue;

            const q_areaPage = (playerState === 7 ? frame[32 + 256 + 5] : areaPage) + (screenPixel === 255);
            const leftEdge = (q_areaPage << 8) + areaPixel - screenPixel;
            const xOffset = gXOffset + leftEdge;

            const alpha = name === following ? 1.0 : 0.6;
            this.outline.reset();
            for (let i = 252; i >= 0; i -= 4) {
                const y = sprites[i];
                const tile = sprites[i + 1];
                const attributes = sprites[i + 2];
                const x = sprites[i + 3];

                if ((!hide_sprite_zero || tile !== 0xff) && y < 240) {
                    if ((attributes >>> 5) & 1)
                        this.renderFGTileToBuffer(xOffset + x, y, tile, attributes, palette, alpha);
                    else
                        above[name].push([xOffset + x, y, tile, attributes, palette, alpha]);
                }
            }
            const o = outlineOrder.indexOf(name);
            this.drawOutline(COMPONENT_OUTLINE_COLOURS[o], name === following ? 1.0 : 0.8);

            let dynamic = frame.subarray(32 + 256 + 9);
            while (dynamic.length !== 0) {
                const opcode = dynamic[0];

                if (opcode < 0x10) { // skip sfx data
                    dynamic = dynamic.subarray(1);

                    if (opcode & 1)
                        dynamic = dynamic.subarray(2);
                    if (opcode & 2)
                        dynamic = dynamic.subarray(2);
                    if (opcode & 4)
                        dynamic = dynamic.subarray(2);
                    if (opcode & 8)
                        dynamic = dynamic.subarray(1);

                    continue;
                }

                const count = dynamic[1] || 0;
                const positions = dynamic.subarray(2, 2 + count * 2);
                if (positions.length !== count * 2)
                    break;

                for (let i = 0; i < positions.length; i += 2) {
                    const y = positions[i] & 0xf8;
                    const p = (positions[i] & 6) >>> 1;
                    const x = (positions[i] & 1) ? positions[i + 1] - 256 : positions[i + 1];
                    for (let j = 0; j < 4; j++)
                        background[name].push([xOffset + x + 8 * (j % 2), y + 8 * (j >>> 1), opcode + j, p, palette, alpha]);
                }
                dynamic = dynamic.subarray(2 + count * 2);
            }
        }
        this.fromBuffer();

        const map = gAreaId.toString(16).padStart(2, "0");
        if (Object.hasOwn(maps, map))
            this.context.drawImage(maps[map], gXOffset, 0);

        this.toBuffer();
        for (const name of drawOrder) {
            for (const tile of background[name])
                this.renderBGTileToBuffer(...tile);
        }
        for (const name of drawOrder) {
            this.outline.reset();
            for (const sprite of above[name])
                this.renderFGTileToBuffer(...sprite);
            const o = outlineOrder.indexOf(name);
            this.drawOutline(COMPONENT_OUTLINE_COLOURS[o], name === following ? 1.0 : 0.8);
        }
        this.fromBuffer();

        this.renderHUD(following);
        return false;
    }

    renderHUD(following) {
        if (typeof this.following === "number")
            following = `[${this.following + 1}] ${following}`;

        this.context.fillStyle = "#000000";
        this.context.globalAlpha = 0.7;
        this.context.fillRect(4, this.canvas.height - 20, following.length * 8 + 8, 16);
        this.context.globalAlpha = 1.0;

        this.drawText(8, this.canvas.height - 16, following);
        if (this.id === 0) {
            this.drawText(this.canvas.width - 8, 8, formatTime(FRAME_TIME_MS * Math.max(this.count, 0)), "right");
            if (this.alt === "")
                return;

            this.context.globalAlpha = 0.7;
            this.context.fillRect(this.canvas.width - this.alt.length * 8 - 12, this.canvas.height - 20, this.alt.length * 8 + 8, 16);
            this.context.globalAlpha = 1.0;

            this.drawText(this.canvas.width - 8, this.canvas.height - 16, this.alt, "right");
        }
    }
}
