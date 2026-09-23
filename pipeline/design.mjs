/**
 * design.mjs — the design tokens a live page is built from.
 *
 * `palette.mjs` reads colours off pixels. This reads them, and the type, spacing
 * and radius, off the computed styles of the page itself, so /sites/<slug> can
 * show a ui-skills design.md foundations panel for somebody else's site.
 *
 * Two halves, split on the browser boundary. `sampleStyles` runs inside the page
 * as ONE `page.evaluate` and returns raw computed values for up to
 * `MAX_SAMPLES` visible elements. `summarize` is plain Node: it ranks those
 * samples into named tokens, and it is the half the tests pin.
 *
 * The names are roles, never aliases (ui-skills `create-design-md/SKILL.md`,
 * URL mode): a token is written only when an element was seen doing that job.
 * A page with no `<code>` has no `mono`; a page whose borders are all faint
 * alpha hairlines has no `border`. Nothing is guessed to fill a slot.
 */

/** Elements sampled, at most. Past this a page is repeating itself. */
const MAX_SAMPLES = 1500;

/** Below this alpha a colour is a tint over something else, not a token. */
const MIN_ALPHA = 0.5;

/** Chroma (max - min channel, 0..1) a link or button colour needs to be an accent. */
const MIN_ACCENT_CHROMA = 0.2;

/**
 * Contrast two colours need to count as different roles: a second text colour
 * against `text` to be muted text, and any text colour against `background`
 * to be text on it at all. Below it, white text sampled from a dark hero on a
 * white page would be named the page's muted ink.
 */
const MIN_ROLE_CONTRAST = 1.5;

/** Spacing past this is layout, not a spacing step. */
const MAX_SPACING_PX = 96;

/** A radius at or past this is a pill, whatever number the page wrote. */
const FULL_RADIUS_PX = 999;

/** Spacing steps and radii kept. */
const SPACING_SIZE = 5;
const RADIUS_SIZE = 3;

/**
 * One visible element, as the page computed it. Colours are `r,g,b,a` strings
 * (0-255 each) resolved through a canvas, so `oklch()` and `color-mix()` arrive
 * as the sRGB the screen painted.
 *
 * @typedef {object} Sample
 * @property {string} tag      Lowercase tag name.
 * @property {boolean} nav     Inside a `<nav>`.
 * @property {boolean} card    Has an opaque background or a border of its own.
 * @property {number} area     Rendered box, in px².
 * @property {number} text     Characters of direct text.
 * @property {string} bg @property {string} color @property {string | null} border
 * @property {[string, string, string, string, string]} font
 *   family, size, weight, line-height, letter-spacing.
 * @property {string[]} space  Padding, margin and gap values as computed.
 * @property {string} radius   Top-left border radius.
 */

/**
 * @typedef {{ name: string, hex: string }} ColorToken
 * @typedef {{ name: string, fontFamily: string, fontSize: string, fontWeight: string, lineHeight: string, letterSpacing: string }} TypeToken
 * @typedef {{ name: string, value: string }} ValueToken
 * @typedef {{ read_date: string, colors: ColorToken[], type: TypeToken[], spacing: ValueToken[], radius: ValueToken[] }} Design
 * @typedef {{ body: string, html: string, edges: string[], samples: Sample[] }} Raw
 */

/**
 * Runs in the page. Self-contained: Playwright serialises the source, so it
 * can reach nothing outside its own body.
 *
 * @param {number} cap
 * @returns {Raw | null}
 */
function sampleStyles(cap) {
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

/**
 * `r,g,b,a` (0-255) to lowercase `#rrggbb`, or null when it is too transparent
 * to be a colour in its own right.
 *
 * @param {string} rgba
 * @returns {string | null}
 */
export function toHex(rgba) {
  const [r, g, b, a] = rgba.split(",").map(Number);
  if (a === undefined || a / 255 < MIN_ALPHA) return null;
  return `#${[r, g, b].map((n) => (n ?? 0).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Values by total weight, heaviest first. Ties keep first-seen order, so the
 * top of the page wins a draw.
 *
 * @template T
 * @param {Iterable<[T, number]>} pairs
 * @returns {T[]}
 */
export function rank(pairs) {
  /** @type {Map<T, number>} */
  const totals = new Map();
  for (const [value, weight] of pairs) totals.set(value, (totals.get(value) ?? 0) + weight);
  return [...totals].sort((a, b) => b[1] - a[1]).map(([value]) => value);
}

/**
 * `rank` with every value weighing one: most frequent first.
 *
 * @template T
 * @param {T[]} values
 * @returns {T[]}
 */
export function byCount(values) {
  return rank(values.map((value) => /** @type {[T, number]} */ ([value, 1])));
}

/**
 * Roles in the order they keep a style when two read identically. Content
 * roles first: a page whose h1 is set exactly like its paragraphs has one
 * style, and `body` is the truer name for it.
 */
const TYPE_PRIORITY = ["body", "display", "heading", "label", "mono"];

/**
 * Type tokens with exact duplicates dropped: when two roles share all five
 * properties, only the one earliest in `TYPE_PRIORITY` stays. Order of what
 * is kept is unchanged.
 *
 * @template {{ name: string, fontFamily: string, fontSize: string, fontWeight: string, lineHeight: string, letterSpacing: string }} T
 * @param {T[]} type
 * @returns {T[]}
 */
export function dedupeType(type) {
  /** @param {T} t */
  const key = (t) => [t.fontFamily, t.fontSize, t.fontWeight, t.lineHeight, t.letterSpacing].join("|");
  /** @param {T} t */
  const rankOf = (t) => {
    const at = TYPE_PRIORITY.indexOf(t.name);
    return at === -1 ? TYPE_PRIORITY.length : at;
  };
  /** @type {Map<string, T>} */
  const kept = new Map();
  for (const t of [...type].sort((a, b) => rankOf(a) - rankOf(b))) {
    if (!kept.has(key(t))) kept.set(key(t), t);
  }
  const winners = new Set(kept.values());
  return type.filter((t) => winners.has(t));
}

/** @param {string} hex */
function channels(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
}

/** @param {string} hex */
function chroma(hex) {
  const c = channels(hex);
  return Math.max(...c) - Math.min(...c);
}

/** WCAG contrast ratio of two hex colours. @param {string} a @param {string} b */
export function contrast(a, b) {
  /** @param {string} hex */
  const lum = (hex) => {
    const [r = 0, g = 0, b = 0] = channels(hex).map((v) =>
      v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
    );
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

/** `12.5px` -> 13; anything not in px (`normal`, `auto`, `%`) -> null. @param {string} value */
function px(value) {
  return /^-?[\d.]+px$/.test(value) ? Math.round(parseFloat(value)) : null;
}

/**
 * `"Inter Variable", Inter, sans-serif` -> `Inter Variable`. next/font renames
 * every family `__Name_<hash>`; the hash is build output, so only the name the
 * site asked for is kept.
 *
 * @param {string} stack
 */
export function firstFamily(stack) {
  const name = (stack.split(",")[0] ?? "").trim().replace(/^["']|["']$/g, "");
  return name.replace(/^__(.+)_[0-9a-f]{6}$/, "$1");
}

/** `17.6px` stays, `17.6000003px` does not. @param {string} value */
function tidy(value) {
  return value.replace(/-?[\d.]+(?=px)/, (n) => String(Math.round(parseFloat(n) * 100) / 100));
}

/**
 * Raw samples to named tokens. Pure, so every rule below is testable without a
 * browser.
 *
 * @param {Raw} raw
 * @param {string} readDate  ISO date the page was read.
 * @returns {Design | null}  Null when nothing at all survived the evidence rules.
 */
export function summarize({ body, html, edges, samples }, readDate) {
  /** @type {ColorToken[]} */
  const colors = [];
  /** @param {string} name @param {string | null | undefined} hex */
  const color = (name, hex) => {
    if (hex) colors.push({ name, hex });
  };

  const hexed = samples.map((s) => ({ ...s, bgHex: toHex(s.bg), colorHex: toHex(s.color) }));
  const byArea = rank(hexed.flatMap((s) => (s.bgHex ? [[s.bgHex, s.area]] : [])));
  const background =
    rank(edges.flatMap((fill) => {
      const hex = toHex(fill);
      return hex ? [[hex, 1]] : [];
    }))[0] ?? toHex(body) ?? toHex(html) ?? byArea[0];
  color("background", background);
  color("surface", byArea.find((hex) => hex !== background));

  const texts = rank(
    hexed.flatMap((s) => (/^(p|li|span)$/.test(s.tag) && s.text > 0 && s.colorHex ? [[s.colorHex, s.text]] : [])),
  ).filter((hex) => !background || contrast(hex, background) >= MIN_ROLE_CONTRAST);
  // The two most-used text colours that are clearly different. Of those, the
  // one standing further off the background is `text`: a page whose longest
  // runs are grey captions still writes its headings and body in the dark ink.
  const first = texts[0];
  const second = first && texts.find((hex) => contrast(hex, first) >= MIN_ROLE_CONTRAST);
  const pair = [first, second].filter((hex) => hex !== undefined);
  if (background) pair.sort((a, b) => contrast(b, background) - contrast(a, background));
  color("text", pair[0]);
  color("text-muted", pair[1]);

  color(
    "accent",
    byCount(
      hexed.flatMap((s) => {
        if (s.tag !== "a" && s.tag !== "button") return [];
        const own = s.tag === "button" ? [s.colorHex, s.bgHex] : [s.colorHex];
        return own.flatMap((hex) => (hex !== null && chroma(hex) >= MIN_ACCENT_CHROMA ? [hex] : []));
      }),
    )[0],
  );
  color("border", byCount(hexed.flatMap((s) => {
    const hex = s.border === null ? null : toHex(s.border);
    return hex ? [hex] : [];
  }))[0]);

  /** @type {TypeToken[]} */
  const type = [];
  /** @param {string} name @param {(s: Sample) => boolean} match */
  const style = (name, match) => {
    const top = rank(samples.filter((s) => match(s) && s.text > 0).map((s) => [s.font.join("|"), s.text]))[0];
    if (top === undefined) return false;
    const [family = "", size = "", weight = "", lineHeight = "", spacing = ""] = top.split("|");
    type.push({
      name,
      fontFamily: firstFamily(family),
      fontSize: tidy(size),
      fontWeight: weight,
      lineHeight: tidy(lineHeight),
      letterSpacing: tidy(spacing),
    });
    return true;
  };
  style("display", (s) => s.tag === "h1");
  style("heading", (s) => s.tag === "h2") || style("heading", (s) => s.tag === "h3");
  style("body", (s) => s.tag === "p");
  style("label", (s) => s.tag === "button" || (s.nav && s.tag === "a"));
  style("mono", (s) => s.tag === "code" || s.tag === "pre");

  // Firecrawl's convention (`spacing: { 2: 8px }`): the key is the 4px step.
  // A value off that grid keeps its pixels as its name rather than a fraction,
  // because `2.5` is not a valid token name.
  const spacing = byCount(
    samples.flatMap((s) =>
      s.space.flatMap((value) => {
        const n = px(value);
        return n !== null && n > 0 && n <= MAX_SPACING_PX ? [n] : [];
      }),
    ),
  )
    .slice(0, SPACING_SIZE)
    .sort((a, b) => a - b)
    .map((n) => ({ name: n % 4 === 0 ? String(n / 4) : `${n}px`, value: `${n}px` }));

  // Named by the element the value was seen on most, not sm/md/lg: SKILL.md
  // forbids deriving a size scale from repeated values.
  /** @param {Sample} s */
  const role = (s) =>
    s.tag === "button" ? "button"
    : /^(input|textarea|select)$/.test(s.tag) ? "input"
    : /^(img|video|picture)$/.test(s.tag) ? "image"
    : s.card ? "card"
    : null;
  /** @type {Map<number, string[]>} */
  const roles = new Map();
  let full = false;
  for (const s of samples) {
    const r = role(s);
    if (r === null) continue;
    const n = s.radius.endsWith("%") ? (parseFloat(s.radius) >= 50 ? FULL_RADIUS_PX : null) : px(s.radius);
    if (n === null || n <= 0) continue;
    if (n >= FULL_RADIUS_PX) full = true;
    else roles.set(n, [...(roles.get(n) ?? []), r]);
  }
  const taken = new Set();
  /** @type {ValueToken[]} */
  const radius = rank([...roles].map(([n, rs]) => [n, rs.length]))
    .slice(0, RADIUS_SIZE)
    .sort((a, b) => a - b)
    .map((n) => {
      const base = byCount(roles.get(n) ?? [])[0] ?? "card";
      let name = base;
      for (let i = 2; taken.has(name); i += 1) name = `${base}-${i}`;
      taken.add(name);
      return { name, value: `${n}px` };
    });
  if (full) radius.push({ name: "full", value: "9999px" });

  if (colors.length + type.length + spacing.length + radius.length === 0) return null;
  return { read_date: readDate, colors, type: dedupeType(type), spacing, radius };
}

/**
 * The tokens of whatever `page` is showing, or null. Never throws: a page that
 * breaks the sampler costs the entry its design panel and nothing else.
 *
 * @param {import("playwright").Page} page
 * @returns {Promise<Design | null>}
 */
export async function readDesign(page) {
  try {
    const raw = await page.evaluate(sampleStyles, MAX_SAMPLES);
    // en-CA formats as YYYY-MM-DD, in the machine's local day rather than UTC's.
    return raw === null ? null : summarize(raw, new Date().toLocaleDateString("en-CA"));
  } catch {
    return null;
  }
}
