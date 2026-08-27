/**
 * The ticking clock, for the two surfaces that have one.
 *
 * `layouts/Base.astro` runs the pair of footer clocks on every page, and
 * `pages/design.astro` runs the figures specimen — the row that exists to show
 * what `.tabular-nums` is for, which only works if the digits actually change
 * under the reader. Same shape both times: format with `Intl`, align to the
 * next whole second, then tick on the beat. It was written out twice, and the
 * second copy's comment said so ("the same shape as the footer clocks").
 *
 * Formatting is delegated to `Intl` rather than done by hand, so DST for
 * Winnipeg and New Delhi is the platform's problem and not ours.
 *
 * **One interval per page, not one per caller.** /design is the page that has
 * both surfaces on it, and it was paying for two timers doing identical work a
 * millisecond apart. The registry below is module state, so the second caller
 * joins the first one's beat instead of starting its own — which also means the
 * two rows can never tick out of step with each other, the way two independently
 * aligned intervals eventually do.
 */

interface Ticking {
  el: HTMLElement;
  format: Intl.DateTimeFormat;
}

const ticking: Ticking[] = [];
let beating = false;

function tick(): void {
  const now = new Date();
  for (const clock of ticking) {
    const next = clock.format.format(now);
    // Avoid a pointless DOM write 59 times out of 60 per minute. The seconds
    // field is the only one that moves, and only the clocks whose string
    // actually changed need touching.
    if (clock.el.textContent !== next) clock.el.textContent = next;
  }
}

/**
 * Start every element carrying `attribute` ticking, on the shared beat.
 *
 * The attribute's *value* is the IANA timezone. An empty attribute means the
 * reader's own, which is what the /design specimen wants — a clock showing a
 * city the reader is not in would be demonstrating the wrong thing.
 *
 * Safe to call when nothing matches, and safe to call more than once per page.
 *
 * @param attribute the data attribute marking a ticking element, e.g. `data-clock`
 */
export function startTicker(attribute: string): void {
  const found = Array.from(
    document.querySelectorAll<HTMLElement>(`[${attribute}]`),
  );
  if (found.length === 0) return;

  for (const el of found) {
    ticking.push({
      el,
      format: new Intl.DateTimeFormat("en-GB", {
        // `undefined` is what Intl wants for "the reader's own zone"; an empty
        // string is a RangeError.
        timeZone: el.getAttribute(attribute) || undefined,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }),
    });
  }

  // Paint immediately, so a late caller's elements are not left showing the
  // `--:--:--` placeholder until the next whole second arrives.
  tick();

  if (beating) return;
  beating = true;
  setTimeout(
    () => {
      tick();
      setInterval(tick, 1000);
    },
    1000 - (Date.now() % 1000),
  );
}
