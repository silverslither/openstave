import { RendererCanvas } from "./2d_renderer.js";
import { OUTLINE_COLOURS } from "./colours.js";

export function formatTime(ms) {
    ms = Math.round(ms);
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    let t = "";
    t += `${(m % 60).toString().padStart(2, "0")}:`;
    t += `${(s % 60).toString().padStart(2, "0")}.`;
    t += (ms % 1000).toString().padStart(3, "0");
    return t;
}

export function getPlacements(players, count) {
    const leaderboard = Object.entries(players).map((v) => {
        let splits = [...v[1].splits];
        if (v[1].time === v[1].time)
            splits.push(v[1].time);
        splits = splits.slice(0, splits.findLastIndex(w => w != null && w <= count) + 1);
        splits.unshift(0);
        return [v[0], splits];
    }).sort((a, b) => b[1].length - a[1].length || a[1].at(-1) - b[1].at(-1));

    const nodnf = [], dnf = [];
    for (const entry of leaderboard) {
        if (players[entry[0]].dnf <= count)
            dnf.push([entry[0], players[entry[0]].dnf]);
        else
            nodnf.push(entry);
    }

    return [nodnf, dnf.sort((a, b) => b[1] - a[1])];
}

export const DEFAULT_COLUMNS = [
    { field: "place", width: 2 },
    { field: "colour", width: 1 },
    { field: "name", width: 25 },
    { field: "time", width: 10, align: "right" },
];

export class LeaderboardCanvas extends RendererCanvas {
    constructor(players, playerCanvas, frameTimeMs, columns) {
        super(playerCanvas.text);

        this.players = players;
        this.playerCanvas = playerCanvas;
        this.frameTimeMs = frameTimeMs;
        this.columns = columns;
        this.title = location.pathname.slice(1, -8).replace(/[-_]$/, "");
        this.count = 0;

        this.canvas = document.createElement("canvas");
        this.canvas.id = "leaderboard";
        this.canvas.width = 24 + 8 * columns.reduce((a, v) => a + v.width, 0);

        window.addEventListener("resize", () => this.resize().render(this.count));
        this.resize(playerCanvas.canvas.height);

        this.canvas.addEventListener("mousedown", event => this.onclick(event), true);
        this.canvas.addEventListener("contextmenu", event => event.preventDefault(), false);

        document.getElementById("screen").append(this.canvas);
        this.context = this.canvas.getContext("2d");
    }

    onclick(event) {
        const y = (event.clientY - this.canvas.getBoundingClientRect().top) / this.scale - 16;
        if (event.button === 1 || event.clientX < 8 || y < 0 || y >= 8 * Object.keys(this.players).length) {
            this.playerCanvas.onclick(event);
            return;
        }

        if (event.button === 2) {
            this.playerCanvas.following = Math.floor(y / 8);
        } else {
            const placements = getPlacements(this.players, this.count).flat();
            this.playerCanvas.following = placements[Math.floor(y / 8)][0];
        }

        this.playerCanvas.render(this.playerCanvas.count);
    }

    resize(height) {
        this.canvas.height = height ?? this.canvas.height;
        this.scale = Math.max(Math.min(Math.floor(innerHeight / this.canvas.height), Math.round(innerWidth / 240)), 1);
        this.canvas.style.width = `${0.5 * this.canvas.width * this.scale}px`;
        this.canvas.style.height = `${this.canvas.height * this.scale}px`;
        return this;
    }

    render(count) {
        this.count = count;
        this.lines = this.getLines(count);

        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.context.globalAlpha = 0.7;
        this.context.fillStyle = "#000000";
        this.context.fillRect(8, 4, this.canvas.width - 8, 16 + 8 * this.lines.length);

        this.context.globalAlpha = 1.0;
        this.drawText(16, 8, this.title);

        const colours = Object.keys(this.players);
        for (let i = 0; i < this.lines.length; i++) {
            const line = this.lines[i];
            const y = 16 + 8 * i;

            let x = 16;
            for (const column of this.columns) {
                const width = 8 * column.width;
                let value;

                switch (column.field) {
                case "colour":
                    this.context.fillStyle = "#a0a0a0";
                    this.context.fillRect(x, y, 7, 7);
                    this.context.fillStyle = OUTLINE_COLOURS[colours.indexOf(line.name)];
                    this.context.fillRect(x + 2, y + 1, 3, 5);
                    break;
                case "time":
                    value = line.time === "DNF" ? "DNF" : `${line.prefix}${formatTime(this.frameTimeMs * line.time)}`;
                    break;
                default:
                    value = typeof column.field === "function" ? column.field(line, this.players[line.name], count) : line[column.field];
                }

                if (value != null) {
                    const align = column.align ?? "left";
                    const offset = { left: 0, right: width, center: width / 2 }[align];
                    this.drawText(x + offset, y, String(value), align);
                }

                x += width;
            }
        }
    }

    getLines(count) {
        if (Object.keys(this.players).length === 0)
            return [];

        const lines = [];
        const [nodnf, dnf] = getPlacements(this.players, count);

        let comparison = nodnf[0]?.[1];
        let cumulative = 0;
        for (const [name, splits] of nodnf) {
            const line = [name];

            if (this.players[name].time <= count) {
                line.push("", this.players[name].time);
            } else if (splits.length === comparison.length) {
                cumulative += splits.at(-1) - comparison.at(-1);
                line.push("+", cumulative);
            } else {
                cumulative += Math.max(count - comparison.at(-1), splits.at(-1) - comparison[splits.length - 1]);
                line.push("+", cumulative);
            }

            comparison = splits;
            lines.push(line);
        }

        for (const [name] of dnf) {
            const line = [];
            line.push(name, "", "DNF");
            lines.push(line);
        }

        let i = 1;
        let _i = 1;
        lines[0].unshift(i.toString());
        for (let j = 1; j < lines.length; j++) {
            _i += 1;
            if (lines[j - 1].at(-1) !== lines[j].at(-1))
                i = _i;
            lines[j].unshift(i.toString());
        }

        return lines.map(([place, name, prefix, time]) => ({ place, name, prefix, time }));
    }
}
