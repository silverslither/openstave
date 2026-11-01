import { MAX_PASSWORD_LENGTH } from "/common/limits.js";

const TOURNAMENT_ID = location.pathname.split("/")[3];

let link, password, live;

document.addEventListener("DOMContentLoaded", main);

function main() {
    link = document.getElementById("link");

    password = document.getElementById("password");
    password.maxLength = MAX_PASSWORD_LENGTH;

    live = document.getElementById("live");

    link.href = `/tournament/${TOURNAMENT_ID}`;
    link.innerText = `${location.origin}/tournament/${TOURNAMENT_ID}`;

    password.value = sessionStorage.getItem("password") ?? "";
    live.innerHTML = "";

    password.addEventListener("input", () => sessionStorage.setItem("password", password.value));

    updateLive();
}

async function updateLive() {
    try {
        const data = await (await fetch(`/tournament/${TOURNAMENT_ID}`, { method: "POST" })).json();
        live.innerText = JSON.stringify(data);
    } catch (e) {
        console.error(e);
    }

    setTimeout(updateLive, 1000);
}
