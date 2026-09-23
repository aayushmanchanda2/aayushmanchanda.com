/**
 * Several saved pages of one site, folded into one /sites card.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { groupByDomain, neighbours, screenLabel } from "./screens.ts";

/** @param {string} slug @param {string} url @param {string} saved_date */
const site = (slug, url, saved_date) =>
  /** @type {import("./sites.ts").Site} */ ({ slug, url, saved_date, domain: new URL(url).hostname.replace(/^www\./, "") });

test("a screen is named by its path", () => {
  assert.equal(screenLabel("https://brianlovin.com/"), "Home");
  assert.equal(screenLabel("https://brianlovin.com"), "Home");
  assert.equal(screenLabel("https://brianlovin.com/about"), "About");
  assert.equal(screenLabel("https://rauno.me/notes/4"), "Notes 4");
  assert.equal(screenLabel("https://uigoodies.com/daily-goods"), "Daily goods");
});

test("one card per domain, home page first, in first-seen order", () => {
  const groups = groupByDomain([
    site("sites-b", "https://b.com/sites", "2026-09-14"),
    site("a", "https://a.com/", "2026-09-10"),
    site("about-b", "https://www.b.com/about", "2026-09-14"),
    site("b", "https://b.com/", "2026-08-26"),
  ]);
  assert.deepEqual(
    groups.map((g) => [g.primary.slug, g.screens.map((s) => `${s.site.slug}:${s.label}`)]),
    [
      ["b", ["b:Home", "sites-b:Sites", "about-b:About"]],
      ["a", ["a:Home"]],
    ],
  );
});

test("with no home page saved, the earliest save leads", () => {
  const [group] = groupByDomain([
    site("late", "https://c.com/late", "2026-09-20"),
    site("early", "https://c.com/early", "2026-09-01"),
  ]);
  assert.equal(group?.primary.slug, "early");
});

test("the arrows walk cards: a site's extra screens are one step, and the ring wraps", () => {
  const groups = groupByDomain([
    site("a", "https://a.com/", "2026-09-10"),
    site("b", "https://b.com/", "2026-09-11"),
    site("b-about", "https://b.com/about", "2026-09-12"),
    site("c", "https://c.com/", "2026-09-13"),
  ]);
  const walk = (/** @type {string} */ slug) => {
    const { prev, next } = neighbours(groups, slug);
    return [prev?.slug, next?.slug];
  };
  assert.deepEqual(walk("a"), ["c", "b"]);
  assert.deepEqual(walk("b-about"), ["a", "c"], "a secondary screen steps from its card");
  assert.deepEqual(walk("c"), ["b", "a"], "prev of c is b's card, not b-about");
  assert.deepEqual(neighbours(groups.slice(0, 1), "a"), { prev: null, next: null });
});
