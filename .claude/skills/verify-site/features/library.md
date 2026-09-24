# Library

/library is a notes-style view (VET-258): a list pane on the left (kind segments and a count, sticky; then the tag filter; then every entry as a row under sticky month headers) and a main area whose layout follows the kind. All is a front page (the newest article as a card, the four newest posts as compact cards, the two newest videos), Articles opens the newest article beside the pane (a list on a phone), Posts is the PostCard grid, Videos is a poster grid (`VideoGrid.astro`). Each route renders only its own view. Each entry has its own page with the same pane beside it.

## Sub-features

- `library-pane` `nav[data-pane]` rows `[data-rows] > li` (`data-kind`, `data-tags`), month headers `[data-rows] > li[data-month]` (count in `[data-month-count]`), toolbar `.ltools` with `[data-kind-set]` segments (`""`, `article`, `post`, `video`) and `[data-filter-count]`; tag filter `.ltags` (`LibraryTags.astro`): chips `[data-tag-chips]` (buttons `Remove tag …`, `Clear tags`), `details.ltags__box > summary.ltags__sum`, checkboxes `input[data-tag-set]` (value = slug) with `[data-tag-count]`, tail under `details.ltags__more`. URL `?kind=&tags=a,b`. On /library the pane carries `data-home="/library"` and `data-start`. Signed in (VET-276), `lib/pane-merge.ts` adds private rows `li[data-kind="private"]` (lock, `/me/library/<slug>`), a `[data-kind-set="private"]` segment (on /library it goes to `/me/library?kind=private`; on an entry page it filters in place) and their tags, then reruns `FILTER`.
- `library-views` `section.view[data-view=""|"article"|"post"|"video"]`, exactly one per route. All: `.lead` (the article card), `.mix__part` (posts, videos, each with an "All N" link). Items: `.feed li`, `.wall li`, `.vgrid li` (tagged ones carry `data-tags`). Phone toolbar `.views__bar` (a second `.ltools` and `.ltags`). Signed in on a phone (VET-279), `lib/pane-merge.ts › mergePhone` puts `section.me-phone` (the private rows, lock and tip) first in All; hidden from 48rem, where the pane shows them.
- `library-filters` `/library/domain/<domain>`, `/library/tag/<slug>` (rows list, `LibraryList.astro`).
- `library-detail` `/library/<slug>`: `h1.page-title--entry`, `.strip`, then up to three `section.sec` boxes (`EntrySection.astro`, VET-279), headers `.sec__head`: "Written by AI" (TLDR, block, digest, notes), "In my words" (only with his own words: private entries) and "The source" (post/video, highlights, excerpt, `a.ctl` Read the full article). Rows are `.fact`. The private fixture is `/me/fixture/entry` under `astro dev`. Scripted proof: `qa/evidence/2026-09-23-vet-279/check.mjs`.

## How to get to it (user POV)

- Library in the Menu panel or the top bar trail, or `/library`.
- The segments All / Articles / Posts / Videos at the top of the pane (under the masthead on a phone). `/library/kind/<kind>` loads with that kind selected.
- A row, a card, a poster or a feed item for its detail page.

## Driving it with shoot.mjs

- **Views.** `node .claude/skills/verify-site/shoot.mjs --base http://localhost:4329 --routes /library,/library/kind/article,/library/kind/post,/library/kind/video --label library --sizes 390x844,1280x800,1600x1000`.
- **Kind switch.** A segment press on /library or a kind route follows its link to `/library/kind/<kind>` (tag carried as `?tag=`), and `/library?kind=<kind>` redirects there; on an entry page it filters the pane in place. Scripted proof: `qa/evidence/2026-09-23-qa-fix-b-library/check.mjs`.
- **Detail.** `... --routes /library/matt-van-horn-agent-first-workflow --label library-detail --styles '.page-title--entry,.strip'`.
- **Hosts.** No page under /library lists a third-party host: posts are drawn from `/posts/`, videos load nothing until a play press on the detail page.

## Gotchas

- `FILTER` runs inline at the foot of the view on /library and after the pane on entry pages.
- A tag change replaces history on every page; a kind change navigates on /library and kind routes and replaces on entry pages (Back there means the previous entry).
