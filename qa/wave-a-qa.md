# Wave A QA (2026-09-22), diff 2921b8c..6d7c29f

Fix 1 applied on branch `qa-wave-a-fix-1`; evidence in `qa/evidence/2026-09-22-qa-fix-1*/`.

Reviewers (all read-only):
- thermo-nuclear code review (opus)
- ponytail-review (sonnet)
- UI/interface review on production (opus)
- live link sweep (sonnet)

Verdicts:
- **UI:** every page is Approve. There are 4 medium and 5 low findings.
- **Link sweep:** 783 fetches. None came back non-200, and no links are broken.
- **Ponytail:** 2 cuts, saving about 6 lines. The wave as a whole removed 1,808 lines.

## Accepted: Fix 1 (what readers see), one PR
- [x] **A. Repo screenshots in previews.** Tools with only a GitHub repo get their preview captured from that repo page, and `buzz.webp` shows a contributor's avatar.
  - Fix: one site resolver built from `icon.mjs › homepageOf`, shared by the icon and preview steps, skipping GitHub hosts. Delete the 16 repo-page previews. Those tools fall back to an icon-only card. (`pipeline/preview.mjs:88`, `apply.mjs:485`)
- [x] **B. /tools table on phones.** The table's semantics break below 640px because the display changes on the tr and th.
  - Fix: keep table display and only hide columns.
  - Also hide the Category and Date sort headers on phones, where their cells are hidden. (`ToolList.astro:214-240`)
- [x] **C. j/k fire anywhere on the page** (WCAG 2.1.4 Level A). Fix: scope them to focus inside `[data-pane]`, or drop them. *(Done: scoped, not dropped.)* On `(hover: none)`, hide the key labels in the hints (`.hint__key`).
- [x] **D. Filter controls.**
  - Selects: 16px text on phones (iOS zooms anything smaller), a 40px minimum height, and 44px under `(pointer: coarse)`.
  - List/Grid: a hit area via `::before`.
  - Use `VERDICT_LABELS` for the option text. (`tools.astro:114,128`)
- [x] **E. Library pane tab order.** The pane puts 139 links in the tab order before the entry. Fix: roving tabindex, with only the `aria-current` link at `tabindex=0` and Up/Down moving between links.
- [x] **F. Crumbs at 390 and 320.** The current title truncates to a few characters. Fix: when the trail is 3 deep and the screen is narrow, hide the root crumb and its divider, or give `.crumbs__here` `min-width: 8ch` and let the root shrink.
- [x] **G. Chips.** The text is 11px, under the 12px floor. Fix: 12px. (`chip.css:48`)
- [x] **H. Separators.** In the footer and in the /sites Collections list, the `·` separators can start or end a wrapped line. Fix: use flex gap and no dots when narrow.
- [x] **P. /privacy** has no JSON-LD. Pre-existing. Fix: add the same WebPage and breadcrumb JSON-LD the other pages have.

## Accepted: Fix 2 (structure), one PR after Fix 1
- [ ] **I. `lib/assets.ts`.** Read `public/icons` and `public/previews` once each into a Set, following `sites.ts:135` PUBLIC_DIR. `markFor` and `previewFor` use it, which removes the repeated `existsSync`. Move `toolAttributes` out of `tools.ts` so it sits next to ToolList/ToolGrid.
- [ ] **J. One `EntryList` component** (`{title, href, meta?, thumb?}`) for /notes, Read next, and Latest on home. The heading style goes into `.accent-bar`.
- [ ] **K. `pipeline/util.mjs`.** Add `writeAtomic`, which replaces the 5 copies of temp-then-rename, and `backfill(items, fn, n)`, which gives both backfills one concurrency. Make sure a stray `.tmp` file can never be committed.
- [ ] **L. Dates.**
  - `date.ts` gets `isoDay` and `rfc822`, and the 4 copies of `toISOString().slice(0,10)` use it.
  - Rename rss.ts's `absolutize` to `absolutizeHtml`.
- [ ] **M. `TopBar.astro`.** Pull the bar markup, the scroll-to-top script and the bar CSS out of Base (828 lines). `FEEDS`/`FEED_SECTIONS` move into `sections.ts` and the `catalogue()` helper is deleted.
- [ ] **N. Dead code and contract drift.**
  - Delete `NavKind`, `NavItem.kind`, `Section.kind`, the catalogue `kind` values and Base's "Dash hierarchy" code.
  - Fix the stale SiteMark comments in MarkGlyph and design.md's "rail dashes".
  - Resolve the design.md contradictions: `.tabular-nums` on dates (lines 114 vs 143), and the radii statement (line 325) against pills and `--r-lg` on pane rows.
  - `.accent-bar` uses `--r-pill`.
  - `.select:hover` stops using `--text-quaternary`.
  - `trailOf` trailing-slash consistency (`schema.ts:416`).
  - Update design.md so `.prose` means "reading text" wherever it's applied.
- [ ] **O.** `read-next.ts` uses a tiny string hash instead of `node:crypto` sha1. `links.ts` gets one shared file-on-disk helper (folded into I).

## Deferred, with reasons
- `Tool.description` and `LibraryEntry.tldr` are unused today. T2 and T14 fill them soon, so they stay.
- /sites hover cards decode the full-page shot (up to 920KB). Revisit in T11: generate 1200×630 crops for sites.
- `sites.json:505`: Aayush's saved `like` copy still says the site uses a proximity sidebar, which is stale. That's his copy, so it goes to T10 or to him.
- `.prose` split into `.reading` + `.prose`: handled by the contract update in N.
- Not verified: forced-colors, 200% zoom, a real iOS device. Queued for the T11 polish QA.
