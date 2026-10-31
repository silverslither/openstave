let key, showHidePassword, password, game, raceId, racePlayers, raceSubmit, raceError, tournamentId, tournamentType, tournamentArg, tournamentPlayers, tournamentSubmit, tournamentError;

let lock = false;
let error;

document.addEventListener("DOMContentLoaded", main);

function main() {
    key = document.getElementById("key");
    showHidePassword = document.getElementById("show-hide-password");
    password = document.getElementById("password");
    game = document.getElementById("game");

    raceId = document.getElementById("race-id");
    racePlayers = document.getElementById("race-players");
    raceSubmit = document.getElementById("race-submit");
    raceError = document.getElementById("race-error");

    tournamentId = document.getElementById("tournament-id");
    tournamentType = document.getElementById("tournament-type");
    tournamentArg = document.getElementById("tournament-arg");
    tournamentPlayers = document.getElementById("tournament-players");
    tournamentSubmit = document.getElementById("tournament-submit");
    tournamentError = document.getElementById("tournament-error");

    game.value = "";

    showHidePassword.addEventListener("click", () => password.type = password.type === "password" ? "text" : "password");
    raceSubmit.addEventListener("click", createRace);
    tournamentSubmit.addEventListener("click", createTournament);
}

async function createRace() {
    if (lock)
        return;
    lock = true;

    raceError.innerText = "";
    tournamentError.innerText = "";
    error = raceError;

    try {
        const parsedPlayers = parsePlayers(racePlayers.innerText);
        if (parsedPlayers == null) {
            lock = false;
            return;
        }

        const response = await fetch("/", {
            method: "POST",
            body: JSON.stringify({
                create: "race",
                key: key.value,
                password: password.value,
                game: game.value,
                id: raceId.value,
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

        game.value = "";
        raceId.value = "";
        racePlayers.innerText = "";
        lock = false;

        sessionStorage.setItem("password", password.value);
        location.pathname = `/dashboard/${await response.text()}`;
    } catch (e) {
        error.innerText = e;
        lock = false;
    }
}

async function createTournament() {
    if (lock)
        return;
    lock = true;

    tournamentError.innerText = "";
    raceError.innerText = "";
    error = tournamentError;

    try {
        const parsedPlayers = parsePlayers(tournamentPlayers.innerText);
        if (parsedPlayers == null) {
            lock = false;
            return;
        }

        const response = await fetch("/", {
            method: "POST",
            body: JSON.stringify({
                create: "tournament",
                key: key.value,
                password: password.value,
                game: game.value,
                id: tournamentId.value,
                type: Number(tournamentType.value),
                arg: Number(tournamentArg.value),
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

        game.value = "";
        tournamentId.value = "";
        tournamentPlayers.innerText = "";
        lock = false;

        sessionStorage.setItem("password", password.value);
        location.pathname = `/dashboard/tournament/${await response.text()}`;
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
