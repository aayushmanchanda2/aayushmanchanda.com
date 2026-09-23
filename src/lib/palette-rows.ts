/**
 * The command palette's result list, as DOM.
 *
 * Split out of `lib/palette.ts` so that each file has one job: this one turns
 * ranked hits into elements, that one decides when the palette is open, which
 * row is highlighted and where the keys go.
 *
 * Everything here is built with `createElement` and `textContent` rather than
 * a template string. The text going in is titles, post bodies and excerpts
 * from the data files, and constructing nodes means there is no escaping step
 * to forget the day one of them contains an angle bracket. The `<mark>`s in an
 * excerpt are elements built from `excerptFor`'s parts, never parsed markup.
 *
 * These elements never carry Astro's `data-astro-cid-*` attribute, because
 * nothing here is compiled from a `.astro` template — which is why the palette's
 * styles are a plain global stylesheet. See the header of `styles/palette.css`.
 */

import { formatDay } from "./date";
import type { Part, RowIcon, SearchEntry, SearchHit } from "./search";
import { excerptFor } from "./search";
import { soundOn } from "./ui-sound";

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * The 30px slot: a picture over its letter, or a kind glyph.
 *
 * The same three layers as `AppIcon.astro`: the logo, then on `error` the
 * self-hosted icon once, then the letter underneath on its identity hue.
 */
function iconNode(entry: SearchEntry): HTMLElement {
  const slot = el("span", "palette__icon");
  slot.setAttribute("aria-hidden", "true");
  const icon: RowIcon | undefined = entry.icon;

  if (!icon) {
    slot.dataset.shape = "glyph";
    const glyph = el("i", "ki");
    glyph.dataset.kind = entry.glyph ?? "article";
    slot.append(glyph);
    return slot;
  }

  slot.dataset.shape = icon.shape;
  const letter = el("span", "monogram", icon.letter);
  letter.dataset.hue = String(icon.hue);
  slot.append(letter);

  if (icon.src) {
    const img = el("img", "");
    img.alt = "";
    img.width = 30;
    img.height = 30;
    img.decoding = "async";
    img.referrerPolicy = "strict-origin-when-cross-origin";
    let fallback = icon.fallback;
    img.addEventListener("error", () => {
      if (fallback) {
        img.src = fallback;
        fallback = undefined;
      } else {
        img.remove();
      }
    });
    img.src = icon.src;
    slot.append(img);
  }
  return slot;
}

function excerptNode(parts: readonly Part[]): HTMLElement {
  const line = el("span", "palette__row-excerpt");
  for (const part of parts) {
    line.append(part.mark ? el("mark", "", part.text) : document.createTextNode(part.text));
  }
  return line;
}

function rowNode(hit: SearchHit, tokens: readonly string[]): HTMLAnchorElement {
  const { entry } = hit;
  const row = el("a", "palette__row");
  row.href = entry.href;
  row.role = "option";
  row.dataset.paletteRow = "";
  // Focus stays in the field; the highlight is a virtual cursor, so a row must
  // not be a tab stop of its own.
  row.tabIndex = -1;
  if (entry.action) row.dataset.paletteAction = entry.action;

  const text = el("span", "palette__row-text");
  text.append(
    el(
      "span",
      "palette__row-title",
      entry.action === "sound" ? `Sound: ${soundOn() ? "on" : "off"}` : entry.title,
    ),
    el(
      "span",
      "palette__row-sub",
      [entry.section, entry.action ? "toggle" : entry.sub].filter(Boolean).join(" · "),
    ),
  );
  const parts = excerptFor(entry, tokens);
  if (parts) text.append(excerptNode(parts));

  row.append(iconNode(entry), text);

  if (entry.date) {
    const date = el("time", "palette__row-date mono", formatDay(entry.date));
    date.dateTime = entry.date;
    row.append(date);
  }
  return row;
}

/**
 * Replace `container`'s contents with `hits`, and hand back the rows.
 *
 * Read back out of the DOM rather than collected while building, so the order
 * the arrow keys walk is guaranteed to be the rendered one.
 */
export function renderRows(
  container: HTMLElement,
  hits: readonly SearchHit[],
  tokens: readonly string[],
): HTMLAnchorElement[] {
  container.replaceChildren(...hits.map((hit) => rowNode(hit, tokens)));
  return Array.from(container.querySelectorAll<HTMLAnchorElement>("[data-palette-row]"));
}
