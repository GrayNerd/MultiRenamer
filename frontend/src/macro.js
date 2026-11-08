// Records the keystrokes typed into a Name cell and replays that edit on other
// cells: Play applies it to the cell you are on and then moves down a row, Play
// All applies it to that cell and to every cell below it in the grid — unless
// rows have been highlighted, in which case only those rows are touched.
//
// Only rows on screen are touched: a header filter hides the rows it does not
// match, and those are skipped both when picking the cell to start from and
// while walking down the table.
//
// Recording starts when the record button is pressed and stops on Enter, Tab,
// the up/down arrows, Escape, or the (now "Stop") button itself. Pressing the
// button does not take focus, so the cell keeps its editor and caret, and that
// caret position is what the replay starts from — the same edit then lands in
// the same place in the next name.
//
// Ctrl/Cmd+C, X and V are recorded as steps of their own: copy and cut take the
// characters that were highlighted when the key was pressed, put them in the
// macro's clipboard, and paste drops that clipboard in at the caret. The range
// is re-read from each cell as it is replayed, so a macro that moves a date from
// the start of the name to the end works on every row's own date.

import { STOP_KEYS, applySteps, stepForKey } from "./steps.js";

// controls: {record, play, playAll} button elements. The record button needs a
// .btn-label child (its icon is swapped through aria-pressed in the stylesheet).
// onStateChange is told when recording starts/stops and when a macro becomes
// available, so the caller can enable/disable the buttons. history, when given,
// collects everything a press changes into one undo step.
export function createMacroRecorder(table, controls, field = "name", onStateChange = () => {}, history = null) {
    const {record: recordBtn, play: playBtn, playAll: playAllBtn} = controls;

    let recording = false;
    let steps = [];         // [{key}] in the order they were pressed
    let startOffset = null; // caret position the recorded edit started at
    let editingCell = null; // Name cell in edit mode right now
    let lastCell = null;    // Name cell that was edited most recently

    // What copy and cut took, and what paste puts back: the macro's own
    // clipboard. It is refilled from every cell that is replayed, so each row
    // moves its own text instead of repeating the first row's.
    let clipboard = "";

    table.on("cellEditing", (cell) => {
        if (cell.getField() !== field) return;
        editingCell = cell;
        lastCell = cell;
    });
    table.on("cellEdited", () => { editingCell = null; });
    table.on("cellEditCancelled", () => { editingCell = null; });

    // New rows (Load/Save) replace the old ones, so drop references to them.
    table.on("dataProcessed", () => {
        editingCell = null;
        lastCell = null;
    });

    // <input> of the Name cell being edited, if one is open.
    const editingInput = () => {
        return editingCell ? editingCell.getElement().querySelector("input") : null;
    };

    // Caret position in the field being edited, if one is open.
    const caretInField = () => {
        const input = editingInput();
        return input && typeof input.selectionStart === "number" ? input.selectionStart : null;
    };

    // Rows the user can see: a header filter hides the rows it does not match,
    // and Play only touches what is on screen.
    const onScreenRows = () => table.getRows("active");

    // Whether the current row selection is a deliberate highlight. Shift-click
    // (range) and ctrl-click (add/remove) highlight rows, while a plain click is
    // how a cell starts being edited — that one selects its row as a side effect
    // and must not turn Play All into a single-row edit. The modifier is on the
    // press, so it is read there; Tabulator acts on the click that follows.
    let highlighted = false;
    table.element.addEventListener("mousedown", (e) => {
        if (!e.target.closest(".tabulator-row")) return;
        highlighted = e.shiftKey || e.ctrlKey || e.metaKey;
    }, true);

    // The highlighted rows that are on screen, in the order they are shown.
    const highlightedCells = () => {
        if (!highlighted) return [];

        const selected = new Set(table.getSelectedRows());
        return onScreenRows()
            .filter((row) => selected.has(row))
            .map((row) => row.getCell(field));
    };

    // The cell Play works on: the last Name cell edited — clicking the toolbar
    // closes its editor, so lastCell carries it over — but only while that row
    // is still on screen; a filter hides rows, and Play skips them. Otherwise
    // the selected row, else the first row on screen.
    const currentCell = () => {
        const rows = onScreenRows();
        const onScreen = new Set(rows);

        if (lastCell && onScreen.has(lastCell.getRow())) return lastCell;

        const row = table.getSelectedRows().find((row) => onScreen.has(row)) || rows[0];
        return row ? row.getCell(field) : null;
    };

    // Swap the button between "Record" (circle) and "Stop" (square) — the icon
    // comes from the aria-pressed styling.
    const setButtonState = (isRecording) => {
        recordBtn.setAttribute("aria-pressed", isRecording ? "true" : "false");
        const label = recordBtn.querySelector(".btn-label");
        if (label) label.textContent = isRecording ? "Stop" : "Record";
    };

    // Steps only become playable once a recording has stopped, so this is what
    // tells the toolbar whether Play and Play All have anything to replay.
    const notify = () => onStateChange({recording, hasMacro: steps.length > 0});

    const startRecording = () => {
        recording = true;
        steps = [];
        clipboard = "";
        // Remember where the caret is in the field being edited right now; the
        // replay starts there. Null when nothing is open, in which case the
        // first recorded keystroke pins the position down instead.
        startOffset = caretInField();
        setButtonState(true);
        notify();
    };

    const stopRecording = () => {
        recording = false;
        setButtonState(false);
        notify();
    };

    // Pressing the button must not take focus: that would close the editor and
    // lose the caret (and the value) of the cell being recorded.
    recordBtn.addEventListener("mousedown", (e) => {
        if (editingInput()) e.preventDefault();
    });

    recordBtn.addEventListener("click", () => {
        recording ? stopRecording() : startRecording();
    });

    // Text pasted in from outside the macro (copied in another application, say)
    // cannot come from its clipboard, so keep what the browser is about to
    // insert and let the paste step fall back to it.
    document.addEventListener("paste", (e) => {
        if (!recording) return;
        const paste = steps[steps.length - 1];
        if (paste && paste.key === "Paste") paste.text = e.clipboardData?.getData("text/plain") ?? "";
    });

    // Captured on the way down rather than bubbled: Tabulator's input editor
    // calls stopPropagation() on Home and End, so a listener on the document
    // would never see them. Running first also means Enter and the navigation
    // keys are seen before the editor is committed and torn down.
    document.addEventListener("keydown", (e) => {
        if (!recording) return;

        // Checked before looking for the editor: Tabulator commits and removes
        // it while handling Enter and the navigation keys, so by the time the
        // event reaches the document there may be no editor left.
        if (STOP_KEYS.includes(e.key)) {
            stopRecording();
            return;
        }

        const input = editingInput();

        // Only what is typed into the cell being recorded counts; the header
        // filter and anything else with a key handler is left alone.
        if (!input || e.target !== input) return;

        // Everything else (select all, undo…) is left to the browser.
        const step = stepForKey(e, input);
        if (!step) return;

        // keydown fires before the key is applied, so the first recorded key
        // pins down the caret position the editing started at.
        if (startOffset === null) startOffset = input.selectionStart ?? 0;

        steps.push(step);
    }, true);

    // Puts the caret back into a cell's editor once Tabulator has built and
    // focused it (edit() does that right after the editor is appended).
    const focusCaret = (cell, offset) => {
        requestAnimationFrame(() => {
            const input = cell.getElement().querySelector("input");
            if (!input) return;
            const pos = Math.min(offset, input.value.length);
            input.setSelectionRange(pos, pos);
        });
    };

    // Reopens a cell's editor and puts the caret at the given offset.
    const focusCell = (cell, offset) => {
        cell.edit();
        focusCaret(cell, offset);
    };

    // Move the caret into the cell directly below, keeping the same offset.
    // The last cell in the column stays in that field instead.
    const moveToNextRow = (cell, caret) => {
        const nextRow = cell.getRow().getNextRow();
        const nextCell = nextRow ? nextRow.getCell(field) : null;
        focusCell(nextCell || cell, caret);
    };

    // Applies the recorded steps to one cell and commits them, returning the
    // caret position the edit finished at (null when the editor did not open).
    const replay = (cell) => {
        if (!cell) return null;

        // Opening another cell's editor cancels (and throws away) the open one,
        // so each cell is applied and committed before the next is opened.
        cell.edit();

        const input = cell.getElement().querySelector("input");
        if (!input) return null;

        const applied = applySteps(input.value, Math.min(startOffset ?? 0, input.value.length), steps, clipboard);
        clipboard = applied.clipboard;
        input.value = applied.value;
        input.setSelectionRange(applied.caret, applied.caret);

        // Commit through the editor's own change handler — the same path Enter
        // and blur take — so the value sticks before the editor is replaced.
        input.dispatchEvent(new Event("change", {bubbles: true}));

        return applied.caret;
    };

    playBtn.addEventListener("click", () => {
        if (steps.length === 0) return;

        // One undo step for the whole press, however many rows it changes.
        history?.beginBatch();
        try {
            const cell = currentCell();
            const caret = replay(cell);
            if (caret !== null) moveToNextRow(cell, caret);
        } finally {
            history?.endBatch();
        }
    });

    // Everything Play All does, so one undo step can wrap the lot.
    const playAll = () => {
        // A highlighted range is exact: those rows only, top to bottom, and the
        // caret stays in the last one (leaving the highlight would lose it).
        const picked = highlightedCells();
        if (picked.length) {
            let last = null;
            picked.forEach((cell) => {
                const caret = replay(cell);
                if (caret !== null) last = {cell, caret};
            });

            if (last) focusCell(last.cell, last.caret);
            return;
        }

        const cell = currentCell();
        if (!cell) return;

        // No highlight: this cell and every cell below it, top to bottom.
        // getNextRow walks the displayed rows, so a header filter's hidden rows
        // are skipped.
        let lastCell = cell;
        let lastCaret = null;

        for (let row = cell.getRow(); row; row = row.getNextRow()) {
            const rowCell = row.getCell(field);
            const caret = replay(rowCell);
            if (caret === null) continue;

            lastCell = rowCell;
            lastCaret = caret;
        }

        // The caret follows the same rule as Play: it ends up in the cell below
        // the last one edited, which here means the last row keeps the caret.
        if (lastCaret !== null) moveToNextRow(lastCell, lastCaret);
    };

    playAllBtn.addEventListener("click", () => {
        if (steps.length === 0) return;

        // One undo step for the whole press, however many rows it changes.
        history?.beginBatch();
        try {
            playAll();
        } finally {
            history?.endBatch();
        }
    });
}
