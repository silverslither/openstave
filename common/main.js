let LeaderboardCanvas, PlayerCanvas, init, screenshot;

const FRAME_BUFFER = 120;
const FRAME_TIME_MS = 655171 / 39375;
const REREQUEST_INTERVAL_MS = 0.5 * FRAME_BUFFER * FRAME_TIME_MS;
let lastFrameMs = 0;

const canvases = [];
const players = {};
const buffered = [];
let frame = 0;
let paused = false;
let seek = false;
let maxLength = 0;
let pingLength = 0;
let finished = false;
let category = "";

addEventListener("DOMContentLoaded", setup);

const controls = {};
async function setup() {
    const path = window.__game === "smb3" ? "/smb3/renderer.js" : "/common/smb1_smb2j_renderer.js";
    ({ LeaderboardCanvas, PlayerCanvas, init, screenshot } = await import(path));

    let drawCondition = false;

    controls.root = document.getElementById("controls");

    controls.play = document.getElementById("play");
    controls.framesLeft = document.getElementById("frames-left");
    controls.range = document.querySelector("input");
    controls.framesRight = document.getElementById("frames-right");
    controls.menu = document.getElementById("menu");

    controls.popup = document.getElementById("popup");
    controls.help = document.getElementById("help");
    controls.ahc = document.getElementById("ahc");
    controls.leaderboard = document.getElementById("lb");
    controls.category = document.getElementById("category");
    controls.float = document.getElementById("float");
    controls.copyScreenshot = document.getElementById("copy-ss");
    controls.saveScreenshot = document.getElementById("save-ss");

    controls.help.addEventListener("click", () => {
        window.open("https://github.com/silverslither/openstave?tab=readme-ov-file#renderer-controls", "_blank").focus();
    });

    query().then(() => {
        frame = finished ? maxLength - 1 : Math.max(pingLength - 2 * FRAME_BUFFER, 0);

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

        if (drawCondition)
            start();
        drawCondition = true;
    });

    await init(window.__game);
    canvases[0] = new PlayerCanvas(0, players);
    canvases[1] = new PlayerCanvas(1, players);
    canvases[2] = new LeaderboardCanvas(players, canvases[0]);
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
    controls.menu.addEventListener("click", () => {
        controls.popup.style.display = controls.popup.style.display === "flex" ? "none" : "flex";
    });
    controls.ahc.addEventListener("click", () => {
        if (controls.root.classList.contains("hide"))
            controls.root.classList.remove("hide");
        else
            controls.root.classList.add("hide");
    });
    controls.leaderboard.addEventListener("click", () => {
        if (canvases[2].canvas.style.display === "none") {
            canvases[2].canvas.style.display = "";
            canvases[2].render(frame);
        } else {
            canvases[2].canvas.style.display = "none";
        }
    });
    controls.category.addEventListener("click", () => {
        canvases[0].alt = canvases[0].alt === "" ? category : "";
        canvases[0].render(canvases[0].count);
    });
    controls.float.addEventListener("click", () => {
        if (canvases[1].canvas.style.display === "none") {
            canvases[1].canvas.style.display = "";
            canvases[1].render(frame);
        } else {
            canvases[1].canvas.style.display = "none";
        }
    });

    let ssLock = false;
    controls.copyScreenshot.addEventListener("click", async () => {
        if (ssLock)
            return;
        ssLock = true;

        try {
            if (canvases[0].count < 0)
                return;

            const ss = screenshot(canvases[0], canvases[2]);
            const canvas = new OffscreenCanvas(ss.width, ss.height);
            const context = canvas.getContext("2d");
            context.putImageData(ss, 0, 0);
            const blob = await canvas.convertToBlob();

            window.navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);

            ssLock = false;
        } catch (e) {
            console.error(e);
            ssLock = false;
        }
    });
    controls.saveScreenshot.addEventListener("click", async () => {
        if (ssLock)
            return;
        ssLock = true;

        try {
            if (canvases[0].count < 0)
                return;

            const ss = screenshot(canvases[0], canvases[2]);
            const canvas = new OffscreenCanvas(ss.width, ss.height);
            const context = canvas.getContext("2d");
            context.putImageData(ss, 0, 0);
            const blob = await canvas.convertToBlob();

            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `${finished ? Math.min(frame, maxLength - 1) : frame}.png`;
            a.click();
            URL.revokeObjectURL(a.href);

            ssLock = false;
        } catch (e) {
            console.error(e);
            ssLock = false;
        }
    });

    if (drawCondition)
        start();
    drawCondition = true;
}

function start() {
    canvases[0].alt = category;

    if (frame === 0) {
        canvases[0].render(-1);
        canvases[2].render(0);
    }

    draw();
}

function draw(timeMs) {
    requestAnimationFrame(draw);

    if (paused && !seek) {
        lastFrameMs = timeMs;
        return;
    }

    const dt = (timeMs - lastFrameMs) / FRAME_TIME_MS;
    if (dt > 0.5) {
        if (buffered[frame]) {
            for (const canvas of canvases)
                if (canvas.canvas.style.display !== "none")
                    canvas.render(frame);

            const df = Math.max(Math.floor(dt), 1);

            if (!seek)
                frame += Math.min(df, 5); // skip at most 4 frames
            seek = false;

            controls.framesLeft.textContent = Math.min(frame, maxLength - 1).toString().padStart(7);
            controls.framesRight.textContent = (frame >= controls.range.max ? "-0" : frame - controls.range.max).toString().padEnd(7);
            controls.range.value = frame;

            if (frame <= pingLength - FRAME_BUFFER && !buffered[frame + FRAME_BUFFER])
                query(frame + FRAME_BUFFER, FRAME_BUFFER);

            lastFrameMs += df * FRAME_TIME_MS;
        } else {
            if (finished || frame <= pingLength - 2 * FRAME_BUFFER)
                query(frame, 2 * FRAME_BUFFER);
            else
                query();
            lastFrameMs += REREQUEST_INTERVAL_MS;
        }
    }
}

let lock = false;
async function query(start = 0, length = 0, noRecurse = false) {
    if (lock)
        return;
    lock = true;

    if (finished && start >= maxLength) {
        lock = false;
        return;
    }

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
        const pingStart = performance.now();
        const data = await (await fetch(window.location.href, {
            method: "POST",
            body: JSON.stringify({
                start,
                length,
            }),
        })).json();

        finished = data.finished;
        category = data.game.split("_")[1];

        for (let name in data.players) {
            const playerData = data.players[name];
            name = name.slice(0, -8);
            players[name] = players[name] ?? {};

            players[name].dnf = parseInt(playerData.dnf);
            players[name].frames = (players[name].frames ?? []);

            const frames = playerData.frames.map(v => Uint8Array.from(atob(v), c => c.charCodeAt(0)));
            for (let i = 0; i < frames.length; i++)
                players[name].frames[start + i] = frames[i];

            players[name].length = parseInt(playerData.length);
            players[name].splits = playerData.splits;
            players[name].time = parseInt(playerData.time);

            const end = players[name].time === players[name].time ? players[name].time : players[name].dnf;

            if (finished && end !== end)
                players[name].dnf = -1;

            if (!noRecurse && end === end) {
                lock = false;
                await query(end - 2, 3, true);
                lock = true;
            }
        }

        maxLength = Infinity;
        for (const name in players) {
            const player = players[name];
            if (player.length !== player.length) {
                maxLength = 0;
                break;
            }
            if (player.dnf === player.dnf || player.time === player.time)
                continue;

            maxLength = Math.min(maxLength, player.length);
        }

        if (maxLength === Infinity) {
            maxLength = -Infinity;
            for (const i in players)
                maxLength = Math.max(maxLength, players[i].length);
        }

        pingLength = maxLength + Math.floor((performance.now() - pingStart) / FRAME_TIME_MS);

        for (let i = buffered.length; i < maxLength; i++)
            buffered.push(false);

        const j = Math.min(start + length, maxLength);
        for (let i = start; i < j; i++)
            buffered[i] = true;

        controls.range.max = finished ? maxLength - 1 : Math.max(maxLength - 4 * FRAME_BUFFER, 0);
        controls.range.value = frame;
        controls.framesRight.textContent = (frame >= controls.range.max ? "-0" : frame - controls.range.max).toString().padEnd(7);

        lock = false;
    } catch (e) {
        console.error(e);
        lock = false;
    }
}
