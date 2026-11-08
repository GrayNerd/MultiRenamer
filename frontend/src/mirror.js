// Editing one row of a highlighted set edits the others with it.
//
// While a Name cell is being edited and more than one row is selected, every
// keystroke is applied to the other selected rows as well — the same steps the
// macro recorder replays, so copy and cut take each row's own characters and
// paste puts them back in that row.
//
// The steps are not taken on trust. After each change they are replayed against
// the value the edit started on and compared with what the field actually
// holds; anything they missed — a key another listener took first, a paste
// nothing announced, an input method — is added to them as the change it turned
// out to be. The other rows follow the text, not a memory of the keys.
//
// The other rows are written with row.update(): it changes the value and
// redraws the cell without firing cellEdited (which would disturb the recorder
// and the caret tracking) and without re-running the filters, so a row cannot
// jump out of view while it is being typed into.
//
// sync() is for a write that comes from elsewhere — an undo while the editor is
// still open — so the edit carries on from what the rows hold now.

import { applySteps, stepForKey } from "./steps.js";

export function createMultiRowEditor(table, field = "name") {
    let session = null;

    const onScreen = () => table.getRows("active");

    const isEditing = (cell) => {
        return session
            && cell.getField() === field
            && cell.getRow() === session.row;
    };

    // The editor the edit is read from. It is created after cellEditing, on the
    // next frame, and it is kept once found rather than looked up again: a
    // lookup that came back with another element would stop the copy dead
    // halfway through an edit.
    const editedInput = () => {
        if (!session) return null;

        if (!session.input || !session.input.isConnected) {
            session.input = session.cell.getElement().querySelector("input");
        }

        return session.input;
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

    // Where two values stop agreeing, how much of the old one is gone and what
    // takes its place. Comparing from both ends finds a change in the middle of
    // a name where it happened.
    const difference = (was, now) => {
        const shortest = Math.min(was.length, now.length);

        let start = 0;
        while (start < shortest && was[start] === now[start]) start += 1;

        let end = 0;
        while (end < shortest - start
            && was[was.length - 1 - end] === now[now.length - 1 - end]) end += 1;

        return {start, taken: was.length - start - end, added: now.slice(start, now.length - end)};
    };

    const mirror = (input) => {
        // What the steps say the row being edited holds by now.
        const replay = applySteps(session.value, session.startOffset ?? 0, session.steps, "");

        // A change that never became a step still has to move the other rows.
        if (replay.value !== input.value) {
            if (session.startOffset === null) session.startOffset = replay.caret;

            const edit = difference(replay.value, input.value);
            session.steps.push({key: "Replace", at: edit.start, taken: edit.taken, added: edit.added});
        }

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

        const row = cell.getRow();
        session = {
            cell,
            row,
            input: null,
            value: String(row.getData()[field] ?? ""),   // what the edit changes
            startOffset: null,                           // the caret it began at
            steps: [],
            original: new Map(),                         // row -> its own text
        };
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

        const input = editedInput();
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
        const input = editedInput();
        if (!input || e.target !== input) return;
        mirror(input);
    }, true);

    // Something outside this module put the rows back — an undo, with the editor
    // still open. The edit carries on from what is there now: the field's text is
    // the new starting point and the steps so far are gone, so the next keystroke
    // copies into the other rows instead of replaying what was undone.
    const sync = () => {
        if (!session) return;

        const input = editedInput();
        if (!input) return;

        session.value = input.value;
        session.steps = [];
        session.startOffset = null;
        session.original.clear();
    };

    return {sync};
}
