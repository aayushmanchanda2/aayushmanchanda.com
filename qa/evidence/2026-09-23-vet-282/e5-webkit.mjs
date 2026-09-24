// E5 in WebKit (Safari's engine): back-to-back screenshots after ⌘K.
// Usage: node e5-webkit.mjs <base> <label> [holdMs]
import { webkit } from "playwright";
import { mkdirSync } from "node:fs";
const [base, label, hold = "0"] = process.argv.slice(2);
const out = new URL(`./e5-${label}-webkit/`, import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const browser = await webkit.launch({ executablePath: process.env.WK });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
if (+hold) await page.route("**/search.json", async (route) => { await new Promise((r) => setTimeout(r, +hold)); await route.continue(); });
await page.goto(`${base}/library`, { waitUntil: "networkidle" });
const t0 = Date.now();
await page.keyboard.press("Meta+k");
for (let i = 0; i < 10; i++) await page.screenshot({ path: `${out}w-${String(i).padStart(2, "0")}-${Date.now() - t0}ms.png`, animations: "allow" });
await browser.close();
