/**
 * Several saved pages of one site, folded into one /sites card.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { groupByDomain, screenLabel } from "./screens.ts";

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
