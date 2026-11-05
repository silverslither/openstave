import { MAX_PASSWORD_LENGTH, SUFFIX_LENGTH } from "/common/limits.js";

const RACE_ID = location.pathname.split("/")[2];

let link, password, live, actionError, authentication;

document.addEventListener("DOMContentLoaded", main);

function main() {
    link = document.getElementById("link");

    password = document.getElementById("password");
    password.maxLength = MAX_PASSWORD_LENGTH;

    live = document.getElementById("live");
    actionError = live.parentElement.nextElementSibling;
    authentication = document.getElementById("authentication");

    link.href = `/${RACE_ID}`;
    link.innerText = `${location.origin}/${RACE_ID}`;

    password.value = sessionStorage.getItem("password") ?? "";
    live.innerHTML = "";

    password.addEventListener("input", () => sessionStorage.setItem("password", password.value));
    authentication.firstElementChild.addEventListener("click", getAuthentication);

    updateLive();
}

let authLock = false;
async function getAuthentication() {
    if (authLock)
        return;
    authLock = true;

    authentication.lastElementChild.innerText = "";

    try {
        const response = await fetch(`/auth/${RACE_ID}`, {
            method: "POST",
            body: JSON.stringify({
                password: password.value,
            }),
        });

        if (!response.ok) {
            authentication.lastElementChild.innerText = await response.text() || response.statusText;
            authentication.lastElementChild.focus();
            authLock = false;
            return;
        }

        let html = "";
        for (const player of await response.json())
            html += `Script for ${player[0].slice(0, -SUFFIX_LENGTH)}: ||<a href="/${player[1]}">${location.origin}/${player[1]}</a>||<br/>`;

        authentication.innerHTML = html;
    } catch (e) {
        authentication.lastElementChild.innerText = e;
        authentication.lastElementChild.focus();
        authLock = false;
    }
}

let actionLock = false;
async function handleAction(player, action, options) {
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

        const response = await fetch(`/exec/${RACE_ID}`, {
            method: "POST",
            body: JSON.stringify({
                password: password.value,
                name: player,
                command: action,
                args,
            }),
        });

        actionError.innerText = await response.text() || response.statusText;
        actionError.focus();
        actionLock = false;
    } catch (e) {
        actionError.innerText = e instanceof Error ? e.message : e;
        actionError.focus();
        actionLock = false;
    }
}

async function updateLive() {
    try {
        const data = await (await fetch(`/${RACE_ID}`, {
            method: "POST",
            body: JSON.stringify({
                start: 0,
                length: 0,
            }),
        })).json();

        const rows = [];

        for (const i of Object.keys(data.players)) {
            const player = data.players[i];
            const row = document.createElement("tr");
            const name = document.createElement("td");
            const status = document.createElement("td");
            const actions = document.createElement("td");

            name.innerText = i.slice(0, -SUFFIX_LENGTH);

            if (data.finished) {
                if (player.time != null)
                    status.innerText = `finished at frame ${player.time}`;
                else
                    status.innerText = `dnf at frame ${player.dnf}`;

                actions.append(
                    getActionButton(i, "trim", [() => getInteger("start"), () => getInteger("end")]),
                    document.createElement("br"),
                    getActionButton(i, "toggle", []),
                    document.createElement("br"),
                    getActionButton(i, "resplit", () => getArray("splits", player.splits.join(", "))),
                    document.createElement("br"),
                    getActionButton(i, "remove", () => confirm(`Are you sure you want to delete ${i.slice(0, -SUFFIX_LENGTH)}?`)),
                );
            } else {
                status.innerText =
                    (player.connected ? "connected, " : "not connected, ") +
                    ((player.dnf != null || player.time != null) ?
                        "finished" :
                        (player.length > 0 ? "started" : "not started"));

                actions.append(
                    getActionButton(i, "dnf", []),
                );
            }

            row.append(name, status, actions);
            rows.push(row);
        }

        live.innerHTML = "";
        live.append(...rows);
    } catch (e) {
        console.error(e);
    }

    setTimeout(updateLive, 1000);
}

function getActionButton(player, action, options) {
    const button = document.createElement("button");
    button.className = "textbtn";
    button.innerText = action;
    button.addEventListener("click", () => handleAction(player, action, options));
    return button;
}

function confirm(message, _default = "") {
    const s = prompt(`${message} [y/N]`, _default);
    if (s !== "y")
        throw new Error("Operation cancelled.");
    return [];
}

function getInteger(message, _default = "") {
    const s = prompt(message, _default);
    if (s == null)
        throw new Error("Operation cancelled.");
    const v = parseInt(s);
    if (v !== v)
        throw new Error("Enter a valid integer.");
    return s;
}

function getArray(message, _default = "") {
    const s = prompt(message, _default);
    if (s == null)
        throw new Error("Operation cancelled.");
    return s.split(",");
}
