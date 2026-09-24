// G9: nothing bleeds sideways on a phone. At 320 and 390, on /library, every kind
// view and 5+ entry pages: the page has no sideways scroll, no element's right edge
// passes the viewport, and no line of text, picture, code or table passes its
// container's content box. A hit area widened by negative margins is not a bleed, so
// boxes are held to the viewport and words to their container. Content inside
// something that clips or scrolls sideways is that box's business; the box is not.
// node .claude/skills/verify-site/overflow.mjs [base]   (from the repo root; exit 1 on any overflow)
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:4384";
const routes = [
  "/library/",
  "/library/kind/article/",
  "/library/kind/post/",
  "/library/kind/video/",
  "/library/my-llm-cliche-highlighter-is-up-to-38-patterns-now/",
  "/library/she-left-waterloo-without-graduating-now-she-s-a-member-of-t/",
  "/library/how-to-build-a-services-as-software-delivery-stack/",
  "/library/your-agents-md-is-holding-you-back/",
  "/library/anatomy-of-an-agent-harness/",
];

function scan() {
  const vw = document.documentElement.clientWidth;
  const out = [];
  const clipped = (el) => {
    for (let a = el; a && a !== document.body; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (a !== el && s.overflowX !== "visible") return true;
      if (s.display === "none" || s.visibility === "hidden" || s.clipPath !== "none" || s.position === "fixed") return true;
    }
    return false;
  };
  const name = (el) => el.tagName.toLowerCase() + (typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "");
  const contentRight = (el) => {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return r.right - parseFloat(s.paddingRight) - parseFloat(s.borderRightWidth);
  };
  const block = (el) => { while (el && getComputedStyle(el).display.startsWith("inline")) el = el.parentElement; return el; };
  if (document.documentElement.scrollWidth > vw + 1) out.push(`page scrolls sideways: ${document.documentElement.scrollWidth} > ${vw}`);
  // Every box: its right edge inside the viewport.
  for (const el of document.body.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.right <= vw + 1 || clipped(el)) continue;
    out.push(`${name(el)} right ${Math.round(r.right)} > viewport ${vw} "${(el.textContent || "").trim().slice(0, 40)}"`);
  }
  // Every line of text, and every picture, code block and table: inside its container.
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    // The text's own element clipping it (an ellipsis, a hidden label) counts as clipped too.
    const own = node.parentElement;
    if (!node.textContent.trim() || clipped(own) || getComputedStyle(own).overflowX !== "visible") continue;
    const box = block(node.parentElement);
    if (!box) continue;
    range.selectNodeContents(node);
    const right = Math.max(...[...range.getClientRects()].map((r) => r.right));
    if (right > contentRight(box) + 1) out.push(`text in ${name(box)} right ${Math.round(right)} > its box ${Math.round(contentRight(box))} "${node.textContent.trim().slice(0, 40)}"`);
  }
  for (const el of document.body.querySelectorAll("img, video, pre, table, iframe, code")) {
    const r = el.getBoundingClientRect();
    if (!r.width || clipped(el) || !el.parentElement) continue;
    const box = block(el.parentElement);
    if (r.right > contentRight(box) + 1) out.push(`${name(el)} right ${Math.round(r.right)} > its box ${Math.round(contentRight(box))}`);
  }
  return out;
}

const browser = await chromium.launch();
let fails = 0;
for (const width of [320, 390]) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  for (const route of routes) {
    const response = await page.goto(base + route, { waitUntil: "networkidle" });
    const found = response?.ok() ? await page.evaluate(scan) : [`HTTP ${response?.status()}`];
    fails += found.length;
    console.log(`${found.length ? "FAIL" : "ok  "} ${width} ${route}${found.map((f) => "\n       " + f).join("")}`);
  }
  await context.close();
}
await browser.close();
console.log(fails ? `${fails} overflows` : "no overflow");
process.exitCode = fails ? 1 : 0;
