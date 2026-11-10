// Insert and overtype in the Name editor.
//
// Insert is the default: a character typed at the caret pushes the rest of the
// name to the right. The Insert key switches the field to overtype, where the
// character under the caret is replaced by the one typed, and switches it back.
// Nothing else changes it — not committing the name, not the edit moving to the
// row below, not a load — so overtype is still on when the next edit is started,
// and Insert is the only key that turns it off again.
//
// The caret shows which mode the field is in. Inserting keeps the browser's
// vertical bar; overtyping hides it (caret-color: transparent in style.css) and
// draws a rectangle over the character the next key would replace. An <input>
// will not say where its caret is, so the rectangle is placed from a hidden copy
// of the field's text, laid out in the field's own font: everything before the
// caret, then the character itself, measured.
//
// The mode travels with the keystrokes too. The recorder and the multi-row edit
// mark a character typed while overtyping (see stepForKey in steps.js), so a
// macro or a highlighted set replaces the character at the caret in each row
// instead of widening it.

import { characterLength } from "./steps.js";

// The mode belongs to the grid rather than to one editor: it is left as it was,
// so the next cell to open takes it on.
let overtype = false;

// Whether a character typed into a Name cell right now would replace the one at
// the caret. The recorder and the multi-row edit ask, so that what they replay
// does the same.
export function isOvertyping() {
    return overtype;
}

export function createOvertype(table, field = "name") {
    let session = null;   // {input, block}: the open editor and its rectangle
    let mirror = null;    // the hidden copy of the text the caret is measured in

    // --------------------------------------------------
    // Where the rectangle goes
    // --------------------------------------------------

    // A box off screen that the field's text can be laid out in. It must be
    // hidden with visibility rather than display, or it would have nothing to
    // measure: a box that is not laid out has no offsets.
    const measuringBox = () => {
        if (!mirror) {
            mirror = document.createElement("div");
            mirror.setAttribute("aria-hidden", "true");
            mirror.style.cssText =
                "position: absolute; top: 0; left: -10000px; visibility: hidden;"
                + " white-space: pre; padding: 0; border: 0; margin: 0;";
            document.body.appendChild(mirror);
        }
        return mirror;
    };

    // The field's own font, so that a character measures up the same in the
    // hidden box as it does in the field.
    const fontProperties = [
        "fontFamily", "fontSize", "fontWeight", "fontStyle", "fontVariant",
        "letterSpacing", "wordSpacing", "textTransform", "textIndent",
        "fontKerning", "tabSize", "lineHeight",
    ];

    const copyFont = (input) => {
        const style = getComputedStyle(input);
        const box = measuringBox();
        fontProperties.forEach((property) => { box.style[property] = style[property]; });
        return style;
    };

    // Moves the rectangle over the character at the caret, and hides it while
    // there is a highlighted range — the selection is its own cue.
    const place = () => {
        if (!session) return;
        const {input, block} = session;

        const at = input.selectionStart ?? 0;
        if (input.selectionEnd !== at) {
            block.hidden = true;
            return;
        }

        const style = copyFont(input);
        const box = measuringBox();

        // Everything before the caret, then the character under it. At the end of
        // the value there is no such character, and a space stands in for the
        // width so that the rectangle still marks the spot.
        box.textContent = input.value.slice(0, at);

        const measured = document.createElement("span");
        measured.textContent = input.value.slice(at, at + characterLength(input.value, at)) || "\u00a0";
        box.appendChild(measured);

        const paddingLeft = parseFloat(style.paddingLeft) || 0;
        const paddingTop = parseFloat(style.paddingTop) || 0;
        const paddingBottom = parseFloat(style.paddingBottom) || 0;
        const textHeight = input.clientHeight - paddingTop - paddingBottom;

        // The cell is the offset parent (Tabulator positions every cell), and an
        // absolutely placed child is laid out from the same edge its offsets are
        // measured from.
        block.style.left = `${input.offsetLeft + paddingLeft + measured.offsetLeft - input.scrollLeft}px`;
        block.style.top = `${input.offsetTop + paddingTop + (textHeight - measured.offsetHeight) / 2}px`;
        block.style.width = `${measured.offsetWidth}px`;
        block.style.height = `${measured.offsetHeight}px`;
        block.hidden = false;
    };

    // --------------------------------------------------
    // Following the caret
    // --------------------------------------------------

    // Puts the field into the mode's style: the browser's bar, or the rectangle.
    const apply = () => {
        if (!session) return;

        session.input.classList.toggle("overtype", overtype);

        if (overtype) place();
        else session.block.hidden = true;
    };

    // The caret can be moved by a key, a click, an undo writing the field back or
    // the browser itself, so everything that reports a change asks for the
    // rectangle to be placed again. While inserting there is nothing to do: the
    // browser's own bar is the caret on screen.
    const follow = () => {
        if (session && overtype) place();
    };

    document.addEventListener("selectionchange", () => {
        if (session && document.activeElement === session.input) follow();
    });

    // --------------------------------------------------
    // The editor
    // --------------------------------------------------

    const end = () => {
        if (!session) return;

        session.block.remove();
        session.input.classList.remove("overtype");
        session = null;
    };

    const begin = (input) => {
        end();   // an editor that went without its events, e.g. a re-render

        const block = document.createElement("div");
        block.className = "overtype-caret";
        block.hidden = true;
        input.parentElement.appendChild(block);

        session = {input, block};
        apply();
    };

    table.on("cellEditing", (cell) => {
        if (cell.getField() !== field) return;

        // Tabulator builds the <input> right after this event, on the next frame.
        requestAnimationFrame(() => {
            if (cell.getField() !== field) return;

            const input = cell.getElement().querySelector("input");
            if (!input) return;

            begin(input);

            input.addEventListener("keydown", (e) => {
                if (e.isComposing) return;

                // The Insert key switches the mode, and is taken here so that it
                // does nothing else: no browser quirk, no step in a recording.
                if (e.key === "Insert" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
                    e.preventDefault();
                    e.stopPropagation();

                    overtype = !overtype;
                    apply();
                    return;
                }

                if (!overtype) return;
                if (e.ctrlKey || e.metaKey || e.altKey) return;
                if (e.key.length !== 1) return;

                // Overtyping: the character at the caret is taken into the
                // selection, so the key pressed next replaces it. Typing over a
                // highlighted range already replaces it, and at the end of the
                // value there is nothing to replace.
                const at = input.selectionStart ?? 0;
                if (input.selectionEnd !== at) return;

                const length = characterLength(input.value, at);
                if (!length) return;

                input.setSelectionRange(at, at + length);
            }, true);

            input.addEventListener("input", follow);
            input.addEventListener("keyup", follow);
            input.addEventListener("mouseup", follow);
            input.addEventListener("scroll", follow);
        });
    });

    // The editor is gone; the mode stays as it was left.
    table.on("cellEdited", (cell) => {
        if (cell.getField() === field) end();
    });

    table.on("cellEditCancelled", (cell) => {
        if (cell.getField() === field) end();
    });

    // New rows (a load or a save) replace the cells the editor sits in.
    table.on("dataProcessed", end);
}
