import { Events } from "@wailsio/runtime";
import * as App from "../bindings/multirenamer/app.js";

document.getElementById("dark-mode").addEventListener("change", (e) => {
    App.SetTheme(e.target.checked).catch(err => console.error(err));
});

// The build this window belongs to, so it is obvious when an older one is still
// open somewhere.
App.Build().then((stamp) => {
    if (stamp) document.getElementById("build").textContent = `Build ${stamp}`;
}).catch(err => console.error("Build failed:", err));

Events.On("theme-changed", (ev) => {
    document.body.classList.toggle("dark", !!ev.data);
});