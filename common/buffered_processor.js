class BufferedProcessor extends AudioWorkletProcessor {
    constructor() {
        super();

        this.current = null;
        this.next = null;
        this.sample = 0;
        this.nextOffset = Infinity;

        this.port.onmessage = (e) => {
            const [buffer, offset] = e.data;

            if (this.current == null || offset == 0) {
                this.current = buffer;
                this.next = null;
                this.sample = 0;
                this.nextOffset = Infinity;
                return;
            }

            if (this.sample >= offset) {
                this.current = buffer;
                this.next = null;
                this.sample -= offset;
                if (this.sample > 2400) // 50 ms
                    this.sample = 0;
                this.nextOffset = Infinity;
                return;
            }

            this.next = buffer;
            this.nextOffset = offset;
        };
    }

    process(_inputs, outputs) {
        if (this.current == null) {
            this.sample = 0;
            return true;
        }

        const output = outputs[0];
        const end = this.sample + output[0].length;

        for (let c = 0; c < output.length; c++) {
            for (let i = this.sample, s = 0; i < end; i++, s++) {
                const j = i - this.nextOffset;
                if (this.next != null && j >= 0) {
                    if (j >= this.next.length)
                        break;
                    output[c][s] = this.next[j];
                } else if (i < this.current.length) {
                    output[c][s] = this.current[i];
                } else {
                    break;
                }
            }
        }

        this.sample = end;

        if (this.sample >= this.nextOffset) {
            this.current = this.next;
            this.next = null;
            this.sample -= this.nextOffset;
            this.nextOffset = Infinity;
        }

        if (this.sample >= this.current.length) {
            this.current = null;
            this.sample = 0;
        }

        return true;
    }
}

registerProcessor(
    "buffered-player",
    BufferedProcessor,
);
