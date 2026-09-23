// node qa/evidence/2026-09-23-r6-1/check.mjs <removed-slugs.txt>  (list lives outside the repo)
import fs from "node:fs"; import path from "node:path";
const removed = fs.readFileSync(process.argv[2], "utf8").trim().split("\n");
const lib = JSON.parse(fs.readFileSync("src/data/library.json", "utf8"));
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((f) => f.isDirectory() ? walk(path.join(d, f.name)) : [path.join(d, f.name)]);
const reserved = new Set(["kind", "tag", "domain"]);
const details = fs.readdirSync("dist/library", { withFileTypes: true }).filter((f) => f.isDirectory() && !reserved.has(f.name) && fs.existsSync(`dist/library/${f.name}/index.html`));
console.log("detail pages:", details.length, "live entries:", lib.length);
const hits = [];
for (const f of walk("dist").filter((f) => /\.(html|xml|json|md|txt|js)$/.test(f))) {
  const t = fs.readFileSync(f, "utf8");
  for (const s of removed) if (new RegExp(`(^|[^a-z0-9-])${s}([^a-z0-9-]|$)`).test(t)) hits.push(`${f}: ${s}`);
}
console.log("removed slugs found in dist:", hits.length, hits.slice(0, 5));
const routes = JSON.parse(fs.readFileSync("vercel.json", "utf8")).routes;
for (const s of [0, 25, 50, 75, 99].map((i) => removed[i])) for (const u of [`/library/${s}`, `/library/${s}.md`]) {
  const r = routes.find((r) => r.src && new RegExp(r.src).test(u));
  console.log(r?.status, r?.headers?.Location, u.replace(s, `<removed#${removed.indexOf(s)}>`));
}
let txt = ""; for (const f of walk("src")) txt += fs.readFileSync(f, "utf8");
console.log("orphans under public/posts:", walk("public/posts").map((f) => f.slice(6)).filter((p) => !txt.includes(p)).length, "of", walk("public/posts").length);
const tags = fs.readdirSync("dist/library/tag"); console.log("tag pages:", tags.length, "empty:", tags.filter((t) => !lib.some((e) => (e.tags ?? []).includes(t))));
console.log("kind pages:", fs.readdirSync("dist/library/kind"));
