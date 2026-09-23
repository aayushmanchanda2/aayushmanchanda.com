/**
 * Adds `on` to each element matching `selector` once `threshold` of it has
 * scrolled into view, then stops watching it. Under reduced motion nothing is
 * added, and the CSS draws the element whole. An element already being watched
 * (two components asking for the same marks) is watched once.
 */
import { reducedMotion } from "./motion.ts";

const watched = new WeakSet<Element>();

export function reveal(selector: string, on: string, threshold: number): void {
  if (reducedMotion()) return;
  const fresh = [...document.querySelectorAll(selector)].filter((el) => !watched.has(el));
  if (fresh.length === 0) return;
  const seen = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add(on);
        seen.unobserve(entry.target);
      }
    },
    { threshold },
  );
  for (const el of fresh) {
    watched.add(el);
    seen.observe(el);
  }
}
