import * as crypto from "node:crypto";

const timeout: Map<string, number> = new Map();

export const LowSecurityHasher = {
    hash(password: string) {
        if (typeof password !== "string" || password === "")
            return null;
        const salt = crypto.randomBytes(48).toString("base64");
        const hash = crypto.createHash("sha3-384").update(password + salt).digest("base64");
        return hash + salt;
    },
    verify(password: unknown, hash: string | null) {
        if (typeof password !== "string" || hash == null)
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
