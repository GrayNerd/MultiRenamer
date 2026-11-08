import { Events } from "@wailsio/runtime";
import * as App from "../bindings/multirenamer/app.js";
// The grid's own stylesheet, bundled from node_modules so it is always the
// version the code is written against — and so the grid is styled with no
// network. src/style.css overrides what it needs with !important.
import "tabulator-tables/dist/css/tabulator.min.css";
import { TabulatorFull as Tabulator } from "tabulator-tables";
import { preserveCaretAcrossCells } from "./caret.js";
import { createHiddenFiles } from "./hidden.js";
import { createMacroRecorder } from "./macro.js";
import { createMultiRowEditor } from "./mirror.js";
import { setupRowSelection } from "./rowselection.js";
import { createToolbarState } from "./toolbar.js";

// What the entry is, in a word. Read-only, like the extension beside it.
const typeText = (row) => (row.is_dir ? "dir" : "file");

// The grid's Name column holds the name without its extension; that is the only
// thing that is edited. The extension and the type sit beside it, read-only, and
// the file is saved back with whatever extension it came with.

// --------------------------------------------------
// Grid
// --------------------------------------------------
const table = new Tabulator("#grid", {
    layout: "fitColumns",
    height: "100%",
    placeholder: "No files loaded",
    columns: [
        // The header filter narrows the list to the names it matches; the rows
        // it hides stay in the grid (and are still saved) but are skipped by
        // Record/Play/Play All, which only work on what is on screen.
        { title: "Name",          field: "name",          editor: "input", headerFilter: "input", headerFilterPlaceholder: "Filter", widthGrow: 1, resizable: true, headerSort: true },
        // The extension only: a directory, or a file without one, has nothing in
        // this column.
        { title: "Ext",           field: "extension",     width: 90,      widthGrow: 0, resizable: false, headerSort: true },
        // Read-only, and sorted by the word it shows rather than the flag.
        { title: "Type",          field: "is_dir",        width: 90,      widthGrow: 0, resizable: false, headerSort: true,
          formatter: (cell) => typeText(cell.getRow().getData()),
          sorter: (a, b, aRow, bRow) => typeText(aRow.getData()).localeCompare(typeText(bRow.getData())) },
        { title: "Date Created",  field: "date_created",  width: 175,      widthGrow: 0, resizable: false, headerSort: true },
        { title: "Date Modified", field: "date_modified", width: 175,      widthGrow: 0, resizable: false, headerSort: true },
        { title: "Size",          field: "size",          width: 100,      widthGrow: 0, resizable: false, headerSort: true },
        { field: "original_name", visible: false },
        { field: "full_path", visible: false },
    ],
    // Rows can be highlighted: shift-click extends the highlight from the row
    // clicked before, ctrl-click toggles one row. A highlighted range narrows
    // Play All to exactly those rows (see macro.js); a plain click is how a cell
    // starts being edited, so it clears the highlight again.
    selectableRows: true,
    selectableRowsRangeMode: "click",
    // Editing is driven by rowselection.js instead: a click only selects the
    // row, and clicking a row that is already selected opens the editor with the
    // caret where the mouse is.
    editTriggerEvent: false,
});

// Keep the caret at the same offset when moving between Name cells.
preserveCaretAcrossCells(table, "name");

// Hidden files stay out of the grid until Ctrl/Cmd+H asks for them.
const hiddenFiles = createHiddenFiles(table);

// Click to select, click again to edit; arrow keys move the highlight.
setupRowSelection(table, "name");

// Typing into one of several highlighted rows edits all of them.
createMultiRowEditor(table, "name");

// --------------------------------------------------
// Toolbar — each click now calls the imported binding
// --------------------------------------------------
document.getElementById("btn-load").addEventListener("click", async () => {
    try {
        const files = await App.LoadDirectory();
        if (files && files.length) {
            table.replaceData(files);
            hiddenFiles.reset();        // a new list starts with hidden files hidden
        }
    } catch (err) {
        console.error("LoadDirectory failed:", err);
    }
});

const saveBtn = document.getElementById("btn-save");
const recordBtn = document.getElementById("btn-record");
const playBtn = document.getElementById("btn-play");
const playAllBtn = document.getElementById("btn-playall");

// Every button is disabled until it has something to do; see toolbar.js.
const toolbar = createToolbarState(table, {
    save: saveBtn,
    record: recordBtn,
    play: playBtn,
    playAll: playAllBtn,
});

let saving = false;

saveBtn.addEventListener("click", async () => {
    if (saving) return;            // a rename in progress; don't run it twice
    saving = true;
    toolbar.setSaving(true);

    const rows = table.getData();
    let saved;

    try {
        // Go renames every row whose name no longer matches original_name, putting
        // the row's own extension back on, and hands the rows back with the new
        // name as the baseline and full_path pointing at what it now names. On
        // failure it puts back anything it had already renamed and shows why.
        saved = await App.SaveRenames(rows);
    } catch (err) {
        console.error("SaveRenames failed:", err);
        return;
    } finally {
        saving = false;
        toolbar.setSaving(false);
    }

    if (saved && saved.length) table.replaceData(saved);
});

document.getElementById("btn-setup").addEventListener("click", () => {
    App.ShowSetup().catch(err => console.error("ShowSetup failed:", err));
});

// --------------------------------------------------
// Drag and drop
//
// The DOM never sees a file drop: the platform takes the drag and hands it to
// the Wails runtime, which discards any drop that does not land on an element
// marked data-file-drop-target (<body> in index.html, so the whole window
// counts). What reaches Go is a WindowFilesDropped window event, re-emitted
// there as "files-dropped" with the dropped paths (see main.go), and this is
// what loads them — the same replace-the-grid behaviour as the Load button.
// --------------------------------------------------
Events.On("files-dropped", async (ev) => {
    const paths = Array.isArray(ev.data) ? ev.data : [];
    if (paths.length === 0) return;

    try {
        const rows = await App.LoadPaths(paths);
        if (rows && rows.length) {
            table.replaceData(rows);
            hiddenFiles.reset();        // a new list starts with hidden files hidden
        }
    } catch (err) {
        console.error("LoadPaths failed:", err);
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
    record:  recordBtn,
    play:    playBtn,
    playAll: playAllBtn,
    // Tells the toolbar whether Play and Play All have a macro to replay.
}, "name", (state) => toolbar.setMacro(state));
