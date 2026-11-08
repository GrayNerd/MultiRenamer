// Undo for what is changed in the grid.
//
// A single-row edit is one step: opening an editor and committing it comes back
// in one press, however many keys were typed. A multi-row edit is recorded
// keystroke by keystroke instead, because the rows are being kept in step: one
// press takes the last key off every row at once, the next press the one before
// it, so the cells stay in sync all the way back.
//
// A macro press is recorded row by row — a Play All over eight rows comes back
// one row per press, starting with the last row it touched — and separate
// presses are separate steps, newest first.
//
// Steps are worked out by comparing the grid with a snapshot taken before the
// action, row by row: nobody has to declare which rows they are about to change.
//
// The Undo button and Ctrl/Cmd+Z do the same thing, from anywhere — with an
// editor open, both commit it first and then undo the last step.

const LIMIT = 100; // steps kept

export function createHistory(table, button, field = "name", onApplied = () => {}) {
    const steps = [];     // oldest first, each a list of {row, before}
    let depth = 0;        // editor sessions open right now
    let before = null;    // row -> value, taken when the outermost editor opened
    let session = null;   // the multi-row edit being recorded keystroke by keystroke
    let sessionSteps = 0; // steps that edit has added, so a cancel can drop them
    let pending = null;   // the other rows as they were before the key being pressed
    let batching = false; // a macro press is wrapping everything it changes
    let batchBefore = null;
    let applying = false; // an undo is being written back
    let blocked = false;  // e.g. while a macro is being recorded
    let mirror = null;    // the multi-row edit, told to carry on after a write-back

    const snapshot = () => {
        const values = new Map();
        table.getRows().forEach((row) => values.set(row, row.getData()[field] ?? ""));
        return values;
    };

    const refresh = () => {
        button.disabled = blocked || steps.length === 0;
    };

    // What changed since a snapshot, one entry per row.
    const changedSince = (snap) => {
        if (!snap) return [];

        const changes = [];
        table.getRows().forEach((row) => {
            const was = snap.get(row);
            const now = row.getData()[field] ?? "";
            if (was !== undefined && was !== now) changes.push({row, before: was});
        });
        return changes;
    };

    const remember = (changes) => {
        if (!changes.length) return;

        steps.push(changes);
        if (steps.length > LIMIT) steps.shift();
        refresh();
    };

    // Anything a step covers, as one step.
    const push = (snap) => remember(changedSince(snap));

    // A click blurs an open editor, so anything driven from a button has to do
    // the same: the edit on screen has to become its own step before the next
    // one is recorded, and a row cannot be written to while its editor is up.
    const settleEditor = () => {
        const active = document.activeElement;
        if (active && active !== button && table.element.contains(active)) active.blur();
    };

    // Opening and closing an editor is one step, however many rows it changes —
    // unless several rows are highlighted, where the session is recorded a
    // keystroke at a time instead (see the input listener below).
    const open = (cell) => {
        if (applying || batching) return;

        if (depth === 0) {
            before = snapshot();
            sessionSteps = 0;
            pending = null;

            const row = cell.getRow();
            const others = table.getSelectedRows().filter((selected) => selected !== row);
            session = {row, text: row.getData()[field] ?? "", multi: others.length > 0};
        }

        depth += 1;
    };

    const close = (committed) => {
        if (applying || batching || depth === 0) return;

        depth -= 1;
        if (depth > 0) return;

        const snap = before;
        const finished = session;
        before = null;
        session = null;

        if (finished?.multi) {
            // Its keys were recorded one by one. Cancelling throws the edit away
            // and the multi-row edit puts its rows back, so those steps go too.
            if (!committed) {
                steps.splice(Math.max(0, steps.length - sessionSteps), sessionSteps);
                refresh();
            }
        } else {
            push(snap);
        }

        sessionSteps = 0;
        pending = null;
    };

    // One keystroke of a multi-row edit is one step: the rows it changes, as they
    // were before the key. The values are read on keydown, which always comes
    // before the key is applied and before the multi-row edit writes it into the
    // other rows — the input event alone would depend on which listener happens
    // to run first.
    const editedInput = () => session.row.getCell(field)?.getElement().querySelector("input") ?? null;

    // The editor of the row being typed into, if it is still open: the one
    // write-back that has to go through the field instead of the row, because a
    // row cannot be redrawn while its editor is up. Whether the field has the
    // focus does not come into it — an editor can be open without it.
    const inUse = () => (session ? editedInput() : null);

    const otherRows = () => table.getSelectedRows()
        .filter((row) => row !== session.row)
        .map((row) => ({row, before: row.getData()[field] ?? ""}));

    document.addEventListener("keydown", (e) => {
        if (!session?.multi || applying || batching) return;

        const input = editedInput();
        if (!input || e.target !== input) return;

        pending = otherRows();
    }, true);

    document.addEventListener("input", (e) => {
        if (!session?.multi || applying || batching) return;

        const input = editedInput();
        if (!input || e.target !== input) return;

        // No keydown of ours came first (a paste from a menu, say): fall back to
        // reading the rows now.
        const changes = pending ?? otherRows();
        pending = null;

        changes.push({row: session.row, before: session.text});

        remember(changes);
        sessionSteps += 1;
        session.text = input.value;
    }, true);

    // A macro press wraps every edit it makes into one step, whatever state the
    // editor sessions are in.
    const beginBatch = () => {
        if (applying || batching) return;

        settleEditor();
        batching = true;
        batchBefore = snapshot();
    };

    const endBatch = () => {
        if (!batching) return;

        batching = false;
        const snap = batchBefore;
        batchBefore = null;

        // A macro press is undone a row at a time: each row it changed becomes
        // its own step, in the order it was changed, so the rows come back
        // bottom-up.
        changedSince(snap).forEach((change) => remember([change]));
    };

    const undo = () => {
        if (blocked || applying || steps.length === 0) return;

        // A click on the button blurs the open editor by itself; a key press does
        // not, and the editor has to stay open so what is typed next keeps
        // editing. Its row is written through the field instead — a row cannot be
        // written to while its editor is up — and the multi-row edit is told to
        // carry on from there.
        const open = inUse();

        const changes = steps.pop();
        applying = true;

        for (const {row, before: value} of changes) {
            if (open && session && row === session.row) {
                const at = Math.min(open.selectionStart ?? value.length, value.length);

                open.value = value;
                open.setSelectionRange(at, at);

                if (session.multi) {
                    session.text = value;
                    if (sessionSteps > 0) sessionSteps -= 1;
                }
                continue;
            }

            // Not cell.setValue: this must not fire cellEdited, or the editor
            // bookkeeping would treat the write-back as a fresh edit.
            row.update({[field]: value});
        }

        if (open) mirror?.sync();

        applying = false;
        refresh();
        onApplied();
    };

    // An editor session is a step; a macro press is a step per row it changes.
    table.on("cellEditing", (cell) => open(cell));
    table.on("cellEdited", () => close(true));
    table.on("cellEditCancelled", () => close(false));

    // A load or a save replaces the rows, so the values recorded against them
    // no longer mean anything.
    table.on("dataProcessed", () => {
        steps.length = 0;
        depth = 0;
        before = null;
        session = null;
        sessionSteps = 0;
        pending = null;
        batching = false;
        batchBefore = null;
        refresh();
    });

    button.addEventListener("click", undo);

    // Ctrl/Cmd+Z is the button, wherever the focus is — but it leaves an open
    // editor open: one press takes a keystroke off every row at once and the next
    // key goes on editing. Nothing is left to the browser, so the key cannot
    // quietly undo the text of one cell while the rows kept in step with it stay
    // as they are.
    document.addEventListener("keydown", (e) => {
        if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
        if (e.key.toLowerCase() !== "z") return;
        if (blocked || applying || steps.length === 0) return;

        e.preventDefault();
        undo();
    });

    refresh();

    return {
        beginBatch,
        endBatch,
        undo,

        // The multi-row edit carries on from whatever an undo puts back.
        setMirror(api) {
            mirror = api;
        },

        // No undo while a macro is being recorded: it would change the grid
        // underneath the keystrokes being captured.
        setBlocked(value) {
            blocked = value;
            refresh();
        },
    };
}
