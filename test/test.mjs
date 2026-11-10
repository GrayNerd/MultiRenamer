// Exercises the real toolbar.js and macro.js against real Tabulator: button
// states, Play/Play All scope with a header filter, and filter persistence.
import { TabulatorFull as Tabulator } from "/tabulator.js";
import { createToolbarState } from "/src/toolbar.js";
import { createMacroRecorder } from "/src/macro.js";
import { preserveCaretAcrossCells } from "/src/caret.js";
import { createHiddenFiles } from "/src/hidden.js";
import { setupRowSelection } from "/src/rowselection.js";
import { fitColumns } from "/src/fit.js";
import { createMultiRowEditor } from "/src/mirror.js";
import { applySteps } from "/src/steps.js";
import { createOvertype } from "/src/overtype.js";
import { forgetRefused, markRefused } from "/src/refused.js";
import { markEdited, setupEditedNames } from "/src/edited.js";
import { applyPreferences, setupPreferences } from "/src/preferences.js";
import { cleanName, createCleanNames } from "/src/clean.js";

// The undo stack lives in its own module, which older trees do not have; the rest
// of the suite runs either way and the undo checks report that they were skipped.
const historyModule = await import("/src/history.js").catch(() => null);

// The reworked multi-row edit reads each change off the field instead of replaying
// the keys, which needs a step that can carry a change; the vocabulary is how the
// rest of the suite can tell whether this tree has it.
const textDerivedMirror =
    applySteps("x", 0, [{key: "Replace", at: 0, taken: 1, added: "y"}], "").value === "y";

const out = [];
const check = (name, ok, detail = "") => out.push(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `  <-- ${detail}`}`);
const info = (msg) => out.push(`INFO ${msg}`);
const tick = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms));

document.getElementById("out").textContent = "module loaded";

const mkRow = (name) => ({
    name,
    original_name: name,
    full_path: `/tmp/dir/${name}`,
    date_created: "2026-01-01 10:00",
    date_modified: "2026-01-01 10:00",
    size: "1 KB",
});

const table = new Tabulator("#grid", {
    layout: "fitColumns",
    height: 420,
    placeholder: "No files loaded",
    columns: [
        { title: "Name", field: "name", editor: "input", headerFilter: "input", headerFilterPlaceholder: "Filter", widthGrow: 1, resizable: true, headerSort: true },
        { title: "Ext", field: "extension", width: 90, widthGrow: 0, resizable: false, headerSort: true,
          headerFilter: "input", headerFilterPlaceholder: "Filter" },
        { title: "Type", field: "is_dir", width: 90, widthGrow: 0, resizable: false, headerSort: true,
          formatter: (cell) => typeLabel(cell.getRow().getData()),
          sorter: (a, b, aRow, bRow) => typeLabel(aRow.getData()).localeCompare(typeLabel(bRow.getData())),
          headerFilter: "input", headerFilterPlaceholder: "Filter",
          headerFilterFunc: (value, _rowValue, rowData) =>
              typeLabel(rowData).toLowerCase().includes(String(value).toLowerCase()) },
        { title: "Date Created", field: "date_created", width: 175, widthGrow: 0, resizable: false, headerSort: true,
          headerFilter: "input", headerFilterPlaceholder: "Filter" },
        { title: "Date Modified", field: "date_modified", width: 175, widthGrow: 0, resizable: false, headerSort: true,
          headerFilter: "input", headerFilterPlaceholder: "Filter" },
        { title: "Size", field: "size", width: 100, widthGrow: 0, resizable: false, headerSort: true },
        { field: "original_name", visible: false },
        { field: "full_path", visible: false },
    ],
    selectableRows: true,
    selectableRowsRangeMode: "click",
    editTriggerEvent: false,
    rowFormatter: (row) => {
        markRefused(row);
        markEdited(row);
    },
});

preserveCaretAcrossCells(table, "name");
const hiddenFiles = createHiddenFiles(table);

const buttons = {
    save: document.getElementById("btn-save"),
    record: document.getElementById("btn-record"),
    play: document.getElementById("btn-play"),
    playAll: document.getElementById("btn-playall"),
};

const toolbar = createToolbarState(table, buttons);

// Created in the same order as main.js: history first, then the row selection
// and the multi-row edit. All of them hang listeners on document, so the order
// decides who sees a keystroke first.
const undoBtn = document.getElementById("btn-undo");
const history = historyModule
    ? historyModule.createHistory(table, undoBtn, "name", () => toolbar.refresh())
    : {setBlocked() {}};

setupRowSelection(table, "name");
const multiRow = createMultiRowEditor(table, "name");
table.on("cellEdited", forgetRefused);
setupEditedNames(table);
if (historyModule) history.setMirror(multiRow);

// Insert and overtype, wired last as in main.js.
createOvertype(table, "name");

let macroChanges = 0;
createMacroRecorder(table, buttons, "name", (state) => {
    macroChanges += 1;
    toolbar.setMacro(state);
    history.setBlocked(state.recording);
}, history);

// Clean, wired last as in main.js.
createCleanNames(table, document.getElementById("btn-clean"), "name", historyModule ? history : null);

const active = () => table.getRows("active").length;
const load = async (list, filter = "") => {
    window.stage = `load ${list.length}`;
    table.setHeaderFilterValue("name", filter);
    table.replaceData(list.map(mkRow));
    hiddenFiles.reset();   // main.js does this on every load
    await tick();
    window.stage = `loaded ${list.length}`;
};

window.stage = "table created";
window.table = table;   // for the screenshot pass in cdp.mjs

// Tabulator builds itself asynchronously; nothing can be loaded before that.
const tableBuilt = new Promise((resolve) => {
    if (table.initialized) resolve();
    else table.on("tableBuilt", resolve);
});


async function main() {
    window.stage = "main start";
    await tableBuilt;
    window.stage = "table built";
    // ---- initial state -------------------------------------------------
    await load(["alpha-1", "alpha-2", "alpha-3", "alpha-4", "beta-1"]);
    window.stage = "initial loaded";
    check("initial: 5 rows on screen", active() === 5, active());
    check("initial: Save disabled, nothing renamed", buttons.save.disabled);
    check("initial: Record enabled, rows present", !buttons.record.disabled);
    check("initial: Play disabled, no macro yet", buttons.play.disabled);
    check("initial: Play All disabled, no macro yet", buttons.playAll.disabled);

    // ---- Save follows the renames --------------------------------------
    table.getRows("active")[0].getCell("name").setValue("alpha-1-renamed");
    await tick();
    check("edited: Save enabled", !buttons.save.disabled);

    table.getRows("active")[0].getCell("name").setValue("alpha-1");
    await tick();
    check("edit undone: Save disabled again", buttons.save.disabled);

    // ---- filtering ------------------------------------------------------
    table.getRows("active")[0].getCell("name").setValue("alpha-1-renamed");
    await tick();

    table.setHeaderFilterValue("name", "beta");
    await tick();
    check("filter beta: 1 row on screen", active() === 1, active());
    check("filter beta: Record still enabled", !buttons.record.disabled);
    check("filter beta: Save still enabled (change hidden, not gone)", !buttons.save.disabled);

    table.setHeaderFilterValue("name", "zzz");
    await tick();
    check("filter zzz: no rows on screen", active() === 0, active());
    check("filter zzz: Record disabled", buttons.record.disabled);
    check("filter zzz: Save still enabled", !buttons.save.disabled);

    // Stop is the record button: it must stay clickable with nothing on screen.
    toolbar.setMacro({ recording: true, hasMacro: false });
    check("recording, empty view: Record (Stop) still enabled", !buttons.record.disabled);
    toolbar.setMacro({ recording: false, hasMacro: true });
    check("macro, empty view: Play disabled", buttons.play.disabled);
    check("macro, empty view: Play All disabled", buttons.playAll.disabled);

    table.setHeaderFilterValue("name", "");
    await tick();
    check("filter cleared: 5 rows on screen", active() === 5, active());
    check("filter cleared + macro: Play enabled", !buttons.play.disabled);
    check("filter cleared + macro: Play All enabled", !buttons.playAll.disabled);

    // ---- empty grid -----------------------------------------------------
    table.replaceData([]);
    await tick();
    check("empty grid: Record disabled", buttons.record.disabled);
    check("empty grid: Save disabled", buttons.save.disabled);
    check("empty grid: Play disabled", buttons.play.disabled);
    check("empty grid: Play All disabled", buttons.playAll.disabled);

    // ---- does a header filter survive a reload? -------------------------
    table.setHeaderFilterValue("name", "alpha");
    await tick();
    table.replaceData(["alpha-1", "alpha-2", "beta-1"].map(mkRow));
    await tick();
    info(`after replaceData with filter "alpha": ${active()} on screen of ${table.getData().length}`);

    await rest();
}

async function rest() {
    // ---- Play All only touches rows on screen ---------------------------
    await load(["alpha-1", "alpha-2", "alpha-3", "alpha-4", "beta-1"], "alpha");
    check("play all: 4 rows on screen, 5 in the grid", active() === 4 && table.getData().length === 5,
        `${active()}/${table.getData().length}`);

    const firstCell = table.getRows("active")[0].getCell("name");
    firstCell.edit();
    const editor = firstCell.getElement().querySelector("input");
    check("recording: editor is open", !!editor);
    editor.setSelectionRange(editor.value.length, editor.value.length);

    buttons.record.click();
    await tick();
    // The bar's word is what a tip shows, so it must be the new one.
    check("recording: button switched to Stop",
        buttons.record.getAttribute("aria-pressed") === "true"
        && buttons.record.querySelector(".btn-label").textContent === "Stop",
        `${buttons.record.getAttribute("aria-pressed")}/${buttons.record.querySelector(".btn-label").textContent}`);
    check("recording: Play disabled while recording", buttons.play.disabled && buttons.playAll.disabled);

    dispatchKey("Z");
    buttons.record.click();
    await tick();
    check("recorded: Play enabled", !buttons.play.disabled);
    check("recorded: Play All enabled", !buttons.playAll.disabled);
    check("recorded: recorder reported its state", macroChanges >= 2, macroChanges);

    buttons.playAll.click();
    await tick(80);

    const after = table.getData();
    const alpha = after.filter((row) => row.name.startsWith("alpha")).map((row) => row.name);
    const beta = after.find((row) => row.name.startsWith("beta"));
    check("play all: every visible row got the macro", alpha.every((name) => name.endsWith("Z")), alpha.join(" "));
    check("play all: hidden row untouched", beta.name === "beta-1", beta.name);
    check("play all: Save enabled afterwards", !buttons.save.disabled);

    // ---- Play touches one row and moves to the next visible one ---------
    await load(["gamma-1", "gamma-2", "gamma-3", "gamma-4", "delta-1"], "gamma");
    const gamma = table.getRows("active");
    gamma[1].select();

    buttons.play.click();
    await tick(80);

    const played = table.getData().filter((row) => row.name.endsWith("Z")).map((row) => row.name);
    check("play: exactly one row changed", played.length === 1, played.join(" "));
    check("play: the selected row changed", played[0] === "gamma-2Z", played.join(" "));
    check("play: hidden row untouched", table.getData().some((row) => row.name === "delta-1"));

    const editing = document.querySelector("#grid .tabulator-cell.tabulator-editing");
    const editingRow = editing ? editing.closest(".tabulator-row") : null;
    check("play: caret moved to the next visible row", editingRow === gamma[2].getElement(),
        editing ? editing.textContent : "no editor open");

    // ---- an edit that stops matching the filter -------------------------
    // Tabulator does not re-run filters on a cell edit, so the row stays on
    // screen; it only leaves when the filter or the data changes. Play then
    // still applies to it, which is what "on screen" means here.
    await load(["alpha-1", "alpha-2", "beta-1"], "alpha");
    table.getRows("active")[0].getCell("name").setValue("zzz-1");
    await tick(80);
    info(`after renaming a row out of the filter: ${active()} on screen, ${table.getData().length} in the grid`);
    check("edit stays on screen: Save enabled", !buttons.save.disabled);
    check("edit stays on screen: Record enabled", !buttons.record.disabled);

    await highlights();

    document.getElementById("out").textContent = summarise();
}

// Highlights are made with the mouse: dispatch the press (which carries the
// modifier our code reads) and the click Tabulator acts on.
const clickRow = (row, {shift = false, ctrl = false} = {}) => {
    const element = row.getElement();
    element.dispatchEvent(new MouseEvent("mousedown", {bubbles: true, shiftKey: shift, ctrlKey: ctrl}));
    element.dispatchEvent(new MouseEvent("click", {bubbles: true, shiftKey: shift, ctrlKey: ctrl}));
};

// Keys are dispatched on the open editor's input and bubble up from there, the
// way a real keypress travels: Tabulator's input editor stops Home and End at
// the input, which a synthetic event on the document would hide.
const dispatchKey = (key, {ctrl = false} = {}) => {
    const input = document.querySelector("#grid .tabulator-cell.tabulator-editing input");
    const target = input ?? document;
    target.dispatchEvent(new KeyboardEvent("keydown", {key, ctrlKey: ctrl, bubbles: true}));
};
const editedNames = () => table.getData().map((row) => row.name);

// Rows as they are on screen, with the row being edited as its field has it: the
// row's own value only changes when the edit is committed.
const captured = () => {
    const input = editorInput();
    const editing = input?.closest(".tabulator-row") ?? null;

    return table.getRows()
        .map((row) => (editing && row.getElement() === editing ? input.value : String(row.getData().name)))
        .join("|");
};

async function highlights() {
    // ---- shift-click range: Play All touches only those rows ------------
    await load(["hl-1", "hl-2", "hl-3", "hl-4", "hl-5"]);
    const hl = table.getRows("active");

    clickRow(hl[1]);
    clickRow(hl[3], {shift: true});
    check("highlight: shift-click selected a range of 3", table.getSelectedRows().length === 3,
        table.getSelectedRows().length);

    buttons.playAll.click();
    await tick(80);
    check("highlight: only the highlighted rows were edited",
        editedNames().join(" ") === "hl-1 hl-2Z hl-3Z hl-4Z hl-5", editedNames().join(" "));

    const editing = document.querySelector("#grid .tabulator-cell.tabulator-editing");
    const editingRow = editing ? editing.closest(".tabulator-row") : null;
    check("highlight: caret stays in the last highlighted row", editingRow === hl[3].getElement(),
        editing ? editing.textContent : "no editor open");

    // ---- a plain click is not a highlight --------------------------------
    await load(["pc-1", "pc-2", "pc-3", "pc-4", "pc-5"]);
    const pc = table.getRows("active");

    clickRow(pc[1]);
    buttons.playAll.click();
    await tick(80);
    check("plain click: Play All still works from that row down",
        editedNames().join(" ") === "pc-1 pc-2Z pc-3Z pc-4Z pc-5Z", editedNames().join(" "));

    // ---- ctrl-click selects one row deliberately -------------------------
    await load(["cc-1", "cc-2", "cc-3"]);
    clickRow(table.getRows("active")[1], {ctrl: true});
    check("ctrl-click: one row highlighted", table.getSelectedRows().length === 1,
        table.getSelectedRows().length);

    buttons.playAll.click();
    await tick(80);
    check("ctrl-click: only that row was edited",
        editedNames().join(" ") === "cc-1 cc-2Z cc-3", editedNames().join(" "));

    // ---- a highlight does not reach hidden rows --------------------------
    await load(["fg-1", "fg-2", "fg-3", "fg-4"]);
    const fg = table.getRows("active");
    clickRow(fg[0]);
    clickRow(fg[2], {shift: true});

    table.setHeaderFilterValue("name", "fg-1");
    await tick(80);
    check("highlight + filter: 3 highlighted, 1 on screen",
        table.getSelectedRows().length === 3 && active() === 1,
        `${table.getSelectedRows().length}/${active()}`);

    buttons.playAll.click();
    await tick(80);
    check("highlight + filter: only the visible highlighted row was edited",
        editedNames().join(" ") === "fg-1Z fg-2 fg-3 fg-4", editedNames().join(" "));

    table.setHeaderFilterValue("name", "");
    await tick();

    await clipboardSteps();
    await homeEndSteps();
    await rowselectionSteps();
    await fitSteps();
    await multiRowEditSteps();
    await overtypeSteps();
    await editedMarkSteps();
    await refusedMarkSteps();
    await extensionSteps();
    await filterSteps();
    await cleanSteps();
    await hiddenSteps();
    if (historyModule) await undoSteps();
    else info("undo checks skipped: src/history.js is not in this tree");

    // Last: it turns auto-sort on, which reorders every later load.
    await preferencesSteps();
}

// The extension and type columns: the same formatter/sorter main.js uses.
const typeLabel = (row) => (row.is_dir ? "dir" : "file");

async function extensionSteps() {
    table.replaceData([
        {name: "report", original_name: "report", extension: "txt", is_dir: false, full_path: "/d/report.txt", date_created: "", date_modified: "", size: "1 KB"},
        {name: "archive.tar", original_name: "archive.tar", extension: "gz", is_dir: false, full_path: "/d/archive.tar.gz", date_created: "", date_modified: "", size: "1 KB"},
        {name: "README", original_name: "README", extension: "", is_dir: false, full_path: "/d/README", date_created: "", date_modified: "", size: "1 KB"},
        {name: "photos", original_name: "photos", extension: "", is_dir: true, full_path: "/d/photos", date_created: "", date_modified: "", size: "1 KB"},
    ]);
    await tick(120);

    const texts = (field) => table.getRows("active").map((row) => row.getCell(field).getElement().textContent);

    const blanks = (field) => texts(field).filter((text) => text.trim() === "").length;

    check("ext: a file shows just its extension", texts("extension").includes("txt") && texts("extension").includes("gz"),
        texts("extension").join());
    check("ext: nothing for a file without an extension or a directory", blanks("extension") === 2,
        texts("extension").map((t) => `[${t.trim()}]`).join());

    check("type: files and directories are labelled",
        texts("is_dir").filter((t) => t === "file").length === 3 && texts("is_dir").includes("dir"),
        texts("is_dir").join());

    // Both columns sort by what they show.
    table.setSort("extension", "asc");
    await tick(120);
    const sortedExt = texts("extension");
    check("ext: sorting orders by the shown text",
        sortedExt.join() === sortedExt.slice().sort((a, b) => a.localeCompare(b)).join(), sortedExt.join());

    table.setSort("is_dir", "asc");
    await tick(120);
    const sortedType = texts("is_dir");
    check("type: sorting orders by the shown text",
        sortedType.join() === sortedType.slice().sort((a, b) => a.localeCompare(b)).join(), sortedType.join());

    table.clearSort();
    await tick(60);
}

// The read-only columns can be narrowed by their own header filters, the Type
// column by the word it shows.
async function filterSteps() {
    table.replaceData([
        {name: "alpha", original_name: "alpha", extension: "txt", is_dir: false, full_path: "/d/alpha.txt",
         date_created: "2026-01-05 10:00", date_modified: "2026-03-01 09:00", size: "1 KB"},
        {name: "beta", original_name: "beta", extension: "gz", is_dir: false, full_path: "/d/beta.gz",
         date_created: "2026-02-10 10:00", date_modified: "2026-01-15 09:00", size: "2 KB"},
        {name: "gamma", original_name: "gamma", extension: "txt", is_dir: true, full_path: "/d/gamma",
         date_created: "2026-02-20 10:00", date_modified: "2026-02-01 09:00", size: "1 KB"},
        {name: "delta", original_name: "delta", extension: "md", is_dir: false, full_path: "/d/delta.md",
         date_created: "2026-03-01 10:00", date_modified: "2026-02-20 09:00", size: "3 KB"},
    ]);
    hiddenFiles.reset();
    await tick(120);

    const names = () => table.getRows("active").map((row) => row.getData().name).join(",");
    const filterBy = async (field, value) => {
        table.setHeaderFilterValue(field, value);
        await tick(120);
    };

    check("filter: every row on screen to begin with", names() === "alpha,beta,gamma,delta", names());

    // ---- the extension ------------------------------------------------
    await filterBy("extension", "txt");
    check("filter: the Ext filter matches the extension", names() === "alpha,gamma", names());

    await filterBy("extension", "");

    // ---- the type, filtered by the word on screen ----------------------
    await filterBy("is_dir", "dir");
    check("filter: typing dir finds the folders", names() === "gamma", names());

    await filterBy("is_dir", "file");
    check("filter: typing file finds the files", names() === "alpha,beta,delta", names());

    await filterBy("is_dir", "");

    // ---- the dates, by any part of what is shown ----------------------
    await filterBy("date_created", "2026-02");
    check("filter: the created date filter matches a month", names() === "beta,gamma", names());

    await filterBy("date_created", "");
    await filterBy("date_modified", "2026-02");
    check("filter: the modified date filter matches a month", names() === "gamma,delta", names());

    await filterBy("date_modified", "");
    check("filter: clearing them brings every row back", names() === "alpha,beta,gamma,delta", names());

    // ---- sorting still works over what is left ------------------------
    await filterBy("extension", "txt");
    table.setSort("date_created", "desc");
    await tick(120);
    check("filter: sorting still applies to the filtered rows", names() === "gamma,alpha", names());

    await filterBy("extension", "");
    table.clearSort();
    await tick(120);
}

// Clean turns the dots and underscores a name was built with back into spaces.
async function cleanSteps() {
    check("clean: dots and underscores become spaces",
        cleanName("my_report.final") === "my report final", cleanName("my_report.final"));
    check("clean: a decimal point is kept",
        cleanName("plate_25.4mm") === "plate 25.4mm", cleanName("plate_25.4mm"));
    check("clean: a leading dot stays, so the file stays hidden",
        cleanName(".hidden_file") === ".hidden file", cleanName(".hidden_file"));
    check("clean: runs of separators become one space",
        cleanName("a__b..c") === "a b c", cleanName("a__b..c"));
    check("clean: the ends are trimmed", cleanName("_name_") === "name", cleanName("_name_"));
    check("clean: a name with nothing to clean is left alone",
        cleanName("plain name") === "plain name", cleanName("plain name"));

    const cleanBtn = document.getElementById("btn-clean");

    // ---- nothing to clean until a row is picked ------------------------
    await load(["one_row.two", "three_row", "four.five"]);
    check("clean: the button is disabled with nothing selected", cleanBtn.disabled);

    const rows = table.getRows("active");
    await clickCell(rows[1]);
    check("clean: and enabled once a row is selected", !cleanBtn.disabled);

    cleanBtn.click();
    await tick(80);
    check("clean: the selected row is cleaned, the others are not",
        editedNames().join(",") === "one_row.two,three row,four.five", editedNames().join(","));
    check("clean: the change counts as unsaved work", !buttons.save.disabled);

    // ---- every highlighted row is cleaned ------------------------------
    await load(["a_b", "c_d", "e_f", "g_h"]);
    const four = table.getRows("active");
    await clickCell(four[0]);
    await clickCell(four[2], "name", {shift: true});

    cleanBtn.click();
    await tick(80);
    check("clean: every highlighted row is cleaned",
        editedNames().join(",") === "a b,c d,e f,g_h", editedNames().join(","));

    // ---- undo puts them back, one row per press ------------------------
    if (historyModule) {
        for (let i = 0; i < 3; i += 1) {
            undoBtn.click();
            await tick(60);
        }
        check("clean: undo puts every name back",
            editedNames().join(",") === "a_b,c_d,e_f,g_h", editedNames().join(","));
    } else {
        info("clean: undo check skipped: src/history.js is not in this tree");
    }
}

// Ctrl/Cmd+H shows and hides the dotfiles; every load starts with them hidden.
async function hiddenSteps() {
    const rowsWithHidden = () => [
        {name: "doc", original_name: "doc", extension: "txt", is_dir: false, hidden: false, full_path: "/d/doc.txt", date_created: "", date_modified: "", size: "1 KB"},
        {name: ".bashrc", original_name: ".bashrc", extension: "", is_dir: false, hidden: true, full_path: "/d/.bashrc", date_created: "", date_modified: "", size: "1 KB"},
        {name: "notes", original_name: "notes", extension: "", is_dir: false, hidden: false, full_path: "/d/notes", date_created: "", date_modified: "", size: "1 KB"},
    ];

    const reload = async () => {
        table.replaceData(rowsWithHidden());
        hiddenFiles.reset();          // main.js does this on every load
        await tick(120);
    };

    const pressToggle = (target = document) => {
        const event = new KeyboardEvent("keydown", {key: "h", ctrlKey: true, bubbles: true, cancelable: true});
        target.dispatchEvent(event);
        return event.defaultPrevented;
    };

    await reload();
    check("hidden: a load starts with hidden files left out", active() === 2, active());
    check("hidden: the dotfile is the one left out",
        table.getRows("active").every((row) => !row.getData().hidden),
        table.getRows("active").map((row) => row.getData().name).join());

    check("hidden: Ctrl+H is taken from the browser", pressToggle());
    await tick(120);
    check("hidden: Ctrl+H shows them", active() === 3, active());

    pressToggle();
    await tick(120);
    check("hidden: Ctrl+H again hides them", active() === 2, active());

    // Loading goes back to the default, even when they were showing.
    pressToggle();
    await tick(120);
    await reload();
    check("hidden: loading resets to hidden", active() === 2, active());

    // It narrows the same list the header filter does: "s" matches "notes" and
    // ".bashrc", but the hidden one stays out.
    table.setHeaderFilterValue("name", "s");
    await tick(120);
    check("hidden: the header filter still applies on top", active() === 1, active());
    table.setHeaderFilterValue("name", "");
    await tick(60);

    // An open editor keeps the key for itself.
    await reload();
    openEditor(table.getRows("active")[0], []);
    pressToggle(editorInput());
    await tick(120);
    check("hidden: the toggle leaves an open editor alone", active() === 2, active());
    pressKey("Escape");
    await tick(60);
}

// Undo: one step per edit, one per macro press, blocked while recording.
async function undoSteps() {
    const undo = async () => {
        undoBtn.click();
        await tick(80);
    };

    // ---- nothing to undo at first, and a load clears the steps ----------
    await load(["u1", "u2", "u3"]);
    check("undo: disabled with nothing to undo", undoBtn.disabled);

    // ---- one step per single-row edit ----------------------------------
    await clickCell(table.getRows("active")[0]);
    await clickCell(table.getRows("active")[0], "name", {x: "right"});
    typeInto(editorInput(), "A");
    pressKey("Enter");
    await tick(60);
    check("undo: enabled after an edit", !undoBtn.disabled);
    check("undo: the edit is in the grid", editedNames()[0] === "u1A", editedNames().join(" "));

    await undo();
    check("undo: the edit is put back", editedNames().join(" ") === "u1 u2 u3", editedNames().join(" "));
    check("undo: disabled again afterwards", undoBtn.disabled);

    // ---- two edits, undone newest first --------------------------------
    const rows = () => table.getRows("active");
    await clickCell(rows()[0], "name", {x: "right"});
    await clickCell(rows()[0], "name", {x: "right"});
    typeInto(editorInput(), "A");
    pressKey("Enter");
    await tick(60);
    await clickCell(rows()[1], "name", {x: "right"});
    await clickCell(rows()[1], "name", {x: "right"});
    typeInto(editorInput(), "B");
    pressKey("Enter");
    await tick(60);
    check("undo: two edits are in the grid", editedNames().join(" ") === "u1A u2B u3", editedNames().join(" "));

    await undo();
    check("undo: the newest edit goes first", editedNames().join(" ") === "u1A u2 u3", editedNames().join(" "));
    await undo();
    check("undo: then the older one", editedNames().join(" ") === "u1 u2 u3", editedNames().join(" "));

    // ---- a multi-row edit undoes one keystroke at a time, on every row -----
    await load(["m1", "m2", "m3"]);
    const multi = table.getRows("active");
    await clickCell(multi[0]);
    await clickCell(multi[2], "name", {shift: true});
    await clickCell(multi[1], "name", {x: "right"});
    typeInto(editorInput(), "XY");
    pressKey("Enter");
    await tick(80);
    check("undo: the multi-row edit changed all three",
        editedNames().join(" ") === "m1XY m2XY m3XY", editedNames().join(" "));

    await undo();
    check("undo: one keystroke comes off every row at once",
        editedNames().join(" ") === "m1X m2X m3X", editedNames().join(" "));
    await undo();
    check("undo: and then the one before it, still in sync",
        editedNames().join(" ") === "m1 m2 m3", editedNames().join(" "));
    check("undo: the multi-row edit is fully back", undoBtn.disabled);

    // The same with a backspace in the middle of the edit.
    await load(["n1", "n2"]);
    const mixed = table.getRows("active");
    await clickCell(mixed[0]);
    await clickCell(mixed[1], "name", {shift: true});
    await clickCell(mixed[0], "name", {x: "right"});
    typeInto(editorInput(), "AB");
    editorInput().dispatchEvent(new KeyboardEvent("keydown", {key: "Backspace", bubbles: true}));
    editorInput().value = "n1A";
    editorInput().setSelectionRange(3, 3);
    editorInput().dispatchEvent(new Event("input", {bubbles: true}));
    pressKey("Enter");
    await tick(80);
    check("undo: a delete counts as one keystroke",
        editedNames().join(" ") === "n1A n2A", editedNames().join(" "));

    await undo();
    check("undo: the delete is undone on both rows",
        editedNames().join(" ") === "n1AB n2AB", editedNames().join(" "));
    await undo();
    check("undo: then a letter, on both rows",
        editedNames().join(" ") === "n1A n2A", editedNames().join(" "));

    // ---- rows loaded from dropped folders behave the same --------------
    const folderRow = (name) => ({
        name, original_name: name, extension: "", is_dir: true, hidden: false,
        full_path: `/d/${name}`, date_created: "", date_modified: "", size: "4 KB",
    });
    const folderNames = () => table.getData().map((row) => row.name).join(" ");

    table.replaceData([folderRow("dirA"), folderRow("dirB"), folderRow("dirC")]);
    hiddenFiles.reset();
    await tick(120);

    const folders = table.getRows("active");
    await clickCell(folders[0]);
    await clickCell(folders[2], "name", {shift: true});
    await clickCell(folders[1], "name", {x: "right"});
    typeInto(editorInput(), "XY");
    await tick(60);
    check("undo folders: the edit reached every row",
        folderNames() === "dirAXY dirB dirCXY", folderNames());

    const openField = () => editorInput()?.value ?? null;

    await undo();          // with the editor still open, as one does
    check("undo folders: one keystroke comes off every other row",
        folderNames() === "dirAX dirB dirCX", folderNames());
    check("undo folders: and off the row being typed in, which stays open",
        openField() === "dirBX", openField());

    await undo();
    check("undo folders: and the one before it",
        folderNames() === "dirA dirB dirC" && openField() === "dirB",
        `${folderNames()} field=${openField()}`);

    pressKey("Enter");
    await tick(60);
    check("undo folders: committing keeps what is left",
        folderNames() === "dirA dirB dirC", folderNames());

    table.deselectRow();


    // ---- a macro press is a single step --------------------------------
    await load(["p1", "p2", "p3", "p4"]);
    const playRows = table.getRows("active");
    await clickCell(playRows[0]);
    await clickCell(playRows[0], "name", {x: "right"});

    buttons.record.click();
    await tick(60);
    check("undo: blocked while recording", undoBtn.disabled);
    dispatchKey("Z");
    buttons.record.click();            // stop
    await tick(60);

    buttons.playAll.click();           // macro over the row and everything below
    await tick(120);
    check("undo: the macro changed every row",
        editedNames().join(" ") === "p1Z p2Z p3Z p4Z", editedNames().join(" "));

    await undo();
    check("undo: a macro press comes back one row at a time, last row first",
        editedNames().join(" ") === "p1Z p2Z p3Z p4", editedNames().join(" "));
    await undo();
    check("undo: then the row above it",
        editedNames().join(" ") === "p1Z p2Z p3 p4", editedNames().join(" "));
    await undo();
    await undo();
    check("undo: and the first row last",
        editedNames().join(" ") === "p1 p2 p3 p4", editedNames().join(" "));
    check("undo: nothing left after that", undoBtn.disabled);

    // ---- two macro presses are two steps -------------------------------
    const pressRows = () => table.getRows("active");
    pressRows()[0].getCell("name").edit();
    buttons.play.click();               // one row
    await tick(120);
    pressRows()[1].getCell("name").edit();
    buttons.play.click();               // the next row
    await tick(120);
    check("undo: two separate plays changed two rows",
        editedNames().join(" ") === "p1Z p2Z p3 p4", editedNames().join(" "));

    await undo();
    check("undo: the second play comes back first",
        editedNames().join(" ") === "p1Z p2 p3 p4", editedNames().join(" "));
    await undo();
    check("undo: then the first play", editedNames().join(" ") === "p1 p2 p3 p4", editedNames().join(" "));

    // ---- a load clears what could be undone ----------------------------
    await load(["z1", "z2"]);
    await clickCell(table.getRows("active")[0]);
    await clickCell(table.getRows("active")[0], "name", {x: "right"});
    typeInto(editorInput(), "Q");
    pressKey("Enter");
    await tick(60);
    check("undo: enabled before the reload", !undoBtn.disabled);

    await load(["n1", "n2"]);
    check("undo: a new list starts with no history", undoBtn.disabled);

    // ---- Ctrl+Z does the same as the button ----------------------------
    await load(["k1", "k2"]);
    await clickCell(table.getRows("active")[0]);
    await clickCell(table.getRows("active")[0], "name", {x: "right"});
    typeInto(editorInput(), "K");
    pressKey("Enter");
    await tick(60);
    check("undo key: the edit is in the grid", editedNames()[0] === "k1K", editedNames().join(" "));

    pressKey("z", {ctrl: true, target: document});
    await tick(80);
    check("undo key: Ctrl+Z puts it back", editedNames().join(" ") === "k1 k2", editedNames().join(" "));
    check("undo key: and the button follows", undoBtn.disabled);

    // With an editor open the key takes one keystroke off every row and leaves
    // the editor where it is, so the next key goes on editing.
    await load(["j1", "j2", "j3"]);
    const keyRows = table.getRows("active");
    await clickCell(keyRows[0]);
    await clickCell(keyRows[2], "name", {shift: true});
    await clickCell(keyRows[1], "name", {x: "right"});
    typeInto(editorInput(), "PQ");
    await tick(60);
    check("undo key: both keys reached every row", captured() === "j1PQ|j2PQ|j3PQ", captured());

    const fromEditor = pressKey("z", {ctrl: true});    // taken from the browser
    await tick(80);
    check("undo key: taken even with an editor open", fromEditor, fromEditor);
    check("undo key: the editor is still open", !!editorCell(), editorCell() ? "open" : "closed");
    check("undo key: the row being typed in lost just the last key",
        editorInput()?.value === "j2P", editorInput()?.value);
    check("undo key: and so did every other row",
        captured() === "j1P|j2P|j3P", captured());

    // The edit carries on: what is typed next is copied to the others again.
    typeInto(editorInput(), "R");
    await tick(60);
    check("undo key: typing after the undo reaches every row again",
        captured() === "j1PR|j2PR|j3PR", captured());

    pressKey("Enter");
    await tick(80);
    check("undo key: committing keeps the edited text",
        editedNames().join(" ") === "j1PR j2PR j3PR", editedNames().join(" "));

    // Undo is still one keystroke at a time once the edit is committed.
    pressKey("z", {ctrl: true, target: document});
    await tick(80);
    check("undo key: then one keystroke comes off every row",
        editedNames().join(" ") === "j1P j2P j3P", editedNames().join(" "));
    pressKey("z", {ctrl: true, target: document});
    await tick(80);
    check("undo key: and the one before it",
        editedNames().join(" ") === "j1 j2 j3", editedNames().join(" "));

    pressKey("z", {ctrl: true, target: document});
    await tick(80);
    check("undo key: the next press takes the one before it",
        editedNames().join(" ") === "j1 j2 j3", editedNames().join(" "));
    check("undo key: nothing left", undoBtn.disabled);

    // A single-row edit in progress comes back the same way.
    await load(["k1", "k2"]);
    await clickCell(table.getRows("active")[0]);
    await clickCell(table.getRows("active")[0], "name", {x: "right"});
    typeInto(editorInput(), "K");

    pressKey("z", {ctrl: true});                       // caret in the editor
    await tick(80);
    check("undo key: an unfinished edit is committed and then undone",
        editedNames().join(" ") === "k1 k2", editedNames().join(" "));
    pressKey("Escape");
    await tick(60);

    // Nothing to undo while a macro is recording, even with no editor open.
    await load(["r1", "r2"]);
    await clickCell(table.getRows("active")[0]);
    await clickCell(table.getRows("active")[0], "name", {x: "right"});
    typeInto(editorInput(), "R");
    pressKey("Enter");
    await tick(60);
    check("undo key: an edit to come back to", editedNames()[0] === "r1R", editedNames().join(" "));

    buttons.record.click();            // recording, with the editor closed
    await tick(60);
    const whileRecording = pressKey("z", {ctrl: true, target: document});
    await tick(80);
    check("undo key: no undo while recording", !whileRecording && editedNames()[0] === "r1R",
        `${whileRecording} ${editedNames().join(" ")}`);

    buttons.record.click();            // stop
    await tick(60);

    pressKey("z", {ctrl: true, target: document});
    await tick(80);
    check("undo key: works again once the recording stops",
        editedNames().join(" ") === "r1 r2", editedNames().join(" "));

    table.deselectRow();
}

// ---- helpers for the click / keyboard / multi-row tests -------------------
const editorCell = () => document.querySelector("#grid .tabulator-cell.tabulator-editing");
const editorInput = () => editorCell()?.querySelector("input") ?? null;

// Where the editor is, for checks that an edit has closed: which row, which field,
// and what the field holds.
const editingWhere = () => {
    const cell = editorCell();
    if (!cell) return "closed";

    const row = cell.closest(".tabulator-row");
    const index = table.getRows().findIndex((r) => r.getElement() === row);
    return `row ${index}, ${cell.getAttribute("tabulator-field")}, ${JSON.stringify(editorInput()?.value)}`;
};

const selectedNames = () => table.getSelectedRows().map((row) => row.getData().name);

// Clicks a cell at the left edge, the right edge, or a pixel offset into it.
const clickCell = async (row, field = "name", {x = "left", shift = false, ctrl = false} = {}) => {
    const element = row.getCell(field).getElement();
    const rect = element.getBoundingClientRect();
    const clientX = typeof x === "number" ? rect.left + x : x === "right" ? rect.right - 1 : rect.left + 1;
    const options = {bubbles: true, clientX, clientY: rect.top + rect.height / 2, shiftKey: shift, ctrlKey: ctrl};

    element.dispatchEvent(new MouseEvent("mousedown", options));
    element.dispatchEvent(new MouseEvent("click", options));
    await tick(60);
};

// A keypress as the browser would deliver it, plus whether it was taken.
// Home and End also move the field's caret, as the browser would.
const pressKey = (key, {ctrl = false, shift = false, meta = false, target} = {}) => {
    const element = target ?? editorInput() ?? document;
    const event = new KeyboardEvent("keydown", {key, ctrlKey: ctrl, shiftKey: shift, metaKey: meta, bubbles: true, cancelable: true});
    element.dispatchEvent(event);

    if (!event.defaultPrevented && !ctrl && element instanceof HTMLInputElement) {
        const at = key === "Home" ? 0 : key === "End" ? element.value.length : null;
        if (at !== null) element.setSelectionRange(at, at);
    }

    return event.defaultPrevented;
};

// A keypress as the browser applies it: the character replaces whatever is
// selected — nothing, unless overtype has taken the character at the caret into
// the selection (see overtype.js), or a range was highlighted.
const typeInto = (input, text) => {
    for (const character of text) {
        input.dispatchEvent(new KeyboardEvent("keydown", {key: character, bubbles: true}));
        const from = input.selectionStart ?? input.value.length;
        const to = Math.max(from, input.selectionEnd ?? from);
        input.value = input.value.slice(0, from) + character + input.value.slice(to);
        input.setSelectionRange(from + 1, from + 1);
        input.dispatchEvent(new Event("input", {bubbles: true}));
    }
};

// One keypress the recorder/mirror should see, plus the input event that makes
// them apply it (the test does not really edit the field for cut and paste).
const stepKey = (key, {ctrl = false} = {}) => {
    pressKey(key, {ctrl});
    editorInput()?.dispatchEvent(new Event("input", {bubbles: true}));
};

async function rowselectionSteps() {
    // ---- first click selects, second click edits ------------------------
    await load(["aa-1.txt", "bb-2.txt", "cc-3.txt"]);
    const rows = table.getRows("active");

    await clickCell(rows[1]);
    check("click: first click selects the row", selectedNames().join() === "bb-2.txt", selectedNames().join());
    check("click: first click does not open an editor", !editorCell());

    await clickCell(rows[1], "name", {x: "left"});
    check("click: clicking the selected row opens the editor", !!editorCell());

    const caretLeft = editorInput()?.selectionStart;
    check("click: caret lands before the first character", caretLeft === 0, caretLeft);
    pressKey("Escape");

    await clickCell(rows[1], "name", {x: "right"});
    const caretRight = editorInput()?.selectionStart;
    check("click: a click past the text puts the caret at the end",
        caretRight === "bb-2.txt".length, caretRight);
    pressKey("Escape");

    await clickCell(rows[1], "name", {x: 30});
    const caretMiddle = editorInput()?.selectionStart;
    check("click: a click inside the text lands inside it",
        caretMiddle > 0 && caretMiddle < "bb-2.txt".length, caretMiddle);
    pressKey("Escape");

    // ---- arrow keys move the selection instead of scrolling -------------
    await load(["d-1.txt", "d-2.txt", "d-3.txt", "d-4.txt"]);
    const four = table.getRows("active");
    await clickCell(four[1]);

    const prevented = pressKey("ArrowDown", {target: document});
    check("keys: the arrow key is taken from the grid", prevented);
    check("keys: ArrowDown moves to the next row", selectedNames().join() === "d-3.txt", selectedNames().join());

    pressKey("ArrowDown", {target: document});
    check("keys: ArrowDown again moves on", selectedNames().join() === "d-4.txt", selectedNames().join());

    pressKey("ArrowUp", {target: document});
    check("keys: ArrowUp moves back", selectedNames().join() === "d-3.txt", selectedNames().join());

    // ---- shift extends and shrinks the range ----------------------------
    await clickCell(four[1]);
    pressKey("ArrowDown", {shift: true, target: document});
    check("keys: shift+ArrowDown highlights the row below too",
        selectedNames().join() === "d-2.txt,d-3.txt", selectedNames().join());

    pressKey("ArrowDown", {shift: true, target: document});
    check("keys: shift+ArrowDown keeps adding",
        selectedNames().join() === "d-2.txt,d-3.txt,d-4.txt", selectedNames().join());

    pressKey("ArrowUp", {shift: true, target: document});
    check("keys: shift+ArrowUp takes the last row back off",
        selectedNames().join() === "d-2.txt,d-3.txt", selectedNames().join());

    pressKey("ArrowUp", {shift: true, target: document});
    pressKey("ArrowUp", {shift: true, target: document});
    check("keys: shift+ArrowUp can grow the other way",
        selectedNames().join() === "d-1.txt,d-2.txt", selectedNames().join());

    pressKey("Escape", {target: document});
    check("keys: Escape clears the highlight", table.getSelectedRows().length === 0, selectedNames().join());

    // ---- Ctrl/Cmd+A over the grid highlights every row -------------------
    await load(["e-1.txt", "e-2.txt", "e-3.txt", "e-4.txt"]);
    pressKey("Escape", {target: document});

    // Away from the grid the key is the browser's own, so it is left alone.
    let taken = pressKey("a", {ctrl: true, target: document});
    check("keys: Ctrl+A away from the grid is left to the browser",
        !taken && table.getSelectedRows().length === 0, `${taken} ${selectedNames().join()}`);

    // Over the grid it is the grid's: everything on screen is highlighted, and the
    // page's text is not.
    table.element.dispatchEvent(new MouseEvent("mouseenter"));
    taken = pressKey("a", {ctrl: true, target: document});
    check("keys: Ctrl+A over the grid highlights every row",
        taken && selectedNames().join() === "e-1.txt,e-2.txt,e-3.txt,e-4.txt",
        `${taken} ${selectedNames().join()}`);

    // Rows a filter is hiding are not on screen, so they are not part of it.
    table.setHeaderFilterValue("name", "e-2");
    await tick();
    pressKey("a", {ctrl: true, target: document});
    check("keys: Ctrl+A leaves the rows a filter has hidden out",
        selectedNames().join() === "e-2.txt", selectedNames().join());

    table.setHeaderFilterValue("name", "");
    await tick();

    // Cmd+A is the same key on a Mac.
    pressKey("Escape", {target: document});
    pressKey("a", {meta: true, target: document});
    check("keys: Cmd+A over the grid does the same",
        selectedNames().join() === "e-1.txt,e-2.txt,e-3.txt,e-4.txt", selectedNames().join());

    // The pointer leaving hands the key back to the browser.
    table.element.dispatchEvent(new MouseEvent("mouseleave"));
    pressKey("Escape", {target: document});
    taken = pressKey("a", {ctrl: true, target: document});
    check("keys: Ctrl+A is left alone again once the pointer leaves",
        !taken && table.getSelectedRows().length === 0, `${taken} ${selectedNames().join()}`);
}


// The grid is built before the window is up, so fit.js asks for the columns to be
// fitted again once there is a window to fill — on the next frame, not this one.
async function fitSteps() {
    const original = table.redraw;
    let asked = null;

    table.redraw = (force) => { asked = force; };
    fitColumns(table);

    check("fit: nothing is asked for in this frame", asked === null, String(asked));

    await tick(80);
    check("fit: the table is redrawn in full on the next frame", asked === true, String(asked));

    table.redraw = original;
}

async function multiRowEditSteps() {
    // ---- editing one highlighted row edits the others -------------------
    await load(["aaa-1.txt", "bbb-2.txt", "ccc-3.txt", "ddd-4.txt"]);
    const rows = table.getRows("active");
    await clickCell(rows[0]);
    await clickCell(rows[2], "name", {shift: true});
    check("edit: three rows highlighted", table.getSelectedRows().length === 3, selectedNames().join());

    await clickCell(rows[1], "name", {x: "right"});
    check("edit: editing keeps the whole highlight", table.getSelectedRows().length === 3, selectedNames().join());

    typeInto(editorInput(), "X");
    await tick(60);
    check("edit: the other highlighted rows follow the typing",
        editedNames().join(" ") === "aaa-1.txtX bbb-2.txt ccc-3.txtX ddd-4.txt", editedNames().join(" "));

    pressKey("Enter");
    await tick(60);
    check("edit: committing keeps the mirrored values",
        editedNames().join(" ") === "aaa-1.txtX bbb-2.txtX ccc-3.txtX ddd-4.txt", editedNames().join(" "));

    // ---- each row cuts and pastes its own text --------------------------
    await load(["abcd-1.txt", "wxyz-2.txt", "qrst-3.txt"]);
    const three = table.getRows("active");
    await clickCell(three[0]);
    await clickCell(three[2], "name", {shift: true});
    await clickCell(three[0]);

    const cutter = editorInput();
    cutter.setSelectionRange(0, 4);          // highlight the four letter prefix
    pressKey("x", {ctrl: true});             // cut it
    cutter.setRangeText("", 0, 4, "end");    // what the browser leaves behind
    cutter.dispatchEvent(new Event("input", {bubbles: true}));

    pressKey("End");                         // jump to the end
    pressKey("v", {ctrl: true});             // paste it back there
    cutter.setRangeText("abcd", cutter.value.length, cutter.value.length, "end");
    cutter.dispatchEvent(new Event("input", {bubbles: true}));
    await tick(60);

    check("edit: every row cuts and pastes its own text",
        editedNames()[1] === "-2.txtwxyz" && editedNames()[2] === "-3.txtqrst",
        editedNames().join(" "));
    pressKey("Escape");

    // ---- a name the save refused ------------------------------------------
    // Go puts a refused name back to what is on disk and marks the row; the grid
    // shows it in red with the reason on hover, until the name is edited again.
    table.replaceData([
        {name: "ok", original_name: "ok", failed: false, failed_reason: ""},
        {name: "kept", original_name: "kept", failed: true, failed_reason: "that name is used twice"},
    ]);
    hiddenFiles.reset();
    await tick(80);

    const [fine, refused] = table.getRows();
    check("refused: the marked row gets the class",
        refused.getElement().classList.contains("rename-failed"),
        refused.getElement().className);
    check("refused: and the row that is fine does not",
        !fine.getElement().classList.contains("rename-failed"),
        fine.getElement().className);
    check("refused: the reason is on the row, to hover",
        refused.getElement().title === "that name is used twice", refused.getElement().title);
    check("refused: the name is shown in red",
        getComputedStyle(refused.getCell("name").getElement()).color === "rgb(198, 40, 40)",
        getComputedStyle(refused.getCell("name").getElement()).color);
    check("refused: the other row keeps its normal colour",
        getComputedStyle(fine.getCell("name").getElement()).color !== "rgb(198, 40, 40)",
        getComputedStyle(fine.getCell("name").getElement()).color);

    // Typing a new name takes the mark away, ready for the next save. The first
    // click selects the row; the next one opens the editor.
    await clickCell(refused);
    await clickCell(refused, "name", {x: "right"});
    typeInto(editorInput(), "X");
    pressKey("Enter");
    await tick(80);
    check("refused: editing the name clears the mark",
        !refused.getElement().classList.contains("rename-failed") && !refused.getElement().title,
        `${refused.getElement().className} title=${refused.getElement().title}`);

    // ---- Enter and Tab leave the edit -----------------------------------
    await load(["x1", "x2", "x3"]);
    const commitRows = table.getRows("active");
    await clickCell(commitRows[0]);
    await clickCell(commitRows[2], "name", {shift: true});
    await clickCell(commitRows[1], "name", {x: "right"});
    typeInto(editorInput(), "Z");
    await tick(60);
    check("commit: a multi-row edit is open", !!editorCell());

    pressKey("Enter");
    await tick(80);
    check("commit: Enter closes the editor", !editorCell(), editingWhere());
    check("commit: Enter keeps what was typed on every row",
        editedNames().join(" ") === "x1Z x2Z x3Z", editedNames().join(" "));

    await clickCell(commitRows[1], "name", {x: "right"});
    check("commit: clicking again opens a new edit", !!editorCell());
    typeInto(editorInput(), "Y");
    await tick(60);

    pressKey("Tab");
    await tick(80);
    check("commit: Tab closes the editor", !editorCell(), editingWhere());
    check("commit: Tab keeps what was typed on every row",
        editedNames().join(" ") === "x1ZY x2ZY x3ZY", editedNames().join(" "));

    // ---- Escape puts the other rows back --------------------------------
    await load(["e-1.txt", "e-2.txt"]);
    const two = table.getRows("active");
    await clickCell(two[0]);
    await clickCell(two[1], "name", {shift: true});
    await clickCell(two[0], "name", {x: "right"});

    typeInto(editorInput(), "Q");
    await tick(60);
    check("edit: the second row was edited too", editedNames().join(" ") === "e-1.txt e-2.txtQ",
        editedNames().join(" "));

    pressKey("Escape");
    await tick(60);
    check("edit: cancelling puts the other rows back", editedNames().join(" ") === "e-1.txt e-2.txt",
        editedNames().join(" "));

    // ---- End puts each row's insertion point after its own last character
    await load(["aa", "bbbb", "cccccc"]);
    const mixed = table.getRows("active");
    await clickCell(mixed[0]);
    await clickCell(mixed[2], "name", {shift: true});
    await clickCell(mixed[0], "name", {x: "left"});   // edit the first row, caret at 0

    pressKey("End");                                  // a step: to the end of each row
    typeInto(editorInput(), "Z");
    await tick(60);

    check("end: each row grows at its own end",
        editedNames()[1] === "bbbbZ" && editedNames()[2] === "ccccccZ", editedNames().join(" "));

    pressKey("Enter");
    await tick(60);
    check("end: the row being typed in agrees with the others",
        editedNames().join(" ") === "aaZ bbbbZ ccccccZ", editedNames().join(" "));

    // ---- arrow keys while editing move the edit and the highlight -------
    await load(["e1", "e2", "e3"]);
    const editingRows = table.getRows("active");
    await clickCell(editingRows[0]);                    // select the first row
    await clickCell(editingRows[0], "name", {x: "right"});
    typeInto(editorInput(), "X");
    check("editing arrows: one row highlighted before moving",
        selectedNames().join() === "e1", selectedNames().join());

    pressKey("ArrowDown");                              // commit and step down
    await tick(80);
    check("editing arrows: the highlight moved to the next row",
        selectedNames().join() === "e2", selectedNames().join());
    check("editing arrows: the editor is on the next row",
        editorCell()?.closest(".tabulator-row") === editingRows[1].getElement(),
        editorCell() ? editorCell().textContent : "no editor");
    check("editing arrows: the row left behind kept what was typed",
        editedNames()[0] === "e1X", editedNames().join(" "));

    typeInto(editorInput(), "Y");                       // edit the new row
    await tick(60);
    check("editing arrows: the row left behind is not edited again",
        editedNames()[0] === "e1X", editedNames().join(" "));
    check("editing arrows: the new row took the edit",
        editorInput()?.value === "e2Y", editorInput()?.value);

    pressKey("Enter");
    await tick(60);
    check("editing arrows: both rows kept their own edit",
        editedNames().join(" ") === "e1X e2Y e3", editedNames().join(" "));

    // Upwards the same way: select the last row, open its editor, step up.
    await clickCell(editingRows[2], "name", {x: "right"});
    await clickCell(editingRows[2], "name", {x: "right"});
    pressKey("ArrowUp");
    await tick(80);
    check("editing arrows: ArrowUp moves the highlight up",
        selectedNames().join() === "e2Y", selectedNames().join());
    check("editing arrows: ArrowUp leaves an editor open on that row",
        editorCell()?.closest(".tabulator-row") === editingRows[1].getElement(),
        editorCell() ? editorCell().textContent : "no editor");
    pressKey("Escape");
    await tick(60);

    // The caret offset comes along, as it does when clicking between rows.
    await load(["c1a", "c2b", "c3c"]);
    const caretRows = table.getRows("active");
    await clickCell(caretRows[0]);
    await clickCell(caretRows[0], "name", {x: "left"});   // editor with the caret at 0
    typeInto(editorInput(), "X");                          // caret now at 1
    pressKey("ArrowDown");
    await tick(80);
    check("editing arrows: the caret offset comes along",
        editorInput()?.selectionStart === 1, editorInput()?.selectionStart);
    pressKey("Escape");
    await tick(60);

    table.deselectRow();
    // ---- the same edit with the caret at the start and in the middle ------
    await load(["aaaa", "bbbb", "cccc"]);
    const atStart = table.getRows("active");
    await clickCell(atStart[0]);
    await clickCell(atStart[2], "name", {shift: true});
    await clickCell(atStart[1], "name", {x: "left"});     // caret at the start
    typeInto(editorInput(), "XY");
    pressKey("Enter");
    await tick(80);
    check("multi-row: typed at the start of the name reaches every row",
        editedNames().join(" ") === "XYaaaa XYbbbb XYcccc", editedNames().join(" "));
    await load(["dddd", "eeee", "ffff"]);
    const atMiddle = table.getRows("active");
    await clickCell(atMiddle[0]);
    await clickCell(atMiddle[2], "name", {shift: true});
    await clickCell(atMiddle[1], "name", {x: 16});        // caret inside the name
    typeInto(editorInput(), "XY");
    pressKey("Enter");
    await tick(80);

    // Where 16px lands depends on the font, so the check is that every row took
    // the same change in the same place — not that it happened at column 2.
    const middles = editedNames();
    const was = ["dddd", "eeee", "ffff"];
    const at = middles[0].indexOf("XY");
    check("multi-row: typed in the middle of the name reaches every row",
        at > 0 && middles.every((name, i) => name === was[i].slice(0, at) + "XY" + was[i].slice(at)),
        `${middles.join(" ")} (inserted at ${at})`);

    // ---- spaces reach every row AND are visible --------------------------
    // HTML collapses runs of spaces, so a second space used to change the value
    // in every row while nothing on screen moved — indistinguishable from the
    // multi-row edit having stopped.
    await load(["space1", "space2", "space3"]);
    const spaced = table.getRows("active");
    await clickCell(spaced[0]);
    await clickCell(spaced[2], "name", {shift: true});
    await clickCell(spaced[1], "name", {x: "left"});      // caret at the start
    typeInto(editorInput(), "  ");
    await tick(60);

    pressKey("Enter");
    await tick(80);
    check("multi-row: both spaces are kept on every row",
        table.getData().map((row) => row.name).join("|") === "  space1|  space2|  space3",
        JSON.stringify(table.getData().map((row) => row.name)));

    const shown = spaced[2].getCell("name").getElement();
    check("grid: cells keep their spaces on screen (no whitespace collapsing)",
        getComputedStyle(shown).whiteSpace === "pre", getComputedStyle(shown).whiteSpace);



    // ---- more rows than fit the grid, so they render virtually ----------
    const many = Array.from({length: 60}, (_, i) => `row${String(i).padStart(2, "0")}`);
    await load(many);
    table.selectRow(table.getRows());
    await tick(60);

    await clickCell(table.getRows("active")[1], "name", {x: "left"});   // caret at the start
    typeInto(editorInput(), "XY");
    pressKey("Enter");
    await tick(80);

    const manyNames = table.getData().map((row) => row.name);
    check("many rows: typed at the start reaches every selected row",
        manyNames.every((name) => name.startsWith("XY")),
        manyNames.slice(0, 4).join(" "));
    // These describe the reworked multi-row edit, so they only run where the
    // vocabulary above is present.
    if (textDerivedMirror) {
        // ---- a paste, a cut, and an edit that is typed and taken back -------
        // None of these announce themselves key by key, so the copy has to be read
        // off the editor rather than remembered from the keystrokes.
        await load(["paste1", "paste2", "paste3"]);
        const pasted = table.getRows("active");
        await clickCell(pasted[0]);
        await clickCell(pasted[2], "name", {shift: true});
        await clickCell(pasted[1], "name", {x: "right"});     // caret at the end

        const pasteInto = editorInput();
        const clip = new DataTransfer();
        clip.setData("text/plain", "-X-");
        pasteInto.dispatchEvent(new ClipboardEvent("paste", {clipboardData: clip, bubbles: true}));
        pasteInto.value += "-X-";                              // what the browser inserts
        pasteInto.setSelectionRange(pasteInto.value.length, pasteInto.value.length);
        pasteInto.dispatchEvent(new Event("input", {bubbles: true}));
        pressKey("Enter");
        await tick(80);
        check("multi-row: a paste reaches every row",
            editedNames().join(" ") === "paste1-X- paste2-X- paste3-X-", editedNames().join(" "));

        await load(["keep-bb-1", "keep-dd-2"]);
        const kept = table.getRows("active");
        await clickCell(kept[0]);
        await clickCell(kept[1], "name", {shift: true});

        const cut = openEditor(kept[0], [5, 7]);               // highlight "bb"
        cut.setRangeText("", 5, 7, "end");                     // what a cut leaves behind
        cut.dispatchEvent(new Event("input", {bubbles: true}));
        pressKey("Enter");
        await tick(80);
        check("multi-row: a cut takes each row's own characters",
            editedNames().join(" ") === "keep--1 keep--2", editedNames().join(" "));

        await load(["back1", "back2", "back3"]);
        const back = table.getRows("active");
        await clickCell(back[0]);
        await clickCell(back[2], "name", {shift: true});
        await clickCell(back[1], "name", {x: "left"});

        const edited = editorInput();
        typeInto(edited, "ZZ");
        edited.value = "back2";                                // every key taken back again
        edited.dispatchEvent(new Event("input", {bubbles: true}));
        pressKey("Enter");
        await tick(80);
        check("multi-row: an edit typed and taken back leaves every row as it was",
            editedNames().join(" ") === "back1 back2 back3", editedNames().join(" "));


        // ---- the same typing with no key events at all ----------------------
        // Whatever the reason a keystroke never arrives, the text still has to
        // reach the other rows: the change is read off the field as well.
        await load(["unseen1", "unseen2", "unseen3"]);
        const unseen = table.getRows("active");
        await clickCell(unseen[0]);
        await clickCell(unseen[2], "name", {shift: true});
        await clickCell(unseen[1], "name", {x: "left"});

        const blind = editorInput();
        blind.setSelectionRange(0, 0);
        for (const typed of ["A", "AB"]) {
            blind.value = typed + "unseen2";
            blind.dispatchEvent(new Event("input", {bubbles: true}));
        }
        pressKey("Enter");
        await tick(80);
        check("multi-row: typing reaches every row even with no key events",
            editedNames().join(" ") === "ABunseen1 ABunseen2 ABunseen3", editedNames().join(" "));
    } else {
        info("text-derived mirror checks skipped: this tree's steps.js has no Replace step");
    }

}


// Insert and overtype: the Insert key switches, the caret says which mode is on,
// and the mode outlives the edit it was set in.
const overtypeCaret = () => editorCell()?.querySelector(".overtype-caret") ?? null;
const caretShown = () => {
    const block = overtypeCaret();
    return !!block && !block.hidden;
};

// The caret placed where a person would put it: the field, then the event the
// browser sends for the move, which is what places the rectangle again.
const placeCaret = async (at) => {
    const input = editorInput();
    input.setSelectionRange(at, at);
    input.dispatchEvent(new KeyboardEvent("keyup", {key: "ArrowRight", bubbles: true}));
    await tick(20);
};

async function overtypeSteps() {
    // ---- the steps carry the mode --------------------------------------
    check("overtype: a marked step replaces the character at the caret",
        applySteps("abcd", 1, [{key: "X", overtype: true}], "").value === "aXcd",
        applySteps("abcd", 1, [{key: "X", overtype: true}], "").value);
    check("overtype: a marked step at the end still widens",
        applySteps("ab", 2, [{key: "X", overtype: true}], "").value === "abX",
        applySteps("ab", 2, [{key: "X", overtype: true}], "").value);
    check("overtype: a character outside the BMP is replaced whole",
        applySteps("a\u{1F600}b", 1, [{key: "X", overtype: true}], "").value === "aXb",
        applySteps("a\u{1F600}b", 1, [{key: "X", overtype: true}], "").value);
    check("overtype: an unmarked step widens",
        applySteps("abcd", 1, [{key: "X"}], "").value === "aXbcd",
        applySteps("abcd", 1, [{key: "X"}], "").value);

    // ---- insert is the default -----------------------------------------
    await load(["abcdef-1.txt", "abcdef-2.txt"]);
    const rows = table.getRows("active");
    await clickCell(rows[0]);
    await clickCell(rows[0], "name", {x: "left"});
    check("overtype: the editor is open", !!editorInput());
    check("overtype: insert is the default",
        !caretShown() && !editorInput().classList.contains("overtype"),
        editorCell()?.innerHTML);

    await placeCaret(2);
    typeInto(editorInput(), "X");
    check("overtype: inserting widens the name",
        editorInput().value === "abXcdef-1.txt", editorInput().value);
    check("overtype: the caret moves past what was typed",
        editorInput().selectionStart === 3, editorInput().selectionStart);

    // ---- Insert switches to overtyping ---------------------------------
    check("overtype: the Insert key is taken", pressKey("Insert"));
    check("overtype: the rectangle replaces the bar",
        caretShown() && editorInput().classList.contains("overtype"),
        editorCell()?.innerHTML);

    typeInto(editorInput(), "Y");
    check("overtype: typing replaces the character at the caret",
        editorInput().value === "abXYdef-1.txt", editorInput().value);
    check("overtype: the caret moves past the character typed over",
        editorInput().selectionStart === 4, editorInput().selectionStart);

    // ---- the rectangle follows the caret -------------------------------
    const blockLeft = () => overtypeCaret()?.getBoundingClientRect().left ?? -1;
    const blockWidth = () => overtypeCaret()?.getBoundingClientRect().width ?? 0;

    await placeCaret(0);
    const leftAtStart = blockLeft();
    const width = blockWidth();
    await placeCaret(6);
    const leftLater = blockLeft();

    check("overtype: the rectangle follows the caret",
        leftAtStart >= 0 && leftLater > leftAtStart, `${leftAtStart} -> ${leftLater}`);
    check("overtype: the rectangle covers a character, not the cell",
        width > 0 && width < editorCell().getBoundingClientRect().width / 2, width);

    const input = editorInput();
    input.setSelectionRange(1, 4);
    input.dispatchEvent(new KeyboardEvent("keyup", {key: "ArrowRight", bubbles: true}));
    await tick(20);
    check("overtype: the rectangle hides while text is highlighted", !caretShown());

    input.setSelectionRange(2, 2);
    input.dispatchEvent(new KeyboardEvent("keyup", {key: "ArrowRight", bubbles: true}));
    await tick(20);
    check("overtype: and comes back for the caret", caretShown());

    // ---- at the end of the value there is nothing to replace -----------
    await placeCaret(editorInput().value.length);
    typeInto(editorInput(), "Z");
    check("overtype: at the end the character is added",
        editorInput().value === "abXYdef-1.txtZ", editorInput().value);

    // ---- Insert switches back ------------------------------------------
    pressKey("Insert");
    check("overtype: insert is back, and the bar with it",
        !caretShown() && !editorInput().classList.contains("overtype"),
        editorCell()?.innerHTML);

    await placeCaret(1);
    typeInto(editorInput(), "Q");
    check("overtype: inserting again widens the name",
        editorInput().value === "aQbXYdef-1.txtZ", editorInput().value);

    // ---- the mode lasts between edits ----------------------------------
    pressKey("Insert");
    check("overtype: overtyping is on again", caretShown());

    pressKey("Enter");
    await tick(80);
    check("overtype: committing closes the editor", !editorCell(), editingWhere());

    await clickCell(rows[1]);
    await clickCell(rows[1], "name", {x: "left"});
    check("overtype: the next edit opens still overtyping",
        caretShown() && editorInput().classList.contains("overtype"),
        editorCell()?.innerHTML);

    await placeCaret(0);
    typeInto(editorInput(), "M");
    check("overtype: and replaces there too",
        editorInput().value === "Mbcdef-2.txt", editorInput().value);

    pressKey("Enter");
    await tick(80);

    // ---- a recorded replacement replays as one -------------------------
    await load(["wxyz-1.txt", "wxyz-2.txt", "wxyz-3.txt", "wxyz-4.txt"]);
    const recorder = openEditor(table.getRows("active")[0], [1, 1]);
    buttons.record.click();
    await tick();

    typeInto(recorder, "A");

    buttons.record.click();
    await tick();

    buttons.playAll.click();
    await tick(120);
    check("overtype: a recorded replacement replaces in every row",
        editedNames().join(" ") === "wAyz-1.txt wAyz-2.txt wAyz-3.txt wAyz-4.txt",
        editedNames().join(" "));

    // ---- leave the grid inserting --------------------------------------
    openEditor(table.getRows("active")[0], [0, 0]);
    pressKey("Insert");
    check("overtype: Insert turns it off for the rest of the run", !caretShown());
    pressKey("Enter");
    await tick(80);
}


// A name that has been edited is bold, and only once its edit is finished.
async function editedMarkSteps() {
    const weight = (row) => getComputedStyle(row.getCell("name").getElement()).fontWeight;
    const marked = (row) => row.getElement().classList.contains("rename-edited");
    const state = (row) => `${marked(row)} ${weight(row)}`;

    await load(["alpha-1.txt", "alpha-2.txt"]);
    const rows = table.getRows("active");
    check("edited: a row nobody has touched is not bold", !marked(rows[0]) && weight(rows[0]) === "400", state(rows[0]));

    await clickCell(rows[0]);
    await clickCell(rows[0], "name", {x: "right"});
    typeInto(editorInput(), "X");
    check("edited: the name being typed keeps the normal weight",
        !marked(rows[0]) && weight(rows[0]) === "400", state(rows[0]));

    pressKey("Enter");
    await tick(80);
    check("edited: the finished edit is bold", marked(rows[0]) && weight(rows[0]) === "700", state(rows[0]));

    // ---- editing it back to what is on disk takes the bold away ---------
    await clickCell(rows[0]);
    await clickCell(rows[0], "name", {x: "right"});
    const input = editorInput();
    input.setSelectionRange(0, input.value.length);
    typeInto(input, "alpha-1.txt");
    check("edited: an editor opened on a bold row goes back to normal",
        weight(rows[0]) === "400", state(rows[0]));

    pressKey("Enter");
    await tick(80);
    check("edited: edited back, it is no longer bold", !marked(rows[0]) && weight(rows[0]) === "400", state(rows[0]));

    // ---- the rows a highlighted edit copies into wait for the same end --
    await load(["one-1.txt", "one-2.txt", "one-3.txt"]);
    const three = table.getRows("active");
    await clickCell(three[0]);
    await clickCell(three[1], "name", {shift: true});
    await clickCell(three[0], "name", {x: "right"});
    typeInto(editorInput(), "M");
    check("edited: nothing is bold while the edit is still going",
        !marked(three[0]) && !marked(three[1]), `${marked(three[0])} ${marked(three[1])}`);

    pressKey("Enter");
    await tick(80);
    check("edited: every row the edit reached is bold once it ends",
        marked(three[0]) && marked(three[1]) && !marked(three[2]),
        `${marked(three[0])} ${marked(three[1])} ${marked(three[2])}`);

    // ---- undo puts the names back, and the bold with them ---------------
    if (historyModule) {
        undoBtn.click();
        await tick(80);
        check("edited: undone, no longer bold",
            !marked(three[0]) && !marked(three[1]) && weight(three[1]) === "400",
            `${marked(three[0])} ${marked(three[1])} ${weight(three[1])}`);
    } else {
        info("edited: undo check skipped: src/history.js is not in this tree");
    }

    // ---- a load draws its rows unmarked ---------------------------------
    await load(["two-1.txt"]);
    check("edited: a fresh load is not bold", !marked(table.getRows("active")[0]));
}

// A refused save marks every refused row red, not just the ones currently
// visible in the virtual DOM viewport.
async function refusedMarkSteps() {
    const rows = [];
    for (let i = 0; i < 30; i += 1) {
        rows.push({
            name: `r${i}`, original_name: `r${i}`, extension: "txt", is_dir: false,
            full_path: `/d/r${i}.txt`, date_created: "", date_modified: "", size: "1 KB",
        });
    }
    // Refuse rows spread across the viewport so not all are rendered at once.
    rows[1].failed = true;
    rows[1].failed_reason = "this name could not be changed";
    rows[10].failed = true;
    rows[10].failed_reason = "this name could not be changed";
    rows[25].failed = true;
    rows[25].failed_reason = "this name could not be changed";

    table.replaceData(rows);
    await tick(120);

    // This is what main.js does after SaveRenames returns: mark every row, so
    // refused rows the virtual DOM has not rendered yet are still flagged.
    table.getRows().forEach(markRefused);

    const all = table.getRows();
    const marked = all.filter((row) => row.getElement().classList.contains("rename-failed"));
    const names = marked.map((row) => row.getData().name).join(",");
    check("refused: every refused row is marked red, not just visible ones",
        marked.length === 3 && names === "r1,r10,r25", `${marked.length} (${names})`);

    const clean = all.filter((row) => !row.getData().failed);
    check("refused: non-refused rows are not marked",
        clean.every((row) => !row.getElement().classList.contains("rename-failed")));
}

// The options the Setup window saves, as the grid applies them.
async function preferencesSteps() {
    const body = document.body;
    const label = document.querySelector("#btn-record .btn-label");
    const weightOf = (row) => getComputedStyle(row.getCell("name").getElement()).fontWeight;

    setupPreferences(table);

    const prefs = (over) => ({
        theme: "light", toolbar_text: true, bold_changed: true, auto_sort: false, ...over,
    });

    // ---- the theme is a class on the body -------------------------------
    applyPreferences(table, prefs({theme: "dark"}));
    check("prefs: the dark theme is a class on the body", body.classList.contains("dark"));

    applyPreferences(table, prefs({theme: "light"}));
    check("prefs: the light theme takes it away", !body.classList.contains("dark"));

    // ---- the toolbar text is an attribute the stylesheet reads ----------
    applyPreferences(table, prefs({toolbar_text: false}));

    // Unticked, the word does not go away: it becomes a tip under the icon.
    await tick(120);   // the fade to nothing takes a frame or two
    const tipStyle = getComputedStyle(label);
    check("prefs: toolbar text off turns each word into a tip",
        body.dataset.toolbarText === "false"
        && tipStyle.display !== "none"
        && tipStyle.position === "absolute"
        && tipStyle.opacity === "0",
        `${body.dataset.toolbarText} ${tipStyle.display}/${tipStyle.position}/${tipStyle.opacity}`);

    // An icon on its own would say nothing, so every button must carry a word.
    const bare = [...document.querySelectorAll("#toolbar button")]
        .filter((button) => !button.querySelector(".btn-label")?.textContent.trim());
    check("prefs: every toolbar button has a word to show as its tip",
        bare.length === 0, bare.map((button) => button.id).join(","));

    const recordBox = document.querySelector("#btn-record").getBoundingClientRect();
    const tipBox = label.getBoundingClientRect();
    check("prefs: the tip hangs below its button", tipBox.top >= recordBox.bottom,
        `${tipBox.top} below ${recordBox.bottom}`);

    check("prefs: a tip does not swallow the click it explains",
        tipStyle.pointerEvents === "none", tipStyle.pointerEvents);

    const setupTip = document.querySelector("#btn-setup .btn-label").getBoundingClientRect();
    check("prefs: the edge button's tip stays inside the window",
        setupTip.right <= window.innerWidth, `${setupTip.right} of ${window.innerWidth}`);

    // It only comes up while the button is held. That is a :hover rule, which no
    // synthetic event can set, so the rule itself is what is checked.
    const hoverRule = [...document.styleSheets]
        .flatMap((sheet) => [...sheet.cssRules])
        .find((rule) => rule.selectorText?.includes("button:hover")
            && rule.selectorText.includes("data-toolbar-text"));
    check("prefs: the tip comes up on hover", hoverRule?.style.opacity === "1",
        hoverRule?.selectorText ?? "no rule");

    applyPreferences(table, prefs({toolbar_text: true}));
    const backStyle = getComputedStyle(label);
    check("prefs: toolbar text on puts the words back beside the icons",
        body.dataset.toolbarText === "true" && backStyle.display !== "none"
        && backStyle.position === "static" && backStyle.opacity === "1",
        `${body.dataset.toolbarText} ${backStyle.display}/${backStyle.position}/${backStyle.opacity}`);

    // ---- a changed name is bold unless the option says otherwise --------
    table.replaceData([{
        name: "changed", original_name: "original", extension: "txt", is_dir: false,
        full_path: "/d/changed.txt", date_created: "", date_modified: "", size: "1 KB",
    }]);
    await tick(120);

    const row = table.getRows("active")[0];
    applyPreferences(table, prefs({bold_changed: true}));
    check("prefs: a changed name is bold", weightOf(row) === "700", weightOf(row));

    applyPreferences(table, prefs({bold_changed: false}));
    check("prefs: bold off returns the normal weight",
        body.classList.contains("no-bold-changed") && weightOf(row) === "400", weightOf(row));

    applyPreferences(table, prefs({bold_changed: true}));

    // ---- auto sort reorders each load, and only then ---------------------
    // getData() answers in insertion order; the rows on screen are the sorted
    // ones, so the order is read from getRows("active").
    const order = () => table.getRows("active").map((r) => r.getData().name).join(",");

    applyPreferences(table, prefs({auto_sort: true}));
    table.replaceData(["c-1", "a-1", "b-1"].map(mkRow));
    await tick(120);
    check("prefs: a load is sorted by name when auto sort is on",
        order() === "a-1,b-1,c-1", order());

    applyPreferences(table, prefs({auto_sort: false}));
    table.replaceData(["c-2", "a-2", "b-2"].map(mkRow));
    await tick(120);
    check("prefs: with auto sort off the order is kept",
        order() === "c-2,a-2,b-2", order());
}


// Home and End jump to the first character and to the end of the cell entry.
async function homeEndSteps() {
    await load(["abcdef.txt", "uvwxyz.txt"]);
    openEditor(table.getRows("active")[0], []);          // caret at the end

    buttons.record.click();
    await tick();
    dispatchKey("Home");                                 // to before the first character
    dispatchKey("X");
    buttons.record.click();
    await tick();

    buttons.playAll.click();
    await tick(80);
    check("home: recorded and replayed at the start of every cell",
        editedNames().join(" ") === "Xabcdef.txt Xuvwxyz.txt", editedNames().join(" "));

    await load(["ghijkl.txt", "mnopqr.txt"]);
    openEditor(table.getRows("active")[0], [0, 0]);      // caret before the first character

    buttons.record.click();
    await tick();
    dispatchKey("End");                                  // to the end of the entry
    dispatchKey("Y");
    buttons.record.click();
    await tick();

    buttons.playAll.click();
    await tick(80);
    check("end: recorded and replayed at the end of every cell",
        editedNames().join(" ") === "ghijkl.txtY mnopqr.txtY", editedNames().join(" "));
}

// Opens the Name editor on a row with the given selection, for recording.
const openEditor = (row, [from, to]) => {
    const cell = row.getCell("name");
    cell.edit();
    const input = cell.getElement().querySelector("input");
    input.setSelectionRange(from ?? input.value.length, to ?? from ?? input.value.length);
    return input;
};

async function clipboardSteps() {
    // ---- copy + paste: each row moves its own highlighted text ----------
    await load(["aaaa-1.txt", "bbbb-2.txt", "cccc-3.txt"]);
    openEditor(table.getRows("active")[0], [0, 4]);

    buttons.record.click();
    await tick();
    dispatchKey("c", {ctrl: true});
    dispatchKey("End");
    dispatchKey("v", {ctrl: true});
    buttons.record.click();
    await tick();

    buttons.playAll.click();
    await tick(80);
    check("clipboard: copy+paste takes each row's own text",
        editedNames().join(" ") === "aaaa-1.txtaaaa bbbb-2.txtbbbb cccc-3.txtcccc",
        editedNames().join(" "));

    // ---- cut + paste: the text moves rather than being duplicated -------
    await load(["abcdtail.txt", "wxyztail.txt"]);
    openEditor(table.getRows("active")[0], [0, 4]);

    buttons.record.click();
    await tick();
    dispatchKey("x", {ctrl: true});
    dispatchKey("End");
    dispatchKey("v", {ctrl: true});
    buttons.record.click();
    await tick();

    buttons.playAll.click();
    await tick(80);
    check("clipboard: cut+paste moves each row's own text",
        editedNames().join(" ") === "tail.txtabcd tail.txtwxyz", editedNames().join(" "));

    // ---- paste of text copied outside the macro -------------------------
    await load(["ext-1.txt", "ext-2.txt"]);
    const input = openEditor(table.getRows("active")[0], []);

    buttons.record.click();
    await tick();
    dispatchKey("v", {ctrl: true});

    const data = new DataTransfer();
    data.setData("text/plain", "-COPY");
    input.dispatchEvent(new ClipboardEvent("paste", {clipboardData: data, bubbles: true}));

    buttons.record.click();
    await tick();

    buttons.playAll.click();
    await tick(80);
    check("clipboard: a paste from outside the macro is replayed",
        editedNames().join(" ") === "ext-1.txt-COPY ext-2.txt-COPY", editedNames().join(" "));

    // ---- paste replaces what was highlighted when it was pressed --------
    await load(["keep-me.txt"]);
    const over = openEditor(table.getRows("active")[0], [5, 7]);   // highlight "me"

    buttons.record.click();
    await tick();
    dispatchKey("v", {ctrl: true});

    const replace = new DataTransfer();
    replace.setData("text/plain", "YOU");
    over.dispatchEvent(new ClipboardEvent("paste", {clipboardData: replace, bubbles: true}));

    buttons.record.click();
    await tick();

    buttons.playAll.click();
    await tick(80);
    check("clipboard: paste replaces the highlighted characters",
        editedNames().join(" ") === "keep-YOU.txt", editedNames().join(" "));

    // ---- copy/cut with nothing highlighted ------------------------------
    await load(["none-1.txt"]);
    openEditor(table.getRows("active")[0], [3, 3]);

    buttons.record.click();
    await tick();
    dispatchKey("c", {ctrl: true});
    dispatchKey("v", {ctrl: true});
    buttons.record.click();
    await tick();

    buttons.playAll.click();
    await tick(80);
    check("clipboard: copying nothing pastes nothing",
        editedNames().join(" ") === "none-1.txt", editedNames().join(" "));
}

// A one-line verdict first, with any failures right below it, so it reads in a
// screenshot as well as a dump.
const summarise = () => {
    const failures = out.filter((line) => line.startsWith("FAIL"));
    const passed = out.filter((line) => line.startsWith("PASS"));
    const rest = out.filter((line) => !line.startsWith("FAIL"));
    return `RESULT ${passed.length} passed / ${failures.length} failed\n\n`
        + [...failures, ...rest].join("\n");
};

main().catch((err) => {
    out.push(`FAIL threw: ${err && err.stack ? err.stack : err}`);
    document.getElementById("out").textContent = summarise();
});
