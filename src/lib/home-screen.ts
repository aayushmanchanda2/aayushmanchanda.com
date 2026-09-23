/**
 * The /tools grid as a home screen (VET-253): the Dock's pick, jiggle mode, and
 * the app-open zoom. Markup and styles are `ToolGrid.astro` and `Dock.astro`.
 *
 * Jiggle is play, not editing: long-press an icon (500ms) or press `e` with
 * focus in the grid to start it, Escape or the Done pill to stop. Clicks still
 * open the tool.
 *
 * Opening an icon names it `app-open` and lets the browser navigate, so the
 * cross-document View Transition in `tools/[slug].astro` grows it into the
 * page. Every other navigation off /tools skips the transition in `pageswap`.
 * A browser without one gets a 160ms scale and fade, then the navigation.
 */

import { ownsKey } from "./keys.ts";
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

/**
 * What a key does to jiggle mode, or null when it is not ours. A bare letter
 * is only ours with focus in the grid (WCAG 2.1.4); Escape is ours anywhere.
 */
export function jiggleKey(event: KeyLike, on: boolean): "toggle" | "exit" | null {
  if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return null;
  const target = event.target as Element | null;
  if (target?.closest?.("input, select, textarea, [contenteditable]")) return null;
  if (event.key === "e" || event.key === "E") return target?.closest?.("[data-home]") ? "toggle" : null;
  return event.key === "Escape" && on ? "exit" : null;
}

/** The hint names the gesture the reader has. */
export const hintText = (finePointer: boolean): string => (finePointer ? "Press E" : "Long-press an icon");

/** How long the hint stays once the grid is showing. */
export const HINT_MS = 6000;

/* --- runtime ------------------------------------------------------------- */

export function initHomeScreen(): void {
  const home = document.querySelector<HTMLElement>("[data-home]");
  const done = home?.querySelector<HTMLButtonElement>("[data-jiggle-done]");
  const live = home?.querySelector<HTMLElement>("[data-jiggle-live]");
  const hint = document.querySelector<HTMLElement>("[data-jiggle-hint]");
  if (!home || !done || !live || !hint) return;

  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const icons = () => home.querySelectorAll<HTMLElement>(".app-icon");
  const jiggling = () => home.hasAttribute("data-jiggle");

  try {
    hint.hidden = localStorage.getItem(HINT_KEY) === "seen";
  } catch {
    hint.hidden = false;
  }
  hint.textContent = hintText(matchMedia("(pointer: fine)").matches);
  // Six seconds from when the grid first shows, not from page load: list is the default view.
  let expiry = 0;
  const arm = () => {
    if (expiry || hint.hidden || document.documentElement.getAttribute("data-tools-view") !== "grid") return;
    expiry = window.setTimeout(() => (hint.hidden = true), HINT_MS);
  };
  new MutationObserver(arm).observe(document.documentElement, { attributes: true, attributeFilter: ["data-tools-view"] });
  arm();

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

  /* Long-press: a still pointer on an icon for 500ms. The click that ends it is
     swallowed, so letting go does not open the tool. A press that ends with no
     click (touch, a drag) must not leave the flag set for the next Enter. */
  let timer = 0;
  let from = { x: 0, y: 0 };
  let pending = false;
  let swallow = false;
  const cancel = () => {
    clearTimeout(timer);
    pending = false;
  };

  // Only in grid view, and an open palette or panel keeps its keys (design.md §4).
  document.addEventListener("keydown", (event) => {
    swallow = false;
    if (!ownsKey(event)) return;
    if (document.documentElement.getAttribute("data-tools-view") !== "grid") return;
    if (document.querySelector('[aria-modal="true"][data-open]')) return;
    const action = jiggleKey(event, jiggling());
    if (!action) return;
    event.preventDefault();
    setJiggle(action === "toggle" && !jiggling());
  });

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
  // Cleared a beat after the release: long enough for the click it makes (touch
  // synthesizes one late) to be swallowed, short enough that a screen reader's
  // later activation, which brings no pointerdown or keydown, is not.
  home.addEventListener("pointerup", () => {
    if (swallow) setTimeout(() => (swallow = false), 300);
  });
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
