/**
 * /tokens: the public data file holds only what it should, and the graphs hold
 * only what the page says they do.
 *
 * `data/tokens.json` is pushed from my Mac by a job nobody watches, into a
 * public repo, so its shape is a contract rather than a formatting detail.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { GRAPH_START, compact, grid, render, summary } from "./tokens.ts";

const data = JSON.parse(readFileSync(new URL("../data/tokens.json", import.meta.url), "utf8"));

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const NAME = /^[a-z0-9][a-z0-9./:_-]{0,60}$/i;
/** @param {unknown} row */
const isRow = (row) => Array.isArray(row) && row.length === 3 && row.every((n) => typeof n === "number" && n >= 0);

test("the data file is dates, app names, model names and three numbers, nothing else", () => {
  assert.deepEqual(Object.keys(data).sort(), ["days", "generated", "weeks"]);
  assert.match(data.generated, DATE);
  for (const [date, apps] of Object.entries(data.days)) {
    assert.match(date, DATE);
    for (const [app, row] of Object.entries(apps)) {
      assert.match(app, NAME);
      assert.ok(isRow(row), `${date} ${app}`);
    }
  }
  for (const [week, apps] of Object.entries(data.weeks)) {
    assert.match(week, DATE);
    for (const models of Object.values(apps)) {
      for (const [model, row] of Object.entries(models)) {
        assert.match(model, NAME);
        assert.ok(isRow(row), `${week} ${model}`);
      }
    }
  }
});

/** @type {import("./tokens.ts").TokenData} */
const sample = {
  generated: "2026-03-11",
  days: {
    "2025-05-01": { warp: [5, 1, 1] },
    "2026-03-02": { claude: [100, 10, 2], codex: [40, 4, 1] },
    "2026-03-03": { codex: [50, 5, 1] },
    "2026-03-10": { claude: [1200, 120, 3] },
    "2026-03-11": { claude: [10, 1, 1] },
  },
  weeks: { "2026-03-02": { claude: { "claude-opus-5-5": [100, 10, 2] } } },
};

test("the totals are all-time and the streak ends on the newest day", () => {
  assert.deepEqual(summary(sample), {
    tokens: 1405,
    cost: 9,
    activeDays: 5,
    streak: 2,
    since: "2025-05-01",
  });
});

test("the calendar starts at GRAPH_START, whatever older days the file holds", () => {
  const html = grid(sample, ["claude", "codex", "warp"], "tokens");
  assert.equal(GRAPH_START, "2026-03-02");
  assert.equal((html.match(/<rect/g) ?? []).length, 4);
  assert.match(html, /data-tip="Mar 2: 140 \(claude 100, codex 40\)"/);
  assert.doesNotMatch(html, /May/);
  assert.match(html, /<span[^>]*>Mar<\/span>/);
});

test("a square takes the colour of the day's biggest app", () => {
  assert.match(grid(sample, ["claude", "codex"], "tokens"), /class="app-codex"[^>]*data-tip="Mar 3/);
});

test("hiding an app takes it out of the squares", () => {
  assert.doesNotMatch(grid(sample, ["claude"], "tokens"), /Mar 3/);
});

test("split view stays cheap: one node per used day per app, not one per calendar cell", () => {
  const html = render(data, { metric: "tokens", split: true, hidden: new Set() });
  assert.ok((html.match(/<(rect|path)/g) ?? []).length < 1500);
});

test("a hostile name renders as text, in every place a name lands", () => {
  const bad = `x"><img src=y onerror=z>`;
  /** @type {import("./tokens.ts").TokenData} */
  const hostile = {
    generated: "2026-03-03",
    days: { "2026-03-02": { [bad]: [10, 1, 1] } },
    weeks: { "2026-03-02": { [bad]: { [bad]: [10, 1, 1] } } },
  };
  for (const split of [false, true]) {
    const html = render(hostile, { metric: "tokens", split, hidden: new Set() });
    assert.doesNotMatch(html, /<img/);
    assert.doesNotMatch(html, /class="[^"]*[<>][^"]*"/);
  }
});

test("big numbers read short", () => {
  assert.equal(compact(31_963_553_153), "32B");
  assert.equal(compact(1_421_900_000), "1.4B");
  assert.equal(compact(838_000), "838K");
  assert.equal(compact(120_000_000), "120M");
  assert.equal(compact(12), "12");
});
