# Tool detail

/tools/<slug> is one tool's page: breadcrumb back to Tools, the name, a strip with the verdict chip, category link and "As of" date, the standfirst note, and a Source line with favicon, link and optional Repo link.

## Sub-features

- `tool-detail-head` crumb `.crumb a[href="/tools"]`, `h1.page-title--entry`, `.strip` chips.
- `tool-detail-links` `.strip__chip` goes to `/tools/verdict/<verdict>`; the category link goes to `/tools/category/<slug>`.
- `tool-detail-source` `.source` with `.source__favicon`, external link, and `.source__repo` when a repo exists.

## How to get to it (user POV)

- From /tools, anywhere on a table row (the name's `.row__link` is stretched over the row) or a grid tile (`.tile__link`).
- Directly at `/tools/<slug>`; slugs from `ls dist/tools` (e.g. `agent-browser`).

## Driving it with shoot.mjs

Preconditions:

- Doctor passes; pick a slug from `ls dist/tools` (skip `category`, `verdict`).

- **Render.** `node .claude/skills/verify-site/shoot.mjs --base http://localhost:4329 --routes /tools/agent-browser --label tool-detail --styles '.page-title--entry,.strip,.standfirst,.source__label'`. `200` at all four variants; styles show the entry title scale.
- **Chip navigation.** The verdict chip's target is its own route: include `/tools/verdict/<verdict>` from the strip in `--routes` and confirm `200`.
- **Hosts.** `thirdPartyHosts` is `img.logo.dev` at most: the Source-line icon is the live logo.dev logo, else `/icons/<slug>.webp` (VET-254).

## Gotchas

- `.row__link` and `.tile__link` on /tools point at `/tools/<slug>`; the only way off-site is the details page's Source line.
- Some tools have no repo; `.source__repo` absent is not a failure.
