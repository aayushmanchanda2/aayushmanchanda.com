/**
 * detail-panel.ts — the slide-over detail on /sites and /tools
 * (`DetailPanel.astro` has the markup, the styles and the reasoning).
 *
 * The panel is `[data-detail-panel="<base>"]` ("/sites", "/tools"). Every tile
 * and row that opens it is `a[data-panel-open]`, with `data-slugs` when one
 * card stands for several entries (a site saved as three screens). A plain
 * left click on one is taken over, and so is a link inside the panel to
 * another entry of the section. Anything with a modifier is the browser's.
 */
import { inField, ownsKey } from "./keys.ts";
import { tick } from "./ui-sound.ts";

type Entry = { node: Element; title: string };

/**
 * Where the panel is off (VET-279): a phone opens the entry's own page. As a
 * fixed scroll box over a scrollable list, a touch scroll chained into the
 * list behind (iOS moves the page's scrollbar and leaves the panel's shot at
 * its first screen), and iOS's collapsing toolbar resized the box and showed
 * the list through the gap. The page itself scrolls natively. `DetailPanel.astro`'s
 * phone breakpoint is the same query.
 */
export const PANEL_OFF = "(max-width: 48rem)";

/** `checkVisibility` arrived in Safari 17.4; before it, a rendered box is the answer. */
const visible = (el: Element): boolean => el.checkVisibility?.() ?? el.getClientRects().length > 0;

/** On screen, or hidden only by a filter: its item is `[hidden]` inside a list that shows. */
const inView = (el: Element): boolean => {
  const item = el.closest("[hidden]");
  return visible(el) || (item?.parentElement != null && visible(item.parentElement));
};

/**
 * The index `dir` steps to from `from`: the next shown entry, wrapping, or -1
 * when no other shows. `from` itself may be hidden, because the open entry
 * keeps its place in the order after a filter hides it.
 */
export function step(shown: readonly boolean[], from: number, dir: 1 | -1): number {
  const n = shown.length;
  for (let i = 1; i < n; i++) {
    const at = (((from + dir * i) % n) + n) % n;
    if (shown[at]) return at;
  }
  return -1;
}

/** `enhance` wires a freshly inserted entry, as the static page's own load does. */
export function initDetailPanel(enhance?: (node: Element) => void): void {
  const panel = document.querySelector<HTMLElement>("[data-detail-panel]");
  const body = panel?.querySelector<HTMLElement>("[data-panel-body]");
  const closer = panel?.querySelector<HTMLButtonElement>("[data-panel-close]");
  const base = panel?.dataset.detailPanel;
  if (panel && body && closer && base) wire(panel, body, closer, base, enhance);
}

function wire(
  panel: HTMLElement,
  body: HTMLElement,
  closer: HTMLButtonElement,
  base: string,
  enhance?: (node: Element) => void,
): void {
  /** `<base>/<slug>` or `<base>/<slug>/`; the filter routes have two segments. */
  const slugPath = new RegExp(`^${base}/([a-z0-9][a-z0-9-]*)/?$`);
  const indexTitle = document.title;
  const cache = new Map<string, Promise<Entry | null>>();
  let current: string | null = null;
  let opener: HTMLElement | null = null;

  const slugOf = (href: string) => slugPath.exec(new URL(href, location.href).pathname)?.[1] ?? null;
  const isOpen = () => panel.hasAttribute("data-open");
  const triggers = () => [...document.querySelectorAll<HTMLAnchorElement>("a[data-panel-open]")];
  const holds = (el: HTMLAnchorElement, slug: string | null) =>
    slug !== null && (el.dataset.slugs?.split(" ") ?? [slugOf(el.href)]).includes(slug);
  /** Filters live in the query, so the panel's URL carries them along. */
  const urlFor = (slug: string | null) => `${slug ? `${base}/${slug}` : base}${location.search}`;

  /** The visible tile or row that holds `slug`, for focus to come back to. */
  const triggerFor = (slug: string) => triggers().find((el) => holds(el, slug) && visible(el)) ?? null;

  /** ← and →: the entry beside the open one, in the order the view on screen shows. */
  function neighbour(dir: 1 | -1): string | null {
    const ring = triggers().filter(inView);
    const from = ring.findIndex((el) => holds(el, current));
    const to = from < 0 ? -1 : step(ring.map(visible), from, dir);
    return to < 0 ? null : slugOf(ring[to].href);
  }

  function load(slug: string): Promise<Entry | null> {
    let entry = cache.get(slug);
    if (!entry) {
      entry = fetch(`${base}/${slug}`)
        .then((response) => (response.ok ? response.text() : Promise.reject(new Error(String(response.status)))))
        .then((html) => {
          const doc = new DOMParser().parseFromString(html, "text/html");
          const node = doc.querySelector("[data-detail]");
          // Adopt the fragment and let the parsed page go: the cache holds
          // one article per entry, not a whole Document per entry.
          return node ? { node: document.importNode(node, true), title: doc.title } : null;
        })
        .catch(() => null);
      entry.then((value) => value ?? cache.delete(slug));
      cache.set(slug, entry);
    }
    return entry;
  }

  async function show(slug: string, focus: boolean) {
    if (!isOpen()) tick({ rate: 0.85 });
    current = slug;
    panel.removeAttribute("inert");
    panel.setAttribute("data-open", "");
    body.setAttribute("aria-busy", "true");

    const entry = await load(slug);
    if (current !== slug) return;
    // No entry means the fetch failed: the static page is the fallback, in
    // place of the entry already pushed, so Back does not land on it twice.
    if (!entry) return location.replace(`${base}/${slug}`);

    const node = entry.node.cloneNode(true) as Element;
    // The page already has its h1 ("Sites"); in here the entry is a section of it.
    const h1 = node.querySelector("[data-detail-title]");
    if (h1) {
      const h2 = document.createElement("h2");
      h2.className = h1.className;
      h2.id = "detail-panel-title";
      h2.textContent = h1.textContent;
      h1.replaceWith(h2);
    }
    body.replaceChildren(node);
    body.removeAttribute("aria-busy");
    panel.scrollTop = 0;
    document.title = entry.title;
    enhance?.(node);
    if (focus) panel.focus({ preventScroll: true });
  }

  function hide() {
    if (!isOpen()) return;
    tick({ rate: 1.15 });
    const back = current ? triggerFor(current) : null;
    current = null;
    panel.removeAttribute("data-open");
    panel.setAttribute("inert", "");
    document.title = indexTitle;
    (opener?.isConnected && visible(opener) ? opener : back)?.focus({ preventScroll: true });
    opener = null;
  }

  /* The open panel is one history entry, whichever entry it shows, so Back and
     the close button both return to the index in one step. A switch keeps the
     entry's state: after a filter pushed while open (state null), the entry
     under this one is no longer the index as the reader left it. */
  function open(slug: string, trigger: HTMLElement | null) {
    if (slug === current) return;
    opener = trigger;
    if (isOpen()) history.replaceState(history.state, "", urlFor(slug));
    else history.pushState({ panel: true }, "", urlFor(slug));
    void show(slug, true);
  }

  function close() {
    if (!isOpen()) return;
    // Our own entry: step back off it (popstate hides). Otherwise nothing to pop.
    if (history.state?.panel) return history.back();
    history.replaceState(null, "", urlFor(null));
    hide();
  }

  const plainClick = (event: MouseEvent) =>
    event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || !plainClick(event) || !(event.target instanceof Element)) return;
    const target = event.target;

    const tile = target.closest<HTMLAnchorElement>("a[data-panel-open]");
    const inner = target.closest<HTMLAnchorElement>("a[href]");
    const link = tile ?? (inner && panel.contains(inner) ? inner : null);
    const slug = link && slugOf(link.href);
    if (link && slug) {
      if (!isOpen() && matchMedia(PANEL_OFF).matches) return;
      event.preventDefault();
      return open(slug, tile ?? opener);
    }

    // The index's empty canvas closes; its controls and links do their own thing.
    if (isOpen() && !panel.contains(target) && target.closest("main") && !target.closest("a, button, summary, input, select, label")) {
      close();
    }
  });

  closer.addEventListener("click", close);

  document.addEventListener("keydown", (event) => {
    // A select or a text field keeps its keys, even Escape.
    if (!isOpen() || !ownsKey(event) || inField(event)) return;
    // An open palette or menu owns its keys (design.md §4, precedence),
    // whichever listener runs first: it took the key already, or it is open.
    if (document.querySelector('[aria-modal="true"][data-open]')) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    const dir = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    // A modifier asks the browser (Cmd+← is Back); a held key would fetch per repeat.
    if (dir && !event.repeat && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
      const slug = neighbour(dir);
      if (!slug) return;
      event.preventDefault();
      return open(slug, null);
    }
    // Tab wraps inside the panel while focus is in it.
    if (event.key !== "Tab" || !panel.contains(document.activeElement)) return;
    const focusable = [...panel.querySelectorAll<HTMLElement>("a[href], button:not([hidden]), summary, [tabindex='0']")].filter(visible);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === panel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  });

  addEventListener("popstate", () => {
    const slug = slugOf(location.href);
    if (slug) {
      opener = triggerFor(slug);
      void show(slug, true);
    } else hide();
  });
}
