// Selecting rows with the mouse and the keyboard.
//
// Tabulator's own edit trigger is switched off (see main.js), so a click on a
// Name cell only selects its row — the same as clicking one of the read-only
// columns. Clicking a row that is already selected opens the Name editor with
// the caret as close to the mouse as the text allows.
//
// Arrow up/down move the selection to the adjacent row instead of scrolling the
// grid, holding shift grows or shrinks the selection from the row it started
// on, and Escape clears it.

export function setupRowSelection(table, field = "name") {
    let pending = null;   // Name cell clicked, waiting for that click to land
    let cursor = null;    // row the arrow keys are on
    let anchor = null;    // row a shift selection grows from

    // Rows the keyboard walks through: what the filter leaves on screen.
    const onScreen = () => table.getRows("active");

    // Where in the text a click landed.
    const offsetAt = (cell, x, y) => {
        const element = cell.getElement();
        const value = String(cell.getValue() ?? "");

        if (document.caretRangeFromPoint) {
            const range = document.caretRangeFromPoint(x, y);
            if (range && element.contains(range.startContainer)) {
                return Math.min(range.startOffset, value.length);
            }
        }

        // Nothing to measure against (the click was past the end of the text):
        // take its position across the cell as its position in the value.
        const rect = element.getBoundingClientRect();
        const ratio = rect.width ? (x - rect.left) / rect.width : 1;
        return Math.max(0, Math.min(value.length, Math.round(ratio * value.length)));
    };

    // Everything between two rows, in the order they are shown.
    const selectBetween = (rows, from, to) => {
        const a = rows.indexOf(from);
        const b = rows.indexOf(to);

        table.deselectRow();

        if (a < 0 || b < 0) {
            to.select();
            return;
        }

        table.selectRow(rows.slice(Math.min(a, b), Math.max(a, b) + 1));
    };

    // Tabulator selects the row on the click that follows, so whether this row
    // was already selected has to be read on the way down.
    table.element.addEventListener("mousedown", (e) => {
        pending = null;
        if (e.button !== 0) return;

        const element = e.target.closest?.(".tabulator-cell");
        if (!element || element.getAttribute("tabulator-field") !== field) return;
        if (element.classList.contains("tabulator-editing")) return;

        const row = element.closest(".tabulator-row");

        pending = {
            element,
            x: e.clientX,
            y: e.clientY,
            selected: !!row && row.classList.contains("tabulator-selected"),
            selection: table.getSelectedRows(),
        };
    }, true);

    table.on("cellClick", (e, cell) => {
        const click = pending;
        pending = null;

        // A first click has selected the row; only the next one edits it.
        if (!click || click.element !== cell.getElement() || !click.selected) return;

        // Editing one row of a highlighted set must not throw the rest away.
        if (click.selection.length > 1) table.selectRow(click.selection);

        // Read the position before the cell turns into an editor.
        const offset = offsetAt(cell, click.x, click.y);

        cell.edit();

        // Tabulator focuses the editor and parks the caret at the end of the
        // value; take over on the next frame, after that focus and after
        // caret.js's own frame, so the click is what decides.
        requestAnimationFrame(() => {
            const input = cell.getElement().querySelector("input");
            if (!input) return;

            const pos = Math.min(offset, input.value.length);
            input.setSelectionRange(pos, pos);
        });

        cursor = anchor = cell.getRow();
    });

    // A click is where the keyboard carries on from.
    table.on("rowClick", (e, row) => {
        cursor = row;
        if (!e.shiftKey && !e.ctrlKey && !e.metaKey) anchor = row;
    });

    // Arrow keys while a Name editor is open move the edit to the adjacent row,
    // and the highlight goes with it. Two things have to be done here rather than
    // left to Tabulator: its own navigation cancels the open editor (throwing
    // away what was typed), and it would leave the highlight — and so the
    // multi-row edit — pointing at the row that was left behind.
    const watchEditor = (cell) => {
        // The editor is created after cellEditing, and on the next frame so that
        // this listener is registered after caret.js's, which has to see the key
        // first to carry the caret offset across.
        requestAnimationFrame(() => {
            const input = cell.getElement().querySelector("input");
            if (!input) return;

            input.addEventListener("keydown", (e) => {
                if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
                if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;

                const rows = onScreen();
                const index = rows.indexOf(cell.getRow());
                const next = rows[index + (e.key === "ArrowDown" ? 1 : -1)];

                // Nothing to move to: leave the editor open where it is.
                if (!next) return;

                e.preventDefault();
                e.stopPropagation();   // keep Tabulator's own navigation out of it

                // Commit first, through the editor's own change handler — the
                // path Enter and blur take.
                input.dispatchEvent(new Event("change", {bubbles: true}));

                // Highlight the row the edit has moved to, unless it is already
                // part of a highlighted range.
                if (!table.getSelectedRows().includes(next)) {
                    table.deselectRow();
                    next.select();
                }

                cursor = next;
                if (!anchor || !rows.includes(anchor)) anchor = next;

                // Bring the row into view first: scrolling afterwards re-renders
                // the rows and takes the new editor down with them.
                next.scrollTo();
                next.getCell(field).edit();   // caret.js carries the offset over
            }, true);
        });
    };

    table.on("cellEditing", (cell) => {
        if (cell.getField() === field) watchEditor(cell);
    });

    document.addEventListener("keydown", (e) => {
        // An open editor owns these keys: the arrows move its caret and Escape
        // cancels the edit. The header filter owns its own caret too.
        if (e.target.closest?.("input, textarea, select, [contenteditable]")) return;

        if (e.key === "Escape") {
            table.deselectRow();
            cursor = anchor = null;
            return;
        }

        if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;

        const rows = onScreen();
        if (!rows.length) return;

        // Take the key: the grid must not scroll, the selection moves instead.
        e.preventDefault();

        const step = e.key === "ArrowDown" ? 1 : -1;
        const selected = table.getSelectedRows();
        const from = [cursor, ...selected].find((row) => row && rows.includes(row)) || null;

        // Nothing to move from yet: the first press lands on one end.
        if (!from) {
            const row = step > 0 ? rows[0] : rows[rows.length - 1];
            cursor = anchor = row;
            table.deselectRow();
            row.select();
            row.scrollTo();
            return;
        }

        const index = rows.indexOf(from);
        const next = rows[Math.min(rows.length - 1, Math.max(0, index + step))];
        if (!next) return;

        cursor = next;

        if (e.shiftKey) {
            // Grow or shrink the range from the row it started on.
            if (!anchor || !rows.includes(anchor)) anchor = from;
            selectBetween(rows, anchor, next);
        } else {
            anchor = next;
            table.deselectRow();
            next.select();
        }

        next.scrollTo();
    });
}
