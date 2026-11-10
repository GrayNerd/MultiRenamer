// "Clean" turns the separators a name was built with back into spaces and gives the
// result AP-style title case: "my_report.final" becomes "My Report Final" and
// "this-is-an-example" becomes "This Is an Example".
//
// A dot between two digits is left alone, so a decimal survives ("plate_25.4mm"
// becomes "Plate 25.4mm"), and a leading dot stays because on Unix that is what
// hides the file (".hidden_file" becomes ".Hidden File"). A dash joins the parts of
// one word and becomes a space, but one that already has a space beside it is a dash
// between words — "1 - text" — and is left as it is. Runs of separators become a
// single space, and the ends are trimmed; a name that would be left with nothing in
// it is not touched at all.
//
// The capitalisation is ap-style-title-case's: the words that carry the meaning are
// capitalised, the short joiners are not, and a word that is already capitalised
// inside keeps its own spelling, so "README_file" becomes "README File".
import { apStyleTitleCase } from "ap-style-title-case";

const isDigit = (character) => character >= "0" && character <= "9";

// A space beside a dash means the dash is standing on its own between two words,
// not joining the parts of one.
const isSpace = (character) => character === " " || character === "\t";

// The cleaned version of a name.
export function cleanName(name) {
    if (typeof name !== "string" || name === "") return name;

    // A leading dot is not a separator, it is what makes the file hidden.
    const hidden = name.startsWith(".");
    const body = hidden ? name.slice(1) : name;

    let out = "";
    for (let i = 0; i < body.length; i += 1) {
        const character = body[i];
        const decimalPoint = character === "." && isDigit(body[i - 1]) && isDigit(body[i + 1]);
        const joinedDash = character === "-" && !isSpace(body[i - 1]) && !isSpace(body[i + 1]);

        const separator = character === "_" || joinedDash || (character === "." && !decimalPoint);
        out += separator ? " " : character;
    }

    // One space where there were several, and nothing at either end.
    out = apStyleTitleCase(out.replace(/\s+/g, " ").trim());

    const cleaned = hidden ? "." + out : out;

    // Nothing left to name: an empty (or ".") name cannot be used, so leave the
    // row as it is rather than hand the save something it will refuse.
    return cleaned === "" || cleaned === "." ? name : cleaned;
}

// controls: the Clean button. history, when given, wraps a press into undo steps
// the way Play All does — one per row it changes.
export function createCleanNames(table, button, field = "name", history = null) {
    // The rows this press works on: the selected ones that are on screen. A header
    // filter hides rows, and a row the user cannot see is not one they meant to
    // change.
    const chosen = () => {
        const selected = new Set(table.getSelectedRows());
        return table.getRows("active").filter((row) => selected.has(row));
    };

    // Nothing selected means there is no row to clean.
    const refresh = () => {
        button.disabled = chosen().length === 0;
    };

    table.on("rowSelected", refresh);
    table.on("rowDeselected", refresh);
    table.on("dataFiltered", refresh);
    table.on("dataProcessed", refresh);
    refresh();

    button.addEventListener("click", () => {
        const rows = chosen();
        if (rows.length === 0) return;

        history?.beginBatch();
        try {
            rows.forEach((row) => {
                const before = String(row.getData()[field] ?? "");
                const after = cleanName(before);
                if (after === before) return;

                // Written straight into the row, the way the multi-row edit does,
                // so the filters and any open editor are left alone. The refused
                // mark goes with it: this is the name being edited again.
                row.update({[field]: after, failed: false, failed_reason: ""});
            });
        } finally {
            history?.endBatch();
        }
    });
}
