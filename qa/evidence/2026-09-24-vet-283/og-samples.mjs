// VET-283: draw five sample share cards with the current `lib/og-render.ts`
// into qa/evidence/2026-09-24-vet-283/<label>/, as PNG (evidence PNGs are gitignored).
//   node --experimental-strip-types qa/evidence/2026-09-24-vet-283/og-samples.mjs before
import { mkdirSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";

import { renderCards } from "../../../src/lib/og-render.ts";

const label = process.argv[2] ?? "current";
const out = path.join("qa/evidence/2026-09-24-vet-283", label);
mkdirSync(out, { recursive: true });

const none = { date: null, picture: null, logo: null, letter: null };
export const SAMPLES = [
  { name: "tool", card: { ...none, page: "/tools/headlong", section: "tools", title: "Headlong", line: "Always-on agent harness, sandboxed in Docker", label: "Tools", date: "2026-08-26", picture: "/previews/headlong.webp", logo: "/icons/headlong.webp" } },
  { name: "post", card: { ...none, page: "/library/polar", section: "library", title: "Polar for GTM turns an ICP into saved outbound workflows", line: "x.com", label: "Library · post", date: "2026-09-23" } },
  { name: "site", card: { ...none, page: "/sites/designengineer-tools", section: "sites", title: "Design Engineer Tools", line: "designengineer.tools", label: "Sites", date: "2026-08-26", picture: "/shots/designengineer-tools.webp" } },
  { name: "note", card: { ...none, page: "/notes/building-this-site", section: "notes", title: "Building this site", line: null, label: "Notes", date: "2026-08-26" } },
  { name: "index", card: { ...none, page: "/library", section: "library", title: "Library", line: "Articles, posts and videos I saved to read or watch later.", label: label === "before" ? "Aayush Manchanda" : "" } },
];

await renderCards(
  SAMPLES.map(({ name, card }) => ({
    card,
    save: (jpeg) => void sharp(jpeg).png().toFile(path.join(out, `${name}.png`)),
  })),
);
console.log(`drew ${SAMPLES.length} samples into ${out}`);
