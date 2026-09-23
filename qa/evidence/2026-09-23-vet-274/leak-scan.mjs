// Leak scan (VET-274). Terms: 10 slugs and 10 titles sampled from archive rows
// that are NOT public on main, every archive Raindrop note, and any Gmail address.
// Corpora: all of dist/, the whole .vercel/output (minus node_modules), and the branch diff
// including untracked files. Prints counts only, never a term.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const archive = JSON.parse(readFileSync("../aayushmanchanda-private/library-private-archive.json", "utf8"));
const main = new Set(JSON.parse(execFileSync("git", ["show", "main:src/data/library.json"], { encoding: "utf8" })).map((e) => e.slug));
const hidden = archive.filter((x) => !main.has(x.slug));
const step = Math.floor(hidden.length / 10);
const sample = Array.from({ length: 10 }, (_, i) => hidden[i * step]);
const terms = [
  ...sample.map((x) => ["slug", x.slug]),
  ...sample.map((x) => ["title", x.entry.title]),
  ...archive.filter((x) => x.raindrop_note).map((x) => ["note", x.raindrop_note]),
  ["email", "@" + "gmail"],
];

const files = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? (e.name === "node_modules" ? [] : files(p)) : statSync(p).size < 5e6 ? [p] : [];
  });
const changed = files("dist");
const untracked = execFileSync("git", ["ls-files", "--others", "--exclude-standard", "--", ".", ":!qa/evidence"], { encoding: "utf8" }).split("\n").filter(Boolean);
const corpora = {
  dist: changed.map((f) => readFileSync(f, "latin1")).join("\n"),
  vercelOutput: files(".vercel/output").map((f) => readFileSync(f, "latin1")).join("\n"),
  branchDiff:
    execFileSync("git", ["diff", "main", "--", ".", ":!package-lock.json"], { encoding: "utf8", maxBuffer: 1e9 }) +
    untracked.map((f) => readFileSync(f, "latin1")).join("\n") +
    execFileSync("git", ["log", "main..HEAD", "--format=%B"], { encoding: "utf8" }),
};
const result = { archiveRows: archive.length, alsoPublicOnMain: archive.length - hidden.length, terms: terms.length, distFiles: changed.length, untrackedFiles: untracked.length };
for (const [name, text] of Object.entries(corpora)) {
  const hits = {};
  for (const [kind, term] of terms) if (text.includes(term)) hits[kind] = (hits[kind] ?? 0) + 1;
  result[name] = { bytes: text.length, hits };
}
console.log(JSON.stringify(result, null, 1));
