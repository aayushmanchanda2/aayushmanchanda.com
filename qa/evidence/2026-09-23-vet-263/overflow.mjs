// VET-263 (from VET-262): horizontal overflow at 320 on one route of every path shape.
import { chromium } from "playwright";
const base = process.argv[2] ?? "http://localhost:4330";
const routes = ["/", "/design", "/contact", "/tools", "/privacy", "/experiments", "/library", "/about", "/sites", "/notes",
  "/tools/jakubkrehel-skills-interface-design-skills-for-agents", "/library/herdr-crash-course-a-beginner-s-guide",
  "/sites/inspora", "/tools/verdict/watching", "/notes/building-this-site", "/sites/collection/mdx",
  "/sites/domain/rareui-com", "/library/kind/video", "/tools/category/design", "/library/tag/local-agency",
  "/library/domain/learn-chatgpt-com", "/404"];
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 320, height: 700 } })).newPage();
const bad = [];
for (const r of routes) {
  await p.goto(base + r, { waitUntil: "load" });
  const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (over > 0) bad.push(`${r} +${over}`);
}
console.log(`${routes.length} routes at 320, overflowing: ${bad.length ? bad.join(", ") : "none"}`);
await b.close();
