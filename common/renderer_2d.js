import { COMPONENT_NES_COLOURS } from "./colours.js";

export class Outline {
    constructor() {
        this.selection = new Set();
        this.outline = new Set();
    }

    reset() {
        this.selection.clear();
        this.outline.clear();
    }

    add(x, y) {
        this.selection.add(this.pair(x, y));
        this.outline.add(this.pair(x + 1, y));
        this.outline.add(this.pair(x - 1, y));
        this.outline.add(this.pair(x, y + 1));
        this.outline.add(this.pair(x, y - 1));
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

    pair(x, y) {
        return (x << 16) + y;
    }
}

export class RendererCanvas {
    constructor(text) {
        this.text = text;
    }

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

    drawOutline(colour_id, alpha) {
        if (this.outline == null)
            return;
        for (const [x, y] of this.outline.iterator())
            this.drawPixelToBuffer(x, y, colour_id, alpha);
    }

    drawPixelToBuffer(x, y, colour_id, alpha) {
        if (x < 0 || x >= this.buffer.width || y < 0 || y >= this.buffer.height)
            return;
        this.outline?.add(x, y);

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
            if (Object.hasOwn(this.text, str[i]))
                this.context.drawImage(this.text[str[i]], x + 8 * i, y);

        this.context.restore();
    }
}

export function screenshot(pCanvas, lCanvas) {
    const pBuffer = pCanvas.context.getImageData(0, 0, pCanvas.canvas.width, pCanvas.canvas.height).data;
    const lBuffer = lCanvas.context.getImageData(0, 0, lCanvas.canvas.width, lCanvas.canvas.height).data;
    const oBuffer = new Uint8ClampedArray(4 * pBuffer.length);

    let oPixel = 0;
    for (let y = 0; y < 2 * pCanvas.canvas.height; y++) {
        const _y = 4 * (y >>> 1);
        const pOffset = _y * pCanvas.canvas.width;
        const lOffset = _y * lCanvas.canvas.width;

        for (let x = 0; x < 2 * pCanvas.canvas.width; x++, oPixel += 4) {
            const pPixel = pOffset + 4 * (x >>> 1);
            const lPixel = lOffset + 4 * x;

            if (x < lCanvas.canvas.width && lBuffer[lPixel + 3] !== 0) {
                const alpha = 0.00392156862745098 * lBuffer[lPixel + 3];
                oBuffer[oPixel + 0] = alpha * lBuffer[lPixel + 0] + (1.0 - alpha) * pBuffer[pPixel + 0];
                oBuffer[oPixel + 1] = alpha * lBuffer[lPixel + 1] + (1.0 - alpha) * pBuffer[pPixel + 1];
                oBuffer[oPixel + 2] = alpha * lBuffer[lPixel + 2] + (1.0 - alpha) * pBuffer[pPixel + 2];
            } else {
                oBuffer[oPixel + 0] = pBuffer[pPixel + 0];
                oBuffer[oPixel + 1] = pBuffer[pPixel + 1];
                oBuffer[oPixel + 2] = pBuffer[pPixel + 2];
            }
            oBuffer[oPixel + 3] = 255;
        }
    }

    return new ImageData(oBuffer, 2 * pCanvas.canvas.width, 2 * pCanvas.canvas.height);
}
