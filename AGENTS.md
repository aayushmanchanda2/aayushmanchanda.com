# AGENTS.md

`CLAUDE.md` is a symlink to this file. Both Claude Code and Codex read it.

## What this repo is

`aayushmanchanda.com` — a personal site that fills itself. Astro static build, git as the database, deployed on Vercel. No CMS, no drafts folder. Content arrives either from a link saved to Raindrop on a phone (a GitHub Actions cron screenshots it and commits the result) or from a file edited by hand. Everything else is a build step. `README.md` has the full pipeline.

Zero framework JS ships. Interactions are vanilla scripts inside `.astro` components or plain modules in `src/lib/`.

## Before you touch UI

**Read `design.md` first.** It is the design contract: tokens, type, structure, interactions, links, copy, and the pre-ship checklist, each claim pointing at the file that enforces it. It is written from the shipped code, so it is checkable. If the code and `design.md` disagree, fix whichever is wrong, in the same commit.

## Gates

Run all three before calling anything done:

```
npx astro check     # 0 errors, 0 warnings (hints: known baseline of 13)
npm test            # all pass
npm run build       # clean
```

Then verify against the real page, not the built HTML: `npm run dev`, open it, press the thing you changed. Check both themes, 375px wide, and reduced motion. The full checklist is §8 of `design.md`.

## Copy

**Read the voice guide before changing a word a reader sees.** It is `feature-research/aayushmanchanda-com/voice-guide-for-site.md` in the AayushOS repo, extracted from the gbrain page `voice-guide`. `PURPOSE.md` at this repo's root is what the copy is for; §6 of `design.md` is the rule set.

Everything earns its place: writing exists for the reader, not to show its work. Audit voice stays in audits. First person, plain words, real opinions only, honest dates, no em dashes, accuracy without defensiveness.

## Dev server

```
astro dev --background
```

Manage it with `astro dev stop`, `astro dev status`, `astro dev logs`.

## Astro reference

<https://docs.astro.build> — [routing](https://docs.astro.build/en/guides/routing/), [components](https://docs.astro.build/en/basics/astro-components/), [content collections](https://docs.astro.build/en/guides/content-collections/), [styling](https://docs.astro.build/en/guides/styling/).
