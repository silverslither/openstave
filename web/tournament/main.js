import { SUFFIX_LENGTH } from "../common/limits.js";

const TOURNAMENT_ID = location.pathname.split("/")[2];

let leaderboard, rounds;

document.addEventListener("DOMContentLoaded", main);

function main() {
    document.querySelector("h1").innerText = TOURNAMENT_ID.slice(0, -SUFFIX_LENGTH);
    leaderboard = document.getElementById("rankings");
    rounds = document.getElementById("rounds");

    leaderboard.innerHTML = "";
    rounds.innerHTML = "";

    updateLive();
}

async function updateLive() {
    try {
        const data = await (await fetch(`/tournament/${TOURNAMENT_ID}`, { method: "POST" })).json();

        const rows = [];
        const columns = [];

        const rankings = Object.entries(data.points);
        rankings.sort((a, b) => b[1] - a[1]);

        let cPlacement = 0;
        let pScore = NaN;

        for (let i = 0; i < rankings.length; i++) {
            const [player, score] = rankings[i];

            if (score !== pScore) {
                pScore = score;
                cPlacement = i + 1;
            }

            const row = document.createElement("tr");
            const placement = document.createElement("td");
            const name = document.createElement("td");
            const points = document.createElement("td");

            placement.innerText = cPlacement;
            name.innerText = player;
            points.innerText = score;

            row.append(placement, name, points);
            rows.push(row);
        }

        leaderboard.innerHTML = "";
        leaderboard.append(...rows);
        rows.length = 0;

        for (let i = 0; i < data.rounds.length; i++) {
            const round = data.rounds[i];
            const race = data.races?.[i];
            const column = document.createElement("td");
            column.width = "50%";
            column.innerHTML = race == null ?
                `${round.id} [${round.expected}]` :
                `<a href="/${race}">${round.id}</a> [${round.expected}]`;

            switch (round.id[0]) {
            case "L":
                if (columns.length === 0)
                    columns.push(document.createElement("td"), column);
                else
                    columns.push(column);
                break;
            case "W":
                if (columns.length === 1) {
                    columns.push(document.createElement("td"));
                    i--;
                } else {
                    columns.push(column);
                }
                break;
            default:
                column.colSpan = 2;
                columns.push(column, undefined);
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
