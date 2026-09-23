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
 * The pane's kind and tag filter, `?kind=post&tags=agents,design` in the URL.
 * The URL is the state. Tags are AND: a row shows when it carries every one.
 * The old single `?tag=` still reads.
 *
 * It reads, inside the pane: `[data-rows] > li`, either a row (`data-kind`,
 * space-separated `data-tags`) or a month header (`data-month-count` inside),
 * and an empty state. Anywhere on the page: the kind links (`KindSegments.astro`,
 * `[data-kind-set]`, "" is All), the tag checkboxes (`LibraryTags.astro`,
 * `input[data-tag-set]`, each with a `[data-tag-count]` beside it), the chip
 * rows (`[data-tag-chips]`) and the live counts; /library draws a second
 * toolbar for phones, where the pane is hidden. A month header counts the rows
 * the filter shows under it and hides at zero; a tag's count is how many shown
 * rows carry it, and a tag at 0 (ticking it could only empty the list) is
 * disabled and moved to the end of its list (R5-4). On an entry page a plain click on a segment filters in place
 * (a modifier click still opens the kind page). Every row link, and the hint
 * row's close, prev and next, carry the query, so the filter survives a click
 * to any entry; prev and next step to the nearest shown row, and the roving
 * tabindex's one stop lands on a shown row. An unknown value reads as All.
 *
 * On an entry page a change replaces the history entry, so Back still means
 * the previous entry. On /library and `/library/kind/<kind>` the pane carries
 * `data-home="/library"` and `data-start` (the kind the route shows). Each of
 * those routes renders only its own view (QA phase 2, B15), so there a kind
 * press is the segment's own link to that route, with the tags carried in its
 * query, and a `/library?kind=` from before the split `location.replace`s to
 * its route. A tag change replaces the URL on the route's own path, and
 * `[data-tags]` items inside a kind's view follow it (All's latest few do not:
 * a filter could empty it).
 */
export const FILTER = `(function(){
var root=document.querySelector("[${PANE_ATTRIBUTE}]");
if(!root)return;
function all(s,r){return [].slice.call((r||document).querySelectorAll(s));}
var items=all("[data-rows] > li",root),rows=items.filter(function(li){return li.dataset.kind;}),segs=all("[data-kind-set]"),boxes=all("input[data-tag-set]"),
counts=all("[data-filter-count]"),chips=all("[data-tag-chips]"),empty=root.querySelector("[data-filter-empty]"),home=root.dataset.home,start=root.dataset.start||"",
kinds=segs.map(function(g){return g.dataset.kindSet;}),labels=Object.create(null);
boxes.forEach(function(b){labels[b.value]=b.dataset.label;});
function read(){var q=new URLSearchParams(location.search),k=q.has("kind")?q.get("kind"):home?start:"",t=(q.get("tags")||q.get("tag")||"").split(",");
return {kind:kinds.indexOf(k)<0?"":k,tags:t.filter(function(s,i){return labels[s]&&t.indexOf(s)===i;})};}
function query(f){var q=[];if(f.kind)q.push("kind="+f.kind);if(f.tags.length)q.push("tags="+f.tags.join(","));return q.length?"?"+q.join("&"):"";}
function route(k){return k?home+"/kind/"+k:home;}
function has(el,t){var s=" "+el.dataset.tags+" ";return t.every(function(x){return s.indexOf(" "+x+" ")>=0;});}
function ring(s){var nav=document.querySelector("[data-entry-nav]");if(!nav)return;
var close=nav.querySelector('[data-nav="close"]'),cur=root.querySelector('[data-rows] > li > [aria-current="page"]'),i=rows.indexOf(cur&&cur.parentNode),n=rows.length;
if(close)close.search=s;if(i<0)return;
[["prev",-1,"Previous"],["next",1,"Next"]].forEach(function(d){var l=nav.querySelector('[data-nav="'+d[0]+'"]');if(!l)return;
for(var j=1;j<n;j++){var r=rows[((i+d[1]*j)%n+n)%n];if(!r.hidden){l.href=r.firstElementChild.href;l.setAttribute("aria-label",d[2]+" entry: "+r.querySelector("b").textContent);return;}}});}
function chip(box,cls,text,name,next){var b=document.createElement("button");b.type="button";b.className=cls;b.textContent=text;b.setAttribute("aria-label",name);
b.addEventListener("click",function(){var f=read();f.tags=next(f.tags);set(f);var to=box.querySelector("button")||box.parentNode.querySelector("summary");if(to)to.focus();});box.append(b);}
function apply(f){var s=query(f),n=0,stop=null,per=Object.create(null),heads=[],head=null;
items.forEach(function(li){if(!li.dataset.kind){head={li:li,n:0};heads.push(head);return;}
var a=li.firstElementChild,ok=(!f.kind||li.dataset.kind===f.kind)&&has(li,f.tags);
li.hidden=!ok;a.search=s;a.tabIndex=-1;if(!ok)return;n++;if(head)head.n++;if(!stop||a.hasAttribute("aria-current"))stop=a;
li.dataset.tags.split(" ").forEach(function(t){per[t]=(per[t]||0)+1;});});
if(stop)stop.tabIndex=0;
heads.forEach(function(h){h.li.hidden=!h.n;h.li.querySelector("[data-month-count]").textContent=h.n;});
segs.forEach(function(g){if(g.dataset.kindSet===f.kind)g.setAttribute("aria-current","true");else g.removeAttribute("aria-current");});
boxes.forEach(function(b){var c=per[b.value]||0;b.checked=f.tags.indexOf(b.value)>=0;b.disabled=!c&&!b.checked;b.parentNode.querySelector("[data-tag-count]").textContent=c;});
boxes.filter(function(b){return !b.disabled;}).concat(boxes.filter(function(b){return b.disabled;})).forEach(function(b){b.parentNode.parentNode.append(b.parentNode);});
chips.forEach(function(box){box.replaceChildren();box.hidden=!f.tags.length;if(!f.tags.length)return;
f.tags.forEach(function(t){chip(box,"tag",labels[t]+" \\u00d7","Remove tag "+labels[t],function(ts){return ts.filter(function(x){return x!==t;});});});
chip(box,"tag tag--more","Clear","Clear tags",function(){return [];});});
counts.forEach(function(c){c.textContent=n+(n===1?" entry":" entries");});
if(empty)empty.hidden=n>0;
all('[data-view]:not([data-view=""]) [data-tags]').forEach(function(e){e.hidden=!has(e,f.tags);});
ring(s);}
function set(f){history.replaceState(null,"",location.pathname+query(home?{kind:"",tags:f.tags}:f));apply(f);}
segs.forEach(function(g){g.addEventListener("click",function(e){if(e.button||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;var f=read(),k=g.dataset.kindSet;
if(home){if(k===f.kind)e.preventDefault();else g.search=query({kind:"",tags:f.tags});return;}
e.preventDefault();f.kind=k;set(f);});});
boxes.forEach(function(b){b.addEventListener("change",function(){var f=read();f.tags=f.tags.filter(function(t){return t!==b.value;});if(b.checked)f.tags.push(b.value);set(f);});});
var first=read();
if(home&&first.kind!==start){location.replace(route(first.kind)+query({kind:"",tags:first.tags}));return;}
apply(first);
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
