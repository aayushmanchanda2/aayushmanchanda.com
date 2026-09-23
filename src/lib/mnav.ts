/**
 * The MENU panel's open and close (`MobileNav.astro`, `MobileNavPanel.astro`):
 * the trigger, the scrim, inert on everything behind it, and Escape.
 */
import { ownsKey } from "./keys.ts";

export function initMobileNav(root: HTMLElement): void {
  const toggle = root.querySelector<HTMLButtonElement>("[data-mnav-toggle]");
  const panel = root.querySelector<HTMLElement>("[data-mnav-panel]");
  const scrim = root.querySelector<HTMLElement>("[data-mnav-scrim]");
  const close = root.querySelector<HTMLButtonElement>("[data-mnav-close]");
  if (!toggle || !panel || !scrim || !close) return;

  let open = false;

  // A const arrow rather than a function declaration, so the four non-null
  // narrowings the guard above just established still hold inside it. A
  // hoisted `function` is reachable from before the guard as far as
  // TypeScript is concerned, which is what used to force a `!` onto every
  // one of these lines.
  const setOpen = (next: boolean) => {
    if (next === open) return;
    open = next;

    toggle.setAttribute("aria-expanded", String(next));
    toggle.setAttribute("aria-label", next ? "Close menu" : "Open menu");
    document.documentElement.style.overflow = next ? "hidden" : "";

    /**
     * The panel is `aria-modal`, and `inert` is what makes that true for a
     * keyboard: without it, Tab walks off the last control in here and into
     * the page behind the scrim — focusable, invisible, pointer-dead. The
     * marked surfaces are the shell, the skip link, the bar's trail and
     * Search (`layouts/Base.astro`, `TopBar.astro`, `Breadcrumbs.astro`); the theme live region is
     * deliberately unmarked so the panel's own toggle still announces. The
     * trigger goes inert too — it sits under the scrim while the panel is
     * up — and comes back before focus returns to it below.
     */
    const inertables = Array.from(
      document.querySelectorAll<HTMLElement>("[data-mnav-inert]"),
    );

    if (next) {
      scrim.hidden = false;
      // one frame so the [hidden] -> display change lands before the
      // opacity transition starts
      requestAnimationFrame(() => scrim.setAttribute("data-open", ""));
      panel.setAttribute("data-open", "");
      close.focus({ preventScroll: true });
      for (const el of inertables) el.inert = true;
      toggle.inert = true;
    } else {
      for (const el of inertables) el.inert = false;
      toggle.inert = false;
      scrim.removeAttribute("data-open");
      panel.removeAttribute("data-open");
      toggle.focus({ preventScroll: true });
    }
  };

  // Keep the scrim out of the a11y/hit-test tree once it has faded out,
  // but never mid-transition (that would kill the fade).
  scrim.addEventListener("transitionend", (e) => {
    if (e.propertyName === "opacity" && !open) scrim.hidden = true;
  });

  toggle.addEventListener("click", () => setOpen(!open));
  close.addEventListener("click", () => setOpen(false));
  scrim.addEventListener("click", () => setOpen(false));

  // Close on item tap (matters for same-page links, where no navigation
  // would otherwise tear the panel down).
  root
    .querySelectorAll<HTMLAnchorElement>("[data-mnav-link]")
    .forEach((link) => link.addEventListener("click", () => setOpen(false)));

  /**
   * The search row hands over to the palette, and this panel gets out of the
   * way first — two stacked modals is a state neither of them should have to
   * reason about.
   *
   * This listener is on the button, so it runs in the target phase, before
   * the delegated `[data-palette-open]` listener that `lib/palette.ts` puts
   * on `document` sees the same click in the bubble phase. That ordering is
   * the DOM's, not a bundling accident: the panel is always closed by the
   * time the palette opens and takes focus.
   */
  root
    .querySelector<HTMLButtonElement>("[data-mnav-search]")
    ?.addEventListener("click", () => setOpen(false));

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !open || !ownsKey(e)) return;

    // An open palette owns Escape. Asked of the document rather than settled
    // by listener order, which is a bundling detail: the same reasoning the
    // /sites entry pages use for their own Escape handler. In practice the
    // two are never open together — the search row above closes this panel
    // on its way out — so this is the guard for the case where something
    // opens the palette while the panel is up without going through it.
    if (document.querySelector("[data-palette][data-open]")) return;

    e.preventDefault();
    setOpen(false);
  });
}
