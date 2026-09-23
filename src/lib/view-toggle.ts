/**
 * view-toggle.ts — a page's list-or-grid choice, in one module.
 *
 * The same split `lib/theme.ts` makes, at a smaller size: the state lives on
 * `<html>` as the page's own attribute (`data-tools-view`, `data-sites-view`),
 * the page's CSS reads it (one attribute, two layouts), `ViewToggle.astro`
 * writes it, and this file is what they agree on. No imports and no DOM, so
 * `view-toggle.test.mjs` can run it under `node --experimental-strip-types`.
 *
 * `prepaint()` is the blocking inline script. `ViewToggle.astro` places it
 * right after its buttons and before the list, so the list is parsed into the
 * right layout on its first paint and the toggle already says which one it is.
 */

export interface ViewConfig {
  /** Button order; the first is not necessarily the default. */
  views: readonly string[];
  /** The `<html>` attribute the page's CSS reads. */
  attribute: string;
  /** The localStorage key. `/privacy` names every one of these. */
  storageKey: string;
  defaultView: string;
}

/** The default is the list: it is the page every verdict and category route shows. */
export const TOOLS_VIEW: ViewConfig = {
  views: ["list", "grid"],
  attribute: "data-tools-view",
  storageKey: "tools-view",
  defaultView: "list",
};

/** The default is the gallery: /sites is a page of pictures first. */
export const SITES_VIEW: ViewConfig = {
  views: ["grid", "list"],
  attribute: "data-sites-view",
  storageKey: "sites-view",
  defaultView: "grid",
};

/** The attribute each toggle button carries its view in. One toggle per page. */
export const BUTTON_ATTRIBUTE = "data-view-set";

/**
 * The pre-paint pass, as source.
 *
 * Only the storage read is inside the try: `localStorage` throws outright when
 * storage is blocked, and the page still gets a valid word on `<html>` and a
 * pressed button. It queries the buttons, so it must be placed after them, and
 * it unhides their group, which ships `hidden` so a reader without scripting
 * never sees a toggle that cannot work.
 */
export function prepaint(config: ViewConfig): string {
  return `(function(){
var V=${JSON.stringify(config.views)},v;
try{v=localStorage.getItem(${JSON.stringify(config.storageKey)});}catch(e){}
if(V.indexOf(v)<0)v=${JSON.stringify(config.defaultView)};
document.documentElement.setAttribute(${JSON.stringify(config.attribute)},v);
var b=document.querySelectorAll("[${BUTTON_ATTRIBUTE}]");
for(var i=0;i<b.length;i++){b[i].setAttribute("aria-pressed",String(b[i].getAttribute(${JSON.stringify(BUTTON_ATTRIBUTE)})===v));b[i].parentElement.hidden=false;}
})();`;
}
