import * as net from "node:net";
import { activePlayers } from "./race.ts";

const PORT = 61124;
const AUTH_WAIT_MS = 1000;

const authorize = (username: string, password: string) => {
    const player = activePlayers.get(username);
    if (player == null || player.connected)
        return false;
    return password === player.password;
};

const server = net.createServer((client) => {
    let username = "";
    let authLength = 0;
    const authChunks: Buffer[] = [];

    client.on("connect", () => {
        setTimeout(() => {
            if (!client.destroyed && username === "")
                client.destroy();
        }, AUTH_WAIT_MS);
    });

    client.on("data", (data) => {
        if (username === "") {
            authChunks.push(data);
            authLength += data.byteLength;
            if (authLength >= 64) {
                const buffer = Buffer.concat(authChunks);
                const _username = buffer.subarray(0, 32).toString().trim();
                const _password = buffer.subarray(32, 64).toString().trim();
                if (authorize(_username, _password)) {
                    username = _username;
                    activePlayers.get(username).add(buffer.subarray(64));
                    authChunks.length = 0;
                    authLength = 0;
                } else {
                    client.destroy();
                }
            }
        } else {
            const player = activePlayers.get(username);
            if (player == null) {
                client.destroy();
                return;
            }
            player.add(data);
        }
    });

    client.on("close", () => {
        const player = activePlayers.get(username);
        if (player != null)
            player.connected = false;
    });
});

server.listen(PORT, "0.0.0.0", () => {
    console.log("TCP server running on port", PORT);
});
