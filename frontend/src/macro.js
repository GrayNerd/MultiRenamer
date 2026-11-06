// Records the keystrokes typed into a Name cell and replays that edit on other
// cells: Play applies it to the cell you are on and then moves down a row, Play
// All applies it to that cell and to every cell below it in the grid.
//
// Recording starts when the record button is pressed and stops on Enter, Tab,
// the up/down arrows, Escape, or the (now "Stop") button itself. Pressing the
// button does not take focus, so the cell keeps its editor and caret, and that
// caret position is what the replay starts from — the same edit then lands in
// the same place in the next name.

// Keys that end a recording instead of being recorded. Escape closes the
// editor, so anything typed after it belongs to a different edit.
const STOP_KEYS = ["Enter", "Tab", "ArrowUp", "ArrowDown", "Escape"];

// Keys that edit or move within the field and are worth replaying.
const EDIT_KEYS = ["Backspace", "Delete", "Home", "End", "ArrowLeft", "ArrowRight"];

// controls: {record, play, playAll} button elements. The record button needs a
// .btn-label child (its icon is swapped through aria-pressed in the stylesheet).
export function createMacroRecorder(table, controls, field = "name") {
    const {record: recordBtn, play: playBtn, playAll: playAllBtn} = controls;

    let recording = false;
    let steps = [];         // [{key}] in the order they were pressed
    let startOffset = null; // caret position the recorded edit started at
    let editingCell = null; // Name cell in edit mode right now
    let lastCell = null;    // Name cell that was edited most recently

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

    // The cell Play works on: the last Name cell edited (clicking the toolbar
    // closes its editor, so lastCell carries it over), else the selected row,
    // else the first row.
    const currentCell = () => {
        if (lastCell) return lastCell;
        const row = table.getSelectedRows()[0] || table.getRows()[0];
        return row ? row.getCell(field) : null;
    };

    // Swap the button between "Record" (circle) and "Stop" (square) — the icon
    // comes from the aria-pressed styling.
    const setButtonState = (isRecording) => {
        recordBtn.setAttribute("aria-pressed", isRecording ? "true" : "false");
        const label = recordBtn.querySelector(".btn-label");
        if (label) label.textContent = isRecording ? "Stop" : "Record";
    };

    const startRecording = () => {
        recording = true;
        steps = [];
        // Remember where the caret is in the field being edited right now; the
        // replay starts there. Null when nothing is open, in which case the
        // first recorded keystroke pins the position down instead.
        startOffset = caretInField();
        setButtonState(true);
    };

    const stopRecording = () => {
        recording = false;
        setButtonState(false);
    };

    // Pressing the button must not take focus: that would close the editor and
    // lose the caret (and the value) of the cell being recorded.
    recordBtn.addEventListener("mousedown", (e) => {
        if (editingInput()) e.preventDefault();
    });

    recordBtn.addEventListener("click", () => {
        recording ? stopRecording() : startRecording();
    });

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
        if (!input) return;

        // Leave shortcuts (copy/paste/select all) to the browser.
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key.length !== 1 && !EDIT_KEYS.includes(e.key)) return;

        // keydown fires before the key is applied, so the first recorded key
        // pins down the caret position the editing started at.
        if (startOffset === null) startOffset = input.selectionStart;

        steps.push({key: e.key});
    });

    // Replays the recorded keystrokes on the input and returns the final caret.
    const applySteps = (input) => {
        let value = input.value;
        let caret = Math.min(startOffset ?? 0, value.length);

        steps.forEach(({key}) => {
            switch (key) {
                case "Backspace":
                    if (caret > 0) {
                        value = value.slice(0, caret - 1) + value.slice(caret);
                        caret -= 1;
                    }
                    break;

                case "Delete":
                    if (caret < value.length) {
                        value = value.slice(0, caret) + value.slice(caret + 1);
                    }
                    break;

                case "ArrowLeft":
                    caret = Math.max(0, caret - 1);
                    break;

                case "ArrowRight":
                    caret = Math.min(value.length, caret + 1);
                    break;

                case "Home":
                    caret = 0;
                    break;

                case "End":
                    caret = value.length;
                    break;

                default:
                    if (key.length === 1) {
                        value = value.slice(0, caret) + key + value.slice(caret);
                        caret += 1;
                    }
            }
        });

        input.value = value;
        input.setSelectionRange(caret, caret);
        return caret;
    };

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

    // Move the caret into the cell directly below, keeping the same offset.
    // The last cell in the column stays in that field instead.
    const moveToNextRow = (cell, caret) => {
        const nextRow = cell.getRow().getNextRow();
        const nextCell = nextRow ? nextRow.getCell(field) : null;

        if (!nextCell) {
            cell.edit();
            focusCaret(cell, caret);
            return;
        }

        nextCell.edit();
        focusCaret(nextCell, caret);
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

        const caret = applySteps(input);

        // Commit through the editor's own change handler — the same path Enter
        // and blur take — so the value sticks before the editor is replaced.
        input.dispatchEvent(new Event("change", {bubbles: true}));

        return caret;
    };

    playBtn.addEventListener("click", () => {
        if (steps.length === 0) return;

        const cell = currentCell();
        const caret = replay(cell);
        if (caret !== null) moveToNextRow(cell, caret);
    });

    playAllBtn.addEventListener("click", () => {
        if (steps.length === 0) return;

        const cell = currentCell();
        if (!cell) return;

        // This cell and every cell below it, top to bottom.
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
    });
}
