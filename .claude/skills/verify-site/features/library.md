# Library

/library is a notes-style view (VET-258): a list pane on the left (kind segments, tag select, count, then every entry as a row) and a main area whose layout follows the kind. All is the latest twelve saves, Articles opens the newest article beside the pane (a list on a phone), Posts is the PostCard grid, Videos is a poster grid. Each entry has its own page with the same pane beside it.

## Sub-features

- `library-pane` `nav[data-pane]` rows `[data-rows] > li` (`data-kind`, `data-tags`), toolbar `.ltools` with `[data-kind-set]` segments (`""`, `article`, `post`, `video`), `select[data-tag-set]`, `[data-filter-count]`. On /library the pane carries `data-home="/library"` and `data-start`.
- `library-views` `section.view[data-view=""|"article"|"post"|"video"]`, one not `hidden`. Items: `.feed li`, `.wall li`, `.vgrid li` (tagged ones carry `data-tags`). Phone toolbar `.views__bar` (select `#view-tag`).
- `library-filters` `/library/domain/<domain>`, `/library/tag/<slug>` (rows list, `LibraryList.astro`).
- `library-detail` `/library/<slug>`: `h1.page-title--entry`, `.strip`, then post/video/digest/draft/why (`EntryDetail.astro`).

## How to get to it (user POV)

- Library in the Menu panel or the top bar trail, or `/library`.
- The segments All / Articles / Posts / Videos at the top of the pane (under the masthead on a phone). `/library/kind/<kind>` loads with that kind selected.
- A row, a card, a poster or a feed item for its detail page.

## Driving it with shoot.mjs

- **Views.** `node .claude/skills/verify-site/shoot.mjs --base http://localhost:4329 --routes /library,/library/kind/article,/library/kind/post,/library/kind/video --label library --sizes 390x844,1280x800,1600x1000`.
- **In-place switch.** `... --routes /library --label library-switch --sizes 1280x800 --click '.pane [data-kind-set="post"]'` shows the Posts view with the URL at `/library?kind=post`. Back/forward needs a script (Playwright `page.goBack()`); see `qa/evidence/*-vet-258/check.mjs`.
- **Detail.** `... --routes /library/a-post-from-ephraimakanmu --label library-detail --styles '.page-title--entry,.strip'`.
- **Hosts.** No page under /library lists a third-party host: posts are drawn from `/posts/`, videos load nothing until a play press on the detail page.

## Gotchas

- `FILTER` runs inline at the foot of the views on /library and after the pane on entry pages. A `?kind=` load must paint the right view with no flash.
- A kind change pushes history on /library and replaces it on entry pages (Back there means the previous entry).
