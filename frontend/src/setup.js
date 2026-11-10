import * as App from "../bindings/multirenamer/app.js";

// The controls of the Setup window.
const themeLight = document.getElementById("theme-light");
const themeDark = document.getElementById("theme-dark");
const toolbarText = document.getElementById("toolbar-text");
const boldChanged = document.getElementById("bold-changed");
const autoSort = document.getElementById("auto-sort");
const rememberWindow = document.getElementById("remember-window");

// The configuration as it is on disk, so Cancel can put the window back to it.
let saved = null;

// Fills the form in from a configuration, and gives the window its theme.
const show = (cfg) => {
    themeLight.checked = cfg.theme !== "dark";
    themeDark.checked = cfg.theme === "dark";
    toolbarText.checked = cfg.toolbar_text !== false;
    boldChanged.checked = cfg.bold_changed !== false;
    autoSort.checked = cfg.auto_sort !== false;
    rememberWindow.checked = !!cfg.remember_window;

    document.body.classList.toggle("dark", cfg.theme === "dark");
};

// What the form is showing right now.
const read = () => ({
    theme: themeDark.checked ? "dark" : "light",
    toolbar_text: toolbarText.checked,
    bold_changed: boldChanged.checked,
    auto_sort: autoSort.checked,
    remember_window: rememberWindow.checked,
});

// Choosing a theme shows it straight away — this window and, once Save is
// pressed, the grid. Cancel puts the saved theme back.
const preview = () => document.body.classList.toggle("dark", themeDark.checked);
themeLight.addEventListener("change", preview);
themeDark.addEventListener("change", preview);

document.getElementById("btn-cancel").addEventListener("click", () => {
    if (saved) show(saved);
    App.HideSetup().catch(err => console.error("HideSetup failed:", err));
});

document.getElementById("btn-save").addEventListener("click", async () => {
    const cfg = read();

    try {
        // Go writes the file and tells the open windows, so the grid takes the
        // new options without a restart.
        await App.SaveConfig(cfg);
    } catch (err) {
        console.error("SaveConfig failed:", err);
        return;
    }

    saved = cfg;
    App.HideSetup().catch(err => console.error("HideSetup failed:", err));
});

// What was saved last time, or the defaults on the first run.
App.GetConfig()
    .then((cfg) => {
        saved = cfg;
        show(cfg);
    })
    .catch(err => console.error("GetConfig failed:", err));

// The build this window belongs to, so it is obvious when an older one is still
// open somewhere.
App.Build().then((stamp) => {
    if (stamp) document.getElementById("build").textContent = `Build ${stamp}`;
}).catch(err => console.error("Build failed:", err));
