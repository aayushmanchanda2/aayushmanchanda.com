# aayushmanchanda.com verification map

The maintained source for verifying what a reader sees on the site. Read this index before driving, then use the matching feature file as the recipe.

## Baseline preconditions

- Fresh build: `npm run build` after the last source change, then `npx astro preview --background --port 4329`.
- Doctor passes: `npx astro preview status` names port 4329 and a pid you started; `curl -sI http://localhost:4329/tools` is `200`.
- Or a deployed base: `https://aayushmanchandacom.vercel.app` or a Vercel preview URL, stated in the report.
- Commands run from the repo root.

## Driving conventions

- One harness: `node .claude/skills/verify-site/shoot.mjs --base <url> --routes <list> --label <label> [...]`.
- Default matrix is 390x844 + 1280x800 x light + dark; narrow with `--sizes`/`--themes` only when the claim is size- or theme-specific.
- Prefer stable handles: `data-*` attributes, `aria-current`, `aria-pressed`, `aria-label`, then BEM classes (`.row__link`). Never coordinates.
- Real content slugs change as the Raindrop pipeline publishes. Pick current ones from `ls dist/<section>/` rather than trusting the examples here.
- One `--label` per run; the same label on the same day overwrites `report.json`.

## Proof and skip reporting

- Cite `qa/evidence/<date>-<label>/report.json` fields (`status`, `dataTheme`, `styles`, `thirdPartyHosts`, `hoverCheck`) alongside the PNGs.
- For clicks and hovers, show the before state (a baseline run, or `visibleBefore`) and the after state.
- Network claims ("no img.logo.dev") come from `thirdPartyHosts` on every route that used to make the request, at every size.
- Report an unreachable entry point with the command and the unmet precondition; do not report it as verified through another route.

## Feature entry contract

Each feature file starts with an H1 and one paragraph of user-visible behavior, then exactly four H2s in order: `Sub-features`, `How to get to it (user POV)`, `Driving it with shoot.mjs`, `Gotchas`.

## Features

- [Tools index](./tools-index.md) covers /tools (sortable table, URL filters, list/grid toggle) and the category and verdict filter routes.
- [Tool detail](./tool-detail.md) covers /tools/<slug> and its verdict/category chips.
- [Library](./library.md) covers /library, kind tabs, domain/tag filters, entry detail, and X embeds.
- [Notes](./notes.md) covers /notes and /notes/<slug>.
- [Sites](./sites.md) covers the /sites gallery, collection/domain filters, and site detail.
