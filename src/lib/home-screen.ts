/**
 * The /tools grid as a home screen (VET-253): the Dock's pick, jiggle mode, and
 * the app-open zoom. Markup and styles are `ToolGrid.astro` and `Dock.astro`.
 *
 * Jiggle is play, not editing: long-press an icon (500ms) or press `e` to
 * start it, Escape or the Done pill to stop. Clicks still open the tool.
 *
 * Opening an icon names it `app-open` and lets the browser navigate, so the
 * cross-document View Transition in `tools/[slug].astro` grows it into the
 * page. Every other navigation off /tools skips the transition in `pageswap`.
 * A browser without one gets a 160ms scale and fade, then the navigation.
 */

import { tick } from "./ui-sound.ts";

export const DOCK_CAP = 8;
export const LONG_PRESS_MS = 500;
/** The hint's localStorage key, written on the first jiggle. /privacy names it. */
export const HINT_KEY = "tools-jiggle-hint";

/** The Dock: the tools marked "using", newest verdict first, at most eight. */
export const dockTools = <T extends { verdict: string; status_date: string }>(
  tools: readonly T[],
  cap = DOCK_CAP,
): T[] =>
  tools
    .filter((tool) => tool.verdict === "using")
    .sort((a, b) => b.status_date.localeCompare(a.status_date))
    .slice(0, cap);

interface KeyLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  repeat: boolean;
  target: EventTarget | null;
}

/** What a key does to jiggle mode, or null when it is not ours. */
export function jiggleKey(event: KeyLike, on: boolean): "toggle" | "exit" | null {
  if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return null;
  const typing = (event.target as Element | null)?.closest?.("input, select, textarea, [contenteditable]");
  if (typing) return null;
  if (event.key === "e" || event.key === "E") return "toggle";
  return event.key === "Escape" && on ? "exit" : null;
}

/* --- runtime ------------------------------------------------------------- */

export function initHomeScreen(): void {
  const home = document.querySelector<HTMLElement>("[data-home]");
  const done = home?.querySelector<HTMLButtonElement>("[data-jiggle-done]");
  const live = home?.querySelector<HTMLElement>("[data-jiggle-live]");
  const hint = home?.querySelector<HTMLElement>("[data-jiggle-hint]");
  if (!home || !done || !live || !hint) return;

  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const icons = () => home.querySelectorAll<HTMLElement>(".app-icon");
  const jiggling = () => home.hasAttribute("data-jiggle");

  try {
    hint.hidden = localStorage.getItem(HINT_KEY) === "seen";
  } catch {
    hint.hidden = false;
  }

  const setJiggle = (on: boolean) => {
    if (on === jiggling()) return;
    home.toggleAttribute("data-jiggle", on);
    done.hidden = !on;
    live.textContent = `Jiggle mode ${on ? "on" : "off"}`;
    if (!on) return;
    hint.hidden = true;
    try {
      localStorage.setItem(HINT_KEY, "seen");
    } catch {
      /* blocked: the hint comes back next visit */
    }
  };

  done.addEventListener("click", () => {
    setJiggle(false);
    home.querySelector<HTMLElement>(".tile:not([hidden]) a")?.focus();
  });

  // Only in grid view, and an open palette or panel keeps its keys (design.md §4).
  document.addEventListener("keydown", (event) => {
    if (document.documentElement.getAttribute("data-tools-view") !== "grid") return;
    if (document.querySelector('[aria-modal="true"][data-open]')) return;
    const action = jiggleKey(event, jiggling());
    if (!action) return;
    event.preventDefault();
    setJiggle(action === "toggle" && !jiggling());
  });

  /* Long-press: a still pointer on an icon for 500ms. The click that ends it is
     swallowed, so letting go does not open the tool. */
  let timer = 0;
  let from = { x: 0, y: 0 };
  let pending = false;
  let swallow = false;
  const cancel = () => {
    clearTimeout(timer);
    pending = false;
  };

  home.addEventListener("pointerdown", (event) => {
    swallow = false;
    cancel();
    if (event.button !== 0 || !(event.target as Element).closest("a")) return;
    from = { x: event.clientX, y: event.clientY };
    pending = true;
    timer = window.setTimeout(() => {
      pending = false;
      swallow = true;
      setJiggle(!jiggling());
    }, LONG_PRESS_MS);
  });
  home.addEventListener("pointermove", (event) => {
    if (Math.hypot(event.clientX - from.x, event.clientY - from.y) > 8) cancel();
  });
  for (const type of ["pointerup", "pointercancel", "dragstart"]) home.addEventListener(type, cancel);
  // A touch long-press would open the link menu instead. A right-click never
  // starts a press, so its menu stays.
  home.addEventListener("contextmenu", (event) => {
    if (pending || swallow) event.preventDefault();
  });

  let opening = false;
  home.addEventListener("click", (event) => {
    const link = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
    if (!link) return;
    if (swallow) {
      swallow = false;
      event.preventDefault();
      return;
    }
    const icon = link.querySelector<HTMLElement>(".app-icon");
    const modified = event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
    if (!icon || modified || event.defaultPrevented || reduced.matches) return;

    tick({ rate: 0.9 });
    for (const other of icons()) other.style.viewTransitionName = "";
    if ("onpageswap" in window) {
      icon.style.viewTransitionName = "app-open";
      opening = true;
      return;
    }
    event.preventDefault();
    icon.classList.add("is-opening");
    setTimeout(() => location.assign(link.href), 160);
  });

  window.addEventListener("pageswap", (event) => {
    if (!opening) event.viewTransition?.skipTransition();
  });
  // Back from the tool page (bfcache): the icon is an icon again.
  window.addEventListener("pageshow", () => {
    opening = false;
    for (const icon of icons()) {
      icon.style.viewTransitionName = "";
      icon.classList.remove("is-opening");
    }
  });
}
