import test from "node:test";
import assert from "node:assert/strict";
import { step } from "./detail-panel.ts";

test("step walks to the next shown entry and wraps", () => {
  const shown = [true, false, true, true];
  assert.equal(step(shown, 0, 1), 2);
  assert.equal(step(shown, 3, 1), 0);
  assert.equal(step(shown, 0, -1), 3);
  assert.equal(step(shown, 2, -1), 0);
});

test("step keeps a hidden entry's place, so a filtered-out open entry still has neighbours", () => {
  const shown = [true, false, true];
  assert.equal(step(shown, 1, 1), 2);
  assert.equal(step(shown, 1, -1), 0);
});

test("step returns -1 when nothing else shows", () => {
  assert.equal(step([true], 0, 1), -1);
  assert.equal(step([true, false], 0, -1), -1);
  assert.equal(step([false, false], 0, 1), -1);
});
