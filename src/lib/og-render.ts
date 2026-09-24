/**
 * Draws share cards (`lib/og.ts`) as 1200x630 JPEGs, in a browser.
 *
 * A browser for the same reason `scripts/og.mjs` gives: the card is set in
 * Geist, which lives in `node_modules` as woff2, and a rasteriser that resolves
 * fonts through fontconfig (sharp's SVG path) silently falls back to whatever
 * sans the machine has. It also lets the card be the site's own stamp:
 * `styles/global.css` and `styles/frame.css` are inlined whole, so the mat,
 * the perforation, the keyline and the denomination are the shipped rules at a
 * 600px window, shot at 2x. Satori was the other option; it is not installed
 * and cannot read a variable woff2, so it would cost two dependencies and a
 * second drawing of the stamp.
 *
 * Only `pages/og/[...card].jpg.ts` imports this, and only for cards missing
 * from `og-cache/`, so a build whose cache is current never starts a browser.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import type { OgCard } from "./og";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file));
const dataUri = (file: string, type: string) => `data:${type};base64,${read(file).toString("base64")}`;
const esc = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Every file whose change should redraw every card: `og-cache` keys include this. */
export const TEMPLATE_FILES = ["src/lib/og-render.ts", "src/styles/global.css", "src/styles/frame.css"];

function styles(): string {
  const font = (family: string, file: string) =>
    `@font-face{font-family:"${family}";src:url("${dataUri(`node_modules/${file}`, "font/woff2")}") format("woff2-variations");font-weight:100 900}`;
  return [
    font("Geist Variable", "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2"),
    font("Geist Mono Variable", "@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2"),
    read("src/styles/global.css").toString(),
    read("src/styles/frame.css").toString(),
    // the mat's wear tile is a root-relative URL on the site; here it is inlined
    `html{--wear:url("${dataUri("public/mat-wear.webp", "image/webp")}")}`,
    CARD_CSS,
  ].join("\n");
}

/** The card's own layout, inside the stamp's keyline (body padding is `--frame`). */
const CARD_CSS = `
body{margin:0;width:600px;height:315px;overflow:hidden;background:var(--bg);-webkit-font-smoothing:antialiased}
.card{box-sizing:border-box;height:100%;display:flex;gap:20px;align-items:center;padding:22px 24px 26px}
.card__text{flex:1;min-width:0;display:flex;flex-direction:column;gap:10px}
.card__title{margin:0;font:600 var(--size)/1.08 var(--font-sans);letter-spacing:-0.035em;color:var(--text-primary);
  display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;overflow:hidden;text-wrap:balance}
.card__line{margin:0;font:400 13px/1.4 var(--font-sans);color:var(--text-secondary);
  display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.card__pic{position:relative;flex:none;width:252px;margin:0}
.card__pic img.shot{display:block;width:100%;aspect-ratio:40/21;object-fit:cover;object-position:top;
  padding:4px;background:var(--bg);border:1px solid var(--hairline-strong)}
.card__logo{position:absolute;left:-14px;bottom:-14px;width:44px;height:44px;display:grid;place-items:center;
  background:var(--bg);mask:var(--squircle) center/100% 100%;font:600 20px/1 var(--font-sans);color:var(--text-primary)}
.card__logo img{width:36px;height:36px;mask:var(--squircle) center/100% 100%}
.card__logo--ring{outline:none;box-shadow:inset 0 0 0 1px var(--hairline-strong)}
.postmark{position:fixed;top:0;right:calc(var(--frame) + 1.5rem);z-index:41;width:112px;color:var(--text-primary);
  opacity:.2;rotate:-8deg;mask:var(--ink-wear),var(--ink-wear) 71px 29px;mask-composite:intersect;font-family:var(--font-mono)}
.stamp__mark{text-transform:none}
`;

/** The cancellation from `components/Stamp.astro`, struck with the card's date. */
function postmark(name: string, date: string | null): string {
  const day = date ? new Date(`${date}T00:00:00Z`) : null;
  const lines = day
    ? [day.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }), String(day.getUTCFullYear())]
    : [];
  return `<svg class="postmark" viewBox="0 0 200 96" aria-hidden="true">
  <g fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
    <path d="M2 30q9-7 18 0t18 0 18 0 18 0 18 0 18 0"/><path d="M6 48q9-7 18 0t18 0 18 0 18 0 18 0 14 0"/><path d="M2 66q9-7 18 0t18 0 18 0 18 0 18 0 18 0"/>
    <path d="M149 5c25-1 44 19 43 44s-20 44-45 43-43-21-42-46 19-40 46-41"/>
    <path d="M148 17c17 0 31 14 31 31s-14 31-32 31-30-15-30-32 14-30 31-30" stroke-width="1.5"/>
  </g>
  <g fill="currentColor" font-size="10" text-anchor="middle">
    <text x="148" y="${lines.length ? 40 : 52}">${esc(name.toUpperCase())}</text>
    ${lines.map((line, i) => `<text x="148" y="${53 + i * 12}">${esc(line.toUpperCase())}</text>`).join("")}
  </g>
</svg>`;
}

/** Title size by length: a short name fills the stamp, a headline wraps. */
const titleSize = (title: string, picture: boolean) => {
  const width = picture ? 0.62 : 1;
  const n = title.length / width;
  return n <= 22 ? 44 : n <= 44 ? 34 : n <= 80 ? 27 : 22;
};

export function cardHtml(card: OgCard, css: string): string {
  const pic = card.picture
    ? `<figure class="card__pic"><img class="shot" src="${dataUri(`public${card.picture}`, "image/webp")}" alt="">${
        card.logo
          ? `<span class="card__logo"><img src="${dataUri(`public${card.logo}`, "image/webp")}" alt=""></span>`
          : card.letter
            ? `<span class="card__logo card__logo--ring">${esc(card.letter)}</span>`
            : ""
      }</figure>`
    : "";
  const section = card.section === "other" ? "" : card.section;
  return `<!doctype html><html lang="en" data-theme="light" data-section="${section}"><meta charset="utf-8"><style>${css}</style>
<body>
<div class="stamp" aria-hidden="true"><span class="stamp__mark">aayushmanchanda.com</span><span class="stamp__mark stamp__mark--end">${esc(card.label)}</span></div>
<div class="mat" aria-hidden="true"><div class="mat__shade"><div class="mat__paper"></div></div></div>
${postmark(section || "Aayush", card.date)}
<main class="card"><div class="card__text">
<h1 class="card__title" style="--size:${titleSize(card.title, Boolean(pic))}px">${esc(card.title)}</h1>
${card.line ? `<p class="card__line">${esc(card.line)}</p>` : ""}
</div>${pic}</main>`;
}

/**
 * Render `jobs` and hand each JPEG to `save`. Four tabs at once; one browser.
 * Throws when no browser can be started, which the caller treats as "use the
 * fallback card", never as a failed build.
 */
export async function renderCards(jobs: { card: OgCard; save: (jpeg: Buffer) => void }[]): Promise<void> {
  const { chromium } = await import("playwright");
  const css = styles();
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 600, height: 315 }, deviceScaleFactor: 2, colorScheme: "light" });
    const queue = [...jobs];
    const worker = async () => {
      const page = await context.newPage();
      for (let job = queue.shift(); job; job = queue.shift()) {
        await page.setContent(cardHtml(job.card, css), { waitUntil: "load" });
        await page.evaluate(() => document.fonts.ready);
        job.save(await page.screenshot({ type: "jpeg", quality: 86, animations: "disabled" }));
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
  } finally {
    await browser.close();
  }
}
