# Library

/library lists saved articles, posts and videos with their domain, tags, source link and saved date. Kind tabs filter to one kind; domain and tag chips filter further. Each entry has its own page, and saved X posts render as live X embeds (with a local fallback card) on the posts wall and on each post's page.

## Sub-features

- `library-list` rows `.row` (`id` = slug) with `.row__link`, `.row__tags`, `.row__domain`, `.row__source`, `.row__date`.
- `library-kind-tabs` `nav[aria-label="Filter the library by kind"]`, `.tabs__tab` with `aria-current="page"` on the active tab; kinds `article`, `post`, `video`.
- `library-filters` `/library/domain/<domain>`, `/library/tag/<slug>`.
- `library-detail` `/library/<slug>`: crumb, `h1.page-title--entry`, `.strip` (kind chip, domain, Saved/Digested/Drafted dates, tags), `.source`.
- `library-x-embeds` `/library/kind/post` wall and post detail pages: `blockquote.twitter-tweet[data-dnt="true"]` fallback cards (`.card__quote`) that X's `widgets.js` replaces with `iframe[id^="twitter-widget"]`.

## How to get to it (user POV)

- Library link in the rail, or `/library`.
- Tabs `All`, `Articles`/`Posts`/`Videos` at the top of /library.
- Domain link or tag chip on any row.
- A row's title for its detail page.

## Driving it with shoot.mjs

Preconditions:

- Doctor passes. Post slugs: `grep -l platform.twitter.com dist/library/*/index.html` (e.g. `a-post-from-ephraimakanmu`).

- **List and tabs.** `node .claude/skills/verify-site/shoot.mjs --base http://localhost:4329 --routes /library,/library/kind/post,/library/kind/video --label library --styles '.tabs__tab[aria-current="page"],.row__link'`. Active tab text matches the route (`All...`, `Posts...`).
- **Detail.** `... --routes /library/a-post-from-ephraimakanmu --label library-detail --styles '.page-title--entry,.strip'`.
- **X embeds hydrate.** `... --routes /library/a-post-from-ephraimakanmu --label library-x --sizes 1280x800 --hover '.page-title' --expect 'iframe[id^="twitter-widget"]' --wait 3000`. The hover is only a timer here: `visibleBefore:false`, `visibleAfter:true` proves the embed stood up within 3 s. Verified 2026-09-22.
- **Embed hosts.** Posts pages list `platform.twitter.com`, `syndication.twitter.com`, `cdn.syndication.twimg.com` (+ `pbs.twimg.com` with media). /library itself (all kinds tab) lists none.

## Gotchas

- X embeds need network access to X; offline or rate-limited, only the fallback `.card__quote` shows. That is intended behavior, not a failure, but say which you saw.
- The dark theme is stamped on the blockquotes before the factory loads; the embed keeps the theme it loaded with. Test dark embeds with `--themes dark` on a fresh load, not by toggling.
- `scripts/validate-schema.mjs` fails the build if an X host appears on a page that did not declare an embed (or vice versa); run `npm run validate:schema` when touching embeds.
- Kind tabs carry `data-astro-prefetch` (hover strategy): hovering a tab fetches that page, which shows up as a same-origin request, not a third-party one.
