let key, showHidePassword, password, id, game, players, submit, error;

document.addEventListener("DOMContentLoaded", main);

function main() {
    key = document.getElementById("key");
    showHidePassword = document.getElementById("show-hide-password");
    password = document.getElementById("password");
    id = document.getElementById("id");
    game = document.getElementById("game");
    players = document.getElementById("players");
    submit = document.getElementById("submit");
    error = document.getElementById("error");

    game.value = "";

    showHidePassword.addEventListener("click", () => password.type = password.type === "password" ? "text" : "password");
    submit.addEventListener("click", create);
}

let lock = false;
async function create() {
    if (lock)
        return;
    lock = true;

    try {
        const parsedPlayers = parsePlayers(players.innerText);
        if (parsedPlayers == null) {
            lock = false;
            return;
        }

        const response = await fetch("/", {
            method: "POST",
            body: JSON.stringify({
                password: password.value,
                id: id.value,
                key: key.value,
                game: game.value,
                players: parsedPlayers,
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

        id.value = "";
        game.value = "";
        players.innerText = "";
        lock = false;

        sessionStorage.setItem("password", password.value);
        location.pathname = `/dashboard/${await response.text()}`;
    } catch (e) {
        error.innerText = e;
        lock = false;
    }
}

function parsePlayers(str) {
    const players = str.split("\n").map(v => v.trim()).filter(v => v !== "");
    if (players.length < 2 || players.length > 16) {
        error.innerText = "The number of players must be between 2 and 16, inclusive.";
        return null;
    }

    for (let i = 0; i < players.length; i++) {
        const player = players[i].replace(/[^0-9A-Za-z_-]/g, "");

        if (player.length > 24) {
            error.innerText = `The player name ${players[i]} is too long; the maximum allowed length is 24 characters.`;
            return null;
        }

        if (player === "") {
            error.innerText = `The player name ${players[i]} contains only forbidden characters.`;
            return null;
        }
    }

    return players;
}
