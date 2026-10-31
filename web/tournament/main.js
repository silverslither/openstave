const TOURNAMENT_ID = location.pathname.split("/")[2];

let rounds;

document.addEventListener("DOMContentLoaded", main);

function main() {
    rounds = document.getElementById("rounds");

    rounds.innerHTML = "";

    updateRounds();
}

let authLock = false;

async function updateRounds() {
    try {
        const data = await (await fetch(`/tournament/${TOURNAMENT_ID}`, { method: "POST" })).json();
        rounds.innerText = JSON.stringify(data);
    } catch (e) {
        console.error(e);
    }

    setTimeout(updateRounds, 1000);
}
