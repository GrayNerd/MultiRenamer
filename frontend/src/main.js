import { Events } from "@wailsio/runtime";
import * as App from "../bindings/multirenamer/app.js";
// The grid's own stylesheet, bundled from node_modules so it is always the
// version the code is written against — and so the grid is styled with no
// network. src/style.css overrides what it needs with !important.
import "tabulator-tables/dist/css/tabulator.min.css";
import { TabulatorFull as Tabulator } from "tabulator-tables";
import { preserveCaretAcrossCells } from "./caret.js";
import { markEdited, setupEditedNames } from "./edited.js";
import { fitColumns } from "./fit.js";
import { createHiddenFiles } from "./hidden.js";
import { createHistory } from "./history.js";
import { createMacroRecorder } from "./macro.js";
import { createMultiRowEditor } from "./mirror.js";
import { createOvertype } from "./overtype.js";
import { applyPreferences, setupPreferences } from "./preferences.js";
import { createCleanNames } from "./clean.js";
import { forgetRefused, markRefused } from "./refused.js";
import { setupRowSelection } from "./rowselection.js";
import { createToolbarState } from "./toolbar.js";

// What the entry is, in a word. Read-only, like the extension beside it.
const typeText = (row) => (row.is_dir ? "dir" : "file");

// The Type column filters on the word it shows ("dir"/"file"), not on the is_dir
// flag behind it, so typing "dir" finds the folders.
const typeFilter = (value, _rowValue, rowData) =>
    typeText(rowData).toLowerCase().includes(String(value).toLowerCase());

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
    // Both marks are worked out from the row's data, so a row is drawn correctly
    // however it got here: refused by the last save, edited since, or neither.
    rowFormatter: (row) => {
        markRefused(row);
        markEdited(row);
    },
    columns: [
        // Each header filter narrows the list to the rows it matches — a name, an
        // extension, "dir"/"file"; the rows it hides stay in
        // the grid (and are still saved) but are skipped by Record/Play/Play All,
        // which only work on what is on screen.
        { title: "Name",          field: "name",          editor: "input", headerFilter: "input", headerFilterPlaceholder: "Filter", widthGrow: 1, resizable: true, headerSort: true },
        // The extension only: a directory, or a file without one, has nothing in
        // this column.
        { title: "Ext",           field: "extension",     width: 90,      widthGrow: 0, resizable: false, headerSort: true,
          headerFilter: "input", headerFilterPlaceholder: "Filter" },
        // Read-only, and sorted by the word it shows rather than the flag — and
        // filtered by it too.
        { title: "Type",          field: "is_dir",        width: 90,      widthGrow: 0, resizable: false, headerSort: true,
          formatter: (cell) => typeText(cell.getRow().getData()),
          sorter: (a, b, aRow, bRow) => typeText(aRow.getData()).localeCompare(typeText(bRow.getData())),
          headerFilter: "input", headerFilterPlaceholder: "Filter", headerFilterFunc: typeFilter },
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

// Undo covers what is changed in the grid: one step per edit, one per row a
// macro press changes. It is created before the multi-row edit so its keystroke
// listener runs first and still sees the rows as they were before the key landed
// in them. It re-enables Save itself once a value is put back.
const history = createHistory(table, document.getElementById("btn-undo"), "name", () => toolbar.refresh());

// Click to select, click again to edit; arrow keys move the highlight.
setupRowSelection(table, "name");

// Typing into one of several highlighted rows edits all of them. Handed to the
// history so that an undo leaves the edit carrying on from what it put back.
const multiRow = createMultiRowEditor(table, "name");
history.setMirror(multiRow);

// Insert and overtype: the Insert key switches between them and the caret shows
// which one is on. Overtype lasts until Insert is pressed again, across edits.
createOvertype(table, "name");

// A name a save could not change is shown in red until it is edited again.
table.on("cellEdited", forgetRefused);

// A name that has been edited is shown in italic, once the edit is finished.
setupEditedNames(table);

// What the Setup window saved: the theme, the toolbar text, the italic, and the
// sort a load starts with.
setupPreferences(table);

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

    if (saved && saved.length) {
        table.replaceData(saved);

        // SaveRenames put back every refused name and flagged it; mark every one
        // red, not just the rows that happen to be rendered in the virtual DOM
        // viewport right now (rowFormatter only fires for those).
        table.getRows().forEach(markRefused);
    }
});

document.getElementById("btn-setup").addEventListener("click", () => {
    App.ShowSetup().catch(err => console.error("ShowSetup failed:", err));
});

// Replaces the grid with what is at these paths — what the Load button does, for
// paths that arrive from outside the grid. A drop and a selection handed over to
// the program both come through here, so they behave alike.
//
// Loads run one at a time: two selections arriving together — a drop while the
// command line's is still being read, say — would otherwise replace each other's
// grid in whatever order their file reads happened to finish.
let loading = Promise.resolve();

function loadPaths(paths) {
    if (!Array.isArray(paths) || paths.length === 0) return loading;

    loading = loading.then(async () => {
        try {
            const rows = await App.LoadPaths(paths);
            if (rows && rows.length) {
                await table.replaceData(rows);
                hiddenFiles.reset();        // a new list starts with hidden files hidden
            }
        } catch (err) {
            console.error("LoadPaths failed:", err);
        }
    });
    return loading;
}

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
Events.On("files-dropped", (ev) => {
    loadPaths(Array.isArray(ev.data) ? ev.data : []);
});

// The files and folders waiting to be loaded: the ones the program was started
// with, and any a second launch handed over. Go keeps them until they are taken,
// so a selection that arrives before the grid is ready is not lost (see app.go).
async function takeOpenPaths() {
    let paths;
    try {
        paths = await App.TakeOpenPaths();
    } catch (err) {
        console.error("TakeOpenPaths failed:", err);
        return;
    }
    await loadPaths(paths);
}

// A second launch — Nemo opening another selection while the program is running —
// has handed its URIs to this copy, which says so with this event. The window has
// already been brought to the front; the files are loaded like any other.
//
// The options from the Setup window: applied when the grid starts, and again
// whenever they are saved, so a change shows without a restart. The window is
// made hidden until this has happened, so it is never seen in the light theme or
// in the wrong place before the options are on; ShowMain is what puts it up.
//
// Both the selection the program started with and one arriving later wait for
// the options, so a load is sorted the way the option asks however early it
// comes.
const preferencesApplied = App.GetConfig()
    .then((cfg) => applyPreferences(table, cfg))
    .catch((err) => console.error("GetConfig failed:", err));

Events.On("open-paths", () => preferencesApplied.then(takeOpenPaths));

preferencesApplied
    .then(takeOpenPaths)
    // The grid was built while the window was still hidden, so its columns were
    // fitted to a width there was no window for: fit them again now there is one.
    .finally(() => App.ShowMain()
        .catch((err) => console.error("ShowMain failed:", err))
        .finally(() => fitColumns(table)));

Events.On("config-changed", (ev) => applyPreferences(table, ev.data));

// --------------------------------------------------
// Macro recorder — records keystrokes in a Name cell and replays them
// --------------------------------------------------
createMacroRecorder(table, {
    record:  recordBtn,
    play:    playBtn,
    playAll: playAllBtn,
    // Tells the toolbar whether Play and Play All have a macro to replay.
}, "name", (state) => {
    toolbar.setMacro(state);

    // No undo while a macro is being recorded: it would change the grid
    // underneath the keystrokes being captured.
    history.setBlocked(state.recording);
}, history);

// --------------------------------------------------
// Clean — the dots and underscores a name was built with become spaces
// --------------------------------------------------
createCleanNames(table, document.getElementById("btn-clean"), "name", history);
