// "Clean" turns the separators a name was built with back into spaces:
// "my_report.final" becomes "my report final".
//
// A dot between two digits is left alone, so a decimal survives ("plate_25.4mm"
// becomes "plate 25.4mm"), and a leading dot stays because on Unix that is what
// hides the file (".hidden_file" becomes ".hidden file"). Runs of separators
// become a single space, and the ends are trimmed; a name that would be left with
// nothing in it is not touched at all.

const isDigit = (character) => character >= "0" && character <= "9";

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

        out += character === "_" || (character === "." && !decimalPoint) ? " " : character;
    }

    out = out.replace(/\s+/g, " ").trim();

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
