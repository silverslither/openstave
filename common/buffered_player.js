export default class {
    constructor() {
        this.ctx = new AudioContext({
            latencyHint: "interactive",
            sampleRate: 48000,
        });

        this.initialized = this.ctx.audioWorklet.addModule("/common/buffered_processor.js").then(() => {
            this.node = new AudioWorkletNode(
                this.ctx,
                "buffered-player",
            );
            this.node.connect(this.ctx.destination);
        });
    }

    async resume() {
        if (this.ctx.state !== "running")
            await this.ctx.resume();
    }

    async suspend() {
        if (this.ctx.state !== "suspended")
            await this.ctx.suspend();
    }

    push(buffer, offset) {
        this.node.port.postMessage([buffer, offset]);
    }

    setVolume(volume) {
        this.node.port.postMessage(volume);
    }

    async close() {
        this.ctx.close();
    }
}
