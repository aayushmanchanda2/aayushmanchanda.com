/**
 * The /tools table's sort cycle and URL filters, under test. The scripts in
 * `ToolList.astro` and `pages/tools.astro` only wire these to the DOM.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { filterSearch, matches, nextSort, readFilters, sortItems } from "./tools-table.ts";

test("a header cycles its natural direction, the reverse, then file order", () => {
  let sort = nextSort(null, "name");
  assert.deepEqual(sort, { key: "name", direction: "ascending" });
  sort = nextSort(sort, "name");
  assert.deepEqual(sort, { key: "name", direction: "descending" });
  assert.equal(nextSort(sort, "name"), null);

  // Dates start newest first; another header starts its own cycle.
  assert.deepEqual(nextSort(null, "date"), { key: "date", direction: "descending" });
  assert.deepEqual(nextSort({ key: "date", direction: "descending" }, "verdict"), {
    key: "verdict",
    direction: "ascending",
  });
});

const rows = [
  { "data-index": "0", "data-sort-name": "Zed", "data-sort-date": "2026-08-01", "data-sort-verdict": "1" },
  { "data-index": "1", "data-sort-name": "alpha", "data-sort-date": "2026-09-10", "data-sort-verdict": "0" },
  { "data-index": "2", "data-sort-name": "Beta", "data-sort-date": "2026-08-01", "data-sort-verdict": "3" },
];
/** @typedef {Record<string, string>} Row */
/** @param {Row[]} list */
const names = (list) => list.map((row) => row["data-sort-name"]);
/** @param {Row} row @param {string} name */
const read = (row, name) => row[name] ?? "";

test("sorts by the column, ties and no sort fall back to file order", () => {
  assert.deepEqual(names(sortItems(rows, { key: "name", direction: "ascending" }, read)), ["alpha", "Beta", "Zed"]);
  assert.deepEqual(names(sortItems(rows, { key: "date", direction: "descending" }, read)), ["alpha", "Zed", "Beta"]);
  assert.deepEqual(names(sortItems(rows, { key: "verdict", direction: "ascending" }, read)), ["alpha", "Zed", "Beta"]);
  assert.deepEqual(names(sortItems(sortItems(rows, { key: "name", direction: "descending" }, read), null, read)), [
    "Zed",
    "alpha",
    "Beta",
  ]);
});

test("filters round-trip through the query string; unknown values read as All", () => {
  const verdicts = ["using", "watching"];
  const categories = ["agent-infra", "unsorted"];
  const filters = { verdict: "using", category: "agent-infra" };

  assert.equal(filterSearch(filters), "?verdict=using&category=agent-infra");
  assert.deepEqual(readFilters(filterSearch(filters), verdicts, categories), filters);
  assert.equal(filterSearch({ verdict: "", category: "" }), "");
  assert.deepEqual(readFilters("?verdict=loved&category=nope", verdicts, categories), { verdict: "", category: "" });
});

test("a row matches when every set filter agrees", () => {
  const row = { verdict: "using", category: "agent-infra" };
  assert.ok(matches(row, { verdict: "", category: "" }));
  assert.ok(matches(row, { verdict: "using", category: "" }));
  assert.ok(!matches(row, { verdict: "using", category: "unsorted" }));
});
