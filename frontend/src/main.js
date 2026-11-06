import { Events } from "@wailsio/runtime";
import * as App from "../bindings/rename-app/app.js";
import { TabulatorFull as Tabulator } from "tabulator-tables";
import { preserveCaretAcrossCells } from "./caret.js";
import { createMacroRecorder } from "./macro.js";

// --------------------------------------------------
// Grid
// --------------------------------------------------
const table = new Tabulator("#grid", {
    layout: "fitColumns",
    height: "100%",
    placeholder: "No files loaded",
    columns: [
        { title: "Name",          field: "name",          editor: "input", widthGrow: 1, resizable: true,  headerSort: true },
        { title: "Date Created",  field: "date_created",  width: 175,      widthGrow: 0, resizable: false, headerSort: true },
        { title: "Date Modified", field: "date_modified", width: 175,      widthGrow: 0, resizable: false, headerSort: true },
        { title: "Size",          field: "size",          width: 100,      widthGrow: 0, resizable: false, headerSort: true },
        { title: "Original Name", field: "original_name", visible: false },
        { field: "full_path", visible: false },
    ],
});

// Keep the caret at the same offset when moving between Name cells.
preserveCaretAcrossCells(table, "name");

// --------------------------------------------------
// Toolbar — each click now calls the imported binding
// --------------------------------------------------
document.getElementById("btn-load").addEventListener("click", async () => {
    try {
        const files = await App.LoadDirectory();
        if (files && files.length) table.replaceData(files);
    } catch (err) {
        console.error("LoadDirectory failed:", err);
    }
});

const saveBtn = document.getElementById("btn-save");
let saving = false;

saveBtn.addEventListener("click", async () => {
    if (saving) return;            // a rename in progress; don't run it twice
    saving = true;

    const rows = table.getData();

    try {
        // Go renames every row whose name no longer matches original_name; on
        // failure it puts back anything it had already renamed and shows why.
        await App.SaveRenames(rows);
    } catch (err) {
        console.error("SaveRenames failed:", err);
        return;
    } finally {
        saving = false;
    }

    // Saved: the new name becomes the baseline for the next save, and full_path
    // has to follow it so the row keeps pointing at the file it now names.
    table.replaceData(rows.map((row) => ({
        ...row,
        full_path: renamedPath(row),
        original_name: row.name,
    })));
});

// full_path ends with the name the file had when it was loaded, so swap that last
// segment for the new name.
function renamedPath(row) {
    if (!row.full_path || row.name === row.original_name) return row.full_path;
    return row.full_path.slice(0, row.full_path.length - row.original_name.length) + row.name;
}

document.getElementById("btn-setup").addEventListener("click", () => {
    App.ShowSetup().catch(err => console.error("ShowSetup failed:", err));
});

// --------------------------------------------------
// Drag and Drop — handle file drops on all platforms
// The wails runtime only sends file drops to Go on Windows (via WebView2).
// On Linux, handle the DOM drop event directly and pass paths to the binding.
// --------------------------------------------------
document.documentElement.addEventListener("dragover", (e) => {
    e.preventDefault();
});

document.documentElement.addEventListener("drop", async (e) => {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();

    const files = Array.from(e.dataTransfer.files);
    const paths = [];
    for (const file of files) {
        // WebKitGTK on Linux exposes the full filesystem path on File.path
        if (file.path) {
            paths.push(file.path);
        } else if (file.webkitGetAsEntry) {
            const entry = file.webkitGetAsEntry();
            if (entry && entry.fullPath) {
                paths.push(entry.fullPath);
            }
        }
    }

    if (paths.length > 0) {
        try {
            const result = await App.LoadPaths(paths);
            if (result && result.length) table.replaceData(result);
        } catch (err) {
            console.error("LoadPaths failed:", err);
        }
    }
});

// Theme — toggle dark class on body so both main and setup windows match
Events.On("theme-changed", (ev) => {
    document.body.classList.toggle("dark", !!ev.data);
});

// --------------------------------------------------
// Macro recorder — records keystrokes in a Name cell and replays them
// --------------------------------------------------
createMacroRecorder(table, {
    record:  document.getElementById("btn-record"),
    play:    document.getElementById("btn-play"),
    playAll: document.getElementById("btn-playall"),
}, "name");
