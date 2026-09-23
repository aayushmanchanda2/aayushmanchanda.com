/**
 * motion.ts — the one reduced-motion check the client scripts share (QA phase 2,
 * B11). Asked each time rather than cached, so a reader who flips the setting
 * mid-visit is heard on the next press. CSS keeps its own `@media` blocks.
 */
export function reducedMotion(): boolean {
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}
