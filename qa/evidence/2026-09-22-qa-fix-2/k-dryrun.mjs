// QA Fix 2 / K: real icon + preview backfill on two tools into a scratch dir; no .tmp may survive.
import { readdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { fetchIcon } from "../../../pipeline/icon.mjs";
import { capturePreview } from "../../../pipeline/preview.mjs";
import { backfill } from "../../../pipeline/util.mjs";

const out = path.resolve("qa/evidence/2026-09-22-qa-fix-2/k-dryrun");
const tools = [
  { slug: "firecrawl", url: "https://firecrawl.dev" },
  { slug: "agent-browser", url: "https://agent-browser.dev" },
];
const browser = await chromium.launch({ headless: true });
try {
  await backfill(tools, async (t) => {
    await fetchIcon({ slug: t.slug, url: t.url, dir: path.join(out, "icons"), force: true, log: console.log });
    await capturePreview({ slug: t.slug, url: t.url, dir: path.join(out, "previews"), browser, force: true, log: console.log });
  }, 2);
} finally {
  await browser.close();
}
for (const d of ["icons", "previews"]) console.log(d, await readdir(path.join(out, d)).catch(() => []));
