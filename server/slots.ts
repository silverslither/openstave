import { MAX_ACTIVE_RACES } from "../env.ts";
import { ValidationError } from "./wrapper.ts";

export const SlotType = {
    RACE: 0,
    TOURNAMENT: 1,
} as const;

export type SlotType = typeof SlotType[keyof typeof SlotType];

const slots: Set<string>[] = [new Set(), new Set()];

export const Slots = {
    register(id: string, type: SlotType, force = false) {
        if (slots[type].has(id))
            return;

        if (!force && slots[SlotType.RACE].size + slots[SlotType.TOURNAMENT].size >= MAX_ACTIVE_RACES)
            throw new ValidationError("The server is currently busy. Try again later.");

        slots[type].add(id);
    },
    deregister(id: string, type: SlotType) {
        slots[type].delete(id);
    },
};
