// The editing vocabulary shared by the macro recorder, its playback, and the
// live multi-row edit: which keys end a recording, which ones edit or move, and
// what applying them to a value does.

// Keys that end a recording instead of being recorded. Escape closes the
// editor, so anything typed after it belongs to a different edit.
export const STOP_KEYS = ["Enter", "Tab", "ArrowUp", "ArrowDown", "Escape"];

// Keys that edit or move within the field and are worth replaying.
export const EDIT_KEYS = ["Backspace", "Delete", "Home", "End", "ArrowLeft", "ArrowRight"];

// Clipboard shortcuts, pressed with the modifier held.
const CLIPBOARD_KEYS = {c: "Copy", x: "Cut", v: "Paste"};

// The step a keydown stands for, or null when the key is not part of an edit.
//
// Copy, cut and paste carry the range that was highlighted in `input` when the
// key was pressed: that range is what they act on, here and in every cell the
// step is later replayed into.
export function stepForKey(e, input) {
    if (e.altKey) return null;

    if (e.ctrlKey || e.metaKey) {
        const key = CLIPBOARD_KEYS[e.key.toLowerCase()];
        if (!key) return null;

        const from = input.selectionStart ?? 0;
        const to = Math.max(from, input.selectionEnd ?? from);
        return {key, from, to};
    }

    if (e.key.length === 1 || EDIT_KEYS.includes(e.key)) return {key: e.key};

    return null;
}

// Applies steps to a value, starting at a caret offset. The clipboard is passed
// in and handed back: playback lets each row's own copy and cut fill it, so no
// row ever pastes another row's text.
export function applySteps(value, caret, steps, clipboard = "") {
    steps.forEach((step) => {
        const {key} = step;

        switch (key) {
            case "Copy":
            case "Cut": {
                // The characters that were highlighted while recording, at the
                // same place in this value.
                const from = Math.min(step.from, value.length);
                const to = Math.min(step.to, value.length);
                clipboard = value.slice(from, to);

                if (key === "Cut") {
                    value = value.slice(0, from) + value.slice(to);
                    if (caret > to) caret -= to - from;
                    else if (caret > from) caret = from;
                }
                break;
            }

            case "Paste": {
                // The clipboard, or — when nothing was copied or cut inside the
                // macro — the text that was pasted in from outside it.
                const text = clipboard || step.text || "";

                // Land it at the caret, replacing as many characters as were
                // highlighted when the paste was recorded.
                const from = caret;
                const to = Math.min(from + (step.to - step.from), value.length);

                value = value.slice(0, from) + text + value.slice(to);
                caret = from + text.length;
                break;
            }

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

            // A change copied out of the cell being edited, for when the keys it
            // came from were never seen: how far in it happened, what came out
            // and what went in its place. The recording never holds one; the
            // live multi-row edit adds them to stay with the text.
            case "Replace": {
                const at = Math.min(step.at, value.length);
                const gone = Math.min(at + step.taken, value.length);
                const added = step.added ?? "";

                value = value.slice(0, at) + added + value.slice(gone);
                caret = at + added.length;
                break;
            }

            case "ArrowLeft":
                caret = Math.max(0, caret - 1);
                break;

            case "ArrowRight":
                caret = Math.min(value.length, caret + 1);
                break;

            // Home goes to before the first character, End to the end of the
            // entry, however long the value in this row is.
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

    return {value, caret, clipboard};
}
