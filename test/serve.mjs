// Serves the test page and the code it exercises. The frontend's own modules are
// handed over as they are — the tests run against the real files, not a build —
// and Tabulator comes from frontend/node_modules.
//
// Started by run.mjs; PORT picks the port.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const here = import.meta.dirname;
const frontend = join(here, "..", "frontend");
const tabulator = join(frontend, "node_modules", "tabulator-tables", "dist");

const types = {
    ".html": "text/html",
    ".mjs": "text/javascript",
    ".js": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
};

// Only two directories are served, and a resolved path has to stay inside the one
// it came from, so a stray URL cannot read its way out.
const inside = (base, relative) => {
    const full = normalize(join(base, relative));
    return full.startsWith(base) ? full : null;
};

const fileFor = (url) => {
    const path = url.split("?")[0];

    if (path === "/") return join(here, "page.html");
    if (path === "/test.mjs") return join(here, "test.mjs");
    if (path === "/tabulator.js") return join(tabulator, "js", "tabulator_esm.mjs");
    if (path === "/tabulator.css") return join(tabulator, "css", "tabulator.min.css");
    // A bare import the app lets Vite resolve; page.html's import map points at this.
    if (path === "/ap-style-title-case.js") return join(frontend, "node_modules", "ap-style-title-case", "index.js");
    if (path.startsWith("/src/")) return inside(join(frontend, "src"), path.slice(5));
    if (path.startsWith("/bindings/")) return inside(join(frontend, "bindings"), path.slice(10));

    return null;
};

const port = Number(process.env.PORT ?? 8731);

createServer(async (req, res) => {
    const path = fileFor(req.url);

    if (!path) {
        res.writeHead(404);
        res.end("not found");
        return;
    }

    try {
        const body = await readFile(path);
        res.writeHead(200, {
            "Content-Type": types[extname(path)] ?? "text/plain",
            "Cache-Control": "no-store",
        });
        res.end(body);
    } catch (err) {
        res.writeHead(404);
        res.end(String(err));
    }
}).listen(port, "127.0.0.1", () => console.log(`serving on http://127.0.0.1:${port}/`));
