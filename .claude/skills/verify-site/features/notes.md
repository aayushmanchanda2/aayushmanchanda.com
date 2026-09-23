# Notes

/notes is the site's own writing grouped by year, newest first, each row a title and (scratch notes) a thumbnail. Each note opens at /notes/<slug> with its date, title, `.prose` body, an optional "See also" block, and "Read next" (up to 5 other notes, absent when there is only one note).

## Sub-features

- `notes-list` `h1.page-title` ("Notes"), `.years > section` per year with `h2.year`, then `ul.list` of `a.row` with `.row__title`, `.row__thumb` (`components/NoteList.astro`).
- `notes-detail` `article.note[data-type]`, `.note__head` (`time.note__date`, `h1.page-title--entry`), `.prose`, `nav.also[aria-label="Elsewhere on this site"]`, `nav.next` (`h2.next__head.accent-bar` + the same `ul.list`).

## How to get to it (user POV)

- Notes in the Menu panel or the top bar trail, or `/notes`.
- A row in the list; directly at `/notes/<slug>` (slugs from `ls dist/notes`, e.g. `building-this-site`).

## Driving it with shoot.mjs

Preconditions:

- Doctor passes.

- **List.** `node .claude/skills/verify-site/shoot.mjs --base http://localhost:4329 --routes /notes --label notes --styles 'h1,.year,.row__title'`.
- **Detail typography.** `... --routes /notes/building-this-site --label notes-detail --styles '.page-title--entry,.prose p,.prose h2,.note__date' --full`. Full-page PNGs show the whole prose column; styles give body size and line-height per theme.
- **Hosts.** Both routes currently have empty `thirdPartyHosts`; keep it that way.

## Gotchas

- There is one note today, so "Read next" and a second year group do not render. To prove them, add a temporary note (and a `public/notes/*.webp` for a scratch one) locally, build, shoot, then delete them before committing (VET-229 did this; see its audit).
- `data-type="scratch"` notes style `.note__head` differently; check both types when a scratch note exists.
