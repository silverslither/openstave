import { COMPONENT_NES_COLOURS, COMPONENT_OUTLINE_COLOURS, NES_COLOURS } from "../common/colours.js";
import { formatTime, getPlacements, DEFAULT_COLUMNS } from "../common/leaderboard.js";
import { Outline, RendererCanvas } from "../common/renderer_2d.js";

export const FRAME_TIME_MS = 655171 / 39375;

const A000_PRG_BANK_LOOKUP = [11, 15, 21, 16, 17, 19, 18, 18, 18, 20, 23, 19, 17, 19, 13, 26, 26, 26, 9];

let TILES;

const CHARACTERS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "-", "_", "+", ".", ";", "[", "]", "%"];
const MAPS = ["A13a7fa", "A13aa40", "A13ac58", "A13ad78", "A13ad98", "A13ade7", "A13ae36", "A13ae93", "A13aef0", "A13af38", "A13af80", "A13afde", "A13b03c", "A13b078", "A13b0b4", "A13b0f6", "A13b138", "A13b1ae", "A13b28a", "A13b371", "A13b3d7", "A13b46f", "A13b5e1", "A13b65a", "A13b718", "A13b8b3", "A13baa9", "A13bacc", "A15a5cc", "A15a728", "A15a74b", "A15a874", "A15a9ab", "A15aa60", "A15aaa7", "A15aade", "A15ac15", "A15ac3d", "A15ae08", "A15aef9", "A15af2f", "A15af6e", "A15b107", "A15b311", "A15b331", "A15b381", "A15b3e6", "A15b406", "A15b427", "A15b44a", "A15b64c", "A15b6b9", "A15b772", "A15b786", "A15b8bb", "A15ba31", "A15ba48", "A15ba82", "A15bb81", "A15bc92", "A15bce8", "A15bd32", "A15bd67", "A15bd87", "A15bdb7", "A15bdd7", "A15bdfa", "A15be1e", "A15be47", "A15be68", "A15bf99", "A15bfc1", "A16a6f8", "A16a78d", "A16a7cc", "A16a98d", "A16a9cc", "A16acb4", "A16acd1", "A16af29", "A16b0dc", "A16b283", "A16b3ea", "A16b404", "A16b421", "A16b441", "A16b49c", "A16b60c", "A16b6d4", "A16b897", "A16b9ec", "A17a8c9", "A17a938", "A17aa3c", "A17aa6a", "A17ab8b", "A17ac97", "A17ace9", "A17adcc", "A17af01", "A17b03b", "A17b0c3", "A17b14b", "A17b221", "A17b2be", "A17b380", "A17b3a7", "A17b500", "A17b624", "A17b7b9", "A17b910", "A17b930", "A17b992", "A17bae9", "A17bcaf", "A17bced", "A17bd2e", "A17bf0f", "A17bf28", "A17bf7d", "A17bf99", "A18ad5f", "A18adc3", "A18af17", "A18b059", "A18b21a", "A18b278", "A18b309", "A18b480", "A18b5ff", "A18b795", "A19ab37", "A19ab4e", "A19ab87", "A19aca8", "A19adaa", "A19ae60", "A19aeb7", "A19b00e", "A19b066", "A19b140", "A19b201", "A19b2ac", "A19b3b1", "A19b489", "A19b567", "A19b5ad", "A19b636", "A19b72b", "A19b837", "A19b873", "A19b951", "A19b98a", "A19b9aa", "A19ba4b", "A19bb1f", "A19bc22", "A19bcdd", "A19bd3f", "A19bd8e", "A19be16", "A19be47", "A19bed2", "A19bf5d", "A19bf76", "A19bfb2", "A19bfdb", "A20afdd", "A20afed", "A20b1d6", "A20b1f5", "A20b220", "A20b45e", "A20b62a", "A20b739", "A20b8a6", "A20b914", "A20bab9", "A20bbfb", "A20bc77", "A20bf0d", "A20bf27", "A20bf43", "A21a7f6", "A21a806", "A21a816", "A21a826", "A21a836", "A21a846", "A21a856", "A21a8b1", "A21a92f", "A21a95c", "A21aa29", "A21aa78", "A21ab0a", "A21ab80", "A21ac47", "A21ad25", "A21aea2", "A21aef5", "A21aeff", "A21afd7", "A21b031", "A21b125", "A21b150", "A21b1fe", "A21b28d", "A21b3ca", "A21b474", "A21b51d", "A21b5bd", "A21b6a5", "A21b753", "A21b879", "A21baac", "A21bc2c", "A21be46", "A21bfe5", "A23ac0f", "A23ac28", "A23ac41", "A23ac96", "A23adb6", "A23aeaa", "A23b008", "A23b139", "A23b2b2", "A23b424", "A23b43d", "A23b456", "A23b46f", "A23b488", "A23b616", "A23b6b0", "A23b7dd", "A23b8d2", "A23ba01", "A23ba4a", "A23ba9f", "A23baf4", "A23bb49", "A23bbb9", "A23bc14", "A23bcb7", "A23bd0c", "A23bd3d", "A23bd6e", "A23bd9f", "A23bdd0", "W0", "W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8"];

const maps = {};
const text = {};

export const LEADERBOARD_COLUMNS = DEFAULT_COLUMNS;

export async function renderer_init() {
    const promises = [];

    TILES = (await import("/smb3/tiles.js")).default.split(" ");

    for (let i = 0; i < TILES.length; i++) {
        let c = BigInt(`0x${TILES[i]}`);
        const a = [];
        for (let j = 0; j < 64; j++) {
            a.push(Number(c & 3n));
            c >>= 2n;
        }
        TILES[i] = a;
    }

    for (const i of MAPS) {
        promises.push(new Promise((resolve) => {
            const image = new Image();
            image.addEventListener("load", async () => {
                maps[i] = await createImageBitmap(image);
                resolve();
            });
            image.src = encodeURI(`/smb3/maps/${i}.png`);
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
        this.resize(192);

        this.canvas.addEventListener("mousedown", event => this.onclick(event));
        this.canvas.addEventListener("contextmenu", event => event.preventDefault(), false);

        document.getElementById(id === 0 ? "screen" : "renderer").append(this.canvas);

        this.context = this.canvas.getContext("2d", { alpha: false, willReadFrequently: true });
        this.outline = new Outline();
    }

    getCHRTile(banks, tile, bg = false) {
        if (!bg)
            return (banks[(tile >>> 6) + 2] << 6) + (tile & 0x3e);
        return (banks[tile >>> 7] << 6) + (tile & 0x7e);
    }

    renderBGTileToBuffer(x, y, tile, p, palette, alpha) {
        const lo = TILES[tile];
        const hi = TILES[tile + 1];

        for (let j = 0; j < 8; j++) {
            for (let i = 0; i < 8; i++) {
                const o = (j << 3) + i;

                if (lo[o] === 0)
                    this.drawPixelToBuffer(x + i, y + j, palette[0], alpha);
                else
                    this.drawPixelToBuffer(x + i, y + j, palette[(p << 2) + lo[o]], alpha);

                if (hi[o] === 0)
                    this.drawPixelToBuffer(x + i, y + j + 8, palette[0], alpha);
                else
                    this.drawPixelToBuffer(x + i, y + j + 8, palette[(p << 2) + hi[o]], alpha);
            }
        }
    }

    renderFGTileToBuffer(x, y, tile, attributes, palette, alpha) {
        const vflip = attributes >>> 7;
        const hflip = (attributes >>> 6) & 1;
        const p = attributes & 3;

        const lo = vflip ? TILES[tile + 1] : TILES[tile];
        const hi = vflip ? TILES[tile] : TILES[tile + 1];

        for (let j = 0; j < 8; j++) {
            for (let i = 0; i < 8; i++) {
                const o = ((vflip ? 7 - j : j) << 3) + (hflip ? 7 - i : i);
                if (lo[o] !== 0)
                    this.drawPixelToBuffer(x + i, y + j + 1, palette[0x10 + (p << 2) + lo[o]], alpha);
                if (hi[o] !== 0)
                    this.drawPixelToBuffer(x + i, y + j + 9, palette[0x10 + (p << 2) + hi[o]], alpha);
            }
        }
    }

    drawPixelToBuffer(x, y, colour_id, alpha) {
        if (this.outline?.selection?.has(this.outline?.pair(x, y)) || this.mask?.has(this.outline?.pair(x, y)))
            return;
        super.drawPixelToBuffer(x, y, colour_id, alpha);
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

    resize(height) {
        if (this.id !== 0) {
            this.canvas.className = "floating";
            this.canvas.width = 384;
            this.canvas.height = height ?? this.canvas.height;
            return this;
        }

        this.canvas.height = height ?? this.canvas.height;
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

        const following = typeof this.following === "string" ?
            this.following :
            getPlacements(this.players, Math.max(this.count, 0)).flat()[this.following]?.[0];
        if (following == null)
            return true;

        if (count < 0) {
            this.clear(following);
            return true;
        }

        this.xOffset = Math.floor((this.canvas.width - 256) / 2);
        this.yOffset = this.canvas.height - 193;

        if (this.players[following] == null)
            return true;

        let frame = this.players[following].frames[count];
        let pframe = this.players[following].frames[count - 1] ?? frame;
        let ppframe = this.players[following].frames[count - 2] ?? pframe;

        if (frame == null) {
            frame = this.players[following].frames.at(-1);
            pframe = this.players[following].frames.at(-2) ?? frame;
            ppframe = this.players[following].frames.at(-3) ?? pframe;
        }

        if (frame == null) {
            this.clear(following);
            return true;
        }

        if (count < 72) {
            this.context.fillStyle = "#000000";
            this.clear(following);
            return false;
        }

        const gPalette = frame.subarray(0, 32);
        const [
            gTileset,
            gWorldNumber,
            gAreaPointerLow,
            gAreaPointerHigh,
            gTopEdgePage,
            gTopEdgePixel,
            gLeftEdgePage,
            gLeftEdgePixel,
            ,
            ,
            gMapY,
            gMapXHigh,
            gMapXLow,
            gLevelType,
        ] = pframe.subarray(38 + 256);

        const gTransitionFlag = (frame[38 + 256 + 8] | pframe[38 + 256 + 8] | ppframe[38 + 256 + 8]) & 1;

        if (gTransitionFlag && (frame[38 + 256 + 8] & 4) === 0) {
            this.context.fillStyle = NES_COLOURS[gPalette[0]];
            this.clear(following);
            return false;
        }

        const gTransitionEffectTimer = (ppframe[38 + 256 + 9] + 1) & 0xff;

        const gAreaPointer = gAreaPointerLow + (gAreaPointerHigh << 8);
        const gTopEdge = (gTopEdgePage << 8) + gTopEdgePixel;
        const gLeftEdge = (gLeftEdgePage << 8) + gLeftEdgePixel;

        const gXOffset = this.xOffset - gLeftEdge;
        const gYOffset = (gAreaPointer === 0) ? this.yOffset + 13 : Math.min(this.yOffset - gTopEdge, 0);

        const outlineOrder = Object.keys(this.players);
        const drawOrder = [...outlineOrder];
        drawOrder.push(drawOrder.splice(drawOrder.indexOf(following), 1)[0]);

        const above = Object.create(null);
        const mask = Object.create(null);
        const background = Object.create(null);
        this.createBuffer(COMPONENT_NES_COLOURS[gPalette[0]]);
        for (const name of drawOrder) {
            above[name] = [];
            mask[name] = [];
            background[name] = [];

            let frame = this.players[name].frames[count];
            let pframe = this.players[name].frames[count - 1] ?? frame;
            let ppframe = this.players[name].frames[count - 2] ?? pframe;

            if (frame == null) {
                frame = this.players[name].frames.at(-1);
                pframe = this.players[name].frames.at(-2) ?? frame;
                ppframe = this.players[name].frames.at(-3) ?? pframe;
            }

            if (frame == null)
                continue;

            const palette = frame.subarray(0, 32);
            const banks = frame.subarray(32, 38);
            const sprites = frame.subarray(38, 38 + 256);
            const [
                tileset,
                worldNumber,
                areaPointerLow,
                areaPointerHigh,
                topEdgePage,
                topEdgePixel,
                leftEdgePage,
                leftEdgePixel,
                ,
                ,
                mapY,
                mapXHigh,
                mapXLow,
            ] = pframe.subarray(38 + 256);

            const transitionFlag = (frame[38 + 256 + 8] | pframe[38 + 256 + 8] | ppframe[38 + 256 + 8]) & 1;
            const areaPointer = areaPointerLow + (areaPointerHigh << 8);

            if (transitionFlag || tileset !== gTileset || worldNumber !== gWorldNumber || areaPointer !== gAreaPointer || (areaPointer !== 0 && (mapY !== gMapY || mapXHigh !== gMapXHigh || mapXLow !== gMapXLow)))
                continue;

            const topEdge = (topEdgePage << 8) + topEdgePixel;
            const leftEdge = (leftEdgePage << 8) + leftEdgePixel;

            const xOffset = gXOffset + leftEdge;
            const yOffset = (areaPointer === 0) ? gYOffset - 25 : gYOffset + topEdge;

            const alpha = name === following ? 1.0 : 0.6;
            this.outline.reset();
            for (let i = 0; i < 256; i += 4) {
                const y = sprites[i];
                const tile = this.getCHRTile(banks, sprites[i + 1]);
                const attributes = sprites[i + 2];
                const x = sprites[i + 3];

                if (y >= 192 || x === 0 || x === 255)
                    continue;

                // send world map side tiles and w8 dark room tiles to background
                if (((attributes >>> 5) & 1) || (0x800 <= tile && tile <= 0x80b) || (0x880 <= tile && tile <= 0x887)) {
                    this.renderFGTileToBuffer(xOffset + x, yOffset + y, tile, attributes, palette, alpha);
                } else {
                    above[name].push([xOffset + x, yOffset + y, tile, attributes, palette, alpha]);
                    mask[name].push(new Set(this.outline.selection));
                }
            }
            const o = outlineOrder.indexOf(name);
            this.drawOutline(COMPONENT_OUTLINE_COLOURS[o], name === following ? 1.0 : 0.8);

            let dynamic = frame.subarray(38 + 256 + 14);
            while (dynamic.length !== 0) {
                const opcode = dynamic[0];
                const count = dynamic[1] || 0;

                const positions = dynamic.subarray(2, 2 + count * 2);
                if (positions.length !== count * 2)
                    break;

                for (let i = 0; i < positions.length; i += 2) {
                    const y = (positions[i] >>> 2) << 3;
                    const p = positions[i] & 3;
                    const x = positions[i + 1];
                    for (let j = 0; j < 2; j++)
                        background[name].push([xOffset + x + 8 * j, gYOffset + y, this.getCHRTile(banks, opcode + 2 * j, true), p, palette, alpha]);
                }
                dynamic = dynamic.subarray(2 + count * 2);
            }
        }
        this.fromBuffer();

        const map = gAreaPointer === 0 ?
            `W${gWorldNumber}` :
            `A${A000_PRG_BANK_LOOKUP[gTileset]}${gAreaPointer.toString(16).padStart(4, "0")}`;
        if (Object.hasOwn(maps, map))
            this.context.drawImage(maps[map], gXOffset, gYOffset);

        this.toBuffer();
        for (const name of drawOrder) {
            this.outline.reset();
            for (const tile of background[name])
                this.renderBGTileToBuffer(...tile);
        }
        for (const name of drawOrder) {
            this.outline.reset();

            for (let i = 0; i < above[name].length; i++) {
                this.mask = mask[name][i];
                this.renderFGTileToBuffer(...above[name][i]);
            }
            this.mask = undefined;

            const o = outlineOrder.indexOf(name);
            this.drawOutline(COMPONENT_OUTLINE_COLOURS[o], name === following ? 1.0 : 0.8);
        }
        this.fromBuffer();

        if (gLevelType === 0xa0 && Object.hasOwn(maps, map)) {
            const image = maps[map];
            const yOffset = Math.max(this.yOffset - gTopEdge, 0);
            this.context.drawImage(image, 0, 400, image.width, 32, gXOffset, this.canvas.height - 32 - yOffset, image.width, 32);
            this.context.drawImage(image, 0, 416, image.width, 16, gXOffset, this.canvas.height - yOffset, image.width, 32);
            this.context.drawImage(image, 0, 416, image.width, 16, gXOffset, this.canvas.height + 16 - yOffset, image.width, 32);
        }

        if (gTransitionEffectTimer > 1)
            this.renderTransition(gTransitionEffectTimer);

        this.renderHUD(following);
        return false;
    }

    renderTransition(timer) {
        timer--;
        const params = [11, 192 - 11, 256, 0];
        let j = 0;
        for (let i = timer; i <= 0x30; i++) {
            params[j] -= 8;
            j = (j + 1) & 3;
        }

        let [y1, y2, x2, x1] = params;
        x1 = this.xOffset - x1;
        x2 += this.xOffset;
        y1 = this.yOffset - y1;
        y2 += this.yOffset;
        this.context.fillStyle = "#000000";
        this.context.fillRect(0, 0, this.canvas.width, y1);
        this.context.fillRect(0, y2, this.canvas.width, this.canvas.height - y2);
        this.context.fillRect(0, y1, x1, y2 - y1);
        this.context.fillRect(x2, y1, this.canvas.width - x2, y2 - y1);
    }

    renderHUD(following) {
        if (typeof this.following === "number")
            following = `[${this.following + 1}] ${following}`;

        this.context.fillStyle = "#000000";
        this.context.globalAlpha = 0.7;
        this.context.fillRect(4, this.canvas.height - 20, 8 * following.length + 8, 16);
        this.context.globalAlpha = 1.0;

        this.drawText(8, this.canvas.height - 16, following);
        if (this.id === 0) {
            this.drawText(this.canvas.width - 8, 8, formatTime(FRAME_TIME_MS * Math.max(this.count, 0)), "right");
            if (this.alt === "")
                return;

            this.context.globalAlpha = 0.7;
            this.context.fillRect(this.canvas.width - 8 * this.alt.length - 12, this.canvas.height - 20, 8 * this.alt.length + 8, 16);
            this.context.globalAlpha = 1.0;

            this.drawText(this.canvas.width - 8, this.canvas.height - 16, this.alt, "right");
        }
    }
}
