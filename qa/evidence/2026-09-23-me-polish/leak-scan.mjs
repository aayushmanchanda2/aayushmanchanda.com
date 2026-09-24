// Leak scan (me-polish). Terms: EVERY slug and title of archive rows not public on main,
// every Raindrop note (raw and stripped), every Telegram comment, every why_saved, every
// block tip and next_step, and "@gmail". Corpora: dist/, .vercel/output (minus
// node_modules), the branch diff vs main plus untracked non-evidence files, commit messages,
// and this run's committable evidence (json/mjs). Prints counts only, never a term.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const P = "../aayushmanchanda-private/";
const read = (f, empty) => (existsSync(P + f) ? JSON.parse(readFileSync(P + f, "utf8")) : empty);
const archive = read("library-private-archive.json", []);
const blocks = read("private-blocks.json", []);
const comments = read("hermes-comments.json", {});
const main = new Set(JSON.parse(execFileSync("git", ["show", "main:src/data/library.json"], { encoding: "utf8" })).map((e) => e.slug));
const hidden = archive.filter((x) => !main.has(x.slug));
const strip = (s) => s.split("\n").filter((l) => !l.trimStart().startsWith("sweep-hold:")).join("\n").trim();
const terms = [
  ...hidden.map((x) => ["slug", x.slug]),
  ...hidden.map((x) => ["title", x.entry.title]),
  ...archive.filter((x) => x.raindrop_note?.trim()).map((x) => ["note", x.raindrop_note]),
  ...archive.filter((x) => x.raindrop_note && strip(x.raindrop_note)).map((x) => ["ownNote", strip(x.raindrop_note)]),
  ...Object.values(comments).filter(Boolean).map((t) => ["telegram", t]),
  ...blocks.filter((b) => b.why_saved).map((b) => ["why_saved", b.why_saved]),
  ...blocks.filter((b) => b.block).flatMap((b) => [["tip", b.block.tip], ["next_step", b.block.next_step]]).filter(([, t]) => t),
  ["email", "@" + "gmail"],
];
const files = (dir) =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);
        return e.isDirectory() ? (e.name === "node_modules" ? [] : files(p)) : statSync(p).size < 5e6 ? [p] : [];
      })
    : [];
const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard", "--", ".", ":!qa/evidence"], { encoding: "utf8" }).split("\n").filter(Boolean);
const evidence = files("qa/evidence/2026-09-23-me-polish").concat(files("qa/evidence/2026-09-23-me-polish-dark"), files("qa/evidence/2026-09-23-me-polish-fold")).filter((f) => /\.(json|mjs)$/.test(f));
const corpora = {
  dist: files("dist").map((f) => readFileSync(f, "latin1")).join("\n"),
  vercelOutput: files(".vercel/output").map((f) => readFileSync(f, "latin1")).join("\n"),
  branchDiff:
    execFileSync("git", ["diff", "main", "--", ".", ":!package-lock.json", ":!qa/evidence"], { encoding: "utf8", maxBuffer: 1e9 }) +
    untracked.map((f) => readFileSync(f, "latin1")).join("\n"),
  commits: execFileSync("git", ["log", "main..HEAD", "--format=%B"], { encoding: "utf8" }),
  evidence: evidence.filter((f) => !f.endsWith("leak-scan.mjs")).map((f) => readFileSync(f, "utf8")).join("\n"),
};
const counts = {};
for (const [kind] of terms) counts[kind] = (counts[kind] ?? 0) + 1;
const result = { archiveRows: archive.length, hiddenRows: hidden.length, termsByKind: counts };
for (const [name, text] of Object.entries(corpora)) {
  const hits = {};
  for (const [kind, term] of terms) if (text.includes(term)) hits[kind] = (hits[kind] ?? 0) + 1;
  result[name] = { bytes: text.length, hits };
}
console.log(JSON.stringify(result, null, 1));
