import * as crypto from "node:crypto";

import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "../web/common/limits.js";
import { ValidationError } from "./wrapper.ts";

const timeout: Map<string, number> = new Map();

export const LowSecurityHasher = {
    hash(password: string) {
        if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH)
            throw new ValidationError(`Passwords must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters long.`);

        const salt = crypto.randomBytes(48).toString("base64");
        const hash = crypto.createHash("sha3-384").update(password + salt).digest("base64");
        return hash + salt;
    },
    verify(password: string, hash: string | null) {
        if (hash == null)
            return 1;
        if (Number(timeout.get(hash)) > Date.now() - 1000)
            return 2;

        const salt = hash.slice(64);
        const h = crypto.createHash("sha3-384").update(password + salt).digest("base64");

        if (h === hash.slice(0, 64))
            return 0;

        timeout.set(hash, Date.now());
        return 1;
    },
};
