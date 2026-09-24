import test from "node:test";
import assert from "node:assert/strict";

import { readHistory, verdictHistory } from "./verdict-history.ts";

const V = ["using", "watching", "on-hold", "skipped"];

test("history is newest first with the current verdict on top", () => {
  const tool = { verdict: "using", status_date: "2026-09-23", verdict_history: [{ verdict: "skipped", date: "2026-08-01" }, { verdict: "watching", date: "2026-09-14" }] };
  assert.deepEqual(verdictHistory(tool), [
    { verdict: "using", date: "2026-09-23" },
    { verdict: "watching", date: "2026-09-14" },
    { verdict: "skipped", date: "2026-08-01" },
  ]);
  assert.equal(verdictHistory({ verdict: "using", status_date: "2026-09-23", verdict_history: [] }).length, 1, "one verdict renders no timeline");
});

test("a stored history is checked: known verdicts, dates in order, none after status_date", () => {
  assert.deepEqual(readHistory(undefined, "t", V, "2026-09-23"), []);
  assert.throws(() => readHistory([], "t", V, "2026-09-23"), /non-empty/);
  assert.throws(() => readHistory([{ verdict: "loved", date: "2026-09-01" }], "t", V, "2026-09-23"), /one of/);
  assert.throws(() => readHistory([{ verdict: "using", date: "2026-09-30" }], "t", V, "2026-09-23"), /none after/);
  assert.throws(() => readHistory([{ verdict: "using", date: "2026-09-10" }, { verdict: "watching", date: "2026-09-01" }], "t", V, "2026-09-23"), /oldest first/);
});
