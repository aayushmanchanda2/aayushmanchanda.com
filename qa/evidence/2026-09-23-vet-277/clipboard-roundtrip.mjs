// Proves the execCommand fallback really lands on the system clipboard: writeText
// is forced to reject (as on production), then the clipboard is read back.
import { chromium } from "playwright";
const b = await chromium.launch();
const ctx = await b.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
const p = await ctx.newPage();
await p.goto((process.argv[2] ?? "http://localhost:4340") + "/library/jason-liu-codex-operating-system/", { waitUntil: "networkidle" });
await p.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new DOMException("Write permission denied.", "NotAllowedError")); });
const btn = p.locator("[data-block-prompt] ~ button[data-copy]");
await btn.click();
await p.waitForTimeout(150);
const read = await p.evaluate(() => navigator.clipboard.readText());
console.log({ label: await btn.locator("[data-copy-label]").textContent(), onClipboard: read === (await btn.getAttribute("data-copy")), read: read.slice(0, 50) });
await b.close();
