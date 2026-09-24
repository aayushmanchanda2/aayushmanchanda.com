/**
 * Pull to refresh (VET-280): a postmark drops out from under the top bar as a
 * reader pulls down at the top of a page, stamps once past the threshold, and
 * the page reloads on release. `PullRefresh.astro` draws it.
 *
 * **Only where the gesture is ours to own.** Chrome on Android hands it over
 * with `overscroll-behavior-y: none` on the root, set here only while the page
 * sits at the top so every other edge keeps its native stretch. Whether WebKit
 * gives up Safari's own refresh for the same rule is untried on a device, and
 * a wrong guess shows two at once, so a Safari tab keeps its native one; an
 * iOS home-screen app has no native refresh, so it gets this one. Mouse and
 * pen never see it.
 *
 * Listeners are passive and nothing calls `preventDefault`: a pull that turns
 * into a scroll is a scroll.
 */
import { reducedMotion } from "./motion.ts";
import { play, tick } from "./ui-sound.ts";

/** Raw finger travel that arms the reload, iOS's own distance, near enough. */
export const ARM_PX = 120;
/** Movement before the gesture commits to a direction (apple-design §10). */
const SLOP_PX = 10;

/** Apple's rubber band: follows less the further it goes, never past `dimension`. */
export const rubberband = (overshoot: number, dimension = 160, constant = 0.55): number =>
  (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));

/** Whether this browser leaves the pull to us (see the header). */
export function ownsPull(ua: string, touchPoints: number, coarse: boolean, standalone: boolean): boolean {
  const iOS = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1);
  return coarse && (!iOS || standalone);
}

/** A touch that starts in something scrolled, or in a modal, is not a page pull. */
function insideScroller(node: EventTarget | null): boolean {
  for (let el = node as Element | null; el && el !== document.documentElement; el = el.parentElement) {
    if (el.scrollTop > 0 || el.matches("dialog, [role='dialog'], [aria-modal='true']")) return true;
  }
  return false;
}

export function initPullRefresh(): void {
  const el = document.querySelector<HTMLElement>("[data-pull]");
  const standalone =
    matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (!el || !ownsPull(navigator.userAgent, navigator.maxTouchPoints, matchMedia("(pointer: coarse)").matches, standalone)) {
    return;
  }

  const root = document.documentElement;
  const atTop = () => root.toggleAttribute("data-pull-top", scrollY <= 0);
  addEventListener("scroll", atTop, { passive: true });
  atTop();

  let startX = 0;
  let startY = 0;
  let pulling: boolean | null = null; // null until the slop decides
  let armed = false;
  let tracking = false;

  const set = (raw: number) => {
    const progress = Math.min(raw / ARM_PX, 1);
    el.style.setProperty("--pull", String(progress));
    el.style.setProperty("--pull-y", `${rubberband(raw).toFixed(1)}px`);
    el.style.setProperty("--pull-over", String(Math.max(0, (raw - ARM_PX) / ARM_PX).toFixed(3)));
    if ((progress === 1) !== armed) {
      armed = progress === 1;
      el.toggleAttribute("data-armed", armed);
      if (armed) tick();
    }
  };

  const reset = () => {
    tracking = false;
    pulling = null;
    el.removeAttribute("data-active");
    el.removeAttribute("data-armed");
    armed = false;
    set(0);
  };

  addEventListener(
    "touchstart",
    (event) => {
      if (event.touches.length !== 1 || scrollY > 0 || insideScroller(event.target)) return;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
      tracking = true;
      pulling = null;
    },
    { passive: true },
  );

  addEventListener(
    "touchmove",
    (event) => {
      if (!tracking) return;
      const dx = event.touches[0].clientX - startX;
      const dy = event.touches[0].clientY - startY;
      if (pulling === null) {
        if (Math.hypot(dx, dy) < SLOP_PX) return;
        pulling = dy > 0 && dy > Math.abs(dx);
        if (!pulling) return reset();
        el.setAttribute("data-active", "");
      }
      if (scrollY > 0) return reset();
      set(Math.max(0, dy - SLOP_PX));
    },
    { passive: true },
  );

  const end = () => {
    if (!tracking) return;
    if (!armed) return reset();
    tracking = false;
    el.setAttribute("data-struck", "");
    play(0.8);
    // Long enough to see the strike land; none under reduced motion.
    setTimeout(() => location.reload(), reducedMotion() ? 0 : 220);
  };
  addEventListener("touchend", end, { passive: true });
  addEventListener("touchcancel", reset, { passive: true });
}
