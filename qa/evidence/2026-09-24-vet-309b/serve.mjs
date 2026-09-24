/**
 * A static server for dist/ that compresses text the way Vercel does (brotli),
 * so a local Lighthouse run is not dominated by a 348 KB uncompressed /tools
 * page (python's http.server sends it raw: VET-309's 4.4s /tools LCP).
 *   node qa/evidence/2026-09-24-vet-309b/serve.mjs <dir> <port>
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { createBrotliCompress } from "node:zlib";

const [dir = "dist", port = "4420"] = process.argv.slice(2);
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".webp": "image/webp", ".avif": "image/avif", ".jpg": "image/jpeg", ".png": "image/png", ".woff2": "font/woff2", ".mp4": "video/mp4", ".xml": "application/xml", ".txt": "text/plain", ".md": "text/markdown" };

createServer((req, res) => {
  let file = path.join(dir, decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname));
  if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, "index.html");
  else if (!existsSync(file) && existsSync(`${file}.html`)) file = `${file}.html`;
  if (!existsSync(file)) return res.writeHead(404).end();
  const type = TYPES[/** @type {keyof typeof TYPES} */ (path.extname(file))] ?? "application/octet-stream";
  const text = /^(text|application\/(json|xml))|svg/.test(type);
  res.writeHead(200, { "Content-Type": type, ...(text ? { "Content-Encoding": "br" } : {}) });
  (text ? createReadStream(file).pipe(createBrotliCompress()) : createReadStream(file)).pipe(res);
}).listen(Number(port));
