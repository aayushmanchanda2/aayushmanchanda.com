/**
 * tools-view.ts — the /tools list-or-grid choice, in one module.
 *
 * The same split `lib/theme.ts` makes, at a smaller size: the state lives on
 * `<html>` as `data-tools-view`, `ToolList.astro` reads it in CSS (one markup,
 * two layouts), the toggle on `pages/tools.astro` writes it, and this file is
 * what they agree on. No imports and no DOM, so `tools-view.test.mjs` can run
 * it under `node --experimental-strip-types`.
 *
 * `PREPAINT` is the blocking inline script. It sits in the body of /tools,
 * after the toggle and before the list, so the list is parsed into the right
 * layout on its first paint and the toggle already says which one it is. Built
 * from the constants below so the inline pass and the click handler cannot
 * disagree about the key or the words.
 */

export const VIEWS = ["list", "grid"] as const;

export type View = (typeof VIEWS)[number];

/** The `<html>` attribute. `ToolList.astro`'s grid rules read the same string. */
export const ATTRIBUTE = "data-tools-view";

/** The localStorage key. */
export const STORAGE_KEY = "tools-view";

/** The default is the list: it is the page every verdict and category route shows. */
export const DEFAULT_VIEW: View = "list";

/** The attribute each toggle button carries its view in. */
export const BUTTON_ATTRIBUTE = "data-tools-view-set";

export function isView(value: unknown): value is View {
  return typeof value === "string" && (VIEWS as readonly string[]).includes(value);
}

/** Whatever storage held, as a view. Garbage and absence are the default. */
export function toView(value: unknown): View {
  return isView(value) ? value : DEFAULT_VIEW;
}

/**
 * The pre-paint pass, as source.
 *
 * Only the storage read is inside the try: `localStorage` throws outright when
 * storage is blocked, and the page still gets a valid word on `<html>` and a
 * pressed button. It queries the buttons, so it must be placed after them, and
 * it unhides their group, which ships `hidden` so a reader without scripting
 * never sees a toggle that cannot work.
 */
export const PREPAINT = `(function(){
var V=${JSON.stringify(VIEWS)},v;
try{v=localStorage.getItem(${JSON.stringify(STORAGE_KEY)});}catch(e){}
if(V.indexOf(v)<0)v=${JSON.stringify(DEFAULT_VIEW)};
document.documentElement.setAttribute(${JSON.stringify(ATTRIBUTE)},v);
var b=document.querySelectorAll("[${BUTTON_ATTRIBUTE}]");
for(var i=0;i<b.length;i++){b[i].setAttribute("aria-pressed",String(b[i].getAttribute(${JSON.stringify(BUTTON_ATTRIBUTE)})===v));b[i].parentElement.hidden=false;}
})();`;
