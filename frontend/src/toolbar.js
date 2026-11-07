// Keeps the toolbar buttons honest, so a button is only clickable when it has
// something to do:
//
//   Save          — a name differs from the one on disk
//   Record        — there is a row on screen to record against
//   Play/Play All — a macro has been recorded and there is a row to play into
//
// A header filter hides rows without removing them, so the two views differ:
// "on screen" is the set that passes the filters (Tabulator's active rows,
// getRows("active")), while Save looks at every row the grid holds — it renames
// all of them, filtered out or not.
//
// controls: {save, record, play, playAll} button elements.
export function createToolbarState(table, controls) {
    const {save, record, play, playAll} = controls;

    let saving = false;
    let macro = {recording: false, hasMacro: false};

    // Rows are compared through the same fields SaveRenames uses in Go.
    const dirty = () => table.getData().some((row) => row.name !== row.original_name);

    // onScreen is the number of rows the user can see; pass it in when the
    // caller already knows it (see the dataFiltered handler below).
    const refresh = (onScreen) => {
        if (onScreen === undefined) onScreen = table.getRows("active").length;

        save.disabled = saving || !dirty();
        // Stop is still the record button, so it has to stay clickable while
        // recording even if the filter has hidden every row recorded so far.
        record.disabled = !macro.recording && onScreen === 0;
        play.disabled = playAll.disabled = !macro.hasMacro || onScreen === 0;
    };

    // cellEdited covers typing and the macro replay, dataProcessed a Load, a
    // drop or the grid reload after a save.
    table.on("dataProcessed", () => refresh());
    table.on("cellEdited", () => refresh());

    // Tabulator reports a filter change *while* it is still working out which
    // rows survive it, so the table would still answer with the previous set.
    // The event hands over the new rows instead.
    table.on("dataFiltered", (_filters, rows) => refresh(rows.length));

    // The grid starts empty, and Tabulator only answers getData/getRows once it
    // has been built, so the first pass waits for that.
    if (table.initialized) refresh();
    else table.on("tableBuilt", () => refresh());

    return {
        refresh,

        // A rename is in flight: no second one, and nothing to save meanwhile.
        setSaving(value) {
            saving = value;
            refresh();
        },

        // Called by the macro recorder whenever it starts, stops, or has a new
        // recording to play.
        setMacro(state) {
            macro = state;
            refresh();
        },
    };
}
