// ⌘K "Copy link" with writeText rejecting, read back from the clipboard.
import { chromium } from "playwright";
const b = await chromium.launch();
const ctx = await b.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
const p = await ctx.newPage();
await p.goto((process.argv[2] ?? "http://localhost:4340") + "/library/", { waitUntil: "networkidle" });
await p.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new DOMException("denied", "NotAllowedError")); });
await p.keyboard.press("Meta+k");
await p.waitForTimeout(300);
await p.locator(".palette__row", { hasText: "Copy link" }).first().click();
await p.waitForTimeout(300);
const row = await p.evaluate(() => [...document.querySelectorAll(".palette__row-title")].map((n) => n.textContent).find((t) => /link/i.test(t)));
console.log({ row, clipboard: await p.evaluate(() => navigator.clipboard.readText()) });
await b.close();
