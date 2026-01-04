import type { Frame, PlayerEvent } from "./types.ts";

const SMB1_SMB2J_WARPLESS_SPLITS = [...Array(31).keys()];

const SMB1_ANY_SPLITS = [
    0x000, // 1-1
    0x130, // 1-2 WZ
    0x030, // 4-1
    0x170, // 4-2 WZ
    0x070, // 8-1
    0x071, // 8-2
    0x072, // 8-3
];

const SMB2J_ANY_SPLITS = [
    0x000, // 1-1
    0x130, // 1-2 WZ
    0x030, // 4-1
    0x031, // 4-2
    0x032, // 4-3
    0x033, // 4-4
    0x040, // 5-1
    0x170, // 5-2 WZ
    0x070, // 8-1
    0x071, // 8-2
    0x072, // 8-3
];

const SMB3_ANYNWW_SPLITS = [
    0x00200040, // 1-1
    0x00200080, // 1-2
    0x002000a0, // 1-3
    0x00600060, // 1-F
    0x07700040, // 8-Tanks 1
    0x07700080, // 8-Navy
    0x17500140, // 8-Airship (Entry)
    0x07500140, // 8-Airship
    0x07700240, // 8-1
    0x07900220, // 8-2
    0x07700280, // 8-Fortress
    0x07700340, // 8-Tanks 2
]

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
                    SPLITS.indexOf(
                        (Number(current.ram[0] === 0x00) << 8) +
                        (current.ram[3] << 4) +
                        current.ram[4]
                    ),
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

const SMB3_ANYNWW_GENERATOR = (current: Frame, frames: Frame[], events: PlayerEvent[]) => {
    const last = frames.at(-1);
    if (last != null) {
        if (current.count !== last.count + 1) {
            events.push({ code: "DNF", data: frames.length - 1 });
            return;
        }

        const currentPosition =
            (current.ram[10] << 16) +
            (current.ram[11] << 8) +
            current.ram[12];
        const lastPosition =
            (last.ram[10] << 16) +
            (last.ram[11] << 8) +
            last.ram[12];

        // exit splits
        if (current.ram[2] === 0x00 &&
            current.ram[3] === 0x00 &&
            last.ram[2] !== 0x00 &&
            last.ram[3] !== 0x00) {

            events.push({
                code: "SPLIT",
                data: [
                    SMB3_ANYNWW_SPLITS.indexOf(
                        (current.ram[1] << 24) +
                        currentPosition
                    ),
                    frames.length,
                ],
            });
        }

        // entry splits
        if (currentPosition !== lastPosition) {
            events.push({
                code: "SPLIT",
                data: [
                    SMB3_ANYNWW_SPLITS.indexOf(
                        (1 << 28) +
                        (current.ram[1] << 24) +
                        currentPosition
                    ),
                    frames.length,
                ],
            });
        }

        const flags = current.ram[8];
        if (current.ram[0] === 0x00 &&
            current.ram[1] === 0x00 &&
            current.ram[2] === 0x00 &&
            current.ram[3] === 0x00 &&
            flags & 0b10) {

            events.push({ code: "START", data: frames.length });
        }

        if (current.ram[0] === 0x02 &&
            current.ram[1] === 0x07 &&
            current.ram[10] === 0x70 &&
            current.ram[11] === 0x03 &&
            current.ram[12] === 0xc0 &&
            flags & 0b100) {

            events.push({ code: "END", data: frames.length });
        }
    }
};

const eventGenerators = {
    "smb1_any%": (current: Frame, frames: Frame[], events: PlayerEvent[]) => SMB1_SMB2J_GENERATOR("smb1_any%", current, frames, events),
    "smb1_warpless": (current: Frame, frames: Frame[], events: PlayerEvent[]) => SMB1_SMB2J_GENERATOR("smb1_warpless", current, frames, events),
    "smb2j_any%": (current: Frame, frames: Frame[], events: PlayerEvent[]) => SMB1_SMB2J_GENERATOR("smb2j_any%", current, frames, events),
    "smb2j_warpless": (current: Frame, frames: Frame[], events: PlayerEvent[]) => SMB1_SMB2J_GENERATOR("smb2j_warpless", current, frames, events),
    "smb3_any%nww": SMB3_ANYNWW_GENERATOR,
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
