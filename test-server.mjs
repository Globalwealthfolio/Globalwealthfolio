// Minimal static file server for testing the built site
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(process.argv[2] || join(__dirname, "dist"));
const PORT = Number(process.argv[3] || 4321);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    let p = decodeURIComponent(url.pathname);
    if (p.endsWith("/")) p += "index.html";
    const safe = normalize(join(ROOT, p));
    if (!safe.startsWith(ROOT + sep) && safe !== ROOT) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    let filepath = safe;
    try {
      const s = await stat(filepath);
      if (s.isDirectory()) filepath = join(filepath, "index.html");
    } catch {
      // Fallback to index.html for clean URLs (SPA-style)
      if (!extname(p)) {
        filepath = join(ROOT, "index.html");
      } else {
        res.writeHead(404);
        res.end("Not Found");
        return;
      }
    }
    const data = await readFile(filepath);
    const mime = MIME[extname(filepath).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "content-type": mime, "cache-control": "no-cache" });
    res.end(data);
  } catch (err) {
    console.error(err);
    res.writeHead(500);
    res.end("Internal Server Error");
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Serving ${ROOT} on http://127.0.0.1:${PORT}`);
});
