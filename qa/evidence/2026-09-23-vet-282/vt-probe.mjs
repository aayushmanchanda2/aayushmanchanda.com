// Which step makes Back from /sites report "Transition was skipped"? Palette flows on a given build.
import { chromium } from "playwright";
const [base, flow] = process.argv.slice(2);
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true })).newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(`${p.url()}: ${e}`));
await p.goto(`${base}/library`, { waitUntil: "networkidle" });
if (flow.includes("x")) { await p.locator(".bar__search").tap(); await p.waitForTimeout(300); await p.locator("[data-palette-close]").tap(); await p.waitForTimeout(300); }
await p.locator(".bar__search").tap();
await p.waitForTimeout(300);
await p.locator('[data-palette-row][href$="/sites"]').first().tap();
await p.waitForURL(/sites/);
await p.waitForTimeout(1000);
await p.goBack({ waitUntil: "commit" }).catch(() => {});
await p.waitForTimeout(1500);
console.log(flow, errs);
await b.close();
