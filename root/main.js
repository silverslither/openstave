let form, dash;
let key, id, game, players, names, submit, error;

document.addEventListener("DOMContentLoaded", main);

function main() {
    form = document.getElementById("form");
    dash = document.getElementById("dash");

    key = document.getElementById("key");
    id = document.getElementById("id");
    game = document.getElementById("game");
    players = document.getElementById("players");
    names = document.getElementById("names");
    submit = document.getElementById("submit");
    error = document.getElementById("error");
    game.value = "";
    players.value = "";

    players.addEventListener("input", () => {
        players.valueAsNumber = Math.min(Math.max(Math.round(players.valueAsNumber), 2), 8);

        if (players.valueAsNumber !== players.valueAsNumber)
            return;

        for (let i = names.children.length >>> 1; i < players.valueAsNumber; i++) {
            const input = document.createElement("input");
            input.type = "text";
            input.maxLength = 24;
            names.append(input, document.createElement("br"));
        }

        for (let i = names.children.length - 1; i >= 2 * players.valueAsNumber; i--) {
            names.children[i].remove();
        }
    });

    submit.addEventListener("click", create);
    dashLoop();
}

let lock = false;
async function create() {
    if (lock)
        return;
    lock = true;

    try {
        const response = await fetch("/", {
            method: "POST",
            body: JSON.stringify({
                id: id.value,
                key: key.value,
                game: game.value,
                players: [...names.getElementsByTagName("input")].map(v => v.value),
            }),
        });

        if (response.status === 400 || response.status === 418) {
            error.innerText = await response.text();
            lock = false;
            return;
        }

        if (response.status !== 200) {
            error.innerText = response.statusText;
            lock = false;
            return;
        }

        const data = await response.json();

        let html = "DO NOT CLOSE OR RELOAD THIS PAGE UNTIL AUTHENTICATION HAS BEEN DISTRIBUTED.\n";
        html += `The permanent link to this race will be <a href="${data.link}">${location.href}${data.link}</a>.\n`;
        for (const player of data.authentication)
            html += `\nScript for ${player[0].slice(0, -8)}: <a href="${player[1]}">${location.href}${player[1]}</a>\n`;

        form.innerHTML = html.replaceAll("\n", "<br/>");
        window.location.hash = data.link;
    } catch (e) {
        error.innerText = e;
        lock = false;
        return;
    }
}

async function dashLoop() {
    while (true) {
        await new Promise(r => setTimeout(r, 1000));
        if (window.location.hash.length === 0)
            continue;

        try {
            let html = "";
            const data = await (await fetch(`${window.location.protocol}//${window.location.host}/${window.location.hash.slice(1)}`, {
                method: "POST",
                body: JSON.stringify({
                    start: 0,
                    length: 0,
                }),
            })).json();

            if (data.finished) {
                history.pushState("", document.title, window.location.pathname);
                dash.innerHTML = "";
                return;
            }

            for (const name in data.players) {
                const player = data.players[name];
                html += `${name.slice(0, -8)}: `;
                html += player.connected ? "connected, " : "not connected, ";
                html += (player.dnf != null || player.time != null) ? "finished" : (player.length > 0 ? "started" : "not started");
                html += "<br/>";
            }

            dash.innerHTML = html;
        } catch (e) {
            console.error(e);
        }
    }
}
