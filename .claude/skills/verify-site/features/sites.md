# Sites

/sites is a gallery of saved websites as screenshot cards, filterable by collection and domain. Each site's page shows a full-page screenshot in a scrollable frame with copy/download actions, a facts list (domain, collections, saved date, palette, link) and, when captured, a design-foundations panel.

## Sub-features

- `sites-gallery` `ul.grid` of `li.card` > `a.card__link` with `.card__title`, `.card__domain`; cards stagger in (`--stagger`).
- `sites-filters` `nav.collections[aria-label="Filter sites by collection"]` links to `/sites/collection/<slug>`; `/sites/domain/<domain>`.
- `sites-detail` `/sites/<slug>`: `figure.shot` (ShotFrame, `.shot__caption`), `[data-shot-actions]` with Copy/Download buttons (`aria-label="Copy the <title> screenshot to the clipboard"`, `"Download the <title> screenshot"`), `dl.facts`.
- `sites-design-panel` `.found` (`.found__head`, `.found__title`, `.found__note`, `.found__md`) on sites with a captured `design`.

## How to get to it (user POV)

- Sites link in the rail, or `/sites`.
- A collection link in the Collections row; a domain link in a site's facts.
- A card in the gallery for its detail page (slugs from `ls dist/sites`, e.g. `about-brian-lovin`).

## Driving it with shoot.mjs

Preconditions:

- Doctor passes. Collection slugs: `ls dist/sites/collection` (e.g. `portfolios`).

- **Gallery.** `node .claude/skills/verify-site/shoot.mjs --base http://localhost:4329 --routes /sites,/sites/collection/portfolios --label sites --styles '.card__title,.card__domain,.collections a'`. Animations are disabled at capture, so cards are in their final state.
- **Detail.** `... --routes /sites/about-brian-lovin --label sites-detail --styles '.page-title--entry,.shot__caption,.facts dt,.found__title' --full`. `.found__title` present proves the design panel rendered.
- **Hosts.** Gallery and detail currently have empty `thirdPartyHosts` (screenshots are self-hosted).

## Gotchas

- The copy button writes to the clipboard; headless Chromium denies clipboard permission by default, so do not treat a failed copy in `shoot.mjs` as a site bug. Verify the status text (`[data-shot-status]`) only with a context granted `clipboard-write`.
- Download writes a file; do not click it in a verification run unless the claim is about the download.
- Sites without `design` have no `.found`; pick a slug whose `dist/sites/<slug>/index.html` contains `class="found"`.
