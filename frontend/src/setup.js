import { Events } from "@wailsio/runtime";
import * as App from "../bindings/multirenamer/app.js";

document.getElementById("dark-mode").addEventListener("change", (e) => {
    App.SetTheme(e.target.checked).catch(err => console.error(err));
});

Events.On("theme-changed", (ev) => {
    document.body.classList.toggle("dark", !!ev.data);
});