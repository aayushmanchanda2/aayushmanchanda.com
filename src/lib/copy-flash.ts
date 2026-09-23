/**
 * Click to copy, with the confirmation where the eye already is.
 *
 * Shared by `PaletteRow.astro` and `SiteFoundations.astro`, which were going to
 * be two copies of the same handler. Markup contract, under a
 * `[data-copy-root]`:
 *
 * - `button[data-copy]` holds the value to copy. `data-copy-name` optionally
 *   names it for the announcement, when the value itself is too long to read
 *   out (a whole DESIGN.md).
 * - `[data-copy-label]` inside it is the text swapped for "copied" or "failed"
 *   for `FLASH_MS`, then put back. It is `aria-hidden`, so the control's name
 *   does not change mid-press.
 * - `[data-copy-status]`, one per root, is the `role="status"` line the
 *   result is announced through.
 */

/** How long a confirmation holds before the resting label comes back. */
export const FLASH_MS = 1200;

export function wireCopy(root: HTMLElement): void {
  // Two components on one page both call this over every root; once is enough.
  if (root.dataset.copyReady !== undefined) return;
  root.dataset.copyReady = "";

  const status = root.querySelector<HTMLElement>("[data-copy-status]");
  /**
   * One pending reset per button, so hammering two in a row cannot leave the
   * first one reading "copied" forever.
   */
  const timers = new WeakMap<HTMLButtonElement, number>();

  root.querySelectorAll<HTMLButtonElement>("button[data-copy]").forEach((button) => {
    const label = button.querySelector<HTMLElement>("[data-copy-label]");
    const value = button.dataset.copy;
    if (!label || value === undefined) return;
    const resting = label.textContent ?? "";
    const name = button.dataset.copyName ?? value;

    button.addEventListener("click", async () => {
      let copied = true;
      try {
        // Throws on its own in an insecure context, where `navigator.clipboard`
        // is not there to have a method — same catch either way.
        await navigator.clipboard.writeText(value);
      } catch {
        copied = false;
      }

      // A button that cannot copy is not hidden: it may be the only place the
      // value is written down, so it stays and says what happened instead.
      label.textContent = copied ? "copied" : "failed";
      if (status) status.textContent = copied ? `Copied ${name}` : `Could not copy ${name}`;

      window.clearTimeout(timers.get(button));
      timers.set(
        button,
        window.setTimeout(() => {
          label.textContent = resting;
          if (status) status.textContent = "";
          timers.delete(button);
        }, FLASH_MS),
      );
    });
  });
}

/** Wire every copy root on the page. */
export function wireAllCopy(): void {
  document.querySelectorAll<HTMLElement>("[data-copy-root]").forEach(wireCopy);
}
