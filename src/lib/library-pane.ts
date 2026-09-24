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
 * The library's one filtering model (VET-282), `?kind=post&tags=a,b&q=words`
 * in the URL. The URL is the state; an unknown value reads as All.
 *
 *   - **Entries.** Every row in the list, one dated list under month headers.
 *     "All" means every entry. An `also_saved` entry is a row like any other
 *     (VET-284): no separate group, in the list or in any view.
 *   - **Filters.** Kind (one segment, "" is All), tags (AND: a row carries
 *     every one; the old single `?tag=` still reads) and text (`q`: every word
 *     is somewhere in the row's text). All three apply to every row, and to
 *     the view's items (`[data-view] [data-tags]`), All's editorial mix too.
 *   - **Counts.** Every number counts the same rows, the list's first copy
 *     (the pane's; /library's phone list mirrors it): the live count
 *     (`[data-filter-count]`) is the rows shown; a segment's count
 *     (`[data-kind-count]`, "" for All) is the rows the tags and text leave
 *     of that kind, so All's count is the live count whenever All is on; a
 *     month header counts the rows shown under it and hides
 *     at 0; a tag's count is the shown rows that carry it, and a tag at 0 is
 *     disabled and sorted last (R5-4). A view group (`[data-filter-group]`)
 *     counts its shown items into `[data-group-count]` and hides at 0. The
 *     stamp's "Library · N" is every entry: All's count with no filter.
 *   - **Group edges.** The first and last shown row under each header carry
 *     `data-edge="first"` / `"last"`, so a list drawn as grouped cards rounds
 *     the right corners whatever the filter hides.
 *
 * It reads: each list (`[data-rows] > li`, a row with `data-kind` and
 * space-separated `data-tags`, or a month header with `[data-month-count]`),
 * the kind links (`[data-kind-set]`), the tag checkboxes (`input[data-tag-set]`
 * with `[data-tag-count]`), the search fields (`input[data-filter-q]`), the
 * chip rows (`[data-tag-chips]`), the counts and the empty states. Every
 * copy on the page is wired. Each list keeps one tab stop (the roving
 * tabindex), on its `aria-current` row or its first shown one.
 *
 * On an entry page a plain click on a segment filters in place when the open
 * entry is of that kind (or All); a kind that leaves the entry out follows the
 * segment's link, tags and text kept, so the right side shows what that kind's
 * page shows rather than an entry the list no longer has (VET-306). A modifier
 * click still opens the kind page, a change replaces the history entry (Back
 * still means the previous entry), and every row link and the hint row's
 * close, prev and next carry the query; prev and next step to the nearest
 * shown row. On /library and `/library/kind/<kind>` the pane carries
 * `data-home="/library"` and `data-start` (the route's kind): a kind press is
 * the segment's own link to that route with the tags and text in its query,
 * a `/library?kind=` from before the split `location.replace`s to its route,
 * and a tag or text change replaces the URL on the route's own path.
 */
export const FILTER = `(function(){
var root=document.querySelector("[${PANE_ATTRIBUTE}]");
if(!root)return;
function all(s,r){return [].slice.call((r||document).querySelectorAll(s));}
var lists=all("[data-rows]").map(function(l){return all(":scope > li",l);}),rows=(lists[0]||[]).filter(function(li){return li.dataset.kind;}),
segs=all("[data-kind-set]"),boxes=all("input[data-tag-set]"),fields=all("input[data-filter-q]"),home=root.dataset.home,start=root.dataset.start||"",
kinds=segs.map(function(g){return g.dataset.kindSet;}),labels=Object.create(null);
boxes.forEach(function(b){labels[b.value]=b.dataset.label;});
function read(){var q=new URLSearchParams(location.search),k=q.has("kind")?q.get("kind"):home?start:"",t=(q.get("tags")||q.get("tag")||"").split(",");
return {kind:kinds.indexOf(k)<0?"":k,tags:t.filter(function(s,i){return labels[s]&&t.indexOf(s)===i;}),q:(q.get("q")||"").trim()};}
function query(f){var q=[];if(f.kind)q.push("kind="+f.kind);if(f.tags.length)q.push("tags="+f.tags.join(","));if(f.q)q.push("q="+encodeURIComponent(f.q));return q.length?"?"+q.join("&"):"";}
function route(k){return k?home+"/kind/"+k:home;}
function has(el,t){var s=" "+el.dataset.tags+" ";return t.every(function(x){return s.indexOf(" "+x+" ")>=0;});}
function said(el,q){var s=el.textContent.toLowerCase();return q.toLowerCase().split(/\\s+/).every(function(w){return s.indexOf(w)>=0;});}
function hit(el,f,kind){return (!kind||!f.kind||el.dataset.kind===f.kind)&&has(el,f.tags)&&(!f.q||said(el,f.q));}
function ring(s){var nav=document.querySelector("[data-entry-nav]");if(!nav)return;
var close=nav.querySelector('[data-nav="close"]'),cur=root.querySelector('[data-rows] > li > [aria-current="page"]'),i=rows.indexOf(cur&&cur.parentNode),n=rows.length;
if(close)close.search=s;if(i<0)return;
[["prev",-1,"Previous"],["next",1,"Next"]].forEach(function(d){var l=nav.querySelector('[data-nav="'+d[0]+'"]');if(!l)return;
for(var j=1;j<n;j++){var r=rows[((i+d[1]*j)%n+n)%n];if(!r.hidden){l.href=r.firstElementChild.href;l.setAttribute("aria-label",d[2]+" entry: "+r.querySelector("b").textContent);return;}}});}
function chip(box,cls,text,name,next){var b=document.createElement("button");b.type="button";b.className=cls;b.textContent=text;b.setAttribute("aria-label",name);
b.addEventListener("click",function(){var f=read();f.tags=next(f.tags);set(f);var to=box.querySelector("button")||box.parentNode.querySelector("summary");if(to)to.focus();});box.append(b);}
function apply(f){var s=query(f),shown=0,per=Object.create(null),kc=Object.create(null);kc[""]=0;
function fin(h){if(!h)return;h.li.hidden=!h.n;h.li.querySelector("[data-month-count]").textContent=h.n;if(h.a)h.a.dataset.edge="first";if(h.z)h.z.dataset.edge=(h.z===h.a?"first ":"")+"last";}
lists.forEach(function(items,at){var stop=null,head=null;
items.forEach(function(li){if(!li.dataset.kind){fin(head);head={li:li,n:0};return;}
var a=li.firstElementChild,ok=hit(li,f,true);li.hidden=!ok;a.search=s;a.tabIndex=-1;delete li.dataset.edge;
if(!at&&hit(li,f,false)){kc[""]++;kc[li.dataset.kind]=(kc[li.dataset.kind]||0)+1;}
if(!ok)return;if(head){head.n++;head.a=head.a||li;head.z=li;}if(!stop||a.hasAttribute("aria-current"))stop=a;
if(!at){shown++;li.dataset.tags.split(" ").forEach(function(t){per[t]=(per[t]||0)+1;});}});
fin(head);if(stop)stop.tabIndex=0;});
segs.forEach(function(g){if(g.dataset.kindSet===f.kind)g.setAttribute("aria-current","true");else g.removeAttribute("aria-current");});
all("[data-kind-count]").forEach(function(c){c.textContent=kc[c.dataset.kindCount]||0;});
fields.forEach(function(i){if(i.value.trim()!==f.q)i.value=f.q;});
boxes.forEach(function(b){var c=per[b.value]||0;b.checked=f.tags.indexOf(b.value)>=0;b.disabled=!c&&!b.checked;b.parentNode.querySelector("[data-tag-count]").textContent=c;});
boxes.filter(function(b){return !b.disabled;}).concat(boxes.filter(function(b){return b.disabled;})).forEach(function(b){b.parentNode.parentNode.append(b.parentNode);});
all("[data-tag-chips]").forEach(function(box){box.replaceChildren();box.hidden=!f.tags.length;if(!f.tags.length)return;
f.tags.forEach(function(t){chip(box,"tag",labels[t]+" \\u00d7","Remove tag "+labels[t],function(ts){return ts.filter(function(x){return x!==t;});});});
chip(box,"tag tag--more","Clear","Clear tags",function(){return [];});});
all("[data-filter-count]").forEach(function(c){c.textContent=shown+(shown===1?" entry":" entries");});
all("[data-filter-empty]").forEach(function(e){e.hidden=shown>0;});
all("[data-view] [data-tags]").forEach(function(e){e.hidden=!hit(e,f,false);});
all("[data-filter-group]").forEach(function(g){var n=all("[data-tags]",g).filter(function(e){return !e.hidden;}).length;g.hidden=!n;all("[data-group-count]",g).forEach(function(c){c.textContent=n;});});
ring(s);}
function set(f){history.replaceState(null,"",location.pathname+query(home?{kind:"",tags:f.tags,q:f.q}:f));apply(f);}
segs.forEach(function(g){g.addEventListener("click",function(e){if(e.button||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;var f=read(),k=g.dataset.kindSet;
if(home){if(k===f.kind)e.preventDefault();else g.search=query({kind:"",tags:f.tags,q:f.q});return;}
var cur=root.querySelector('[data-rows] > li > [aria-current="page"]'),own=cur&&cur.parentNode.dataset.kind;
if(k&&own&&own!==k){var p=new URLSearchParams(g.search);p.delete("tags");p.delete("q");if(f.tags.length)p.set("tags",f.tags.join(","));if(f.q)p.set("q",f.q);p=String(p);g.search=p&&"?"+p;return;}
e.preventDefault();f.kind=k;set(f);});});
boxes.forEach(function(b){b.addEventListener("change",function(){var f=read();f.tags=f.tags.filter(function(t){return t!==b.value;});if(b.checked)f.tags.push(b.value);set(f);});});
fields.forEach(function(i){i.addEventListener("input",function(){var f=read();f.q=i.value.trim();set(f);});});
var first=read();
if(home&&first.kind!==start){location.replace(route(first.kind)+query({kind:"",tags:first.tags,q:first.q}));return;}
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
