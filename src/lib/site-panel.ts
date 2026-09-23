/**
 * site-panel.ts — the /sites slide-over's behaviour (`SitePanel.astro` has
 * the markup, the styles and the reasoning for the pattern).
 *
 * Every tile and row is `a[data-site-open][data-slugs]`; every screen link in
 * a fetched entry is `a[data-site-screen]`. A plain left click on either is
 * taken over; anything with a modifier is the browser's.
 */
import { ownsKey } from "./keys";
import { enhanceSiteDetail } from "./site-detail";
import { tick } from "./ui-sound";

/** `/sites/<slug>` or `/sites/<slug>/`; the filter routes have two segments. */
const SLUG_PATH = /^\/sites\/([a-z0-9][a-z0-9-]*)\/?$/;

type Entry = { node: Element; title: string };

/** `checkVisibility` arrived in Safari 17.4; before it, a rendered box is the answer. */
const visible = (el: Element): boolean => el.checkVisibility?.() ?? el.getClientRects().length > 0;

export function initSitePanel(): void {
  const panel = document.querySelector<HTMLElement>("[data-site-panel]");
  const body = panel?.querySelector<HTMLElement>("[data-panel-body]");
  const closer = panel?.querySelector<HTMLButtonElement>("[data-panel-close]");
  if (panel && body && closer) wire(panel, body, closer);
}

function wire(panel: HTMLElement, body: HTMLElement, closer: HTMLButtonElement): void {
  const indexTitle = document.title;
  const cache = new Map<string, Promise<Entry | null>>();
  let current: string | null = null;
  let opener: HTMLElement | null = null;

  const slugOf = (href: string) => SLUG_PATH.exec(new URL(href, location.href).pathname)?.[1] ?? null;
  const isOpen = () => panel.hasAttribute("data-open");

  /** The visible tile or row that holds `slug`, for focus to come back to. */
  const triggerFor = (slug: string) =>
    [...document.querySelectorAll<HTMLElement>("[data-site-open]")].find(
      (el) => el.dataset.slugs?.split(" ").includes(slug) && visible(el),
    ) ?? null;

  function load(slug: string): Promise<Entry | null> {
    let entry = cache.get(slug);
    if (!entry) {
      entry = fetch(`/sites/${slug}`)
        .then((response) => (response.ok ? response.text() : Promise.reject(new Error(String(response.status)))))
        .then((html) => {
          const doc = new DOMParser().parseFromString(html, "text/html");
          const node = doc.querySelector("[data-site-detail]");
          return node ? { node, title: doc.title } : null;
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
    if (!entry) return location.replace(`/sites/${slug}`);

    const node = document.importNode(entry.node, true);
    // The page already has its h1 ("Sites"); in here the site is a section of it.
    const h1 = node.querySelector("[data-detail-title]");
    if (h1) {
      const h2 = document.createElement("h2");
      h2.className = h1.className;
      h2.id = "site-panel-title";
      h2.textContent = h1.textContent;
      h1.replaceWith(h2);
    }
    body.replaceChildren(node);
    body.removeAttribute("aria-busy");
    panel.scrollTop = 0;
    document.title = entry.title;
    enhanceSiteDetail(node);
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

  /* The open panel is one history entry, whichever site it shows, so Back and
     the close button both return to the gallery in one step. */
  function open(slug: string, trigger: HTMLElement | null) {
    if (slug === current) return;
    opener = trigger ?? opener;
    history[isOpen() ? "replaceState" : "pushState"]({ site: slug }, "", `/sites/${slug}`);
    void show(slug, true);
  }

  function close() {
    if (!isOpen()) return;
    // Our own entry: step back off it (popstate hides). Otherwise nothing to pop.
    if (history.state?.site) return history.back();
    history.replaceState(null, "", "/sites");
    hide();
  }

  const plainClick = (event: MouseEvent) =>
    event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

  document.addEventListener("click", (event) => {
    if (!plainClick(event) || !(event.target instanceof Element)) return;
    const target = event.target;

    const tile = target.closest<HTMLAnchorElement>("a[data-site-open]");
    const screen = target.closest<HTMLAnchorElement>("a[data-site-screen]");
    const link = tile ?? (screen && panel.contains(screen) ? screen : null);
    const slug = link && slugOf(link.href);
    if (link && slug) {
      event.preventDefault();
      if (tile) return open(slug, tile);
      // Another screen of the same site: one history entry for the site.
      history.replaceState({ site: slug }, "", `/sites/${slug}`);
      return void show(slug, true);
    }

    // The gallery's empty canvas closes; its controls and links do their own thing.
    if (isOpen() && !panel.contains(target) && target.closest("main") && !target.closest("a, button, summary, input, select, label")) {
      close();
    }
  });

  closer.addEventListener("click", close);

  document.addEventListener("keydown", (event) => {
    if (!isOpen() || !ownsKey(event)) return;
    // An open palette owns Escape (design.md §4, precedence), whichever
    // listener runs first: it took the key already, or it is still open.
    if (event.key === "Escape" && !document.querySelector('[aria-modal="true"][data-open]')) {
      event.preventDefault();
      close();
      return;
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
