import { INVALID_CHARACTERS, MAX_PASSWORD_LENGTH, MAX_PLAYERS, MAX_RACE_ID_LENGTH, MAX_ROUND_ROBIN_ROUNDS, MAX_TOURNAMENT_ID_LENGTH } from "/common/limits.js";

let key, showHidePassword, password, game, raceId, racePlayers, raceSubmit, raceError, tournamentId, tournamentType, tournamentArg, tournamentPlayers, tournamentSubmit, tournamentError;

let lock = false;
let error;

document.addEventListener("DOMContentLoaded", main);

function main() {
    key = document.getElementById("key");
    showHidePassword = document.getElementById("show-hide-password");

    password = document.getElementById("password");
    password.maxLength = MAX_PASSWORD_LENGTH;

    game = document.getElementById("game");

    raceId = document.getElementById("race-id");
    raceId.maxLength = MAX_RACE_ID_LENGTH;

    racePlayers = document.getElementById("race-players");
    racePlayers.previousElementSibling.innerText = `Players (1–${MAX_PLAYERS}, one name per line)`;

    raceSubmit = document.getElementById("race-submit");
    raceError = document.getElementById("race-error");

    tournamentId = document.getElementById("tournament-id");
    tournamentId.maxLength = MAX_TOURNAMENT_ID_LENGTH;

    tournamentType = document.getElementById("tournament-type");

    tournamentArg = document.getElementById("tournament-arg");
    tournamentArg.min = "1";
    tournamentArg.max = String(MAX_ROUND_ROBIN_ROUNDS);
    tournamentArg.step = "1";

    tournamentPlayers = document.getElementById("tournament-players");
    tournamentPlayers.previousElementSibling.innerText = `Players (1–${MAX_PLAYERS}, one name per line)`;

    tournamentSubmit = document.getElementById("tournament-submit");
    tournamentError = document.getElementById("tournament-error");

    game.value = "";

    showHidePassword.addEventListener("click", () => password.type = password.type === "password" ? "text" : "password");
    raceSubmit.addEventListener("click", createRace);
    tournamentSubmit.addEventListener("click", createTournament);

    for (const input of [raceId, tournamentId, racePlayers, tournamentPlayers]) {
        input.addEventListener("beforeinput", (event) => {
            if (event.inputType !== "insertFromPaste" && event.data != null && event.data.split("\n").some(line => INVALID_CHARACTERS.test(line)))
                event.preventDefault();
        });
        input.addEventListener("input", () => {
            const property = input.isContentEditable ? "innerText" : "value";
            const lines = input[property].split("\n");
            if (!lines.some(line => INVALID_CHARACTERS.test(line)))
                return;

            const invalid = new RegExp(INVALID_CHARACTERS, "g");
            input[property] = lines.map(line => line.replace(invalid, "")).join(input.isContentEditable ? "\n" : "");
        });
    }
}

async function createRace() {
    if (lock)
        return;
    lock = true;

    raceError.innerText = "";
    tournamentError.innerText = "";
    error = raceError;

    try {
        const response = await fetch("/", {
            method: "POST",
            body: JSON.stringify({
                create: "race",
                key: key.value,
                password: password.value,
                game: game.value,
                id: raceId.value,
                players: racePlayers.innerText.split("\n").filter(v => v !== ""),
            }),
        });

        if (!response.ok) {
            error.innerText = await response.text() || response.statusText;
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
        const response = await fetch("/", {
            method: "POST",
            body: JSON.stringify({
                create: "tournament",
                key: key.value,
                password: password.value,
                game: game.value,
                id: tournamentId.value,
                type: Number(tournamentType.value),
                arg: tournamentArg.value === "" ? undefined : Number(tournamentArg.value),
                players: tournamentPlayers.innerText.split("\n").filter(v => v !== ""),
            }),
        });

        if (!response.ok) {
            error.innerText = await response.text() || response.statusText;
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
