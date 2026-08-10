let key, password, id, game, players, names, submit, error;

document.addEventListener("DOMContentLoaded", main);

function main() {
    key = document.getElementById("key");
    password = document.getElementById("password");
    id = document.getElementById("id");
    game = document.getElementById("game");
    players = document.getElementById("players");
    names = document.getElementById("names");
    submit = document.getElementById("submit");
    error = document.getElementById("error");
    game.value = "";
    players.value = "";

    players.addEventListener("input", () => {
        players.valueAsNumber = Math.min(Math.max(Math.round(players.valueAsNumber), 2), 16);

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
                password: password.value,
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

        sessionStorage.setItem("password", password.value);
        location.pathname = `/dashboard/${await response.text()}`;
    } catch (e) {
        error.innerText = e;
        lock = false;
    }
}
