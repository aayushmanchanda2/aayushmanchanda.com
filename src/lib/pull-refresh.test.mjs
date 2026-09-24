import test from "node:test";
import assert from "node:assert/strict";
import { ARM_PX, ownsPull, rubberband } from "./pull-refresh.ts";

test("the rubber band follows less the further it goes, and never passes its dimension", () => {
  assert.equal(rubberband(0), 0);
  const armed = rubberband(ARM_PX);
  assert.ok(armed > 40 && armed < 60, `armed at ${armed}px`);
  assert.ok(rubberband(2 * ARM_PX) - armed < armed, "the second 120px gives less than the first");
  assert.ok(rubberband(10_000) < 160);
});

test("the pull is ours on Android and an iOS home-screen app, never in an iOS Safari tab or with a mouse", () => {
  const android = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36";
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";
  const ipad = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15";
  assert.equal(ownsPull(android, 5, true, false), true);
  assert.equal(ownsPull(iphone, 5, true, false), false);
  assert.equal(ownsPull(ipad, 5, true, false), false, "iPadOS says Macintosh");
  assert.equal(ownsPull(iphone, 5, true, true), true);
  assert.equal(ownsPull(ipad, 0, false, false), false, "a real Mac");
  assert.equal(ownsPull(android, 5, false, false), false);
});
