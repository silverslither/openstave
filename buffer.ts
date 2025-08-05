import type { Frame, PlayerEvent } from "./types.ts";

const eventGenerators = {
    "smb1_any%": (current: Frame, frames: Frame[], events: PlayerEvent[]) => {
        const last = frames.at(-1);
        if (last != null) {
            if (current.count !== last.count + 1) {
                events.push({ code: "DNF", data: frames.length });
                return;
            }

            // FIXME
            /*
            if (current.ram[0] === 0x07)
                events.push({ code: "SPLIT", data: frames.length });
            */

            if (current.ram[0] === 0x07 &&
                current.ram[1] === 0x25 &&
                current.ram[2] === 0x01 &&
                current.ram[3] === 0x00 &&
                current.ram[4] === 0x00 &&
                current.ram[5] === 0x00 &&
                current.ram[6] === 0x28) {

                events.push({ code: "START", data: frames.length + 2 });
            }

            if (current.ram[1] === 0x65 &&
                current.ram[2] === 0x02 &&
                current.ram[3] === 0x07 &&
                current.ram[4] === 0x03) {

                events.push({ code: "END", data: frames.length + 1 });
            }
        }
    }
};

export const supportedGames = new Set(Object.keys(eventGenerators));

export function bufferHandler(buffer: Buffer, frames: Frame[], game: string) {
    const events: PlayerEvent[] = [];
    let l: number;
    while ((l = buffer.readUint32LE(0)) < buffer.length) {
        const current: Frame = {
            data: buffer.subarray(8, l),
            count: buffer.readUint32LE(4),
            ram: buffer.subarray(8 + 32 + 256, l)
        };
        buffer = buffer.subarray(l);

        eventGenerators[game](current, frames, events);
        frames.push(current);
    }

    return { buffer, events };
}
