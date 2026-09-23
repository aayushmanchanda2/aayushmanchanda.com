// R5-1 scripted checks: press play on both playlist videos and read the iframe src.
import { chromium } from "playwright";
const base = "http://localhost:4329";
const browser = await chromium.launch();
const page = await browser.newPage();
const out = {};
for (const slug of ["hermes-agent-masterclass", "the-money-button-v1"]) {
  await page.goto(`${base}/library/${slug}/`);
  await page.click("a.tile__play");
  const src = await page.locator(".tile__frame iframe").getAttribute("src");
  const list = new URL(src).searchParams.get("list");
  out[slug] = { src, validList: /^[A-Za-z0-9_-]{10,64}$/.test(list ?? "") };
}
await browser.close();
console.log(JSON.stringify(out, null, 2));
