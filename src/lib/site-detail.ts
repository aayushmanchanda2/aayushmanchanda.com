/**
 * site-detail.ts — the behaviour inside a /sites entry's content
 * (`SiteDetail.astro`): the shot's copy button, the design panel's copy rows
 * and its "Show all N". One entry point, because the content is wired twice:
 * once on the static page's load, and again each time the /sites panel
 * (`SitePanel.astro`) inserts a fetched entry.
 */
import { FLASH_MS, wireAllCopy } from "./copy-flash";
import { showAll } from "./show-all";

/** A failure is something to read, so it stays up longer. */
const FAIL_MS = 2400;

/**
 * Every piece the copy path needs, checked before the control is shown.
 *
 * `navigator.clipboard` is absent outside a secure context, `ClipboardItem`
 * is the part that lands last in any engine, and `createImageBitmap` is what
 * decodes the WebP on the way to the canvas.
 */
function canCopyImages(): boolean {
  return (
    typeof ClipboardItem === "function" &&
    typeof createImageBitmap === "function" &&
    typeof navigator.clipboard?.write === "function"
  );
}

/**
 * The shot, re-encoded as a PNG.
 *
 * The clipboard does not take WebP. Chrome and Safari both write a short
 * allow-list — text/plain, text/html, image/png — so handing `ClipboardItem`
 * the fetched file directly would fail on every browser rather than none, and
 * the button would be exactly the broken control it is not allowed to be.
 *
 * This can still fail on a very tall capture: shots run to 12,000px and every
 * engine caps canvas area (iOS Safari at ~16.7M pixels, which the tallest
 * shot in the gallery is over). That failure is caught by the caller and told
 * to the user, with Download sitting right beside it.
 */
async function pngFrom(src: string): Promise<Blob> {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`${src} responded ${response.status}`);

  const bitmap = await createImageBitmap(await response.blob());
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("no 2d context for the re-encode");
    context.drawImage(bitmap, 0, 0);

    const png = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!png) throw new Error("the canvas would not encode a PNG");
    return png;
  } finally {
    // A full-page capture is tens of megabytes decoded; do not wait for GC.
    bitmap.close();
  }
}

function initShotActions(root: HTMLElement) {
  const button = root.querySelector<HTMLButtonElement>("[data-shot-copy]");
  const flash = root.querySelector<HTMLElement>("[data-shot-flash]");
  const status = root.querySelector<HTMLElement>("[data-shot-status]");
  const src = button?.dataset.src;
  if (!button || !flash || !status || !src) return;

  // Left hidden otherwise. Download is still there and still works.
  if (!canCopyImages()) return;
  button.hidden = false;

  let timer = 0;

  /** `hold` of 0 leaves the state up until the next call replaces it. */
  const show = (label: string, spoken: string, hold: number) => {
    window.clearTimeout(timer);
    flash.textContent = label;
    button.setAttribute("data-flash", "");
    status.textContent = spoken;

    if (hold > 0) {
      timer = window.setTimeout(() => {
        button.removeAttribute("data-flash");
        flash.textContent = "";
        status.textContent = "";
      }, hold);
    }
  };

  button.addEventListener("click", () => {
    show("Copying", "Copying the screenshot", 0);

    /*
     * The blob goes in as a promise rather than being awaited first. Safari
     * ends the user-activation window at the first `await`, so awaiting the
     * re-encode and then writing would be a clipboard write with no gesture
     * behind it; a pending value inside `ClipboardItem` is the sanctioned way
     * to keep a slow encode inside the press that started it.
     */
    navigator.clipboard
      .write([new ClipboardItem({ "image/png": pngFrom(src) })])
      .then(() => show("Copied", "Screenshot copied", FLASH_MS))
      .catch(() =>
        show(
          "Failed",
          "Could not copy the screenshot. Use Download instead.",
          FAIL_MS,
        ),
      );
  });
}

/** Wire everything under `root`. Call once per inserted entry. */
export function enhanceSiteDetail(root: ParentNode): void {
  wireAllCopy();
  root.querySelectorAll<HTMLElement>("[data-shot-actions]").forEach(initShotActions);
  root.querySelectorAll<HTMLButtonElement>(".found [data-more]").forEach((button) => {
    showAll(button, button.parentElement?.querySelectorAll("[data-tail]") ?? []);
    button.hidden = false;
  });
}
