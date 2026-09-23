import test from "node:test";
import assert from "node:assert/strict";
import { formatDay } from "./date.ts";

test("an ISO day prints as a short US date, never shifted by a zone", () => {
  assert.equal(formatDay("2026-08-13"), "Aug 13, 2026");
  assert.equal(formatDay("2026-01-01"), "Jan 1, 2026");
  assert.equal(formatDay("2025-12-31"), "Dec 31, 2025");
});
