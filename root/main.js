let key, id, game, players, names, submit, error;

document.addEventListener("DOMContentLoaded", main);

function main() {
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

        if (players.valueAsNumber !== players.valueAsNumber) {
            names.innerHTML = "";
            return;
        }

        names.innerHTML = "";
        for (let i = 0; i < players.valueAsNumber; i++) {
            const input = document.createElement("input");
            input.type = "text";
            input.maxLength = 24;
            names.append(input, document.createElement("br"));
        }
    });

    submit.addEventListener("click", create);
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

        document.body.innerHTML = html.replaceAll("\n", "<br/>");
    } catch (e) {
        error.innerText = e;
        lock = false;
        return;
    }
}
