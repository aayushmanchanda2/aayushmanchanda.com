/**
 * The command palette's result list, as DOM.
 *
 * Split out of `lib/palette.ts` so that each file has one job: this one turns
 * ranked groups into elements, that one decides when the palette is open, which
 * row is highlighted and where the keys go. They met at a single seam already —
 * `render()` called two builders and read the rows back — so the split cost
 * nothing but the import below.
 *
 * Everything here is built with `createElement` rather than a template string.
 * The text going in is entry titles from the data files, and constructing nodes
 * means there is no escaping step to forget the day a title contains an angle
 * bracket.
 *
 * These elements never carry Astro's `data-astro-cid-*` attribute, because
 * nothing here is compiled from a `.astro` template — which is why the palette's
 * styles are a plain global stylesheet. See the header of `styles/palette.css`.
 */

import type { SearchEntry, SearchGroup } from "./search";

/**
 * The muted right-hand column of a row.
 *
 * Every row goes to a page on this site — see `lib/search-index.ts`, which is
 * where that is decided and why — so this is simply the path. There is no
 * external case to handle: no `target`, no `rel`, and no second navigation path
 * to keep working.
 */
function destination(entry: SearchEntry): string {
  return entry.href;
}

function rowNode(entry: SearchEntry): HTMLAnchorElement {
  const row = document.createElement("a");
  row.className = "palette__row";
  row.href = entry.href;
  row.role = "option";
  row.dataset.paletteRow = "";
  // Focus stays in the field; the highlight is a virtual cursor, so a row must
  // not be a tab stop of its own.
  row.tabIndex = -1;

  const title = document.createElement("span");
  title.className = "palette__row-title";
  title.textContent = entry.title;

  const where = document.createElement("span");
  where.className = "palette__row-where mono";
  where.textContent = destination(entry);

  row.append(title, where);
  return row;
}

/** One `role="group"` per section heading, with its rows inside. */
function groupNode(group: SearchGroup): HTMLElement {
  const wrap = document.createElement("div");
  wrap.role = "group";
  wrap.setAttribute("aria-label", group.section);

  const heading = document.createElement("div");
  heading.className = "palette__heading mono";
  heading.textContent = group.section;
  // The group's own aria-label already announces this to a screen reader;
  // leaving it in the tree twice would read the section name on every row.
  heading.setAttribute("aria-hidden", "true");
  wrap.append(heading);

  for (const hit of group.hits) {
    wrap.append(rowNode(hit.entry));
  }
  return wrap;
}

/**
 * Replace `container`'s contents with `groups`, and hand back the rows.
 *
 * The rows come back read out of the DOM rather than collected while building,
 * because the caller uses the returned order to drive the arrow keys and the
 * highlight. Reading them back is what guarantees that order is the rendered
 * one: a list assembled alongside the tree can disagree with it, and the bug
 * that produces — arrows landing on a different row than the highlight — is
 * exactly the sort nobody notices in review.
 */
export function renderGroups(
  container: HTMLElement,
  groups: readonly SearchGroup[],
): HTMLAnchorElement[] {
  container.replaceChildren(...groups.map(groupNode));
  return Array.from(
    container.querySelectorAll<HTMLAnchorElement>("[data-palette-row]"),
  );
}
