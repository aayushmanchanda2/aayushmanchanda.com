/**
 * The voice fields, and the two renderings that have to agree about them.
 *
 * An entry's `why` / `like` / `dislike` / `try` are drawn twice: as labelled
 * blocks by `components/VoiceBlocks.astro`, and as a `###` list by
 * `lib/markdown.ts › voiceSection` for the agent asking for `text/markdown`.
 * Same data, same labels, same order — that is the whole claim the markdown
 * variants make, and it is the claim a second copy of the list quietly broke.
 *
 * The drift that already shipped: `markdown.ts` spelled the third label
 * `What I don't` with a typewriter apostrophe while the component rendered
 * `What I don’t` with a typographic one. Every /tools entry carrying a dislike
 * served a page and a `.md` twin that disagreed. Nothing caught it, because
 * catching it means reading both renderings of the same entry side by side and
 * noticing one glyph — and the file that would have prompted anyone to do that
 * was the file asserting, in a comment, that the two matched exactly.
 *
 * So: one list, and these tests. The component is checked as text rather than
 * rendered, because rendering an `.astro` file needs a build; what matters is
 * structural anyway — that it reads the shared list instead of keeping its own.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { VOICE_FIELDS, voiceSection } from "./markdown.ts";

const COMPONENT = readFileSync(
  fileURLToPath(new URL("../components/VoiceBlocks.astro", import.meta.url)),
  "utf8",
);

test("the fields are the four, in the documented order", () => {
  assert.deepEqual(
    VOICE_FIELDS.map((field) => field.key),
    ["why", "like", "dislike", "try"],
    "why orients, like and dislike are the judgement, try is the way out",
  );
});

test("only `try` is machine text", () => {
  assert.deepEqual(
    VOICE_FIELDS.filter((field) => field.code).map((field) => field.key),
    ["try"],
    "the code flag is what makes the HTML set a field in mono and the markdown fence it",
  );
});

test("the dislike label uses a typographic apostrophe", () => {
  const dislike = VOICE_FIELDS.find((field) => field.key === "dislike");
  assert.ok(dislike, "there is no dislike field any more");

  // The exact regression. U+2019, never U+0027 — and asserting the character
  // rather than the whole string so this fails on the glyph, which is the thing
  // that is invisible in a diff.
  assert.ok(
    dislike.label.includes("’"),
    `dislike label is ${JSON.stringify(dislike.label)}; it must carry U+2019, not a typewriter apostrophe`,
  );
  assert.ok(
    !dislike.label.includes("'"),
    "dislike label carries a typewriter apostrophe — this is the drift that already shipped once",
  );
});

test("the component reads the shared list", () => {
  assert.match(
    COMPONENT,
    /import \{ VOICE_FIELDS[^}]*\} from "\.\.\/lib\/markdown"/,
    "VoiceBlocks.astro must import VOICE_FIELDS rather than keep its own copy",
  );
  assert.match(
    COMPONENT,
    /VOICE_FIELDS\.flatMap/,
    "VoiceBlocks.astro must build its blocks from VOICE_FIELDS",
  );
});

test("the component writes no label of its own", () => {
  // The failure mode this guards is someone adding a fifth block inline
  // instead of to VOICE_FIELDS — which would render on the page and be absent
  // from the markdown, silently, exactly like the apostrophe was.
  for (const { label } of VOICE_FIELDS) {
    assert.ok(
      !COMPONENT.includes(`"${label}"`),
      `VoiceBlocks.astro spells the label ${JSON.stringify(label)} out. Labels come from VOICE_FIELDS.`,
    );
  }
});

test("the markdown rendering uses those labels and fences only `try`", () => {
  const rendered = voiceSection([
    {
      name: "Paperclip",
      voice: {
        why: "why-text",
        like: "like-text",
        dislike: "dislike-text",
        try: "brew install paperclip",
      },
    },
  ]);

  assert.ok(rendered, "an entry with all four fields rendered nothing");

  for (const { key, label, code } of VOICE_FIELDS) {
    const value = code ? "`brew install paperclip`" : `${key}-text`;
    assert.ok(
      rendered.includes(`${label}: ${value}`),
      `markdown is missing "${label}: ${value}"`,
    );
  }
});

test("an absent field contributes nothing to either rendering", () => {
  const rendered = voiceSection([
    { name: "Paperclip", voice: { like: "like-text", dislike: null } },
  ]);

  assert.ok(rendered);
  assert.ok(rendered.includes("What I like: like-text"));
  // Absent and null both mean absent. An empty labelled block is worse than
  // silence: it reads as a page that failed rather than one not written up.
  assert.ok(!rendered.includes("What I don’t"), "a null field rendered a label");
  assert.ok(!rendered.includes("Why:"), "a missing field rendered a label");
});
