# Tools index

/tools is a sortable table (briOS /stack): icon and name, description, category, verdict pill, date. Every row links to `/tools/<slug>`. Two native selects filter by verdict and category and sync to `?verdict=&category=`. A List/Grid toggle swaps the table for an iOS-style icon grid, and the choice persists across reloads. Category and verdict pages render the same table with their subset.

## Sub-features

- `tools-table` `table` > `tbody[data-tool-rows]` > `tr.row[data-tool]` (attributes `data-verdict`, `data-category` (slug), `data-sort-name|category|verdict|date`, `data-index`). Name cell `.row__link` is stretched over the row.
- `tools-sort` `th[data-sort-key] > button.sort` (name, category, verdict, date); state is `aria-sort` on the `th`. Cycle: natural direction (date newest first), reverse, file order.
- `tools-filters` `#filter-verdict`, `#filter-category` (`[data-filter]`), count `[data-filter-count]` (aria-live), empty state `[data-filter-empty]`.
- `tools-grid` `ul[data-tool-rows] > li.tile[data-tool] > a.tile__link` (60px `.app-icon`, `.tile__name`), shown when `html[data-tools-view="grid"]`.
- `tools-filter-category` /tools/category/<slug>: table without the Category column.
- `tools-filter-verdict` /tools/verdict/<verdict>: table without the Verdict column.
- `tools-marks` `.app-icon`: an `<img src="/icons/<slug>.webp">`, or `.app-icon__letter` where there is none.
- `tools-panel` on /tools a row or tile (`a[data-panel-open]`) opens `[data-detail-panel][data-open]` (`DetailPanel.astro`), URL `/tools/<slug>`; filters and the toggle stay usable beside it. Scripted proof: `qa/evidence/2026-09-23-r5-2/check.mjs`. Under 1100px or on touch there is no panel (VET-279, VET-285, `lib/detail-panel.ts › PANEL_OFF`): the tap follows the link to the entry's page, and on touch or a phone the shot sits full height in the page's flow. Touch proof: `qa/evidence/2026-09-23-vet-279-scroll/probe.mjs` (CDP touch gestures at 375x812).
- `tools-preview` rows and tiles carry `data-preview` (`/previews/<slug>.webp`, empty for the icon-only card) and `data-preview-name|domain|description|note`. The shared card is `.preview-card`, built on first hover; open is `[data-open]`, icon-only is `[data-no-image]`, flipped is `[data-side="top"]`.

## How to get to it (user POV)

- Tools in the Menu panel or the top bar trail, or open `/tools` directly.
- Pick a Verdict or Category in the selects above the table; press a column header to sort; press `List` or `Grid` after the selects.
- From a tool detail page, the verdict chip (`/tools/verdict/<verdict>`) or category link (`/tools/category/<slug>`).

## Driving it with shoot.mjs

Preconditions:

- Doctor passes. Current filter slugs: `ls dist/tools/category dist/tools/verdict` (e.g. `agent-infra`, `using`).

- **Table baseline.** `node .claude/skills/verify-site/shoot.mjs --base http://localhost:4329 --routes /tools --label tools-list --styles '.row__link,.row__desc,.sort,[data-filter-count]'`. Screenshots show the table; first row under 300px at 1280.
- **Query filters.** `... --routes '/tools?verdict=using,/tools?category=agent-infra&verdict=watching' --label tools-query`. Use a label separate from the filter pages: `/tools?verdict=using` and `/tools/verdict/using` slug to the same PNG name.
- **Grid via the button.** `... --routes /tools --label tools-grid --click '[data-tools-view-set="grid"]'`. Pressed button text is `Grid`; screenshots show 60px squircles, four across at 390.
- **Filter pages.** `... --routes /tools/category/agent-infra,/tools/verdict/using --label tools-filters --styles '.page-title'`. Both `200`.
- **Sort, filter round-trip, row click, Back.** `shoot.mjs` has no select or back step; `qa/evidence/2026-09-22-vet-227/interactions.mjs` is the scripted check (run from the repo root with the base URL as its argument) and writes `interactions.json`.
- **Hover preview.** `... --routes /tools --label tools-preview --sizes 1280x800 --hover 'tbody tr[data-preview]' --expect '.preview-card[data-open]' --wait 400` (expect visible); the same with `--wait 150` reports `visibleAfter: false`, which is the 300ms delay, not a bug. Grid tiles: add `--click '[data-tools-view-set="grid"]'` and hover `.tile[data-preview]`. Flip, cursor tracking, close delay, keyboard focus + Escape and the touch gate have no `shoot.mjs` step: `qa/evidence/2026-09-22-vet-228/interactions.mjs` (run from the repo root against :4329) writes `interactions.json`.
- **Third-party hosts.** Every run records `thirdPartyHosts`; logos load live from logo.dev (VET-254), so /tools and its filters show `img.logo.dev` and nothing else.

## Gotchas

- The `.views` group ships `hidden` and the PREPAINT script from `src/lib/view-toggle.ts` (`TOOLS_VIEW`, written by `ViewToggle.astro`) unhides it; with JS broken the toggle is missing, not dead. Its absence is a finding.
- The view persists in `localStorage["tools-view"]` per browser context. `shoot.mjs` uses a fresh context per size/theme; within one run a `--click` persists across the routes after it.
- Playwright's click on a non-name cell trips its "another element intercepts" check, because the stretched link covers the row on purpose. Pass `{ force: true }`: the mouse still presses the cell.
- Filters are applied by a module script after parse, so a deep link paints the full table for a frame before hiding rows. Wait for load before asserting.
- Programmatic `focus()` does not match `:focus-visible`; reach the row link with `Tab` to see its ring.
