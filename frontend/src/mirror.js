// Editing one row of a highlighted set edits the others with it.
//
// While a Name cell is being edited and more than one row is selected, every
// keystroke is applied to the other selected rows as well — the same steps the
// macro recorder replays, so copy and cut take each row's own characters and
// paste puts them back in that row.
//
// The other rows are written with row.update(): it changes the value and
// redraws the cell without firing cellEdited (which would disturb the recorder
// and the caret tracking) and without re-running the filters, so a row cannot
// jump out of view while it is being typed into.

import { applySteps, stepForKey } from "./steps.js";

export function createMultiRowEditor(table, field = "name") {
    let session = null;

    const onScreen = () => table.getRows("active");

    const inputOf = (cell) => cell.getElement().querySelector("input");

    const isEditing = (cell) => {
        return session
            && cell.getField() === field
            && cell.getRow() === session.row;
    };

    // The rows this edit copies itself into: the rest of the highlighted set.
    const targets = () => {
        const selected = table.getSelectedRows();
        return onScreen().filter((row) => row !== session.row && selected.includes(row));
    };

    // Reverts the rows the edit had already been copied into.
    const revert = () => {
        session.original.forEach((value, row) => row.update({[field]: value}));
    };

    const mirror = () => {
        const rows = targets();
        if (!rows.length) return;

        rows.forEach((row) => {
            if (!session.original.has(row)) {
                session.original.set(row, String(row.getData()[field] ?? ""));
            }

            const applied = applySteps(
                session.original.get(row),
                session.startOffset ?? 0,
                session.steps,
                "",              // every row has its own copy and paste buffer
            );

            row.update({[field]: applied.value});
        });
    };

    table.on("cellEditing", (cell) => {
        if (cell.getField() !== field) return;
        session = {cell, row: cell.getRow(), startOffset: null, steps: [], original: new Map()};
    });

    table.on("cellEdited", (cell) => {
        if (isEditing(cell)) session = null;
    });

    table.on("cellEditCancelled", (cell) => {
        if (!isEditing(cell)) return;
        revert();
        session = null;
    });

    // The rows are about to be replaced by a load or a save.
    table.on("dataProcessed", () => { session = null; });

    // Each keystroke becomes a step, exactly as the recorder would store it.
    document.addEventListener("keydown", (e) => {
        if (!session) return;

        const input = inputOf(session.cell);
        if (!input || e.target !== input) return;

        const step = stepForKey(e, input);
        if (!step) return;

        // The caret the edit started at is only final once the first key is
        // pressed — by then the click, caret.js and the editor have all had
        // their say.
        if (session.startOffset === null) session.startOffset = input.selectionStart ?? 0;

        session.steps.push(step);
    }, true);

    // Text pasted in from outside the app is not in the steps; keep what the
    // browser is about to insert, like the recorder does.
    document.addEventListener("paste", (e) => {
        if (!session) return;
        const paste = session.steps[session.steps.length - 1];
        if (paste && paste.key === "Paste") paste.text = e.clipboardData?.getData("text/plain") ?? "";
    });

    // Once the editor has taken the change, do the same to the other rows.
    document.addEventListener("input", (e) => {
        if (!session || e.target !== inputOf(session.cell)) return;
        mirror();
    }, true);
}
