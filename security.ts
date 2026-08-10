import * as crypto from "node:crypto";

export const LowSecurityHasher = {
    hash: (password: string) => {
        if (typeof password !== "string" || password === "")
            return null;
        const salt = crypto.randomBytes(48).toString("base64");
        const hash = crypto.createHash("sha3-384").update(password + salt).digest("base64");
        return hash + salt;
    },
    verify: (password: string | null, hash: string | null) => {
        if (typeof password !== "string" || hash == null)
            return false;
        const salt = hash.slice(64);
        const h = crypto.createHash("sha3-384").update(password + salt).digest("base64");
        return h === hash.slice(0, 64);
    },
};
