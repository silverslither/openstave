import * as crypto from "node:crypto";

export default function key() {
    return crypto.randomBytes(24).toString("base64");
}
