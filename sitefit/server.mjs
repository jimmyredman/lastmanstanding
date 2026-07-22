/*
 * SiteFit — local dev server
 * --------------------------
 * Serves the static app AND the /api/lookup endpoint from one process, so the
 * whole tool (including live QLD data pulls) is runnable anywhere with outbound
 * network:  node server.mjs   ->  http://localhost:8080
 *
 * The same lookup handler deploys unchanged as a Vercel serverless function.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import handler from "./api/lookup.mjs";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PORT = process.env.PORT || 8080;
const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml",
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/api/lookup") return void handler(req, res);

    let p = normalize(url.pathname).replace(/^(\.\.[/\\])+/, "");
    if (p === "/" || p === "") p = "/index.html";
    const file = join(ROOT, p);
    if (!file.startsWith(ROOT)) { res.statusCode = 403; return void res.end("forbidden"); }
    const data = await readFile(file);
    res.setHeader("Content-Type", TYPES[extname(file)] || "application/octet-stream");
    res.end(data);
  } catch {
    res.statusCode = 404;
    res.end("not found");
  }
});

server.listen(PORT, () => console.log("SiteFit on http://localhost:" + PORT));
