/**
 * preview-card.ts — the hover card on /tools rows and tiles and /sites cards.
 *
 * briOS's `PreviewCard.tsx`, in vanilla: hover shows the outside site, a click
 * still goes to our own page. One card node for the whole page, built on first
 * use. A trigger is any element with `data-preview` (the image path, "" for
 * none) and the `data-preview-*` words `previewAttributes` writes.
 *
 * Timing is briOS's: opens 300ms after the pointer arrives, closes 100ms after
 * it leaves, and while one card is open the next trigger swaps in at once.
 * Keyboard focus opens it the same way; Escape, blur, a press or a scroll close
 * it. Only a fine pointer that can hover ever sees one: on touch nothing runs.
 *
 * The card is `aria-hidden`: every word on it is already in the row, so a
 * screen reader would hear the row twice.
 *
 * Placement is script, not CSS anchor positioning, because Firefox's is still
 * partial: below the trigger, flipped above when it would cross the viewport
 * floor, shifted to stay 20px inside the sides, and centred on the cursor's x
 * as it moves along a row (briOS's `trackCursorAxis="x"`).
 */

export interface Preview {
  /** Web path of the picture, or null for the icon-only card. */
  image: string | null;
  name: string;
  domain: string;
  description?: string | null | undefined;
  note?: string | null | undefined;
}

/** The trigger's attributes. The note is dropped when it repeats the description. */
export function previewAttributes(preview: Preview): Record<string, string> {
  const attributes: Record<string, string> = {
    "data-preview": preview.image ?? "",
    "data-preview-name": preview.name,
    "data-preview-domain": preview.domain,
  };
  if (preview.description) attributes["data-preview-description"] = preview.description;
  if (preview.note && preview.note !== preview.description) attributes["data-preview-note"] = preview.note;
  return attributes;
}

export const OPEN_MS = 300;
export const CLOSE_MS = 100;
const OFFSET = 8;
const PAD = 20;

type Rect = { top: number; bottom: number; left: number; width: number };

/**
 * Where the card goes: below `trigger` unless it would cross the floor and
 * fits above, centred on `x` (or the trigger's centre), kept `PAD` inside.
 */
export function placeCard(
  trigger: Rect,
  card: { width: number; height: number },
  viewport: { width: number; height: number },
  x: number | null,
): { left: number; top: number; side: "top" | "bottom" } {
  const centre = x ?? trigger.left + trigger.width / 2;
  const left = Math.max(PAD, Math.min(centre - card.width / 2, viewport.width - PAD - card.width));
  const below = trigger.bottom + OFFSET;
  const above = trigger.top - OFFSET - card.height;
  const flip = below + card.height > viewport.height - PAD && above >= PAD;
  return { left, top: flip ? above : below, side: flip ? "top" : "bottom" };
}

const CARD_HTML = `<div class="preview-card__image"><img alt="" decoding="async"></div>
<div class="preview-card__foot"><span class="preview-card__icon"></span><span class="preview-card__text">
<span class="preview-card__domain"></span><span class="preview-card__name"></span>
<span class="preview-card__line" data-field="description"></span><span class="preview-card__line" data-field="note"></span>
</span></div>`;

function decoded(src: string): Promise<boolean> {
  const probe = new Image();
  probe.src = src;
  return probe.decode().then(() => true, () => false);
}

export function initPreviewCard(): void {
  const media = matchMedia("(hover: hover) and (pointer: fine)");
  let card: HTMLElement | null = null;
  let active: HTMLElement | null = null;
  let dismissed: HTMLElement | null = null;
  let cursorX: number | null = null;
  let openTimer = 0;
  let closeTimer = 0;

  const isOpen = () => card?.hasAttribute("data-open") === true;
  const triggerOf = (target: EventTarget | null) =>
    target instanceof Element ? target.closest<HTMLElement>("[data-preview]") : null;

  function build(): HTMLElement {
    const node = document.createElement("div");
    node.className = "preview-card";
    node.setAttribute("aria-hidden", "true");
    node.innerHTML = CARD_HTML;
    document.body.append(node);
    return node;
  }

  function place(trigger: HTMLElement, node: HTMLElement) {
    const { left, top, side } = placeCard(
      trigger.getBoundingClientRect(),
      { width: node.offsetWidth, height: node.offsetHeight },
      { width: innerWidth, height: innerHeight },
      cursorX,
    );
    node.style.left = `${left}px`;
    node.style.top = `${top}px`;
    node.dataset.side = side;
    const originX = (cursorX ?? left + node.offsetWidth / 2) - left;
    node.style.transformOrigin = `${originX}px ${side === "top" ? "100%" : "0"}`;
  }

  // The picture is decoded before the card changes, so a slow file never
  // shows a broken or half-painted image; a missing one is the icon-only card.
  async function show(trigger: HTMLElement) {
    const data = trigger.dataset;
    const src = data["preview"] ?? "";
    const loaded = src !== "" && (await decoded(src));
    if (active !== trigger) return;

    const node = (card ??= build());
    node.toggleAttribute("data-no-image", !loaded);
    if (loaded) node.querySelector("img")?.setAttribute("src", src);

    const icon = node.querySelector(".preview-card__icon");
    const appIcon = loaded ? null : trigger.querySelector(".app-icon");
    icon?.replaceChildren(...(appIcon ? [appIcon.cloneNode(true)] : []));

    for (const [selector, value] of [
      [".preview-card__name", data["previewName"]],
      [".preview-card__domain", data["previewDomain"]],
      ['[data-field="description"]', data["previewDescription"]],
      ['[data-field="note"]', data["previewNote"]],
    ] as const) {
      const field = node.querySelector<HTMLElement>(selector);
      if (!field) continue;
      field.textContent = value ?? "";
      field.hidden = !value;
    }

    place(trigger, node);
    node.setAttribute("data-open", "");
  }

  function hide() {
    clearTimeout(openTimer);
    clearTimeout(closeTimer);
    active = null;
    card?.removeAttribute("data-open");
  }

  function enter(trigger: HTMLElement, x: number | null) {
    if (!media.matches || trigger === dismissed) return;
    clearTimeout(closeTimer);
    cursorX = x;
    if (trigger === active) return;
    clearTimeout(openTimer);
    active = trigger;
    if (isOpen()) void show(trigger);
    else openTimer = window.setTimeout(() => void show(trigger), OPEN_MS);
  }

  function leave() {
    dismissed = null;
    clearTimeout(openTimer);
    if (isOpen()) closeTimer = window.setTimeout(hide, CLOSE_MS);
    else active = null;
  }

  document.addEventListener("pointerover", (event) => {
    const trigger = triggerOf(event.target);
    if (trigger && event.pointerType === "mouse") enter(trigger, event.clientX);
  });
  document.addEventListener("pointerout", (event) => {
    const trigger = triggerOf(event.target);
    if (trigger && !trigger.contains(event.relatedTarget as Node | null)) leave();
  });
  document.addEventListener("pointermove", (event) => {
    if (active === null || cursorX === null || !active.contains(event.target as Node)) return;
    cursorX = event.clientX;
    if (card && isOpen()) place(active, card);
  });
  document.addEventListener("focusin", (event) => {
    const trigger = triggerOf(event.target);
    if (trigger && (event.target as Element).matches(":focus-visible")) enter(trigger, null);
  });
  document.addEventListener("focusout", (event) => {
    if (triggerOf(event.target)) leave();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || active === null) return;
    dismissed = active;
    hide();
  });
  document.addEventListener("pointerdown", hide);
  addEventListener("scroll", hide, { passive: true, capture: true });
  media.addEventListener("change", hide);
}
