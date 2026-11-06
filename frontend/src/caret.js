// Keeps the text cursor at a consistent character offset when the edit moves
// from one Name cell to another.
//
// Tabulator opens the editor for the whole cell, so its input starts with the
// caret at the end of the value. That makes arrow-key and mouse navigation
// between rows lose the position you were typing at. Here the caret offset is
// carried across, so renames stay aligned from row to row:
//
//   * move to another Name cell -> caret goes back to the same offset
//   * the value is shorter than that offset -> caret parks at its end
//   * move on again -> the remembered offset is used again, so a longer value
//     in a later row puts the caret back where it started
//
// The offset is only replaced when the caret is deliberately placed (typing,
// Home/End/left/right arrows, clicking inside the open editor), never by the
// clamped position a short value forced on it.

export function preserveCaretAcrossCells(table, field = "name") {
    let caretOffset = null;   // offset the user last put the caret at
    let carry = false;        // a move to another cell is in flight
    let editingInput = null;  // <input> of the Name cell being edited now

    const capture = {capture: true};

    // A move always ends with a keyup/mouseup, which is the reliable point to
    // drop a carry that never became a cell change (top/bottom row, click on a
    // column that cannot be edited, ...).
    document.addEventListener("keyup", () => { carry = false; }, capture);
    document.addEventListener("mouseup", () => { carry = false; }, capture);

    // editTriggerEvent is "focus", so pressing the mouse outside the open editor
    // is about to move the edit to the cell under the pointer.
    document.addEventListener("mousedown", (e) => {
        if (!editingInput || editingInput.contains(e.target)) return;
        carry = true;
    }, capture);

    table.on("cellEditing", (cell) => {
        const requested = carry ? caretOffset : null;
        carry = false;

        if (cell.getField() !== field) return;

        // Tabulator builds the <input> right after this event and focuses it,
        // which parks the caret at the end, so move the caret on the next frame
        // to make sure the position set here is the one that sticks.
        requestAnimationFrame(() => {
            const input = cell.getElement().querySelector("input");
            if (!input) return;

            editingInput = input;

            if (requested !== null) {
                const pos = Math.min(requested, input.value.length);
                input.setSelectionRange(pos, pos);
            }

            // Remember where the user puts the caret. setSelectionRange above
            // fires no events, so the carried position is never read back in.
            const track = () => {
                if (typeof input.selectionStart === "number") {
                    caretOffset = input.selectionStart;
                }
            };

            // Keys that move between cells are not a caret placement: the keyup
            // for them lands on the next cell's input, after it was clamped.
            const navKeys = ["ArrowUp", "ArrowDown", "Tab"];

            input.addEventListener("input", track);
            input.addEventListener("keyup", (e) => {
                if (!navKeys.includes(e.key)) track();
            });

            // Only a click that starts inside the editor places the caret there;
            // the mouseup that belongs to the click which opened this editor
            // does not, so it must not overwrite the carry.
            let pressedInside = false;
            input.addEventListener("mousedown", () => { pressedInside = true; });
            input.addEventListener("mouseup", () => {
                if (!pressedInside) return;
                pressedInside = false;
                track();
            });

            // Capture phase on the input runs before Tabulator's keybinding
            // handler on the table element, which is what opens the next editor.
            input.addEventListener("keydown", (e) => {
                if (navKeys.includes(e.key)) carry = true;
            }, true);
        });
    });

    table.on("cellEdited", () => { editingInput = null; });
    table.on("cellEditCancelled", () => { editingInput = null; });
}
