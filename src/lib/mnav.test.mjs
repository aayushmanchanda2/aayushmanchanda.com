/**
 * The MENU panel is modal to the keyboard, not just to the pointer.
 *
 * design.md §3. The panel says `aria-modal="true"`, and `inert` on everything
 * behind it is what makes that claim true: without it, Tab walks off the last
 * control in the panel and lands in the page behind the scrim — focusable,
 * invisible, pointer-dead. That shipped, and nothing on screen looked wrong.
 *
 * The wiring has two ends and either can be lost alone: the `data-mnav-inert`
 * markers on the background surfaces, and the `setOpen` code that flips the
 * property. A marker with no flipper is decoration; a flipper with no markers
 * finds nothing. So this test holds both, parsed as text the way
 * `newsletter.test.mjs` reads its components — there is no DOM here to ask.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("..", import.meta.url));
const read = (/** @type {string} */ rel) => readFileSync(SRC + rel, "utf8");

const base = read("layouts/Base.astro");
const mark = read("components/SiteMark.astro");
const mnav = read("components/MobileNav.astro");

test("the background surfaces carry the inert marker", () => {
  assert.ok(
    /<div class="shell" data-mnav-inert>/.test(base),
    "the shell no longer carries data-mnav-inert — an open MENU panel would leave every link on the page reachable by Tab (design.md §3)",
  );
  assert.ok(
    /class="skip[^"]*"[^>]*data-mnav-inert/.test(base),
    "the skip link no longer carries data-mnav-inert",
  );
  assert.ok(
    /data-mnav-inert/.test(mark),
    "the site mark no longer carries data-mnav-inert — it is a focusable control sitting behind the open panel",
  );
});

test("the theme live region stays out of the inert set", () => {
  const live = base.match(/<span[^>]*data-theme-live[^>]*>/);
  assert.ok(live, "the theme live region has moved out of Base.astro");
  assert.ok(
    !live[0].includes("data-mnav-inert"),
    "the theme live region is marked inert — the panel's own theme toggle announces through it while the panel is open, and an inert region announces nothing",
  );
});

test("setOpen flips inert both ways", () => {
  const script = mnav.slice(mnav.indexOf("<script>"));
  assert.ok(
    script.includes('querySelectorAll<HTMLElement>("[data-mnav-inert]")'),
    "MobileNav no longer collects the [data-mnav-inert] surfaces",
  );
  assert.ok(
    script.includes("el.inert = true") && script.includes("el.inert = false"),
    "MobileNav no longer sets and clears inert on the background — the markers in Base.astro and SiteMark.astro are decoration without it",
  );
  assert.ok(
    script.includes("toggle.inert = true") &&
      script.includes("toggle.inert = false"),
    "the trigger no longer goes inert with the background — it sits under the scrim while the panel is open",
  );
  assert.ok(
    script.indexOf("toggle.inert = false") <
      script.indexOf("toggle.focus({ preventScroll: true })"),
    "inert must be lifted before focus returns to the trigger — focusing an inert element silently does nothing",
  );
});
