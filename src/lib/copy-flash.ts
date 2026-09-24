/**
 * Click to copy, with the confirmation where the eye already is.
 *
 * Shared by `PaletteRow.astro`, `SiteFoundations.astro` and `EntryBlock.astro`
 * (the ⌘K palette's "Copy link" calls `copyText` directly). Markup contract,
 * under a `[data-copy-root]`:
 *
 * - `button[data-copy]` holds the value to copy. `data-copy-name` optionally
 *   names it for the announcement, when the value itself is too long to read
 *   out (a whole DESIGN.md). `data-copy-select` optionally names the element
 *   (a selector inside the root) that shows the value, for the last fallback.
 * - `[data-copy-label]` inside it is the text swapped for "copied" or "Press ⌘C"
 *   for a moment, then put back. It is `aria-hidden`, so the control's name
 *   does not change mid-press.
 * - `[data-copy-status]`, one per root, is the `role="status"` line the
 *   result is announced through.
 */

/** How long "copied" holds before the resting label comes back. */
export const FLASH_MS = 1200;
/** "Press ⌘C" holds longer: the reader has a key to press. */
export const HOLD_MS = 4000;

/** How the value got out: on the clipboard, selected on the page for ⌘C, or neither. */
export type CopyResult = "copied" | "selected" | "none";

interface CopyEnv {
  clipboard?: Pick<Clipboard, "writeText">;
  doc: Document;
}

/**
 * Copy `value`, trying three ways in order, all inside the click that asked:
 *
 * 1. `navigator.clipboard.writeText`. It rejects when the browser denies the
 *    clipboard-write permission (a blocked site setting, an embedded webview,
 *    an unfocused document) and is missing outside a secure context.
 * 2. A hidden textarea and `execCommand("copy")`, which needs only the click.
 *    The textarea goes inside `host`, so a modal's inert outside cannot stop it.
 * 3. Select `target` in place, so ⌘C copies it.
 */
export async function copyText(
  value: string,
  host: HTMLElement,
  target?: Element | null,
  env: CopyEnv = { clipboard: globalThis.navigator?.clipboard, doc: document },
): Promise<CopyResult> {
  const { clipboard, doc } = env;
  try {
    if (!clipboard) throw new Error("no clipboard");
    await clipboard.writeText(value);
    return "copied";
  } catch {
    // fall through to the next way
  }

  const before = doc.activeElement as HTMLElement | null;
  const area = doc.createElement("textarea");
  area.value = value;
  area.setAttribute("readonly", "");
  area.setAttribute("aria-hidden", "true");
  // 16px so iOS does not zoom to it; fixed and transparent so nothing moves.
  area.style.cssText = "position:fixed;inset:0 auto auto 0;width:1px;height:1px;opacity:0;font-size:16px";
  host.append(area);
  area.select();
  let copied = false;
  try {
    // Deprecated in the spec and still the one copy every browser runs without a permission.
    copied = (doc as unknown as { execCommand(command: "copy"): boolean }).execCommand("copy");
  } catch {
    copied = false;
  }
  area.remove();
  before?.focus?.({ preventScroll: true });
  if (copied) return "copied";

  const selection = doc.getSelection();
  if (!target || !selection) return "none";
  const range = doc.createRange();
  range.selectNodeContents(target);
  selection.removeAllRanges();
  selection.addRange(range);
  return "selected";
}

/** "⌘C" on Apple keyboards, "Ctrl+C" everywhere else. */
export function copyKeys(platform = globalThis.navigator?.platform ?? ""): string {
  return /Mac|iPhone|iPad|iPod/.test(platform) ? "⌘C" : "Ctrl+C";
}

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
    const selector = button.dataset.copySelect;
    // A label that shows the value itself (a hex, a token) is its own target.
    const target = selector ? root.querySelector(selector) : resting.trim() === value ? label : null;

    button.addEventListener("click", async () => {
      const result = await copyText(value, button.parentElement ?? root, target);
      const keys = `Press ${copyKeys()}`;

      // A button that cannot copy is not hidden: it may be the only place the
      // value is written down, so it stays and says what to do instead.
      if (result === "copied") {
        label.textContent = "copied";
        if (status) status.textContent = `Copied ${name}`;
      } else if (result === "selected") {
        if (target !== label) label.textContent = keys;
        if (status) status.textContent = `${keys} to copy ${name}, it's selected`;
      } else {
        label.textContent = "can't copy";
        if (status) status.textContent = `This browser blocked copying ${name}`;
      }

      window.clearTimeout(timers.get(button));
      timers.set(
        button,
        window.setTimeout(
          () => {
            label.textContent = resting;
            if (status) status.textContent = "";
            timers.delete(button);
          },
          result === "copied" ? FLASH_MS : HOLD_MS,
        ),
      );
    });
  });
}

/** Wire every copy root on the page. */
export function wireAllCopy(): void {
  document.querySelectorAll<HTMLElement>("[data-copy-root]").forEach(wireCopy);
}
