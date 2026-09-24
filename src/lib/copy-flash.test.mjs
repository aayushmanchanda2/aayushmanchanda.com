/**
 * The copy fallback order (VET-277), against stubbed clipboard and document
 * APIs: the Clipboard API, then a hidden textarea and execCommand, then the
 * text selected in place. No real DOM: each stub records what was asked of it.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { copyKeys, copyText } from "./copy-flash.ts";

/**
 * A document that records the textarea, the execCommand call and the selection.
 * @param {{ exec?: boolean | "throw" }} [options]
 * @returns {{ doc: any, host: any, log: string[] }}
 */
function fakeDoc({ exec = true } = {}) {
  /** @type {string[]} */
  const log = [];
  /** @param {string} line */
  const note = (line) => log.push(line);
  const doc = {
    activeElement: { focus: () => note("refocus") },
    createElement: () => {
      const area = { value: "", style: {}, setAttribute() {}, select: () => note(`select textarea:${area.value}`), remove: () => note("remove textarea") };
      return area;
    },
    /** @param {string} command */
    execCommand: (command) => {
      note(`exec ${command}`);
      if (exec === "throw") throw new Error("nope");
      return exec;
    },
    getSelection: () => ({ removeAllRanges: () => note("clear selection"), addRange: (/** @type {{ node: string }} */ range) => note(`select ${range.node}`) }),
    createRange: () => {
      const range = { node: "", selectNodeContents: (/** @type {string} */ node) => (range.node = node) };
      return range;
    },
  };
  const host = { append: (/** @type {{ value: string }} */ area) => note(`append textarea:${area.value}`) };
  return { doc, host, log };
}

/** The element to select, as the stub document sees it. */
const PROMPT = /** @type {any} */ ("prompt");
const ok = { writeText: async () => {} };
const denied = { writeText: async () => { throw new DOMException("Write permission denied.", "NotAllowedError"); } };

test("the Clipboard API is tried first, and nothing else runs when it works", async () => {
  const { doc, host, log } = fakeDoc();
  assert.equal(await copyText("hello", host, PROMPT, { clipboard: ok, doc }), "copied");
  assert.deepEqual(log, []);
});

test("a denied clipboard falls back to a hidden textarea and execCommand, then gives focus back", async () => {
  const { doc, host, log } = fakeDoc();
  assert.equal(await copyText("hello", host, PROMPT, { clipboard: denied, doc }), "copied");
  assert.deepEqual(log, ["append textarea:hello", "select textarea:hello", "exec copy", "remove textarea", "refocus"]);
});

test("no Clipboard API at all (an insecure context) goes straight to execCommand", async () => {
  const { doc, host, log } = fakeDoc();
  assert.equal(await copyText("hello", host, PROMPT, { clipboard: undefined, doc }), "copied");
  assert.ok(log.includes("exec copy"));
});

test("when execCommand fails too, the text is selected in place for ⌘C", async () => {
  for (const exec of /** @type {const} */ ([false, "throw"])) {
    const { doc, host, log } = fakeDoc({ exec });
    assert.equal(await copyText("hello", host, PROMPT, { clipboard: denied, doc }), "selected");
    assert.deepEqual(log.slice(-2), ["clear selection", "select prompt"]);
    assert.ok(log.includes("remove textarea"), "the textarea never stays on the page");
  }
});

test("with nothing to select, it says so rather than pretending", async () => {
  const { doc, host } = fakeDoc({ exec: false });
  assert.equal(await copyText("hello", host, null, { clipboard: denied, doc }), "none");
});

test("the key hint matches the keyboard", () => {
  assert.equal(copyKeys("MacIntel"), "⌘C");
  assert.equal(copyKeys("iPhone"), "⌘C");
  assert.equal(copyKeys("Win32"), "Ctrl+C");
  assert.equal(copyKeys("Linux x86_64"), "Ctrl+C");
});
