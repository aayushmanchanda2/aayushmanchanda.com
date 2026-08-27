# aayushmanchanda.com

A personal site that fills itself. Tools I actually ran, sites whose craft I keep
coming back to, notes, and whatever experiment is running.

Astro 5 static build, git as the database, deployed on Vercel. No CMS and no
drafts folder: content arrives either from a link I saved on my phone or from a
file I edited and committed. Everything else is a build step. Zero framework JS
ships. `PURPOSE.md` is what the site is for; `design.md` is the design contract,
and it comes before touching UI.

## Local development

```
npm install
npm run dev              # local server
npm run build            # production build, and the real gate on content
npm test                 # unit tests
npm run check            # astro check, types across .astro and .ts
npm run validate:schema  # reads dist/, so only meaningful after a build
npm run og               # regenerate public/og.png through Playwright
```

`npm run build` is the real gate on content: a malformed entry fails it rather
than rendering half a page, so nothing broken reaches the site.

## How content publishes

Save a link. That is the whole workflow: iPhone share sheet, Raindrop, then pick
**Publish/Tools**, **Publish/Sites** or **Publish/Reading**. The collection
decides the section and is the only thing that has to be right. Tag it if you
want a collection out of it, see below. A GitHub Actions cron
(`.github/workflows/publish.yml`, `23 */3 * * *`) reads the three collections,
screenshots what is new, commits to `main`, and Vercel deploys the push.

| Collection | Data file | Assets |
| --- | --- | --- |
| Publish/Tools | `src/data/tools.json` | none |
| Publish/Sites | `src/data/sites.json` | `public/shots/<slug>.webp` |
| Publish/Reading | `src/data/library.json` | none |

**Publish/Reading fills /library.** The Raindrop collection keeps the older name
because it is the folder I actually tap; `galleryFor` in `pipeline/state.mjs`
translates, and `vercel.json` 308s `/reading` and everything under it.

Sites get one full-page screenshot in whatever colour scheme the site renders by
default, cut off after 12,000px, plus the dominant colours read off it. Tools get
an entry and no picture: category `unsorted`, verdict `watching`, note "Saved
from Raindrop. Not tested yet." A GitHub link lands in `repo`, never `url`. Each
run also commits `pipeline/state.json`: what published, what failed, how many
attempts. Two steps run through [Firecrawl](https://firecrawl.dev) when the
`FIRECRAWL_API_KEY` secret is set and skip silently when it is not: reading an
x.com post for a real title, and a last screenshot attempt on a **Publish/Sites**
link that has already failed twice.

```
gh workflow run publish.yml                             # run it now
RAINDROP_TOKEN=... node pipeline/publish.mjs --dry-run   # see what a run would do
```

### Tagging is curation

A tag on a **Publish/Sites** bookmark becomes a collection: a page at
`/sites/collection/<slug>`, a chip on the entry, and a link under the standfirst
on /sites once there are two of them. Nothing else to maintain.

- Tags fold into slugs, so phone-keyboard capitalisation does not matter, and a
  site can be in several collections or none. None is the ordinary case.
- `published` and `failed` are reserved; the pipeline writes them back to
  Raindrop itself (`RESERVED_TAGS` in `pipeline/entries.mjs`).
- Collections are read once, at first write. Tag before the run picks the link
  up, and edit `src/data/sites.json` afterwards.
- /tools and /library ignore tags. They have `category` and `kind`.

## Editing content by hand

Everything is a plain file. Edit, commit, push.

**Tool verdicts** (`src/data/tools.json`). When a tool graduates from saved to an
opinion: `verdict` is one of `using` / `watching` / `on-hold` / `skipped`, `note`
is one line in my voice rendered as written, `status_date` is the ISO date that
verdict was last true. Fix `category` at the same time, since categories become
routes.

**A tool's two link fields are not interchangeable.** `url` is the product's own
site; `repo` is `https://github.com/{owner}/{name}`, exactly that, no trailing
slash or `.git` or branch. Either may be null, and a repository written into
`url` fails the build with a message saying so. A tool saved from GitHub arrives
with `url` null, so finding the product site is the second job after the verdict.

**Site collections** are per entry in `src/data/sites.json`, as `"collections":
["portfolios"]`. Omit for a site in none. Each value has to be a slug already: it
is the route segment and the join key at once.

**Notes** are markdown in `src/content/notes/`:

```yaml
---
title: Building this site
date: 2026-08-26
type: musing           # or: scratch
image: /notes/x.webp   # required for scratch, optional for musing
links: ["/tools"]      # optional, a short see-also row
---
```

A `scratch` is a picture with a line under it, so its image has to exist in
`public/notes/` at build time. A `musing` is prose.

**Experiments** (`src/data/experiments.json`): `slug`, `name`, `status`,
`one_liner`, `started`, optional `links`. Killed ones stay in the file with the
status changed. That is the point of the page.

Empty sections hide themselves: `src/lib/sections.ts` drops any section at zero
from the nav and the home index. Delete every note and /notes stops existing.

## Turning the newsletter on

There is no newsletter yet, and while there is not, nothing on the site says
there is. `NEWSLETTER_ACTION` in `src/lib/site.ts` is `null`, and that one value
is the whole switch: the signup block is absent from the home page HTML and the
paragraph describing it is absent from /privacy. Not hidden, not disabled.
Absent.

To turn it on, make a free account at [buttondown.com](https://buttondown.com)
and set the const to `https://buttondown.com/api/emails/embed-subscribe/USERNAME`.
Commit. The box appears on the home page, the newsletter paragraph appears on
/privacy, and the /privacy sentence saying there is no box leaves with the same
switch. The form is a plain HTML POST and Buttondown's pages handle confirmation,
CAPTCHA and errors; do not "improve" it into a `fetch`, which swallows the
response the subscriber sometimes has to follow.

## When something fails

A link that will not screenshot is data, not an error: the run stays green and
reports it. Three attempts, then dead-lettered, tagged `failed` in Raindrop and
never picked up again, which puts the notification where the link was saved.
x.com and twitter.com fail on sight, deliberately. A crash mid-run repairs itself
on the next run's `reconcile()`, which makes the state file, the galleries and
`public/shots` agree again.

Infrastructure failure goes red instead: a missing token, a renamed collection,
data that will not build. GitHub's email on a failed run is the only alerting
there is. To stop the automation, comment out the `schedule:` block in the
workflow and commit; `workflow_dispatch` stays, and the site is static files in
git either way.

## How agents read this site

Every section page has a markdown variant generated from the same parsed data the
HTML renders, so the two cannot drift (`src/lib/markdown.ts`, `src/pages/*.md.ts`).
Send `Accept: text/markdown` to a page's own URL, or fetch the `.md` URL
directly. `/llms.txt` is the front door. `vercel.json` holds the negotiation
rules and **no comments**: Vercel validates it against a strict schema and fails
the deployment on any key it does not recognise, `_comment` included.

## Where things are

| Path | What |
| --- | --- |
| `PURPOSE.md` | What the site is for, and the bar for anything added. |
| `design.md` | The design contract. Read before touching UI. |
| `pipeline/` | Raindrop to site. `publish.mjs` is the entry point; read its header first. |
| `src/data/` | `tools.json`, `sites.json`, `library.json`, `experiments.json`. |
| `src/content/notes/` | Notes, as markdown. Schema in `src/content.config.ts`. |
| `src/lib/site.ts` | `SITE_URL` and `NEWSLETTER_ACTION`. The origin, and the newsletter switch. |
| `public/shots/` | Screenshots, written by the pipeline. Orphans deleted on the next run. |
| `scripts/` | `og.mjs` (social card), `dns-cutover-wizard.sh` (re-runnable if the origin moves). |
| `qa/` | QA passes, one file per batch. |
