/**
 * pane-merge.ts — the private rows into a public page's library pane, in the
 * browser, once the signed-in module has them (VET-276).
 *
 * It draws what `LibraryPane.astro` draws for a private row on /me (lock,
 * tip, `/me/library/<slug>`), puts each row where the /me pane would
 * (`lib/private.ts › paneRows` names the public row it sits above), redraws
 * the month headers, adds the "Private" segment and any tag the public list
 * lacks, and runs `FILTER` again so the counts, tags and URL state include
 * them. The pane on a /me page already has them, and is left alone.
 */
import type { PaneRow } from "./private";

/**
 * How this finds `lib/library-pane.ts › FILTER` on the page: the inline script
 * holding it is the one that reads the kind segments. Read off the page rather
 * than imported, because a module this and the public pages both import
 * would be split into a shared chunk, and every public page's JS would change.
 */
export const FILTER_MARK = "[data-kind-set]";

/** The padlock, 12px: `LockGlyph.astro` renders this same markup on /me. */
export const LOCK_SVG =
  '<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" role="img" aria-label="Private"><path d="M5 7V5a3 3 0 0 1 6 0v2h.5A1.5 1.5 0 0 1 13 8.5v5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13.5v-5A1.5 1.5 0 0 1 4.5 7H5Zm1.5 0h3V5a1.5 1.5 0 0 0-3 0v2Z" /></svg>';

/** Five segments do not fit the 350px pane with every count; only "Private" keeps its own (as `PrivatePane.astro`). */
export const PANE_CSS = '.seg:has([data-kind-set="private"]) .seg__item:not([data-kind-set="private"]) .seg__count{display:none}';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, ...kids: (Node | string)[]): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...kids);
  return node;
};

function rowItem(row: PaneRow): HTMLLIElement {
  const small = el("small", "");
  if (!row.also) {
    const icon = small.appendChild(el("i", "ki", row.kind));
    icon.dataset.kind = row.kind;
  }
  small.insertAdjacentHTML("beforeend", LOCK_SVG);
  small.append(el("span", "", row.domain));
  if (row.also) small.append(Object.assign(el("time", "", row.day), { dateTime: row.date }));
  const link = Object.assign(el("a", "", el("b", "", row.title), small), { href: row.href });
  if (row.summary) link.append(el("span", row.tip ? "tip" : "", row.summary));
  const item = el("li", "", link);
  item.dataset.kind = "private";
  item.dataset.tags = row.tags.map((tag) => tag.slug).join(" ");
  if (row.also) item.dataset.also = "";
  return item;
}

const header = (label: string, also = false): HTMLLIElement => {
  const count = el("span", "tabular-nums", "0");
  count.setAttribute("data-month-count", "");
  const li = el("li", `pane__month mono${also ? " pane__also" : ""}`, `${label} · `, count);
  li.setAttribute("data-month", "");
  return li;
};

/** The rows into the list, and the month headers redrawn around them. */
function place(list: HTMLElement, rows: PaneRow[]): void {
  // Each public row learns its month from the header above it, then the
  // month headers go; "Also saved" stays as the boundary between the groups.
  const monthOf = new Map<Element, string>();
  let month = "";
  for (const li of [...list.children]) {
    if (li.classList.contains("pane__also")) break;
    if (li.hasAttribute("data-month")) {
      month = li.firstChild?.textContent?.replace(/ · $/, "") ?? "";
      li.remove();
    } else monthOf.set(li, month);
  }
  let also = list.querySelector<HTMLLIElement>(":scope > .pane__also");
  if (!also && rows.some((row) => row.also)) list.append((also = header("Also saved", true)));
  const byHref = new Map([...list.querySelectorAll<HTMLAnchorElement>(":scope > li > a")].map((a) => [a.pathname, a.parentElement]));
  for (const row of rows) {
    const item = rowItem(row);
    if (!row.also) monthOf.set(item, row.month);
    list.insertBefore(item, (row.before && byHref.get(row.before)) || (row.also ? null : also));
  }
  month = "";
  for (const li of [...list.children]) {
    if (li === also) break;
    const own = monthOf.get(li) ?? "";
    if (own !== month) li.before(header((month = own)));
  }
}

/** "Private N" after the kinds in every segmented control on the page, and N more under All. */
function segments(count: number): void {
  for (const seg of document.querySelectorAll(".seg")) {
    const all = seg.querySelector('[data-kind-set=""] .seg__count');
    if (all) all.textContent = String(Number(all.textContent) + count);
    const link = Object.assign(el("a", "seg__item", "Private ", el("span", "seg__count tabular-nums", String(count))), { href: "/me/library?kind=private" });
    link.dataset.kindSet = "private";
    seg.append(link);
  }
}

/** Private-only tags join the end of each tag list; `FILTER` counts and orders them. */
function tags(rows: PaneRow[]): void {
  for (const box of document.querySelectorAll("[data-tag-box]")) {
    const have = new Set([...box.querySelectorAll<HTMLInputElement>("input[data-tag-set]")].map((input) => input.value));
    const lists = box.querySelectorAll(".ltags__list");
    const last = lists[lists.length - 1];
    for (const tag of rows.flatMap((row) => row.tags)) {
      if (have.has(tag.slug) || !last) continue;
      have.add(tag.slug);
      const input = Object.assign(el("input", ""), { type: "checkbox", value: tag.slug });
      input.setAttribute("data-tag-set", "");
      input.dataset.label = tag.label;
      const count = el("span", "tag__count", "0");
      count.setAttribute("data-tag-count", "");
      last.append(el("label", "tag ltags__tag", input, tag.label, count));
    }
    const sum = box.querySelector(".ltags__sum .tabular-nums");
    if (sum) sum.textContent = String(have.size);
  }
}

export function mergePane(rows: PaneRow[]): void {
  const pane = document.querySelector<HTMLElement>("[data-pane]");
  const list = pane?.querySelector<HTMLElement>("[data-rows]");
  const filter = [...document.scripts].find((script) => !script.src && script.text.includes(FILTER_MARK));
  if (!pane || !list || !filter || rows.length === 0 || list.querySelector('[data-kind="private"]')) return;
  place(list, rows);
  segments(rows.filter((row) => !row.also).length);
  tags(rows);
  document.head.append(el("style", "", PANE_CSS));
  // FILTER bound its listeners to the old controls; clones drop them, and it
  // runs again over the whole list. On /library, where a segment is a route,
  // "Private" is not one: it goes to /me/library, ahead of FILTER's handler.
  for (const control of document.querySelectorAll("[data-kind-set], input[data-tag-set]")) control.replaceWith(control.cloneNode(true));
  if (pane.dataset.home) {
    for (const link of document.querySelectorAll("[data-kind-set=private]")) link.addEventListener("click", (event) => event.stopImmediatePropagation());
  }
  document.body.append(el("script", "", filter.text));
}
