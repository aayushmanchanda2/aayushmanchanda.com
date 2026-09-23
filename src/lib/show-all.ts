/**
 * show-all.ts — the one "Show all N" / "Show fewer" toggle (QA phase 2, B11):
 * the /library tag filter row (`TagFilters.astro`) and a site's design panel
 * groups (`lib/site-detail.ts`). The tail is in the HTML, so with scripting off
 * everything shows and the button never does; the caller reveals the button.
 *
 * No imports and nothing from outside its own body, because `TagFilters`
 * inlines it by `toString()` to hide the tail before the first paint.
 */
export function showAll(button: HTMLElement, tail: Iterable<Element>): void {
  const items = [...tail];
  const set = (open: boolean) => {
    for (const item of items) item.toggleAttribute("hidden", !open);
    button.setAttribute("aria-expanded", String(open));
    button.textContent = open ? "Show fewer" : button.dataset.label || "Show all";
  };
  set(false);
  button.addEventListener("click", () => set(button.getAttribute("aria-expanded") !== "true"));
}
