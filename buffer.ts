import type { Frame, PlayerEvent } from "./types.ts";

const SMB1_SMB2J_WARPLESS_SPLITS = [...Array(31).keys()];

const SMB1_ANY_SPLITS = [
    0 * 4 + 0, // 1-1
    3 * 4 + 0 + 128, // 1-2 WZ
    3 * 4 + 0, // 4-1
    7 * 4 + 0 + 128, // 4-2 WZ
    7 * 4 + 0, // 8-1
    7 * 4 + 1, // 8-2
    7 * 4 + 2, // 8-3
];

const SMB2J_ANY_SPLITS = [
    0 * 4 + 0, // 1-1
    3 * 4 + 0 + 128, // 1-2 WZ
    3 * 4 + 0, // 4-1
    3 * 4 + 1, // 4-2
    3 * 4 + 2, // 4-3
    3 * 4 + 3, // 4-4
    4 * 4 + 0, // 5-1
    7 * 4 + 0 + 128, // 5-2 WZ
    7 * 4 + 0, // 8-1
    7 * 4 + 1, // 8-2
    7 * 4 + 2, // 8-3
];

const SMB1_SMB2J_GENERATOR = (game: string, current: Frame, frames: Frame[], events: PlayerEvent[]) => {
    const SPLITS = {
        "smb1_any%": SMB1_ANY_SPLITS,
        "smb1_warpless": SMB1_SMB2J_WARPLESS_SPLITS,
        "smb2j_any%": SMB2J_ANY_SPLITS,
        "smb2j_warpless": SMB1_SMB2J_WARPLESS_SPLITS,
    }[game];

    const START_AREA = game.split("_")[0] === "smb1" ? 0x25 : 0x20;
    const END_AREA = game.split("_")[0] === "smb1" ? 0x65 : 0x67;

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
                    SPLITS.indexOf(Number(current.ram[0] === 0x00) * 128 + current.ram[3] * 4 + current.ram[4]),
                    frames.length + current.ram[8],
                ],
            });
        }

        if (current.ram[0] === 0x07 && last.ram[0] === 0x00 &&
            current.ram[1] === START_AREA &&
            current.ram[2] === 0x01 && last.ram[2] === 0x01 &&
            current.ram[3] === 0x00 &&
            current.ram[4] === 0x00 &&
            current.ram[5] === 0x00 &&
            current.ram[6] === 0x28) {

            events.push({ code: "START", data: frames.length + 2 });
        }

        if (last.ram[1] === END_AREA &&
            last.ram[2] === 0x02 &&
            last.ram[3] === 0x07 &&
            last.ram[4] === 0x03) {

            events.push({ code: "END", data: frames.length });
        }
    }
};

const SMB3_GENERATOR = (game: string, current: Frame, frames: Frame[], events: PlayerEvent[]) => {
    const last = frames.at(-1);
    if (last != null) {
        if (current.count !== last.count + 1) {
            events.push({ code: "DNF", data: frames.length - 1 });
            return;
        }

        events.push({ code: "START", data: frames.length });
    }
};

const eventGenerators = {
    "smb1_any%": (current: Frame, frames: Frame[], events: PlayerEvent[]) => SMB1_SMB2J_GENERATOR("smb1_any%", current, frames, events),
    "smb1_warpless": (current: Frame, frames: Frame[], events: PlayerEvent[]) => SMB1_SMB2J_GENERATOR("smb1_warpless", current, frames, events),
    "smb2j_any%": (current: Frame, frames: Frame[], events: PlayerEvent[]) => SMB1_SMB2J_GENERATOR("smb2j_any%", current, frames, events),
    "smb2j_warpless": (current: Frame, frames: Frame[], events: PlayerEvent[]) => SMB1_SMB2J_GENERATOR("smb2j_warpless", current, frames, events),
    "smb3_test": (current: Frame, frames: Frame[], events: PlayerEvent[]) => SMB3_GENERATOR("smb3_test", current, frames, events),
};

export const supportedGames = new Set(Object.keys(eventGenerators));

const RAM_OFFSET = {
    "smb1": 8 + 32 + 256,
    "smb2j": 8 + 32 + 256,
    "smb3": 8 + 32 + 6 + 256,
};

export function bufferHandler(buffer: Buffer, frames: Frame[], game: string) {
    const events: PlayerEvent[] = [];
    let l: number;
    while ((l = buffer.readUint32LE(0)) < buffer.length) {
        const current: Frame = {
            data: buffer.subarray(8, l),
            count: buffer.readUint32LE(4),
            ram: buffer.subarray(RAM_OFFSET[game.split("_")[0]], l),
        };
        buffer = buffer.subarray(l);

        eventGenerators[game](current, frames, events);
        frames.push(current);
    }

    return { buffer, events };
}
