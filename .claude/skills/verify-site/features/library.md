# Library

/library is a notes-style view (VET-258): a list pane on the left (kind segments and a count, sticky; then the tag filter; then every entry as a row under sticky month headers) and a main area whose layout follows the kind. All is a front page (the newest article as a card, the four newest posts as compact cards, the two newest videos), Articles opens the newest article beside the pane (a list on a phone), Posts is the PostCard grid, Videos is a poster grid (`VideoGrid.astro`). Each route renders only its own view. Each entry has its own page with the same pane beside it.

## Sub-features

- `library-pane` `nav[data-pane]` rows `[data-rows] > li` (`data-kind`, `data-tags`), month headers `[data-rows] > li[data-month]` (count in `[data-month-count]`), toolbar `.ltools` with `[data-kind-set]` segments (`""`, `article`, `post`, `video`) and `[data-filter-count]`; tag filter `.ltags` (`LibraryTags.astro`): chips `[data-tag-chips]` (buttons `Remove tag …`, `Clear tags`), `details.ltags__box > summary.ltags__sum`, checkboxes `input[data-tag-set]` (value = slug) with `[data-tag-count]`, tail under `details.ltags__more`. URL `?kind=&tags=a,b`. On /library the pane carries `data-home="/library"` and `data-start`. Signed in (VET-276), `lib/pane-merge.ts` adds private rows `li[data-kind="private"]` (lock, `/me/library/<slug>`), a `[data-kind-set="private"]` segment (on /library it goes to `/me/library?kind=private`; on an entry page it filters in place) and their tags, then reruns `FILTER`.
- `library-views` `section.view[data-view=""|"article"|"post"|"video"]`, exactly one per route. All from 48rem: `LibraryMix.astro` (`.lead`, `.mix__part` posts and videos with "All N" as `[data-kind-count]`), then `section.also`. Every view ends with `section.also[data-filter-group]` (Also saved, count in `[data-group-count]`). Items: `.feed li`, `.wall li`, `.vgrid li`, `.lead` (all carry `data-tags`). Phone toolbar `.views__bar` (a second `.ltools` with `input[data-filter-q]` and `.ltags`). **Phone list** (VET-282): under 48rem All shows `.notes` (`LibraryNotes.astro`), a second `[data-rows]` list as inset groups (`data-edge="first|last"` on each group's shown ends); signed in, `lib/pane-merge.ts` merges private rows (lock badges) into it and the pane alike. The large title `[data-large-title]` sets `html[data-title-shown]` while visible. Filtering model and counts: the header of `lib/library-pane.ts › FILTER`; URL `?kind=&tags=&q=`. Scripted proof: `qa/evidence/2026-09-23-vet-282/check.mjs` and `signed-in.mjs`.
- `library-filters` `/library/domain/<domain>` (rows list, `LibraryList.astro`). `/library/tag/<slug>` is gone (VET-282): `vercel.json` 308s it and its `.md` to `/library?tags=<slug>`; an entry's tag chips link there.
- `library-detail` `/library/<slug>`: `h1.page-title--entry`, `.strip`, then up to three `section.sec` boxes (`EntrySection.astro`, VET-279), headers `.sec__head`: "Written by AI" (TLDR, block, digest, notes), "In my words" (only with his own words: private entries) and "The source" (post/video, highlights, excerpt, `a.ctl` Read the full article). Rows are `.fact`. The private fixture is `/me/fixture/entry` under `astro dev`. Scripted proof: `qa/evidence/2026-09-23-vet-279/check.mjs`.

## How to get to it (user POV)

- Library in the Menu panel or the top bar trail, or `/library`.
- The search field, then the segments All / Articles / Posts / Videos at the top of the pane (under the masthead on a phone). `/library/kind/<kind>` loads with that kind selected.
- A row, a card, a poster or a feed item for its detail page.

## Driving it with shoot.mjs

- **Views.** `node .claude/skills/verify-site/shoot.mjs --base http://localhost:4329 --routes /library,/library/kind/article,/library/kind/post,/library/kind/video --label library --sizes 390x844,1280x800,1600x1000`.
- **Kind switch.** A segment press on /library or a kind route follows its link to `/library/kind/<kind>` (tag carried as `?tag=`), and `/library?kind=<kind>` redirects there; on an entry page it filters the pane in place. Scripted proof: `qa/evidence/2026-09-23-qa-fix-b-library/check.mjs`.
- **Detail.** `... --routes /library/matt-van-horn-agent-first-workflow --label library-detail --styles '.page-title--entry,.strip'`.
- **Hosts.** No page under /library lists a third-party host: posts are drawn from `/posts/`, videos load nothing until a play press on the detail page.

## Gotchas

- `FILTER` runs inline at the foot of the view on /library and after the pane on entry pages.
- A tag change replaces history on every page; a kind change navigates on /library and kind routes and replaces on entry pages (Back there means the previous entry).
