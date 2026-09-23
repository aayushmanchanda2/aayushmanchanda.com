/**
 * library-pane.ts — the /library/<slug> list pane keeps its scroll, and
 * filters by kind and tag (`FILTER`, below).
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
 * The pane's kind and tag filter, `?kind=post&tag=agents` on the entry's URL,
 * inline straight after the pane so a filtered pane paints filtered and
 * `PREPAINT` after it measures the filtered list. The URL is the state.
 *
 * It reads, inside the pane: rows (`[data-rows] > li`, each with `data-kind`
 * and space-separated `data-tags`), the kind links (`KindSegments.astro`,
 * `[data-kind-set]`, "" is All), the tag `select[data-tag-set]`, a live count
 * and an empty state. A plain click on a segment filters in place (a modifier
 * click still opens the kind page). A change replaces the history entry, so
 * Back still means the previous entry. Every row link, and the hint row's
 * close, prev and next, carry the query, so the filter survives a click to any
 * entry; prev and next step to the nearest shown row, and the roving
 * tabindex's one stop lands on a shown row. An unknown value reads as All.
 */
export const FILTER = `(function(){
var root=document.querySelector("[${PANE_ATTRIBUTE}]");
if(!root)return;
function all(s){return [].slice.call(root.querySelectorAll(s));}
var rows=all("[data-rows] > li"),segs=all("[data-kind-set]"),select=root.querySelector("select[data-tag-set]"),
count=root.querySelector("[data-filter-count]"),empty=root.querySelector("[data-filter-empty]"),
kinds=segs.map(function(g){return g.dataset.kindSet;}),tags=select?[].map.call(select.options,function(o){return o.value;}):[];
function read(){var q=new URLSearchParams(location.search),k=q.get("kind")||"",t=q.get("tag")||"";
return {kind:kinds.indexOf(k)<0?"":k,tag:tags.indexOf(t)<0?"":t};}
function query(f){var q=new URLSearchParams();if(f.kind)q.set("kind",f.kind);if(f.tag)q.set("tag",f.tag);q=q.toString();return q?"?"+q:"";}
function ring(s){var nav=document.querySelector("[data-entry-nav]");if(!nav)return;
var close=nav.querySelector('[data-nav="close"]'),cur=root.querySelector('[data-rows] > li > [aria-current="page"]'),i=rows.indexOf(cur&&cur.parentNode),n=rows.length;
if(close)close.search=s;if(i<0)return;
[["prev",-1,"Previous"],["next",1,"Next"]].forEach(function(d){var l=nav.querySelector('[data-nav="'+d[0]+'"]');if(!l)return;
for(var j=1;j<n;j++){var r=rows[((i+d[1]*j)%n+n)%n];if(!r.hidden){l.href=r.firstElementChild.href;l.setAttribute("aria-label",d[2]+" entry: "+r.querySelector("b").textContent);return;}}});}
function apply(f){var s=query(f),n=0,stop=null;
rows.forEach(function(li){var a=li.firstElementChild,ok=(!f.kind||li.dataset.kind===f.kind)&&(!f.tag||(" "+li.dataset.tags+" ").indexOf(" "+f.tag+" ")>=0);
li.hidden=!ok;if(ok)n++;a.search=s;a.tabIndex=-1;if(ok&&(!stop||a.hasAttribute("aria-current")))stop=a;});
if(stop)stop.tabIndex=0;
segs.forEach(function(g){if(g.dataset.kindSet===f.kind)g.setAttribute("aria-current","true");else g.removeAttribute("aria-current");});
if(select)select.value=f.tag;
if(count)count.textContent=n+(n===1?" entry":" entries");
if(empty)empty.hidden=n>0;
ring(s);}
function set(f){history.replaceState(null,"",location.pathname+query(f));apply(f);}
segs.forEach(function(g){g.addEventListener("click",function(e){if(e.button||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();var f=read();f.kind=g.dataset.kindSet;set(f);});});
if(select)select.addEventListener("change",function(){var f=read();f.tag=select.value;set(f);});
apply(read());
document.addEventListener("DOMContentLoaded",function(){ring(query(read()));});
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
