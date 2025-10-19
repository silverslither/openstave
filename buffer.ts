import type { Frame, PlayerEvent } from "./types.ts";

const SMB1_ANY_SPLITS = [
    0 * 4 + 0, // 1-1
    3 * 4 + 0 + 32, // 1-2 WZ
    3 * 4 + 0, // 4-1
    7 * 4 + 0 + 32, // 4-2 WZ
    7 * 4 + 0, // 8-1
    7 * 4 + 1, // 8-2
    7 * 4 + 2, // 8-3
];

const SMB1_WARPLESS_SPLITS = [...Array(31).keys()];

const eventGenerators = {
    "smb1_any%": (current: Frame, frames: Frame[], events: PlayerEvent[]) => {
        const last = frames.at(-1);
        if (last != null) {
            if (current.count !== last.count + 1) {
                events.push({ code: "DNF", data: frames.length - 1 });
                return;
            }

            if (last.ram[8] === 0xff && current.ram[8] !== 0xff) {
                events.push({
                    code: "SPLIT",
                    data: [
                        SMB1_ANY_SPLITS.indexOf(Number(current.ram[0] === 0x00) * 32 + current.ram[3] * 4 + current.ram[4]),
                        frames.length + current.ram[8],
                    ],
                });
            }

            if (current.ram[0] === 0x07 && last.ram[0] === 0x00 &&
                current.ram[1] === 0x25 &&
                current.ram[2] === 0x01 && last.ram[2] === 0x01 &&
                current.ram[3] === 0x00 &&
                current.ram[4] === 0x00 &&
                current.ram[5] === 0x00 &&
                current.ram[6] === 0x28) {

                events.push({ code: "START", data: frames.length + 2 });
            }

            if (last.ram[1] === 0x65 &&
                last.ram[2] === 0x02 &&
                last.ram[3] === 0x07 &&
                last.ram[4] === 0x03) {

                events.push({ code: "END", data: frames.length });
            }
        }
    },
    "smb1_warpless": (current: Frame, frames: Frame[], events: PlayerEvent[]) => {
        const last = frames.at(-1);
        if (last != null) {
            if (current.count !== last.count + 1) {
                events.push({ code: "DNF", data: frames.length - 1 });
                return;
            }

            if (last.ram[8] === 0xff && current.ram[8] !== 0xff) {
                events.push({
                    code: "SPLIT",
                    data: [
                        SMB1_WARPLESS_SPLITS.indexOf(Number(current.ram[0] === 0x00) * 32 + current.ram[3] * 4 + current.ram[4]),
                        frames.length + current.ram[8],
                    ],
                });
            }

            if (current.ram[0] === 0x07 && last.ram[0] === 0x00 &&
                current.ram[1] === 0x25 &&
                current.ram[2] === 0x01 && last.ram[2] === 0x01 &&
                current.ram[3] === 0x00 &&
                current.ram[4] === 0x00 &&
                current.ram[5] === 0x00 &&
                current.ram[6] === 0x28) {

                events.push({ code: "START", data: frames.length + 2 });
            }

            if (last.ram[1] === 0x65 &&
                last.ram[2] === 0x02 &&
                last.ram[3] === 0x07 &&
                last.ram[4] === 0x03) {

                events.push({ code: "END", data: frames.length });
            }
        }
    },
};

export const supportedGames = new Set(Object.keys(eventGenerators));

export function bufferHandler(buffer: Buffer, frames: Frame[], game: string) {
    const events: PlayerEvent[] = [];
    let l: number;
    while ((l = buffer.readUint32LE(0)) < buffer.length) {
        const current: Frame = {
            data: buffer.subarray(8, l),
            count: buffer.readUint32LE(4),
            ram: buffer.subarray(8 + 32 + 256, l),
        };
        buffer = buffer.subarray(l);

        eventGenerators[game](current, frames, events);
        frames.push(current);
    }

    return { buffer, events };
}
