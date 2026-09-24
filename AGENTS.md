# AGENTS.md

`CLAUDE.md` is a symlink to this file. Both Claude Code and Codex read it.

## What this repo is

`aayushmanchanda.com` — a personal site that fills itself. Astro static build, git as the database, deployed on Vercel. No CMS, no drafts folder. Content arrives either from a link saved to Raindrop on a phone (a GitHub Actions cron screenshots it and commits the result) or from a file edited by hand. Everything else is a build step. `README.md` has the full pipeline.

Zero framework JS ships. Interactions are vanilla scripts inside `.astro` components or plain modules in `src/lib/`.

## Private /me (VET-274)

`/me/*` is the one on-demand route (the Vercel adapter, Clerk, Convex); every other page is prerendered, and a /me change must leave `dist/` byte-identical apart from `sitemap` dates. One exception, on purpose (VET-276): every page carries a ~110-byte inline check (`lib/signed-in-check.ts`) that imports `/signed-in.js` only when Clerk's `__client_uat` cookie is non-zero; that module (`lib/signed-in.ts`) adds "Private" and "Sign out" to the top bar, merges the private rows from `/me/api/rows` into the library pane and ⌘K. A signed-out visitor's JS must stay byte-identical to main: `qa/evidence/2026-09-23-signed-in/check.mjs` measures it. **This repo is public: no private entry, note, media, email or secret ever enters it.** The rows live in Convex (`convex/`), loaded by `scripts/private-import.mjs` from the private folder next to this repo; `scripts/private-setup-wizard.sh` sets every key. `astro preview` does not run with the adapter: see `.claude/skills/verify-site/SKILL.md`.

## Before you touch UI

**Read `design.md` first.** It is the design contract: tokens, type, structure, interactions, links, copy, and the pre-ship checklist, each claim pointing at the file that enforces it. It is written from the shipped code, so it is checkable. If the code and `design.md` disagree, fix whichever is wrong, in the same commit.

## Gates

Run all four before calling anything done:

```
npx astro check     # 0 errors, 0 warnings (hints: known baseline of 1)
npm test            # all pass
npm run build       # clean
npm run validate:schema  # JSON-LD valid on every page
```

**What a test is for** (Brian Lovin's rule): test copy, hrefs and logic, not CSS source. A test that greps a stylesheet for a property passes while the page looks wrong and fails on a harmless refactor. Look is checked on the real page, below.

Then verify against the real page, not the built HTML: `npm run dev`, open it, press the thing you changed. Check both themes, 375px wide, and reduced motion. The full checklist is §8 of `design.md`.

## Copy

**Read [`voice.md`](voice.md) before changing a word a reader sees.** It is the voice (Guide A), the value test, the banned patterns and the caps per surface. `PURPOSE.md` is what the copy is for; §6 of `design.md` is the rule set, and `src/lib/copy-lint.test.mjs` enforces the banned sentences and the em dash rule in `npm test`.

Every sentence gives the reader a fact or an opinion they'd want. Nothing that describes the site, narrates how it got made, or reassures. Audit voice stays in audits.

## Dev server

```
astro dev --background
```

Manage it with `astro dev stop`, `astro dev status`, `astro dev logs`.

## Astro reference

<https://docs.astro.build> — [routing](https://docs.astro.build/en/guides/routing/), [components](https://docs.astro.build/en/basics/astro-components/), [content collections](https://docs.astro.build/en/guides/content-collections/), [styling](https://docs.astro.build/en/guides/styling/).
