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
        const response = await fetch(`/authentication/${RACE_ID}`, {
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

async function updateLive() {
    while (true) {
        try {
            const data = await (await fetch(`/${RACE_ID}`, {
                method: "POST",
                body: JSON.stringify({
                    start: 0,
                    length: 0,
                }),
            })).json();

            if (data.finished) {
                let html = "";

                for (const name in data.players) {
                    const player = data.players[name];
                    html += `${name.slice(0, -8)}: `;
                    if (player.dnf != null)
                        html += `DNFed at ${player.dnf}`;
                    if (player.time != null)
                        html += `Finished at ${player.time}`;
                    html += "<br/>";
                }

                live.innerHTML = html;
                return;
            }

            let html = "";

            for (const name in data.players) {
                const player = data.players[name];
                html += `${name.slice(0, -8)}: `;
                html += player.connected ? "connected, " : "not connected, ";
                html += (player.dnf != null || player.time != null) ? "finished" : (player.length > 0 ? "started" : "not started");
                html += "<br/>";
            }

            live.innerHTML = html;
        } catch (e) {
            console.error(e);
        }

        await new Promise(r => setTimeout(r, 1000));
    }
}
