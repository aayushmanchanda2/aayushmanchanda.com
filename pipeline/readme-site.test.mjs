/**
 * `siteInReadme` against real READMEs (saved 2026-09-23) and the strict rules:
 * a link counts only when labelled as a site, badged as one, or on a host named
 * after the repo or its owner. Sponsor, "powered by", registry, social, image
 * and other owners' github.io links never do.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { siteInReadme } from "./readme-site.mjs";

/** @param {string} name */
const fixture = (name) => readFileSync(new URL(`./fixtures/readme-${name}.md`, import.meta.url), "utf8");

test("readme: davidondrej/skills names no site of its own (DeepAPI is 'powered by')", () => {
  assert.equal(siteInReadme(fixture("davidondrej-skills"), "davidondrej", "skills"), null);
});

test("readme: agency-agents finds agencyagents.app by its repo-named host, past the sponsor badges", () => {
  assert.equal(siteInReadme(fixture("msitarzewski-agency-agents"), "msitarzewski", "agency-agents"), "https://agencyagents.app");
});

test("readme: tw93/Kami finds kami.tw93.fun, never the sponsor section's cats.tw93.fun", () => {
  assert.equal(siteInReadme(fixture("tw93-kami"), "tw93", "Kami"), "https://kami.tw93.fun");
});

test("readme: a labelled or badged link counts on any host; the label beside it counts too", () => {
  assert.equal(siteInReadme("# A\n[Documentation](https://read.example/a)", "o", "a"), "https://read.example/a");
  assert.equal(siteInReadme("# A\n[![Website](https://img.shields.io/badge/website-live-blue)](https://live.example)", "o", "a"), "https://live.example");
  assert.equal(siteInReadme("# A\n**Demo:** [try it](https://play.example)", "o", "a"), "https://play.example");
});

test("readme: unlabelled, registry, social, image and other-owner github.io links never count", () => {
  const readme = [
    "# a",
    "[Blog](https://company.example/blog) [npm](https://www.npmjs.com/package/a)",
    "[site](https://x.com/o) [site](https://i.imgur.com/a.png) [docs](https://other.github.io/a/)",
    "[home](https://pypi.org/project/a) [a](https://a.example/logo.png)",
  ].join("\n");
  assert.equal(siteInReadme(readme, "o", "a"), null);
  assert.equal(siteInReadme("# a\n[docs](https://o.github.io/a/)", "o", "a"), "https://o.github.io/a/");
  // A named host counts only at its root: a blog post on the owner's domain is not the product.
  assert.equal(siteInReadme("# a\nSee [here](https://engineering.o.xyz/blog/run-a)", "o", "a"), null);
  assert.equal(siteInReadme("# a\nSee [alpha.dev](https://alpha.dev/)", "o", "alpha"), "https://alpha.dev/");
});

test("readme: a sponsor section or a credit line (powered by, built by) is skipped even when labelled", () => {
  assert.equal(siteInReadme("# a\n## Sponsors\n[Website](https://sponsor.example)", "o", "a"), null);
  assert.equal(siteInReadme("# a\nPowered by [Website](https://engine.example)", "o", "a"), null);
  // block/buzz's footer: the owner's root, but as the maker's credit, not the product.
  assert.equal(siteInReadme('<sub>Apache 2.0 · Built by <a href="https://block.xyz">Block, Inc.</a></sub>', "block", "buzz"), null);
});
