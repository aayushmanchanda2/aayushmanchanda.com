import test from "node:test";
import assert from "node:assert/strict";
import {
  TARGET,
  initialOn,
  noiseSamples,
  shouldPlay,
  soundTarget,
} from "./ui-sound.ts";

test("the tick is 24ms of samples at any rate", () => {
  assert.equal(noiseSamples(48000).length, 1152);
  assert.equal(noiseSamples(44100).length, Math.ceil(44100 * 0.024));
});

test("the tick is seeded, bounded, and shaped", () => {
  const a = noiseSamples(48000);
  assert.deepEqual(a, noiseSamples(48000), "same seed, same samples");
  assert.ok(a.every((v) => Math.abs(v) <= 1));
  assert.equal(Math.abs(a[0]), 0, "the attack starts from silence");
  /** @param {number} from @param {number} to */
  const peak = (from, to) => Math.max(...a.slice(from, to).map(Math.abs));
  assert.ok(peak(20, 120) > peak(1000, 1152) * 5, "it decays");
});

test("the throttle lets one tick through per 35ms", () => {
  assert.equal(shouldPlay(100, -Infinity), true);
  assert.equal(shouldPlay(134, 100), false);
  assert.equal(shouldPlay(135, 100), true);
});

test("a press counts on enabled controls only", () => {
  /** A fake press target whose `closest(TARGET)` finds `hit`. @param {unknown} hit @returns {any} */
  const el = (hit) => ({ closest: (/** @type {string} */ sel) => (sel === TARGET ? hit : null) });
  /** @param {boolean} disabled */
  const control = (disabled) => ({ getAttribute: () => (disabled ? "true" : null) });
  assert.ok(soundTarget(el(control(false))));
  assert.equal(soundTarget(el(control(true))), null, "aria-disabled is silent");
  assert.equal(soundTarget(el(null)), null, "plain text is silent");
  assert.equal(soundTarget(null), null);
  for (const part of ["button:not([disabled])", "a[href]", "summary", "select:not([disabled])"]) {
    assert.ok(TARGET.includes(part), part);
  }
});

test("a stored choice wins; with none, reduced motion is off", () => {
  assert.equal(initialOn(null, false), true);
  assert.equal(initialOn(null, true), false);
  assert.equal(initialOn("on", true), true);
  assert.equal(initialOn("off", false), false);
  assert.equal(initialOn("garbage", true), false);
});

test("the pre-paint script writes the same state initialOn picks", async () => {
  const { PREPAINT } = await import("./ui-sound.ts");
  for (const [stored, reduced, want] of [
    ["on", true, "on"],
    ["off", false, "off"],
    [null, false, "on"],
    [null, true, "off"],
    ["junk", true, "off"],
  ]) {
    /** @type {Record<string, string>} */
    const attrs = {};
    const document = { documentElement: { setAttribute: (/** @type {string} */ k, /** @type {string} */ v) => (attrs[k] = v) } };
    const localStorage = { getItem: () => stored };
    const matchMedia = () => ({ matches: reduced });
    new Function("document", "localStorage", "matchMedia", PREPAINT)(document, localStorage, matchMedia);
    assert.equal(attrs["data-sound"], want, `stored ${stored}, reduced ${reduced}`);
  }
});
