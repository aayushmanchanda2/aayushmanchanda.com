/**
 * The command palette's behaviour, separated from its markup.
 *
 * `components/CommandPalette.astro` owns what the thing looks like; this owns
 * what it does. The split is about size — the two together are past the point
 * where either reads well — and about the fact that this half is ordinary DOM
 * code that benefits from being read as a unit rather than as the tail of a
 * `.astro` file.
 *
 * The ranking is not here either. It is in `lib/search.ts`, which has no
 * imports so it can be tested under `node --test`; this module is the part that
 * cannot be, because it is all document.
 *
 * ---------------------------------------------------------------------------
 * Precedence, which is the only genuinely subtle thing in this file
 * ---------------------------------------------------------------------------
 * Three surfaces listen for keys on `document`: this palette, the mobile nav
 * panel, and the prev/next/close keys on a /sites entry page. The order two
 * document-level listeners run in is a bundling detail, not a guarantee, so
 * none of them may depend on running first.
 *
 * The rule is: an open palette wins, and every other surface asks the document
 * whether one is open rather than trusting order.
 *
 *   - /sites entry pages already bail on `[aria-modal="true"][data-open]`,
 *     which this palette matches when open. That code needed no change.
 *   - `MobileNav.astro` bails on `[data-palette][data-open]` for the same
 *     reason, added alongside this.
 *   - The palette itself can never be open underneath the mobile panel,
 *     because the panel's search control closes the panel on its way in.
 */

import { renderGroups } from "./palette-rows";
import { RESULT_LIMIT, flatten, search } from "./search";
import type { SearchEntry } from "./search";

export function initPalette(root: HTMLElement): void {
  const input = root.querySelector<HTMLInputElement>("[data-palette-input]");
  const results = root.querySelector<HTMLElement>("[data-palette-results]");
  const empty = root.querySelector<HTMLElement>("[data-palette-empty]");
  const scrim = root.querySelector<HTMLElement>("[data-palette-scrim]");
  const data = document.querySelector<HTMLElement>("[data-palette-index]");
  if (!input || !results || !empty || !scrim || !data) return;

  let entries: SearchEntry[] = [];
  try {
    entries = JSON.parse(data.textContent ?? "[]") as SearchEntry[];
  } catch {
    // A malformed index is a build bug, but it must not take the page's other
    // scripts down with it. The palette simply never opens.
    return;
  }

  /** Rows in the order the arrow keys walk them — always the DOM order. */
  let rows: HTMLAnchorElement[] = [];
  let active = 0;
  let open = false;
  /** What to hand focus back to on close. */
  let opener: HTMLElement | null = null;

  /* --- rendering --------------------------------------------------------- */

  /**
   * Every closure below is a const arrow rather than a `function` declaration,
   * and that is load-bearing rather than a style choice: a hoisted function is
   * reachable from above the guard as far as TypeScript is concerned, so the
   * five non-null narrowings that guard just established would not hold inside
   * it, and every line touching `input`, `results` or `empty` would need a `!`.
   * `MobileNav.astro` documents the same trap in its own `setOpen`.
   */
  const render = (query: string): void => {
    const groups = search(entries, query, RESULT_LIMIT);
    const hits = flatten(groups);

    rows = renderGroups(results, groups);

    empty.hidden = hits.length > 0;
    results.hidden = hits.length === 0;

    setActive(0);
  };

  /* --- the virtual cursor ------------------------------------------------ */

  /**
   * Move the highlight, and tell the field about it.
   *
   * `aria-activedescendant` is what makes this readable to a screen reader: DOM
   * focus never leaves the input, so the field has to name the row that is
   * currently selected or the highlight is a purely visual effect.
   */
  const setActive = (next: number): void => {
    if (rows.length === 0) {
      active = 0;
      input.removeAttribute("aria-activedescendant");
      return;
    }

    // Wrap, so holding Down walks off the bottom and back to the top.
    active = (next + rows.length) % rows.length;

    rows.forEach((row, i) => {
      const on = i === active;
      row.toggleAttribute("data-active", on);
      row.setAttribute("aria-selected", String(on));
      if (on) {
        row.id = `palette-row-${i}`;
        input.setAttribute("aria-activedescendant", row.id);
        row.scrollIntoView({ block: "nearest" });
      }
    });
  };

  /* --- open / close ------------------------------------------------------ */

  /**
   * `trigger` is the control that asked for this, when there was one.
   *
   * Passed in rather than read back off `document.activeElement`, because a
   * button is not reliably focused by the click that activates it — Safari on
   * macOS notably does not focus one — and the whole point of remembering the
   * opener is to hand focus back to it on close. Reading `activeElement` sent
   * focus to `<body>` for anyone opening the palette from the footer in that
   * browser. The keyboard shortcut passes nothing and falls back to whatever
   * was focused, which for a shortcut is the right answer.
   */
  const setOpen = (next: boolean, trigger?: HTMLElement | null): void => {
    if (next === open) return;
    open = next;

    /**
     * Synchronously, because the two surfaces in the header's precedence note
     * read this attribute to decide who owns a key. Setting it a frame late
     * would leave a window where the palette is up but the document still says
     * it is not, and both of them would act on the same Escape.
     *
     * It is also why `styles/palette.css` hides the palette with `visibility`
     * rather than `display`: visibility can be transitioned, so the animations
     * still play off this one synchronous attribute.
     */
    root.toggleAttribute("data-open", next);

    // Locked while open, the same way the mobile panel does it. The two are
    // never open at once, so neither can strand the other's lock.
    document.documentElement.style.overflow = next ? "hidden" : "";

    if (next) {
      opener =
        trigger ??
        (document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null);
      input.value = "";
      render("");

      /**
       * Focus lands synchronously too.
       *
       * It sat inside a `requestAnimationFrame` first, which loses whatever the
       * reader typed in the frame between Cmd+K and the field becoming ready —
       * and typing straight after the shortcut is the normal way to use a
       * palette, not an edge case. It cost the first character every time.
       */
      input.focus({ preventScroll: true });
    } else {
      opener?.focus({ preventScroll: true });
      opener = null;
    }
  };

  /**
   * Follow a row.
   *
   * Assigning `location.href` rather than synthesising `row.click()`. The click
   * was the first attempt and it silently did nothing: `setOpen(false)` puts
   * `hidden` on the palette root on its way out, and a synthetic click on an
   * anchor inside a subtree that is no longer rendered does not navigate. The
   * href is read first here, so the close cannot affect it — and this is the
   * same one-liner the /sites entry pages already use for their arrow keys.
   */
  const go = (row: HTMLAnchorElement | undefined): void => {
    if (!row) return;
    const href = row.href;
    setOpen(false);
    window.location.href = href;
  };

  /* --- wiring ------------------------------------------------------------ */

  input.addEventListener("input", () => render(input.value));

  input.addEventListener("keydown", (event) => {
    if (event.isComposing) return;

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive(active + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive(active - 1);
        break;
      case "Home":
        event.preventDefault();
        setActive(0);
        break;
      case "End":
        event.preventDefault();
        setActive(rows.length - 1);
        break;
      case "Enter":
        event.preventDefault();
        go(rows[active]);
        break;
      case "Tab":
        // The field is the only focusable control in here, so there is nowhere
        // for Tab to go. Swallowing it is the whole focus trap.
        event.preventDefault();
        break;
    }
  });

  // Pointer users get the same rows. `mousemove` rather than `mouseenter` so
  // the highlight follows the cursor the way a native menu does.
  results.addEventListener("mousemove", (event) => {
    const row = (event.target as HTMLElement).closest<HTMLAnchorElement>(
      "[data-palette-row]",
    );
    if (row) setActive(rows.indexOf(row));
  });

  results.addEventListener("click", () => setOpen(false));
  scrim.addEventListener("click", () => setOpen(false));

  /**
   * Focus that escapes while the palette is open gets pulled back.
   *
   * Belt to Tab's braces: a click on the scrim, or a browser control handing
   * focus somewhere odd, would otherwise leave a modal dialog open with focus
   * behind it.
   */
  root.addEventListener("focusout", (event) => {
    if (!open) return;
    const next = event.relatedTarget;
    if (next instanceof Node && root.contains(next)) return;
    input.focus({ preventScroll: true });
  });

  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.isComposing) return;

    // Cmd+K / Ctrl+K toggles, from anywhere on the page.
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      setOpen(!open);
      return;
    }

    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
    }
  });

  // Any control that wants to open the palette says so in markup — the footer
  // hint and the mobile panel's search row both carry the attribute — so this
  // file never needs to know where the triggers are.
  document.addEventListener("click", (event) => {
    const trigger = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-palette-open]",
    );
    if (!trigger) return;
    event.preventDefault();
    setOpen(true, trigger);
  });

  correctKeyCap();
}

/**
 * The footer advertises ⌘K, which is wrong on most of the world's keyboards.
 *
 * Rendered as the Mac glyph and corrected here rather than the other way round:
 * the markup has to pick one, and a hint that is wrong for a moment on Windows
 * is better than one that is wrong for a moment on the platform the site is
 * written on. `platform` is deprecated but still the most direct answer, and
 * the user-agent string is the fallback for browsers that have dropped it.
 */
function correctKeyCap(): void {
  const mac = /mac/i.test(navigator.platform || navigator.userAgent);
  if (mac) return;

  for (const hint of document.querySelectorAll<HTMLElement>(
    "[data-palette-hint]",
  )) {
    hint.textContent = "Ctrl K";
  }
}
