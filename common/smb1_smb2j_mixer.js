import BufferedPlayer from "/common/buffered_player.js";

const FRAME_SAMPLES = 48 * 655171 / 39375;
const SS = x => Math.round(FRAME_SAMPLES * x);

const SFX = ["sq1_01", "sq1_02", "sq1_04", "sq1_08", "sq1_10", "sq1_20", "sq1_40", "sq1_80", "sq2_01", "sq2_02", "sq2_04", "sq2_08", "sq2_10", "sq2_20", "sq2_40", "sq2_80", "noise_01", "noise_02", "event_01"];

const sfx = {};

export async function mixer_init() {
    const promises = [];

    const context = new AudioContext({
        latencyHint: "interactive",
        sampleRate: 48000,
    });
    for (const i of SFX) {
        promises.push(
            fetch(`common/smb1_smb2j_sfx/${i}.opus`)
                .then(response => response.arrayBuffer())
                .then(buffer => context.decodeAudioData(buffer))
                .then(buffer => sfx[i] = buffer.getChannelData(0)),
        );
    }
    promises.push(context.close());

    await Promise.all(promises);
}

export class Mixer {
    constructor(players, bufferLength) {
        this.players = players;
        this.bufferLength = bufferLength;

        this.bufferedPlayer = new BufferedPlayer();
        this.buffer = new Float32Array(this.bufferLength);
    }

    mix(following, count, length) {
        let j = 0;

        for (let _ = 0, f = count; _ < length; _++, f++) {
            const ss_now = SS(count);
            const ss_fwd = SS(count + 1) - ss_now;

            const frame = this.players[following].frames[count];
            if (frame == null)
                break;

            const [
                gPlayerState,
                gAreaId,
                ,
                gWorldNumber,
                gStageNumber,
            ] = frame.subarray(32 + 256);

            if (gPlayerState === 0)
                continue;

            for (const player in this.players) {
                const frame = this.players[player].frames[count];
                if (frame == null)
                    continue;

                const [
                    playerState,
                    areaId,
                    ,
                    worldNumber,
                    stageNumber,
                ] = frame.subarray(32 + 256);

                if (playerState === 0 || areaId !== gAreaId || worldNumber !== gWorldNumber || stageNumber !== gStageNumber)
                    continue;

                const channels = [null, null, null];
                let dynamic = frame.subarray(32 + 256 + 9);
                while (dynamic.length !== 0) {
                    const opcode = dynamic[0];

                    if (opcode >= 0x10) { // skip tile data
                        dynamic = dynamic.subarray(2 + dynamic[1] * 2);
                        continue;
                    }

                    dynamic = dynamic.subarray(1);

                    if (opcode & 1) {
                        channels[0] = [`sq1_${dynamic[0].toString(16).padStart(2, "0")}`, dynamic[1]];
                        dynamic = dynamic.subarray(2);
                    }

                    if (opcode & 2) {
                        channels[1] = [`sq2_${dynamic[0].toString(16).padStart(2, "0")}`, dynamic[1]];
                        dynamic = dynamic.subarray(2);
                    }

                    if (opcode & 4) {
                        channels[2] = [`sq2_${dynamic[0].toString(16).padStart(2, "0")}`, dynamic[1]];
                        dynamic = dynamic.subarray(2);
                    }

                    if (opcode & 8)
                        channels[0] = ["event_01", dynamic[0]];

                    const alpha = player === following ? 1.0 : 0.7;

                    for (const channel of channels) {
                        if (channel == null)
                            continue;
                        const [id, offset] = channel;
                        const start = ss_now - SS(count - offset);
                        const effect = sfx[id]?.subarray(start, start + ss_fwd);
                        if (effect == null)
                            continue;
                        for (let i = 0; i < this.buffer.length && i < effect.length; i++)
                            this.buffer[i + j] += alpha * effect[i];
                    }

                    break;
                }
            }

            j += ss_fwd;
            count++;
        }
    }

    send(count, cf) {
        const samples = SS(count) - SS(count - cf);
        this.bufferedPlayer.resume();
        this.bufferedPlayer.push(this.buffer, samples);
        this.buffer = new Float32Array(this.bufferLength);
    }
}
