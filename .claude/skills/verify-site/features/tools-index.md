# Tools index

/tools lists every tool grouped by category, each row with a mark, name, verdict badge, dated status, note and a Details link. A two-button control switches the same markup between a list and a card grid, and the choice persists across reloads. Category and verdict pages filter the list.

## Sub-features

- `tools-list` renders grouped rows (`.group`, `.group__head`, `.row`) in list view by default.
- `tools-grid` switches to cards when the reader presses Grid; persists after reload.
- `tools-filter-category` /tools/category/<slug> shows one category.
- `tools-filter-verdict` /tools/verdict/<verdict> shows one verdict.
- `tools-marks` row marks (`.row__mark`) load logos; initials (`.row__mark--initial`) where there is none.

## How to get to it (user POV)

- Left rail / nav link to Tools, or open `/tools` directly.
- Press `List` or `Grid` in the `Tools layout` group, top right above the first category.
- From a tool detail page, the verdict chip (`/tools/verdict/<verdict>`) or category link (`/tools/category/<slug>`).

## Driving it with shoot.mjs

Preconditions:

- Doctor passes. Current filter slugs: `ls dist/tools/category dist/tools/verdict` (e.g. `agent-infra`, `using`).

- **List baseline.** `node .claude/skills/verify-site/shoot.mjs --base http://localhost:4329 --routes /tools --label tools-list --styles '.row__name,.group__head,[data-tools-view-set][aria-pressed="true"]'`. Pressed button text is `List`; screenshots show rows.
- **Grid via the button.** `... --routes /tools --label tools-grid --click '[data-tools-view-set="grid"]' --styles '[data-tools-view-set][aria-pressed="true"]'`. Pressed button text is `Grid`; screenshots show bordered cards, two per row at 1280.
- **Filters.** `... --routes /tools/category/agent-infra,/tools/verdict/using --label tools-filters --styles '.page-title'`. Both `200`; `.page-title` text is the category/verdict.
- **Third-party hosts.** Every run above records `thirdPartyHosts`; today /tools and its filters request `img.logo.dev` for row marks. A change that self-hosts marks is proven when that host is absent on all three routes at both sizes.

## Gotchas

- The `.views` group ships `hidden` and the PREPAINT script in `src/lib/tools-view.ts` unhides it; with JS broken the toggle is missing, not dead. Its absence is a finding.
- The view persists in `localStorage["tools-view"]` per browser context. `shoot.mjs` uses a fresh context per size/theme, so a `--click` in one run does not leak into the next; within one run it persists across the routes listed after it.
- `data-tools-view` on `<html>` is the layout switch; it is set by script, so assert via `aria-pressed` and the screenshot, not by reading HTML source.
- The grid is `auto-fill` 15rem columns: expect one column at 390, two at 1280. Run the grid click at both sizes.
