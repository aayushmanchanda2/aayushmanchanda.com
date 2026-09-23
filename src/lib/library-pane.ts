/**
 * library-pane.ts — the /library/<slug> list pane keeps its scroll.
 *
 * There is no client router, so every entry is a full page load and the pane
 * would open at the top each time. `PREPAINT` runs inline straight after the
 * pane (`components/LibraryPane.astro`), before first paint: it restores the
 * saved `scrollTop`, then brings the current row into view if it is outside the
 * pane (a j/k walk off the edge, or a first visit with nothing saved). It saves
 * on `pagehide` and on any press inside the pane.
 *
 * sessionStorage, not localStorage: the position is worth keeping for one tab's
 * reading session and nothing longer. A hidden pane (one column, under 48rem)
 * never saves, so a phone visit cannot wipe the desktop position.
 *
 * No imports and no DOM, so `library-pane.test.mjs` runs it against fakes.
 */

/** The sessionStorage key. /privacy names it. */
export const PANE_KEY = "library-pane";

/** The pane's hook in `LibraryPane.astro`; its current row carries `aria-current`. */
export const PANE_ATTRIBUTE = "data-pane";

export const PREPAINT = `(function(){
var p=document.querySelector("[${PANE_ATTRIBUTE}]"),k=${JSON.stringify(PANE_KEY)},y=null;
if(!p)return;
try{y=sessionStorage.getItem(k);}catch(e){}
if(y!==null)p.scrollTop=Number(y)||0;
var a=p.querySelector('[aria-current="page"]');
if(a&&p.clientHeight){var t=a.offsetTop;if(t<p.scrollTop||t+a.offsetHeight>p.scrollTop+p.clientHeight)p.scrollTop=t-(p.clientHeight-a.offsetHeight)/2;}
function s(){if(p.clientHeight)try{sessionStorage.setItem(k,String(p.scrollTop));}catch(e){}}
addEventListener("pagehide",s);p.addEventListener("click",s);
})();`;

/**
 * Where Up, Down, Home and End move focus among the pane's `count` rows from
 * row `from`, stopping at the ends; null for any other key. The pane is one tab
 * stop (a roving tabindex, `LibraryPane.astro`), so these keys are how a
 * keyboard walks it without leaving the page.
 */
export function paneStep(key: string, from: number, count: number): number | null {
  switch (key) {
    case "ArrowDown":
      return Math.min(from + 1, count - 1);
    case "ArrowUp":
      return Math.max(from - 1, 0);
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}
