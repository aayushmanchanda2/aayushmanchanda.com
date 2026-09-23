// B15 behaviour on the built site: one view per route, link-out segments, legacy ?kind= redirect, tag in path.
import { chromium } from "playwright";
const B = process.argv[2] ?? "http://localhost:4329";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const out = {};
await p.goto(B + "/library");
out.viewsOnLibrary = await p.$$eval("[data-view]", (v) => v.map((x) => x.dataset.view));
await p.selectOption(".pane select[data-tag-set]", { index: 1 });
out.afterTag = new URL(p.url()).pathname + new URL(p.url()).search;
await Promise.all([p.waitForURL(/kind\/post/), p.click('.pane [data-kind-set="post"]')]);
out.afterPostPress = new URL(p.url()).pathname + new URL(p.url()).search;
out.viewsOnPost = await p.$$eval("[data-view]", (v) => v.map((x) => x.dataset.view));
out.tagKept = await p.$eval(".pane select[data-tag-set]", (s) => s.value);
await p.goto(B + "/library?kind=video&tag=agents");
await p.waitForURL(/kind\/video/);
out.legacy = new URL(p.url()).pathname + new URL(p.url()).search;
console.log(JSON.stringify(out, null, 1));
await b.close();
