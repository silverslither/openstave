import { MAX_PASSWORD_LENGTH } from "/common/limits.js";

const TOURNAMENT_ID = location.pathname.split("/")[3];

let link, password, reload, restart, next, actionError, rounds;

document.addEventListener("DOMContentLoaded", main);

function main() {
    link = document.getElementById("link");

    password = document.getElementById("password");
    password.maxLength = MAX_PASSWORD_LENGTH;

    reload = document.getElementById("reload");
    restart = document.getElementById("restart");
    next = document.getElementById("next");
    rounds = document.getElementById("rounds");
    actionError = reload.parentElement.nextElementSibling;

    link.href = `/tournament/${TOURNAMENT_ID}`;
    link.innerText = `${location.origin}/tournament/${TOURNAMENT_ID}`;

    password.value = sessionStorage.getItem("password") ?? "";
    rounds.innerHTML = "";

    password.addEventListener("input", () => sessionStorage.setItem("password", password.value));

    reload.addEventListener("click", () =>
        handleAction("reload", confirm("Are you sure you want to recalculate points for all rounds?")));
    restart.addEventListener("click", () =>
        handleAction("restart", confirm("Are you sure you want to restart the last round?")));
    next.addEventListener("click", () => handleAction("next", []));

    updateLive();
}

let actionLock = false;
async function handleAction(action, options) {
    if (actionLock)
        return;
    actionLock = true;

    actionError.innerText = "";
    await new Promise(r => setTimeout(r, 0));

    try {
        const args = [];
        if (typeof options === "function") {
            args.push(...options());
        } else {
            for (const option of options) {
                if (typeof option === "function")
                    args.push(option());
                else
                    args.push(option);
            }
        }

        const response = await fetch(`/exec/tournament/${TOURNAMENT_ID}`, {
            method: "POST",
            body: JSON.stringify({
                password: password.value,
                command: action,
                args,
            }),
        });

        actionError.innerText = await response.text() || response.statusText;
        actionLock = false;
    } catch (e) {
        actionError.innerText = e instanceof Error ? e.message : e;
        actionLock = false;
    }
}

async function updateLive() {
    try {
        const data = await (await fetch(`/tournament/${TOURNAMENT_ID}`, { method: "POST" })).json();

        const rows = [];
        const columns = [];

        for (let i = 0; i < data.rounds.length; i++) {
            const round = data.rounds[i];
            const race = data.races?.[i];

            const id = document.createElement("td");
            id.width = "50%";
            id.innerHTML = `${round.id} [${round.expected}]`;
            if (race != null)
                id.innerHTML += ` (<a href="/dashboard/${race}">view dashboard</a>)`;

            switch (round.id[0]) {
            case "L":
                if (columns.length === 0)
                    columns.push(document.createElement("td"), id);
                else
                    columns.push(id);
                break;
            case "W":
                if (columns.length === 1) {
                    columns.push(document.createElement("td"));
                    i--;
                } else {
                    columns.push(id);
                }
                break;
            default:
                id.colSpan = 2;
                columns.push(id, undefined);
            }

            if (columns.length >= 2) {
                const row = document.createElement("tr");
                row.append(...columns.filter(v => v != null));
                rows.push(row);
                columns.length = 0;
            }
        }

        rounds.innerHTML = "";
        rounds.append(...rows);
    } catch (e) {
        console.error(e);
    }

    setTimeout(updateLive, 1000);
}

function confirm(message, _default = "") {
    const s = prompt(`${message} [y/N]`, _default);
    if (s !== "y")
        throw new Error("Operation cancelled.");
    return [];
}
