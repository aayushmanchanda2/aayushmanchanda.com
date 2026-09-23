// One-off (VET-264): fold library-content-f4.json into src/data/library.json by slug.
// source_video_id moves onto each moment; `status`/`source_note` are provenance and stay out.
import { readFileSync, writeFileSync } from "node:fs";
const F4 = "/Users/aayushmanchanda/Downloads/Aayush/AayushOS/feature-research/aayushmanchanda-com/briOS-wave/library-content-f4.json";
const FILE = "src/data/library.json";
const f4 = JSON.parse(readFileSync(F4, "utf8"));
const lib = JSON.parse(readFileSync(FILE, "utf8"));
const bySlug = new Map(lib.map((e) => [e.slug, e]));
const n = { highlights: 0, keyline: 0, moments: 0, missing: [] };
for (const [slug, add] of Object.entries(f4)) {
  if (slug === "_meta") continue;
  const e = bySlug.get(slug);
  if (!e) { n.missing.push(slug); continue; }
  if (add.highlights) { e.highlights = add.highlights; n.highlights++; }
  if (add.keyline) { e.keyline = add.keyline; n.keyline++; }
  if (add.moments) {
    e.moments = add.moments.map((m) => (add.source_video_id ? { ...m, source_video_id: add.source_video_id } : m));
    n.moments++;
  }
}
// Pocket FM predates the post caps: keep the CTR insight trimmed to its verbatim core, drop the fourth.
const pocket = bySlug.get("how-pocket-fm-grew-from-zero-to-500m-arr");
if (pocket?.highlights?.length === 4) {
  pocket.highlights[1].text = "If the clickthrough rate (CTR) for an ad goes from 2% to 2.25%, our customer acquisition cost (CAC) decreases by ~ 30%.";
  pocket.highlights.length = 3;
}
writeFileSync(FILE, `${JSON.stringify(lib, null, 2)}\n`);
console.log(JSON.stringify(n));
