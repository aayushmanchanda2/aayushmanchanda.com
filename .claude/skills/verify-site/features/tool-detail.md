# Tool detail

/tools/<slug> is one tool's page: breadcrumb back to Tools, the name, a strip with the verdict chip, category link and "As of" date, the standfirst note, and a Source line with favicon, link and optional Repo link.

## Sub-features

- `tool-detail-head` crumb `.crumb a[href="/tools"]`, `h1.page-title--entry`, `.strip` chips.
- `tool-detail-links` `.strip__chip` goes to `/tools/verdict/<verdict>`; the category link goes to `/tools/category/<slug>`.
- `tool-detail-source` `.source` with `.source__favicon`, external link, and `.source__repo` when a repo exists.

## How to get to it (user POV)

- From /tools, the row's `Details` link (`.row__more`) or the tool name.
- Directly at `/tools/<slug>`; slugs from `ls dist/tools` (e.g. `agent-browser`).

## Driving it with shoot.mjs

Preconditions:

- Doctor passes; pick a slug from `ls dist/tools` (skip `category`, `verdict`).

- **Render.** `node .claude/skills/verify-site/shoot.mjs --base http://localhost:4329 --routes /tools/agent-browser --label tool-detail --styles '.page-title--entry,.strip,.standfirst,.source__label'`. `200` at all four variants; styles show the entry title scale.
- **Chip navigation.** The verdict chip's target is its own route: include `/tools/verdict/<verdict>` from the strip in `--routes` and confirm `200`.
- **Hosts.** `thirdPartyHosts` shows what the favicon/mark loads (today `img.logo.dev`).

## Gotchas

- `.row__link` on /tools points off-site (the tool's own URL); the in-site path is `.row__more` ("Details").
- Some tools have no repo; `.source__repo` absent is not a failure.
