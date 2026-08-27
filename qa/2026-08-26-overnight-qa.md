# QA — overnight review batch (T8 / VET-14)

Two reviews, 17 accepted findings, all applied on 2026-08-26. Every item below
is done and verified against a real build.

## Thermo findings (15)

- [x] **1. Typecheck gate.** Added `@astrojs/check` + `typescript`, an
      `npm run check` script, and `checkJs: true`. Found 18 real errors, all
      fixed. The one that mattered: a bare `<` in MobileNav's frontmatter
      comment made the Astro compiler drop the `Props` interface, so every prop
      on that component had silently been `any`.
- [x] **2. CI gates.** `npm test` runs after `npm ci` (before a browser is
      downloaded); `npx astro build` runs after the pipeline's commit and before
      the push, so bad generated data fails the workflow instead of landing on
      main. Keepalive untouched — it only fires at 25 days idle, which a run
      that just committed can never be.
- [x] **3. Markdown-variant list, four places to one.** `Section` now carries
      `md: string | null`. `astro.config.mjs` imports `PAGES`; `Base.astro`,
      `llms.txt.ts`, `index.md.ts` and `404.md.ts` all look up through
      `markdownVariantFor()`. No `${href}.md` guessing anywhere.
- [x] **4. `src/lib/parse.ts`.** `SLUG`, `ISO_DATE`, and a `readers(filename)`
      factory. All three data boundaries use it; each keeps its own per-entry
      messages and its section-specific readers (`readUrl`, `readShot`,
      `readLinks`). No schema library added.
- [x] **5. `src/lib/links.ts` + `EntryLink.astro`.** `INTERNAL_PATH`,
      `isInternal()`, `absolutize()`, and one component that sets `rel`/`target`
      by dropping `undefined`. Replaced 8 scattered implementations across
      `experiments.astro`, `notes/[slug].astro`, `experiments.md.ts`,
      `notes.md.ts`, `experiments.ts`, `content.config.ts`.
- [x] **6. `linkLabel` + `faviconUrl` moved** out of `lib/tools.ts` into
      `lib/links.ts`. Importers updated: `experiments.astro`,
      `notes/[slug].astro`, `tools/[slug].astro`, `ToolList.astro`; the
      `privacy.astro` reference now names the right file.
- [x] **7. `404.md.ts` through `markdownDocument()`** with a new `status`
      option. It gained frontmatter, a canonical URL, and the other-pages index
      it never had. Still returns 404.
- [x] **8. Masthead dedupe.** Home uses `.page-title` + `.standfirst` with one
      `margin-top` override. Mono masthead promoted to `.page-title--mono`,
      shared by /notes and the 404. The "deliberate variant" comments that were
      no longer true are gone.
- [x] **9. `.facts` / `.fact` promoted** to `global.css`; both detail pages use
      it and keep only the value styling that is actually theirs.
- [x] **10. `pipeline/util.mjs`.** Shared `describe()` and `isRecord()`; the 4+2
      copies across `capture`, `apply`, `raindrop`, `publish`, `entries` and
      `state` are gone. `raindrop.mjs` imports it — a `typeof` check is language,
      not domain.
- [x] **11. X placeholder removed** from the footer. A `rel="me"` pointing at a
      bare `https://x.com/` is a claim about nobody.
- [x] **12. Shared `normalize()`** in `lib/links.ts`, used by
      `ProximitySidebar`, `MobileNav` and `Base`. `NavKind`/`NavItem` moved to
      `lib/sections.ts` so neither nav surface owns the other's vocabulary.
- [x] **13. Dead tokens deleted** — `--r-md`, `--r-lg`, `--rail-width`. Verified
      zero references before and zero in the built CSS after.
- [x] **14. MobileNav `setOpen`** is a const arrow declared after the null
      guard; the five `!` assertions are gone.
- [x] **15. `captureSite` takes `log`** (default `console.warn`); both
      light-only warnings route through it, and `apply.mjs` passes the run's
      logger so the downgrade lands in the run log instead of stderr. The
      existing fixture and the existing light-only test now observe it.

## Sweep findings (2)

- [x] **16.** 404 body: `and<a` → `and <a` (front-page link).
- [x] **17.** 404 body: `in<a` → `in <a` (sitemap link).

Both were Astro collapsing a newline between text and an anchor. Fixed with an
explicit `{" "}` and confirmed in the built HTML and on the live page.

## Sweep — clean, no action

- [x] Nav: rail and mobile panel agree on the current page on every route.
- [x] Links: 66 checked, 0 broken.
- [x] Headings: one `h1` per page, no skipped levels.
- [x] Titles: unique and correctly suffixed on every route.
- [x] Footer: renders on every page (now one link shorter, deliberately).
- [x] Mobile menu: opens, closes, traps focus, restores scroll.
- [x] Sidebar: proximity animation, `aria-current`, reduced-motion fallback.
- [x] No placeholder text anywhere in the built output.

## Standing gates

- [x] `npm run check` — 0 errors, 0 warnings (56 files).
- [x] `npm test` — 37/37 pass.
- [x] `npm run build` — clean, 50 pages.
- [x] All five markdown variants and `/llms.txt` byte-identical to the previous
      deploy: the refactors changed no output.
- [x] Live: 404 spacing correct; `Accept: text/markdown` on `/tools` still
      negotiates to `/tools.md`.

## Worth knowing next time

**Never write a bare `<` in `.astro` frontmatter, comments included.** It makes
the compiler emit `_props: Record<string, any>` instead of your `Props`
interface, and every prop on the component stops being typed with no error
anywhere. Write "below 900px". `npm run check` is what catches it.

**Astro's scoped styles stop at a component boundary.** Moving an element into a
child component silently drops the parent's styling — the `data-astro-cid`
attribute does not follow a `class` prop. Extracting `EntryLink` broke
`/experiments` link styling exactly this way; the fix is `:global()` under an
ancestor that still carries the cid.
