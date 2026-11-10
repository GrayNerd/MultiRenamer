// What an edited name looks like.
//
// A name that no longer matches the one on disk is drawn in bold, so what a save
// would rename stands out from the rows it would leave alone. The mark is read
// from the data every time a row is drawn rather than set once on the edit: an
// undo, a top-up from a macro, a refused save or a load all put rows back or
// replace them, and the bold has to follow.
//
// Nothing changes while an editor is open. The name being typed must not change
// shape under the caret, and the rows a highlighted edit copies itself into are
// not finished either — the mark is left for the moment that edit ends.

let editing = false;   // an editor is open somewhere in the grid

export function markEdited(row) {
    const element = row.getElement();

    // A row with no element is one the table has never drawn, or one it is taking
    // away (a load replaces the rows while an editor may still be open). There is
    // nothing to mark either way, and a row drawn later is marked by the formatter.
    if (!element || editing) return;

    const data = row.getData();
    element.classList.toggle("rename-edited", data.name !== data.original_name);
}

export function setupEditedNames(table) {
    // Only rows the table has drawn: a row scrolled out of view is marked by the
    // row formatter when it is drawn, and asking for an element here would build
    // one for every row the grid holds.
    const refresh = () => table.getRows("visible").forEach(markEdited);

    // The edit is finished, one way or the other: this is the moment the name
    // counts as edited, and the rows it was copied into count with it.
    const editEnded = () => {
        editing = false;
        refresh();
    };

    table.on("cellEditing", () => { editing = true; });
    table.on("cellEdited", editEnded);
    table.on("cellEditCancelled", editEnded);

    // New rows are drawn unmarked by the formatter; this is for the editor an
    // old set may have had open.
    table.on("dataProcessed", editEnded);

    // Anything else that changes the rows — an undo, a save putting names back —
    // is marked straight away, unless an edit is still open.
    table.on("dataChanged", refresh);
}
