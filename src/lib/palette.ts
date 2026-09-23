/**
 * The command palette's behaviour, separated from its markup.
 *
 * `components/CommandPalette.astro` owns the look and `lib/search.ts` the
 * ranking (import-free, so `node --test` covers it). This is the DOM half.
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
 *   - `lib/mnav.ts` bails on `[data-palette][data-open]` for the same
 *     reason, added alongside this.
 *   - The palette itself can never be open underneath the mobile panel,
 *     because the panel's search control closes the panel on its way in.
 */

import { ownsKey } from "./keys";
import { renderRows } from "./palette-rows";
import { RESULT_LIMIT, search, tokenize } from "./search";
import type { SearchEntry } from "./search";
import { toggleSound } from "./ui-sound";

export function initPalette(root: HTMLElement): void {
  const input = root.querySelector<HTMLInputElement>("[data-palette-input]");
  const results = root.querySelector<HTMLElement>("[data-palette-results]");
  const empty = root.querySelector<HTMLElement>("[data-palette-empty]");
  const scrim = root.querySelector<HTMLElement>("[data-palette-scrim]");
  const status = root.querySelector<HTMLElement>("[data-palette-status]");
  if (!input || !results || !empty || !scrim || !status) return;

  /**
   * The index, fetched on first open (`pages/search.json.ts`, VET-247). It
   * carries every post's full text, so it is one cached request for readers
   * who search rather than bytes inline on every page for all who do not.
   */
  let entries: SearchEntry[] | null = null;
  let loading: Promise<void> | null = null;
  const load = (): Promise<void> =>
    (loading ??= fetch("/search.json")
      .then((response) => (response.ok ? response.json() : Promise.reject(response.status)))
      .then((data: SearchEntry[]) => {
        entries = data;
        if (open) render(input.value);
      })
      .catch(() => {
        loading = null;
        empty.textContent = "Search didn't load. Close and try again.";
        empty.hidden = false;
        status.textContent = empty.textContent;
      }));

  /** Rows in the order the arrow keys walk them — always the DOM order. */
  let rows: HTMLAnchorElement[] = [];
  let active = 0;
  let open = false;
  /** What to hand focus back to on close. */
  let opener: HTMLElement | null = null;

  /* --- rendering --------------------------------------------------------- */

  // Const arrows, not `function`s: a hoisted function would lose the guard's
  // non-null narrowing (`lib/mnav.ts › setOpen` has the same note).
  const render = (query: string): void => {
    if (!entries) {
      status.textContent = "Loading search";
      return;
    }
    const hits = search(entries, query, RESULT_LIMIT);

    rows = renderRows(results, hits, tokenize(query));

    empty.textContent = "No matches";
    empty.hidden = hits.length > 0;
    results.hidden = hits.length === 0;
    input.setAttribute("aria-expanded", String(hits.length > 0));
    status.textContent = hits.length === 0 ? "No matches" : `${hits.length} ${hits.length === 1 ? "result" : "results"}`;

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
      void load();

      // Synchronously too: inside a rAF it lost the first character typed
      // straight after Cmd+K.
      input.focus({ preventScroll: true });
    } else {
      opener?.focus({ preventScroll: true });
      opener = null;
    }
  };

  /**
   * Follow a row, or run its command. `location.href`, not `row.click()`: the
   * close hides the subtree, and a synthetic click inside a hidden subtree does
   * not navigate. The href is read before the close for the same reason.
   */
  const go = (row: HTMLAnchorElement | undefined): void => {
    if (!row) return;
    if (row.dataset.paletteAction) {
      setOpen(false);
      toggleSound();
      return;
    }
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

  results.addEventListener("click", (event) => {
    const command = (event.target as HTMLElement).closest<HTMLAnchorElement>("[data-palette-action]");
    if (command) event.preventDefault();
    return command ? go(command) : setOpen(false);
  });
  scrim.addEventListener("click", () => setOpen(false));
  // The footer's sound toggle is for the pointer; keep focus in the field.
  root.querySelector("[data-sound-toggle]")?.addEventListener("pointerdown", (event) => event.preventDefault());

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
    if (!ownsKey(event)) return;

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
  // A pointer resting on a trigger, or focus landing on one, starts the index
  // fetch, so the palette opens with results rather than a wait.
  for (const type of ["pointerover", "focusin"]) {
    document.addEventListener(type, (event) => {
      if ((event.target as Element).closest?.("[data-palette-open]")) void load();
    });
  }

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
