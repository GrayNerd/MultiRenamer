// Runs the browser suite: serves the page, drives headless Chromium over the
// DevTools protocol, and prints what the checks wrote.
//
//     node test/run.mjs
//
// Exit code is 1 when any check failed, so it can be used as-is in CI. CHROME
// picks a different browser binary, PORT and DEBUG_PORT pick ports, and TIMEOUT
// (seconds) is how long the run is given.
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const here = import.meta.dirname;
const PORT = Number(process.env.PORT ?? 8731);
const DEBUG_PORT = Number(process.env.DEBUG_PORT ?? 9223);
const CHROME = process.env.CHROME ?? "chromium";
const BUDGET = Number(process.env.TIMEOUT ?? 240) * 1000;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const server = spawn(process.execPath, [join(here, "serve.mjs")], {
    stdio: ["ignore", "inherit", "inherit"],
    env: {...process.env, PORT: String(PORT)},
});

const profile = await mkdtemp(join(tmpdir(), "multirenamer-suite-"));
const browser = spawn(CHROME, [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    `--remote-debugging-port=${DEBUG_PORT}`,
    "--window-size=1280,900",
    `--user-data-dir=${profile}`,
    // The suite is timing-sensitive: none of the page may be throttled.
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    `http://127.0.0.1:${PORT}/`,
], {stdio: "ignore"});

const stop = async (code) => {
    browser.kill();
    server.kill();

    // Chromium keeps writing to its profile while it shuts down, so wait for it
    // to be gone before removing the directory — and do not fail the run over a
    // leftover temporary one.
    await new Promise((resolve) => {
        if (browser.exitCode !== null) {
            resolve();
            return;
        }
        browser.once("exit", resolve);
        setTimeout(resolve, 5000);
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
            await rm(profile, {recursive: true, force: true});
            break;
        } catch {
            await wait(200);   // still letting go of a file
        }
    }

    process.exit(code);
};

// The page target, once the browser is up.
let target = null;
for (let i = 0; i < 80 && !target; i += 1) {
    try {
        const list = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json();
        target = list.find((t) => t.type === "page" && t.url.includes(String(PORT)));
    } catch {
        // not listening yet
    }
    if (!target) await wait(250);
}

if (!target) {
    console.error(`could not reach a browser on port ${DEBUG_PORT}; is ${CHROME} installed? (set CHROME=/path/to/chromium)`);
    await stop(1);
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const console_ = [];

const send = (method, params = {}) => new Promise((resolve) => {
    const messageId = (id += 1);
    pending.set(messageId, resolve);
    ws.send(JSON.stringify({id: messageId, method, params}));
});

ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);

    if (message.id && pending.has(message.id)) {
        pending.get(message.id)(message.result);
        pending.delete(message.id);
    } else if (message.method === "Runtime.consoleAPICalled") {
        console_.push(`${message.params.type}: ${message.params.args.map((a) => a.value ?? a.description).join(" ")}`);
    } else if (message.method === "Runtime.exceptionThrown") {
        console_.push(`exception: ${message.params.exceptionDetails.text} ${message.params.exceptionDetails.exception?.description ?? ""}`);
    }
});

await new Promise((resolve) => ws.addEventListener("open", resolve));
await send("Runtime.enable");

const read = async (expression) => {
    const result = await send("Runtime.evaluate", {expression, returnByValue: true});
    return result?.result?.value;
};

// The page writes its results into #out when it is done, starting with RESULT.
const deadline = Date.now() + BUDGET;
let out = "";
while (Date.now() < deadline) {
    out = (await read("document.getElementById('out').textContent")) ?? "";
    if (out.startsWith("RESULT")) break;
    await wait(250);
}

if (!out.startsWith("RESULT")) {
    const stage = await read("window.stage");
    console.error(`no result after ${BUDGET / 1000}s (stage: ${stage})`);
    console.error(out);
    if (console_.length) console.error("\n--- console ---\n" + console_.join("\n"));
    ws.close();
    await stop(1);
}

console.log(out);

const failed = Number(out.match(/RESULT \d+ passed \/ (\d+) failed/)?.[1] ?? 1);

// Console noise is only interesting when something went wrong: a macro press in
// the suite writes to a row whose editor the test left open, which Tabulator
// reports as a rejected promise without any check failing.
if (failed && console_.length) console.log("\n--- console ---\n" + console_.join("\n"));
ws.close();
await stop(failed === 0 ? 0 : 1);
