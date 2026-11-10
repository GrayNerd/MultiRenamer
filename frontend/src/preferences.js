// Applies what the Setup window saved.
//
// The options come from Go when a window loads and again whenever they are saved,
// so a change shows in the grid without a restart. Three of them are no more than
// a class or an attribute on <body> — the theme, the toolbar text and the bold on
// a changed name are all styled from style.css — while the sort has to be applied
// to the grid, and put back on every load that replaces its rows.

let autoSort = true;

// Applies the sort the option asks for: by name when it is on, and none at all
// when it is off (the sort a load used to carry would otherwise stay on it).
// A load that runs before the grid is built is left to the tableBuilt pass.
const sortNow = (table) => {
    if (!table.initialized) return;

    if (autoSort) table.setSort("name", "asc");
    else table.clearSort();
};

// Turns a saved configuration into what the page shows.
export function applyPreferences(table, cfg) {
    autoSort = cfg.auto_sort !== false;

    document.body.classList.toggle("dark", cfg.theme === "dark");
    document.body.classList.toggle("no-bold-changed", cfg.bold_changed === false);
    document.body.dataset.toolbarText = cfg.toolbar_text === false ? "false" : "true";

    sortNow(table);
}

// A load replaces the rows, so the sort has to be put back on each one.
export function setupPreferences(table) {
    table.on("dataProcessed", () => sortNow(table));

    if (table.initialized) sortNow(table);
    else table.on("tableBuilt", () => sortNow(table));
}
