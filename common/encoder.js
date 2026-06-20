class IVFWriter {
    constructor(name, width, height, framerate, fourcc) {
        this.timestep = 1000000 * framerate[1] / framerate[0];
        this.writeQueueSize = 0;
        this.queue = (async () => {
            const root = await navigator.storage.getDirectory();
            this.handle = await root.getFileHandle(name, { create: true });
            this.writable = await this.handle.createWritable();
        })();

        const header = new ArrayBuffer(32);
        const view = new DataView(header);

        view.setUint32(0, 0x46494b44, true);
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

export default class {
    constructor(width, height, framerate) {
        this.closing = false;
        this.closed = false;
        this.keyframeInterval = Math.max(30, Math.round(2 * framerate[0] / framerate[1]));
        this.timestep = 1000000 * framerate[1] / framerate[0];
        this.frame = 0;

        this.ivf = new IVFWriter("video.ivf", width, height, framerate, "VP90");

        this.encoder = new VideoEncoder({
            output: chunk => this.ivf.writeChunk(chunk),
            error: e => this.error(e),
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
        return this.encoder.encodeQueueSize <= 1 && this.ivf.writeQueueSize <= 1;
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

    error(e) {
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
