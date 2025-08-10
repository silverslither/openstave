import { PlayerCanvas, init } from "./renderer.js";

const FRAME_BUFFER = 60;
const FRAME_TIME_MS = 655171 / 39375;
let lastFrameMs = 0;

const canvases = [];
const players = {};
const buffered = [];
let frame = 0;
let paused = false;
let seek = false;
let maxLength = 0;
let finished = false;

addEventListener("DOMContentLoaded", setup);

const controls = {};
async function setup() {
    let drawCondition = false;

    controls.play = document.getElementById("play");
    controls.start = document.getElementById("start");
    controls.end = document.getElementById("end");
    controls.float = document.getElementById("float");
    controls.framesLeft = document.getElementById("frames-left");
    controls.framesRight = document.getElementById("frames-right");
    controls.range = document.querySelector("input");

    query().then(() => {
        frame = Number(controls.range.max);
        controls.framesLeft.textContent = frame.toString().padStart(7);
        controls.framesRight.textContent = "-0".padEnd(7);
        controls.range.value = frame;

        const oninput = () => {
            seek = true;
            frame = Number(controls.range.value);
            controls.framesLeft.textContent = frame.toString().padStart(7);
            controls.framesRight.textContent = (frame >= controls.range.max ? "-0" : frame - controls.range.max).toString().padEnd(7);
        };
        controls.range.addEventListener("input", oninput);
        controls.range.addEventListener("mousedown", (e) => {
            if (e.button === 0)
                paused = true;
        });
        controls.range.addEventListener("mouseup", (e) => {
            if (e.button === 0 && controls.play.textContent === "Pause")
                paused = false;
        });
        controls.start.addEventListener("click", () => oninput(controls.range.value = 0));
        controls.end.addEventListener("click", () => oninput(controls.range.value = controls.range.max));

        if (drawCondition)
            draw();
        drawCondition = true;
    });

    await init();
    canvases[0] = new PlayerCanvas(0, players);
    canvases[1] = new PlayerCanvas(1, players);
    canvases[1].canvas.style.display = "none";

    controls.play.addEventListener("click", () => {
        if (controls.play.textContent === "Pause") {
            controls.play.textContent = "Play";
            paused = true;
        } else {
            controls.play.textContent = "Pause";
            paused = false;
        }
    });
    controls.float.addEventListener("click", () => {
        if (canvases[1].canvas.style.display === "none")
            canvases[1].canvas.style.display = "";
        else
            canvases[1].canvas.style.display = "none";
    });

    if (drawCondition)
        draw();
    drawCondition = true;
}

function draw() {
    requestAnimationFrame(draw);

    if (paused && !seek)
        return;

    if (performance.now() - lastFrameMs > FRAME_TIME_MS) {
        if (buffered[frame]) {
            for (const canvas of canvases)
                canvas.render(frame);

            if (!seek)
                frame++;
            seek = false;

            controls.framesLeft.textContent = Math.min(frame, maxLength - 1).toString().padStart(7);
            controls.framesRight.textContent = (frame >= controls.range.max ? "-0" : frame - controls.range.max).toString().padEnd(7);
            controls.range.value = frame;

            if (frame + FRAME_BUFFER < maxLength && !buffered[frame + FRAME_BUFFER])
                query(frame + FRAME_BUFFER, FRAME_BUFFER);

            lastFrameMs += Math.floor((performance.now() - lastFrameMs) / FRAME_TIME_MS) * FRAME_TIME_MS;
        } else {
            if (finished || frame <= maxLength - 2 * FRAME_BUFFER) {
                query(frame, 2 * FRAME_BUFFER);
            } else {
                query();
            }
            lastFrameMs += 1000;
        }
    }
}

let lock = false;
async function query(start = 0, length = 0) {
    if (lock)
        return;
    lock = true;

    if (length > 0) {
        let l = start;
        for (; l < start + length; l++)
            if (!buffered[l])
                break;
        let r = start + length - 1;
        for (; r >= start; r--)
            if (!buffered[r])
                break;

        if (r < l) {
            lock = false;
            return;
        }

        start = l;
        length = r - l + 1;
    }

    try {
        const data = await (await fetch(`${location.href}`, {
            method: "POST",
            body: JSON.stringify({
                start,
                length,
            }),
        })).json();

        finished = data.finished;

        for (let player in data.players) {
            const playerData = data.players[player];
            player = player.slice(0, -8);
            players[player] = players[player] ?? {};

            players[player].dnf = parseInt(playerData.dnf);
            players[player].frames = (players[player].frames ?? []);

            const frames = playerData.frames.map(v => Uint8Array.from(atob(v), c => c.charCodeAt(0)));
            for (let i = 0; i < frames.length; i++)
                players[player].frames[start + i] = frames[i];

            players[player].length = parseInt(playerData.length);
            players[player].splits = playerData.splits;
            players[player].time = parseInt(playerData.time);
        }

        maxLength = Infinity;
        for (const i in players) {
            const player = players[i];
            if (player.length !== player.length) {
                maxLength = 0;
                break;
            }
            if (player.dnf === player.dnf)
                continue;

            maxLength = Math.min(maxLength, player.length);
        }

        if (maxLength === Infinity) {
            maxLength = -Infinity;
            for (const i in players)
                maxLength = Math.max(maxLength, players[i].length);
        }

        for (let i = buffered.length; i < maxLength; i++)
            buffered.push(false);

        const j = Math.min(start + length, maxLength);
        for (let i = start; i < j; i++)
            buffered[i] = true;

        controls.range.max = finished ? maxLength - 1 : Math.max(maxLength - 2 * FRAME_BUFFER, 0);

        lock = false;
        return data.game;
    } catch (e) {
        console.error(e);
        lock = false;
    }
}
