// Is "AbortError: Transition was skipped" on Back new in VET-282? Plain link + Back on a given build.
import { chromium } from "playwright";
const [base, mode = "href"] = process.argv.slice(2);
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true })).newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(`${p.url()}: ${e}`));
await p.goto(`${base}/library`, { waitUntil: "networkidle" });
await p.evaluate((process_mode) => { if (process_mode === "replace") { history.pushState({}, ""); location.replace("/sites"); } else location.href = "/sites"; }, mode);
await p.waitForURL(/sites/);
await p.waitForTimeout(800);
await p.goBack({ waitUntil: "commit" }).catch(() => {});
await p.waitForTimeout(1500);
console.log(base, errs);
await b.close();
