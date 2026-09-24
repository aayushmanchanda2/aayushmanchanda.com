# Sites

/sites is a gallery of saved websites as screenshot cards, filterable by collection and domain. Each site's page shows a full-page screenshot in a scrollable frame with copy/download actions, a facts list (domain, collections, saved date, palette, link) and, when captured, a design-foundations panel.

## Sub-features

- `sites-gallery` `ul.grid` of `li.card` > `a.card__link` with `.card__title`, `.card__domain`; cards stagger in (`--stagger`).
- `sites-preview` each `li.card` carries `data-preview` (its `/shots` file) and the hover card opens over it; see `tools-index.md › tools-preview`.
- `sites-filters` `nav.collections[aria-label="Filter sites by collection"]` links to `/sites/collection/<slug>`; `/sites/domain/<domain>`.
- `sites-detail` `/sites/<slug>`: `figure.shot` (ShotFrame, `.shot__caption`), `[data-shot-actions]` with Copy/Download buttons (`aria-label="Copy the <title> screenshot to the clipboard"`, `"Download the <title> screenshot"`), `dl.facts`.
- `sites-list` the list view (`[data-view-set="list"]`): `table.dtable[data-sites-list]` (`SiteList.astro`, `styles/table.css`), headers Name / Domain / Collections (gray chip pills, unlinked) / Saved; each `tr` carries `data-preview` and one `a.row__link[data-site-open]`. Under 640px only Name shows, the domain under it (`.row__phone`).
- `sites-panel` a click on a tile or row opens `[data-detail-panel][data-open]` (`DetailPanel.astro`, shared with /tools); over 48rem it casts a left-edge shadow and dims the gallery 5% light, 8% dark (a `box-shadow` spread, so it takes no clicks). Drive with `--click 'a[data-panel-open]'`. Under 1100px or on touch there is no panel (VET-279, VET-285, `lib/detail-panel.ts › PANEL_OFF`): the tap follows the link to the entry's page, and on touch or a phone the shot sits full height in the page's flow. Touch proof: `qa/evidence/2026-09-23-vet-279-scroll/probe.mjs` (CDP touch gestures at 375x812).
- `sites-design-panel` `.found` (`.found__head`, `.found__title`, `.found__note`, `.found__md`) on sites with a captured `design`.

## How to get to it (user POV)

- Sites in the Menu panel or the top bar trail, or `/sites`.
- A collection link in the Collections row; a domain link in a site's facts.
- A card in the gallery for its detail page (slugs from `ls dist/sites`, e.g. `about-brian-lovin`).

## Driving it with shoot.mjs

Preconditions:

- Doctor passes. Collection slugs: `ls dist/sites/collection` (e.g. `portfolios`).

- **Gallery.** `node .claude/skills/verify-site/shoot.mjs --base http://localhost:4329 --routes /sites,/sites/collection/portfolios --label sites --styles '.card__title,.card__domain,.collections a'`. Animations are disabled at capture, so cards are in their final state.
- **Detail.** `... --routes /sites/about-brian-lovin --label sites-detail --styles '.page-title--entry,.shot__caption,.facts dt,.found__title' --full`. `.found__title` present proves the design panel rendered.
- **Hosts.** The list view's icons load from `img.logo.dev` (VET-254), so /sites shows exactly that one host once the list is on screen; detail pages show none (screenshots are self-hosted).

## Gotchas

- The copy button writes to the clipboard; headless Chromium denies clipboard permission by default, so do not treat a failed copy in `shoot.mjs` as a site bug. Verify the status text (`[data-shot-status]`) only with a context granted `clipboard-write`.
- Download writes a file; do not click it in a verification run unless the claim is about the download.
- Sites without `design` have no `.found`; pick a slug whose `dist/sites/<slug>/index.html` contains `class="found"`.
