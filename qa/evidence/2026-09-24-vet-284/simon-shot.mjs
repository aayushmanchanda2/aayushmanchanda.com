// Simon's post at 390 in Chromium and WebKit (iPhone Safari's engine), full page.
// node qa/evidence/2026-09-24-vet-284/simon-shot.mjs <base> <label>
import { chromium, webkit, devices } from "playwright";
const [base = "http://localhost:4384", label = "after"] = process.argv.slice(2);
const route = "/library/my-llm-cliche-highlighter-is-up-to-38-patterns-now/";
for (const [name, engine] of [["chromium", chromium], ["webkit", webkit]]) {
  const b = await engine.launch();
  const c = await b.newContext({ ...devices["iPhone 13"], viewport: { width: 390, height: 844 } });
  const p = await c.newPage();
  await p.goto(base + route, { waitUntil: "networkidle" });
  const sw = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  await p.screenshot({ path: `qa/evidence/2026-09-24-vet-284/simon-390-${label}-${name}.png`, fullPage: true });
  console.log(name, "scrollWidth/innerWidth", sw);
  await b.close();
}
