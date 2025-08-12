import * as net from "node:net";
import { activePlayers } from "./race.ts";
import { AUTH_WAIT_MS, TCP_PORT } from "./env.ts";

export const openConnections: Set<net.Socket> = new Set();

const authorize = (username: string, password: string) => {
    const player = activePlayers.get(username);
    if (player == null || player.connected)
        return false;
    return password === player.password;
};

export const server = net.createServer((client) => {
    openConnections.add(client);

    let username = "";
    let authLength = 0;
    const authChunks: Buffer[] = [];

    client.on("connect", () => {
        setTimeout(() => {
            if (!client.destroyed && username === "") {
                client.destroy();
                console.log("client destroyed due to timeout");
            }
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
                    const player = activePlayers.get(username);
                    player.connected = true;
                    player.add(buffer.subarray(64));
                    authChunks.length = 0;
                    authLength = 0;
                } else {
                    client.destroy();
                    console.log("client destroyed due to wrong auth");
                }
            }
        } else {
            const player = activePlayers.get(username);
            if (player == null || !player.connected) {
                client.destroy();
                console.log("client destroyed due to not being in active players");
                return;
            }
            player.add(data);

            if (player.finished) {
                activePlayers.delete(username);
                client.destroy();
                console.log("client destroyed due to finishing");
            }
        }
    });

    client.on("close", () => {
        openConnections.delete(client);
        const player = activePlayers.get(username);
        if (player != null)
            player.connected = false;
    });
});

server.listen(TCP_PORT, "0.0.0.0", () => {
    console.log("TCP server running on port", TCP_PORT);
});
