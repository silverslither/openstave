const TOURNAMENT_ID = location.pathname.split("/")[2];

let live;

document.addEventListener("DOMContentLoaded", main);

function main() {
    live = document.getElementById("live");

    live.innerHTML = "";

    updateRounds();
}

async function updateRounds() {
    try {
        const data = await (await fetch(`/tournament/${TOURNAMENT_ID}`, { method: "POST" })).json();
        live.innerText = JSON.stringify(data);
    } catch (e) {
        console.error(e);
    }

    setTimeout(updateRounds, 1000);
}
