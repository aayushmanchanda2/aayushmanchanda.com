/**
 * design-sample.mjs — the in-page half of design.mjs.
 *
 * `readDesign` hands this function to `page.evaluate`, so it runs in the
 * browser and returns the raw computed styles `summarize` ranks into tokens.
 * Kept in its own file because nothing in it runs in Node.
 */

/** @typedef {import("./design.mjs").Sample} Sample @typedef {import("./design.mjs").Raw} Raw */

/**
 * Runs in the page. Self-contained: Playwright serialises the source, so it
 * can reach nothing outside its own body.
 *
 * @param {number} cap
 * @returns {Raw | null}
 */
export function sampleStyles(cap) {
  if (document.contentType !== "text/html" || document.body === null) return null;

  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (ctx === null) return null;
  /** @type {Map<string, string>} */
  const seen = new Map();
  /** @param {string} css */
  const rgba = (css) => {
    const hit = seen.get(css);
    if (hit !== undefined) return hit;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000";
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const out = Array.from(ctx.getImageData(0, 0, 1, 1).data).join(",");
    seen.set(css, out);
    return out;
  };

  /** @type {Sample[]} */
  const samples = [];
  for (const el of document.body.querySelectorAll("*")) {
    if (samples.length >= cap) break;
    if (!(el instanceof HTMLElement) || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|BR)$/.test(el.tagName)) continue;
    const box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) continue;
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility !== "visible" || Number(s.opacity) === 0) continue;

    let text = 0;
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) text += (node.textContent ?? "").trim().length;
    }
    const bordered = s.borderTopStyle !== "none" && parseFloat(s.borderTopWidth) > 0;
    const bg = rgba(s.backgroundColor);
    samples.push({
      tag: el.tagName.toLowerCase(),
      nav: el.closest("nav") !== null,
      card: bordered || !bg.endsWith(",0"),
      area: Math.round(box.width * box.height),
      text,
      bg,
      color: rgba(s.color),
      border: bordered ? rgba(s.borderTopColor) : null,
      font: [s.fontFamily, s.fontSize, s.fontWeight, s.lineHeight, s.letterSpacing],
      space: [
        s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft,
        s.marginTop, s.marginRight, s.marginBottom, s.marginLeft,
        ...(/flex|grid/.test(s.display) ? [s.rowGap, s.columnGap] : []),
      ],
      radius: s.borderTopLeftRadius,
    });
  }

  // What the eye sees at the page's left and right margins: the first opaque
  // fill behind each point, walking up from whatever is on top there. A body
  // painted white under a full-page dark wrapper reads dark here, as it looks.
  /** @type {string[]} */
  const edges = [];
  for (const x of [4, window.innerWidth - 5]) {
    for (let y = 0.1; y < 1; y += 0.2) {
      for (let at = document.elementFromPoint(x, window.innerHeight * y); at !== null; at = at.parentElement) {
        const fill = rgba(getComputedStyle(at).backgroundColor);
        if (!fill.endsWith(",0")) {
          edges.push(fill);
          break;
        }
      }
    }
  }

  return {
    body: rgba(getComputedStyle(document.body).backgroundColor),
    html: rgba(getComputedStyle(document.documentElement).backgroundColor),
    edges,
    samples,
  };
}
