import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto("http://localhost:4331/tools");
await p.evaluate(() => localStorage.setItem("tools-view", "list")); await p.reload();
const list = await p.evaluate(() => Math.round(document.querySelector(".dtable thead").getBoundingClientRect().top));
await p.click('[data-view-set="grid"]');
const grid = await p.evaluate(() => Math.round(document.querySelector("ul.tiles").getBoundingClientRect().top - document.querySelector(".controls").getBoundingClientRect().bottom));
console.log({ theadTop1280: list, gridGap1280: grid }); await b.close();
