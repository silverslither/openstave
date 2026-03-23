const COMPONENT = (arr) => arr.map(v => v.slice(1).match(/../g).map(w => parseInt(w, 16)));

export const OUTLINE_COLOURS = ["#ff0000", "#00ffff", "#00ff00", "#ff00ff", "#0000ff", "#ffff00", "#ffffff", "#000000", "#ff7f00", "#007fff", "#00ff7f", "#ff007f", "#7f00ff", "#7fff00", "#aaaaaa", "#555555"];
export const COMPONENT_OUTLINE_COLOURS = COMPONENT(OUTLINE_COLOURS);

export const NES_COLOURS = ["#6a6d6a", "#001380", "#1e008a", "#39007a", "#550056", "#5a0018", "#4f1000", "#3d1c00", "#253200", "#003d00", "#004000", "#003924", "#002e55", "#000000", "#000000", "#000000", "#b9bcb9", "#1850c7", "#4b30e3", "#7322d6", "#951fa9", "#9d285c", "#983700", "#7f4c00", "#5e6400", "#227700", "#027e02", "#007645", "#006e8a", "#000000", "#000000", "#000000", "#ffffff", "#68a6ff", "#8c9cff", "#b586ff", "#d975fd", "#e377b9", "#e58d68", "#d49d29", "#b3af0c", "#7bc211", "#55ca47", "#46cb81", "#47c1c5", "#4a4d4a", "#000000", "#000000", "#ffffff", "#cceaff", "#dddeff", "#ecdaff", "#f8d7fe", "#fcd6f5", "#fddbcf", "#f9e7b5", "#f1f0aa", "#dafaa9", "#c9ffbc", "#c3fbd7", "#c4f6f6", "#bec1be", "#000000", "#000000"];
export const COMPONENT_NES_COLOURS = COMPONENT(NES_COLOURS);
