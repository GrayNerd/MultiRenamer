// Hidden files — dotfiles on Unix — stay out of the grid until they are asked
// for: Ctrl/Cmd+H shows them, and pressing it again hides them.
//
// The setting is a filter rather than a rewrite of the data, so everything else
// keeps working unchanged: hidden rows are simply not on screen, which is what
// the header filter, Play/Play All and the multi-row edit already go by, while
// Save still counts every row the grid holds.
//
// Every load starts from "hidden", so a new directory never arrives cluttered.

export function createHiddenFiles(table) {
    let showing = false;

    // Tabulator hands a filter function the row's data.
    const withoutHidden = (row) => !row.hidden;

    const apply = () => {
        if (showing) {
            // Programmatic filters only: the Name column's header filter stays.
            table.clearFilter();
            return;
        }
        table.setFilter(withoutHidden);
    };

    document.addEventListener("keydown", (e) => {
        if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
        if (e.key.toLowerCase() !== "h") return;

        // An open editor owns the keys it needs; the toggle is for the grid.
        if (e.target.closest?.("input, textarea, select, [contenteditable]")) return;

        e.preventDefault();     // Ctrl+H is a browser shortcut otherwise
        showing = !showing;
        apply();
    });

    return {
        // Back to the default, at the start of every load.
        reset() {
            showing = false;
            apply();
        },
    };
}
