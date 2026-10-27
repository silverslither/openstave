class IVFWriter {
    constructor(filename, width, height, framerate, fourcc) {
        this.timestep = 1000000 * framerate[1] / framerate[0];
        this.writeQueueSize = 0;
        this.queue = (async () => {
            const root = await navigator.storage.getDirectory();
            this.handle = await root.getFileHandle(filename, { create: true });
            this.writable = await this.handle.createWritable();
        })();

        const header = new ArrayBuffer(32);
        const view = new DataView(header);

        view.setUint32(0, 0x444b4946);
        view.setUint16(4, 0, true);
        view.setUint16(6, 32, true);

        for (let i = 0; i < 4; i++)
            view.setUint8(8 + i, fourcc.charCodeAt(i));

        view.setUint16(12, width, true);
        view.setUint16(14, height, true);

        view.setUint32(16, framerate[0], true);
        view.setUint32(20, framerate[1], true);

        view.setUint32(24, 0, true);
        view.setUint32(28, 0, true);

        this.queue = this.queue.then(async () => this.writable.write(header));
    }

    get idle() {
        return this.writeQueueSize <= 1;
    }

    writeChunk(chunk) {
        this.writeQueueSize++;
        this.queue = this.queue.then(async () => {
            const size = chunk.byteLength;
            const data = new Uint8Array(size);
            chunk.copyTo(data);

            const header = new ArrayBuffer(12);
            const view = new DataView(header);

            view.setUint32(0, size, true);
            view.setBigInt64(4, BigInt(Math.round(chunk.timestamp / this.timestep)), true);

            await this.writable.write(header);
            await this.writable.write(data);
            this.writeQueueSize--;
        });

        return this.queue;
    }

    async close() {
        await this.queue;
        await this.writable.close();
        return this.handle;
    }
}

export class VP9Encoder {
    constructor(width, height, framerate) {
        this.closing = false;
        this.closed = false;
        this.keyframeInterval = Math.max(30, Math.round(2 * framerate[0] / framerate[1]));
        this.timestep = 1000000 * framerate[1] / framerate[0];
        this.frame = 0;

        this.ivf = new IVFWriter("video.ivf", width, height, framerate, "VP90");

        this.encoder = new VideoEncoder({
            output: chunk => this.ivf.writeChunk(chunk),
            error: e => this.#error(e),
        });
        this.encoder.configure({
            codec: "vp09.01.52.08.03",
            width,
            height,
            framerate: framerate[0] / framerate[1],
            bitrateMode: "quantizer",
            hardwareAcceleration: "prefer-software",
        });
    }

    get idle() {
        return this.encoder.encodeQueueSize <= 1 && this.ivf.idle;
    }

    input(data) {
        if (this.closing)
            return this.closed;

        const frame = new VideoFrame(data.data, {
            timestamp: this.timestep * (this.frame++),
            codedWidth: data.width,
            codedHeight: data.height,
            format: "RGBA",
        });
        this.encoder.encode(frame, {
            keyFrame: this.frame % this.keyframeInterval === 1,
            vp9: { quantizer: 0 },
        });
        frame.close();

        return false;
    }

    #error(e) {
        console.error(e);
        this.close();
    }

    async close() {
        if (this.closing)
            return null;
        this.closing = true;

        await this.encoder.flush();
        this.encoder.close();

        const r = await this.ivf.close();
        this.closed = true;

        return r;
    }
}

export class RawAudioEncoder {
    constructor(rate) {
        this.closing = false;
        this.closed = false;

        this.writeQueueSize = 0;
        this.queue = (async () => {
            const root = await navigator.storage.getDirectory();
            this.handle = await root.getFileHandle("audio.wav", { create: true });
            this.writable = await this.handle.createWritable();
        })();

        const header = new ArrayBuffer(44);
        const view = new DataView(header);

        view.setUint32(0, 0x52494646);
        view.setUint32(4, 0xffffffff, true);
        view.setUint32(8, 0x57415645);
        view.setUint32(12, 0x666d7420);
        view.setUint32(16, 0x10, true);
        view.setUint16(20, 3, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, rate, true);
        view.setUint32(28, 4 * rate, true);
        view.setUint16(32, 4, true);
        view.setUint16(34, 32, true);
        view.setUint32(36, 0x64617461);
        view.setUint32(40, 0xffffffff, true);

        this.queue = this.queue.then(async () => this.writable.write(header));
    }

    get idle() {
        return this.writeQueueSize <= 1;
    }

    input(data) {
        if (this.closing)
            return this.closed;

        this.writeQueueSize++;
        this.queue = this.queue.then(async () => {
            await this.writable.write(data);
            this.writeQueueSize--;
        });

        return false;
    }

    async close() {
        if (this.closing)
            return null;
        this.closing = true;

        await this.queue;
        await this.writable.close();
        this.closed = true;

        return this.handle;
    }

}

export class MultiEncoder {
    constructor(encoders) {
        this.encoders = encoders;
    }

    get idle() {
        return this.encoders.every(v => v.idle);
    }

    input(data) {
        return this.encoders.some((v, i) => v.input(data[i]));
    }

    async close() {
        return Promise.all(this.encoders.map(v => v.close()));
    }
}
