const RACE_ID = location.pathname.split("/")[2];

let link, password, live, authentication;

document.addEventListener("DOMContentLoaded", main);

function main() {
    link = document.getElementById("link");
    password = document.getElementById("password");
    live = document.getElementById("live");
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

    try {
        const response = await fetch(`/auth/${RACE_ID}`, {
            method: "POST",
            body: JSON.stringify({
                password: password.value,
            }),
        });

        if (response.status === 401) {
            authentication.lastElementChild.innerText = "The entered password is incorrect.";
            authLock = false;
            return;
        }

        if (response.status === 404) {
            authentication.innerText = "The race is no longer active.";
            return;
        }

        if (response.status !== 200) {
            authentication.lastElementChild.innerText = response.statusText;
            authLock = false;
            return;
        }

        let html = "";
        for (const player of await response.json())
            html += `Script for ${player[0].slice(0, -8)}: <a href="/${player[1]}">${location.origin}/${player[1]}</a><br/>`;

        authentication.innerHTML = html;
    } catch (e) {
        authentication.lastElementChild.innerText = e;
        authLock = false;
    }
}

let actionLock = false;
async function handleAction(player, action, options) {
    if (actionLock)
        return;
    actionLock = true;

    try {
        const response = await fetch(`/exec/${RACE_ID}`, {
            method: "POST",
            body: JSON.stringify({
                password: password.value,
                name: player,
                command: action,
                args: options,
            }),
        });

        if (response.status === 401) {
            live.parentElement.nextElementSibling = "The entered password is incorrect.";
            actionLock = false;
            return;
        }

        if (response.status === 404) {
            live.parentElement.nextElementSibling = "uhhhhhhhh TODO?";
            actionLock = false;
            return;
        }

        live.parentElement.nextElementSibling = response.statusText;
        actionLock = false;
    } catch (e) {
        live.parentElement.nextElementSibling = e;
        actionLock = false;
    }
}

async function updateLive() {
    const rows = [];

    try {
        const data = await (await fetch(`/${RACE_ID}`, {
            method: "POST",
            body: JSON.stringify({
                start: 0,
                length: 0,
            }),
        })).json();

        for (const i in data.players) {
            const player = data.players[i];
            const row = document.createElement("tr");
            const name = document.createElement("td");
            const status = document.createElement("td");
            const actions = document.createElement("td");

            name.innerText = i.slice(0, -8);

            if (data.finished) {
                if (player.time != null)
                    status.innerText = `finished at frame ${player.time}`;
                else
                    status.innerText = `dnf at frame ${player.dnf}`;

                actions.append(
                    getActionButton(i, "remove", []),
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
