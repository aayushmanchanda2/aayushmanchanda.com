// Presses the entry page's Copy and reads the label and status line back.
import { chromium } from "playwright";
const browser = await chromium.launch();
const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
const page = await context.newPage();
await page.goto("http://127.0.0.1:4340/library/jason-liu-codex-operating-system");
const box = await page.locator("#sec-ai ~ dl button.ctl, .sec button.ctl").first().boundingBox();
await page.locator(".sec button.ctl").first().click();
await page.waitForTimeout(150);
const out = await page.evaluate(async () => ({ label: document.querySelector(".sec button.ctl [data-copy-label]").textContent, status: document.querySelector(".sec [data-copy-status]").textContent, clip: (await navigator.clipboard.readText()).slice(0, 30) }));
console.log(JSON.stringify({ ...out, height: box.height }));
await browser.close();
