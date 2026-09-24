// VET-283 F3: in the served /library, which group each of the six recent posts renders in.
import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(`${process.argv[2] ?? "http://localhost:4337"}/library/`);
const out = await page.$$eval("[data-rows] li:not([data-month]) a", (links) =>
  links
    .filter((a) => /(30-seconds|she-left|make-money|eight-mistakes|how-i-make|improve-your-agent)/.test(a.getAttribute("href") ?? ""))
    .map((a) => `${a.closest("li").hasAttribute("data-also") ? "ALSO" : "MAIN"}  ${a.querySelector("b").textContent}`),
);
console.log([...new Set(out)].join("\n"));
await browser.close();
