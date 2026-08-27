/**
 * The digest labels, and the two renderings that have to agree about them.
 *
 * A digested library entry is drawn twice: as mono-labelled blocks by
 * `components/DigestBlocks.astro` on `/library/<slug>`, and as a `###` block
 * by `lib/markdown.ts › digestSection` in `/library.md`. Same data, same
 * labels — the claim every markdown variant on this site makes, and the claim
 * a second copy of a label list has already quietly broken once (the
 * apostrophe drift `lib/voice.test.mjs` documents). So the labels live in
 * `DIGEST_LABELS`, both surfaces read it, and these tests hold them to it the
 * same way the voice tests hold `VoiceBlocks`.
 *
 * The component is checked as text rather than rendered, because rendering an
 * `.astro` file needs a build; what matters is structural anyway — that it
 * reads the shared list instead of keeping its own.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { DIGEST_LABELS, digestSection } from "./markdown.ts";

const COMPONENT = readFileSync(
  fileURLToPath(new URL("../components/DigestBlocks.astro", import.meta.url)),
  "utf8",
);

/** A digest with nothing missing, for the rendering tests. */
const DIGEST = {
  bullets: ["First claim.", "Second claim.", "Third claim."],
  verdict: "Read now: it touches the live thing.",
  why: "Because the live thing is on the bench this week.",
  digested: "2026-08-27",
};

test("the labels are the three, in the order the page stacks them", () => {
  assert.deepEqual(
    Object.keys(DIGEST_LABELS),
    ["bullets", "verdict", "why"],
    "what the piece says, then the call, then the reason for the call",
  );
});

test("the component reads the shared labels", () => {
  assert.match(
    COMPONENT,
    /import \{ DIGEST_LABELS \} from "\.\.\/lib\/markdown"/,
    "DigestBlocks.astro must import DIGEST_LABELS rather than keep its own copy",
  );
  for (const key of Object.keys(DIGEST_LABELS)) {
    assert.ok(
      COMPONENT.includes(`DIGEST_LABELS.${key}`),
      `DigestBlocks.astro must render DIGEST_LABELS.${key}`,
    );
  }
});

test("the component writes no label of its own", () => {
  // The failure this guards: someone editing a label inline on the page,
  // which would render there and stay stale in the markdown, silently,
  // exactly like the voice apostrophe did.
  for (const label of Object.values(DIGEST_LABELS)) {
    assert.ok(
      !COMPONENT.includes(`"${label}"`) && !COMPONENT.includes(`>${label}<`),
      `DigestBlocks.astro spells the label ${JSON.stringify(label)} out. Labels come from DIGEST_LABELS.`,
    );
  }
});

test("the markdown rendering carries every bullet, both labels, and the page URL", () => {
  const rendered = digestSection([
    { title: "A digested piece", slug: "a-digested-piece", digest: DIGEST },
  ]);

  assert.ok(rendered, "one digested entry rendered nothing");
  assert.ok(rendered.includes("### A digested piece"));

  for (const bullet of DIGEST.bullets) {
    assert.ok(rendered.includes(`- ${bullet}`), `markdown is missing the bullet ${bullet}`);
  }
  assert.ok(rendered.includes(`${DIGEST_LABELS.verdict}: ${DIGEST.verdict}`));
  assert.ok(rendered.includes(`${DIGEST_LABELS.why}: ${DIGEST.why}`));
  assert.ok(rendered.includes(`Digested: ${DIGEST.digested}`));
  assert.ok(
    rendered.includes("https://aayushmanchanda.com/library/a-digested-piece"),
    "each block names the page the digest earned, so an agent knows which slugs are URLs",
  );
});

test("no digests, no section", () => {
  // The markdown twin of the honest-absence rule: an empty heading reads as a
  // document that broke, not as a backlog.
  assert.equal(digestSection([]), null);
});
