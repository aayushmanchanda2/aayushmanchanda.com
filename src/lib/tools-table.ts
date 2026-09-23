/**
 * tools-table.ts — what the /tools table sorts and filters on, in one module.
 *
 * Like `view-toggle.ts`: no imports and no DOM, so `tools-table.test.mjs` runs
 * it under `node --experimental-strip-types`, and the scripts in
 * `ToolList.astro` (sorting) and `pages/tools.astro` (filters) only wire it up.
 *
 * Every row and grid tile carries its filter values and sort keys as data
 * attributes (`rowAttributes`), so a sort reorders the nodes already on the page and the
 * two views stay in the same order.
 */

export const SORT_KEYS = ["name", "category", "verdict", "date"] as const;

export type SortKey = (typeof SORT_KEYS)[number];

/** The `aria-sort` words, so the state and the attribute are one value. */
export type Direction = "ascending" | "descending";

/** null is file order: the order `data/tools.json` lists them in. */
export type Sort = { key: SortKey; direction: Direction } | null;

export function isSortKey(value: unknown): value is SortKey {
  return typeof value === "string" && (SORT_KEYS as readonly string[]).includes(value);
}

/**
 * One press per header: its natural direction first (A to Z, verdict rank,
 * newest date), then the reverse, then back to file order. briOS's cycle.
 */
export function nextSort(current: Sort, key: SortKey): Sort {
  const first: Direction = key === "date" ? "descending" : "ascending";
  if (current === null || current.key !== key) return { key, direction: first };
  if (current.direction === first) {
    return { key, direction: first === "ascending" ? "descending" : "ascending" };
  }
  return null;
}

/**
 * The attributes a row or tile carries: the two filter values, the sort keys
 * and the file position. The verdict's sort key is its rank in `VERDICTS`
 * (using first), not the word, so A to Z would not put on-hold on top.
 */
export function rowAttributes(
  tool: { name: string; category: string; verdict: string; status_date: string },
  place: { verdictRank: number; categorySlug: string; index: number },
): Record<string, string> {
  return {
    "data-tool": "",
    "data-verdict": tool.verdict,
    "data-category": place.categorySlug,
    "data-sort-name": tool.name,
    "data-sort-category": tool.category,
    "data-sort-verdict": String(place.verdictRank),
    "data-sort-date": tool.status_date,
    "data-index": String(place.index),
  };
}

const COLLATOR = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/**
 * `items` in `sort` order; ties and a null sort fall back to file order. Works
 * on anything that can answer "what is your value for this attribute".
 */
export function sortItems<T>(items: readonly T[], sort: Sort, read: (item: T, attribute: string) => string): T[] {
  const index = (item: T) => Number(read(item, "data-index"));
  return [...items].sort((a, b) => {
    if (sort !== null) {
      const attribute = `data-sort-${sort.key}`;
      const order = COLLATOR.compare(read(a, attribute), read(b, attribute));
      if (order !== 0) return sort.direction === "ascending" ? order : -order;
    }
    return index(a) - index(b);
  });
}

/* --- filters ------------------------------------------------------------- */

/** "" is All. Values are a verdict word and a category route slug. */
export type Filters = { verdict: string; category: string };

/**
 * The filters a query string asks for. A value that is not on the page (a
 * stale link, a typo) reads as All rather than as an empty table.
 */
export function readFilters(
  search: string,
  verdicts: readonly string[],
  categories: readonly string[],
): Filters {
  const params = new URLSearchParams(search);
  const verdict = params.get("verdict") ?? "";
  const category = params.get("category") ?? "";
  return {
    verdict: verdicts.includes(verdict) ? verdict : "",
    category: categories.includes(category) ? category : "",
  };
}

/** The query string for `filters`, "" when both are All. */
export function filterSearch(filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.verdict) params.set("verdict", filters.verdict);
  if (filters.category) params.set("category", filters.category);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function matches(item: Filters, filters: Filters): boolean {
  return (
    (filters.verdict === "" || item.verdict === filters.verdict) &&
    (filters.category === "" || item.category === filters.category)
  );
}
