# Phase 2 QA (2026-09-23), diff 13b1b03..5db1bfe

Reviewers, all read-only:
- thermo-nuclear, in 4 slices: pipeline, posts/library/pages, client scripts, CSS/design
- ponytail (4 scans): about 28 lines could go, all duplicated helpers
- UI review on production: every page Approve except /library at 320, which is Block
- live sweep: 413 URLs, 314 links and 45 media all returned 200; logo.dev is the only third-party host; no banned phrases

## Fix A: blockers and correctness (one PR)
- [x] **A1. CI never commits new X-post media.** Add `public/posts` to `COMMITTED` in `pipeline/publish.mjs:183-191` and to the `paths` array in `.github/workflows/publish.yml`. Add a test.
- [x] **A2. `pipeline/post.mjs` robustness.**
  - A 200 response that isn't JSON must throw; only a 404 or a real `TweetTombstone` counts as removed.
  - Catch per media item: drop the item, or fall back to poster-only.
  - Stream downloads with a byte cap, since a missing content-length currently reads as 0.
  - Require `id_str` to match `^\d+$`.
  - Skip entities that lack string `url`/`display_url`/`expanded_url`.
  - Give each atomic write a unique `.tmp` suffix.
  - Validate `library.ts`: post id numeric, `quoted` exactly one level deep, `w`/`h` finite and above 0, booleans strict.
  - Add tests for non-JSON, partial media failure and a bad quoted id.
- [x] **A3. `siteOf` runs 3× per tool.** Resolve it once, pass it down, and send `GITHUB_TOKEN` when set. In `link-previews`: no double fetch, launch Chromium lazily, and fix the URL regex so `)` and `&amp;` match `linkHash`.
- [x] **A4. `site-panel.ts:36,148` and older Safari.** `checkVisibility` is missing before Safari 17.4. Add the fallback `el.checkVisibility?.() ?? el.getClientRects().length > 0`.
- [x] **A5. One Escape closes two layers.** Every document-level key listener gets `if (event.defaultPrevented) return;` through a shared `lib/keys.ts` `ownsKey(e)`. That covers the palette, sites panel, home screen, EntryNav, mobile nav and library pane.
- [x] **A6. Sites panel history.** Closing calls `history.back()` when `history.state?.site` is set, otherwise `replaceState`. On fetch failure use `location.replace`.
- [x] **A7. Home screen.**
  - Reset the stale `swallow` flag on keydown and pointerup.
  - The `e` shortcut only fires with focus inside `[data-home]` (WCAG 2.1.4).
  - The hint says "Press E" on fine pointers and "Long-press an icon" on touch. Place it beside the view toggle, not over the tiles, and clear it after first use or 6 seconds.
- [x] **A8. `post.ts parts()`.** Find links once on the whole text, then split at the keyline. Exclude `…` from bare-URL endings. Move the reveal observer into shared `lib/reveal.ts`, used by PostText, ReaderBlocks and Doodle.
- [x] **A9. Library segments at 320 (UI blocker #1).** Below 360px, drop the counts or let the row scroll sideways with a fade. Verify at 320 with no clipping.
- [x] **A10. Accessibility.**
  - The palette active-row `mark` fails at 3.5:1: use a dark wash or an underline, and add it to `ink.test`.
  - Add a `@media (forced-colors: active)` block covering `mark`/`.hl`, the mat, stamp band and postmark.
  - Top bar focus ring: `outline-offset: -2px`, or pad by `--cover`.
  - `SiteFoundations`: move the `h2` out of `summary`.
  - Palette: `role=status` for the result count and loading state; set `aria-expanded` correctly.
  - `palette-rows`: use `setAttribute('role')`.
- [x] **A11. Tools list at 320–390.** The description goes on its own full-width line under the name. Stack the filter selects at 100% width below 360px.
- [x] **A12. Small copy and meta.**
  - Privacy "orsystem" typo.
  - Library `[slug]` meta description leads with the TLDR.
  - `library.md.ts` blockquotes: prefix every line.
  - The tools `new` category must not collide with a real one, and stays out of JSON-LD.

## Fix B: UI polish and structure (one PR after A)
- [x] **B1. Stamp labels:** 11–12px, ink opacity ≥ .85, so contrast is ≥ 4.5 on paper in both themes. Ruler digits stay decorative.
- [x] **B2. Letter tiles:** one neutral tone (surface-2 with tertiary ink), not random hues, so they read as intentional.
- [x] **B3. Sites panel on desktop:** a layered left-edge shadow and a 4–8% dim over the gallery behind it, in both themes.
- [x] **B4. Postmark below 600px:** shift it right or hide the wavy lines so it clears the breadcrumbs.
- [x] **B5. Sites list:** use the tools table style, with headers Name / Domain / Collections / Saved.
- [x] **B6. Library "All" view:** a mixed layout (newest article card, latest 4 posts, latest 2 videos), so it no longer repeats the pane.
- [x] **B7. Masthead consistency:** one pattern, with the subtitle under the title everywhere, Tools included.
- [x] **B8. Post card links:** one pattern, "Read more" plus a ↗ icon for the original. Consistent X mark size.
- [x] **B9. Highlighter:** consolidate into a single `mark` system with a `--pen` token. Amber from one token; wallpaper and library mat derived from shared hue tokens.
- [x] **B10. Dead CSS:** remove `data-age="strong"`, `data-stamp` base, the `.mat__lift` rules and the unused strong texture. Prebuild the `--age` noise as a small tiled asset rather than a stretched 1440×900.
- [x] **B11. Shared helpers:**
  - `lib/motion.ts` (reduced-motion)
  - `lib/storage.ts` (safe localStorage)
  - `lib/reveal.ts` (from A8)
  - one show-all toggle
  - `FLASH_MS` in one place
  - pipeline `util.mjs`: `exists`, `oneLine`/`flat`, `squash`, a fetch-with-timeout wrapper, `bareHost`
  - `library.ts`: `readCommittedPath` and `readList` reuse
  - `links.ts` `markFor` uses `monogram()`
- [x] **B12. Search:** normalize the index once after fetch; cache the parsed site-panel fragment, not the Document. `ui-sound`: try/catch around AudioContext, and suspend on mute or when the page is hidden.
- [x] **B13. Tests:**
  - `wide.test` checks behaviour, not the regex fullPages pattern
  - `ink.test` parses `light-dark()` pairs
  - `rescrape` tie test
  - `backfill-posts.mjs` gets a main guard
  - fix stale `types.d.ts` `Post.text`
- [x] **B14. design.md drift:**
  - amber consumers
  - the token list is hand-written, so either generate it or say so
  - move hex values in `AppIcon`/`PostMedia` into `styles/`
  - row-note ink level
  - stale comments in CollectionChips, chip.css, Moments and palette.css
  - verify-site features map entries for deleted files

- [x] **B15. Split library.ts:** move post parsing into `src/lib/post-schema.ts` (library.ts is at 938 lines). `/library/kind/*` renders only its own view's markup. The other views load on switch or link out, so the same ~350KB of HTML no longer ships four times.

## Deferred / Aayush's call
- Orbis role: the Work row stays frozen with no title (earlier decision). The UI review asked for "Co-founder", which is not applied.
- The claudex tool listing, the jakubkrehel/emilkowalski verdicts, and links on the About Work rows.
- Letter tiles: real icons for the dock tools need real logos. logo.dev has none; J2's art could cover this.
- J2 avatar art: waiting on Aayush in ChatGPT.

## Fix A: done (branch `qa-phase2-fix-a`)
Proof: `qa/evidence/2026-09-23-qa-fix-a/` (`check.mjs` writes `report.json`, `extra.mjs` writes `extra.json`; screenshots are gitignored, rerun to recreate). Notes against the list above:
- A9 went further than "below 360": the four segments need 309px, which clipped at 360 and 390 too, so the counts drop by container width (toolbar under 20rem), not viewport.
- A11 moves the verdict pill onto the name line on phones, so the description can take the full row.
- A10's forced-colors block lives in its own `styles/forced-colors.css` (frame.css was already over 300 lines).

## Fix B: done (branch `qa-phase2-fix-b`)
Proof: `qa/evidence/2026-09-23-qa-fix-b*/` (`report.json` per run; PNGs gitignored, rerun `shoot.mjs` to recreate). Before shots: `2026-09-23-qa-fix-b-before*`. Library routing: `2026-09-23-qa-fix-b-library/check.mjs` → `check.json`. Notes against the list above:
- B1: `--stamp-label`, 11px, .9/.85 alpha, unworn. 5.00 to 5.30:1 light and 6.97 to 7.37:1 dark across the six mats, held in `ink.test`.
- B7: /tools' table header now starts at 304px at 1280 (was 257 with the inline intro); the controls sit 0.75rem under the standfirst.
- B10: the lift is live (`data-stamp="full"` shipped), so only its switch rules went, with `data-stamp` and `data-age`. `public/mat-wear.webp` is 17KB, made by `scripts/mat-wear.mjs`; before/after corner crops in `2026-09-23-qa-fix-b-g1/cmp-*.png`.
- B11: the fetch-with-timeout wrapper was skipped: every call site takes an injected `fetch` for its tests, so a wrapper would have to take it too.
- B15: HTML per route, before → after: /library 355,850 → 127,623; article 339,225 → 139,633; post 346,499 → 283,576; video 333,590 → 100,846 (1.38MB → 0.65MB). A kind press on /library or a kind route follows its link; `/library?kind=` redirects. library.ts is 759 lines (post parsing moved to `post-schema.ts`, 172).

