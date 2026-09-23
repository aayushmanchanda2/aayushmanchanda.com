# Notes

/notes is a dated list of the site's own writing, each row a title, date and optional thumbnail. Each note opens at /notes/<slug> with its title, date, prose body and an optional "See also" block.

## Sub-features

- `notes-list` `h1.page-title--mono` ("notes."), `ul.list` of `a.row` with `.row__title`, `time.row__date`, `.row__thumb`.
- `notes-detail` `article.note[data-type]`, `.note__head` (`h1.page-title--entry`, `time.note__date`), `.prose`, `nav.also[aria-label="Elsewhere on this site"]`.

## How to get to it (user POV)

- Notes in the Menu panel or the top bar trail, or `/notes`.
- A row in the list; directly at `/notes/<slug>` (slugs from `ls dist/notes`, e.g. `building-this-site`).

## Driving it with shoot.mjs

Preconditions:

- Doctor passes.

- **List.** `node .claude/skills/verify-site/shoot.mjs --base http://localhost:4329 --routes /notes --label notes --styles '.page-title--mono,.row__title,.row__date'`.
- **Detail typography.** `... --routes /notes/building-this-site --label notes-detail --styles '.page-title--entry,.prose p,.prose h2,.note__date' --full`. Full-page PNGs show the whole prose column; styles give body size and line-height per theme.
- **Hosts.** Both routes currently have empty `thirdPartyHosts`; keep it that way.

## Gotchas

- There is one note today; detail checks cover it, list-density checks need more content.
- `data-type="scratch"` notes style `.note__head` differently; check both types when a scratch note exists.
