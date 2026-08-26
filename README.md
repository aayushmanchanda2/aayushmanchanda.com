# aayushmanchanda.com

A personal site that fills itself. Tools I actually ran, sites whose craft I keep
coming back to, notes, and whatever experiment is running. It is an Astro 5
static build with git as the database, deployed on Vercel. There is no CMS and no
drafts folder: content arrives either from a link I saved on my phone, or from a
file I edited and committed. Everything else is a build step.

## Daily use

Save a link. That is the whole workflow.

1. On the iPhone, share sheet, Raindrop.
2. Pick the collection: **Publish/Tools** or **Publish/Sites**. That decides
   which section the link lands in, and it is the only thing that has to be
   right.
3. Optionally, tag it. Tags are curation — see below. Skipping this is fine;
   most entries have no tags.
4. Wait.

A GitHub Actions cron (`.github/workflows/publish.yml`, `23 */3 * * *`, so :23
past every third hour) reads both collections, screenshots what is new, commits
the result to `main`, and Vercel deploys the push.

Sites get one full-page screenshot, taken in whatever colour scheme the site
renders by default and cut off after 12,000px, plus the dominant colours read
off it. Tools do not get a picture, only an entry, and it lands as category
`unsorted` with verdict `watching` and the note "Saved from Raindrop. Not tested
yet." Fix it later by hand, see below.

### Tagging is curation

A tag on a **Publish/Sites** bookmark becomes a collection on the site: a
browsable page at `/sites/collection/<slug>`, a chip on the entry, and a link in
the line under the standfirst on /sites. There is no second place to maintain
and no admin screen. Tag a bookmark "Reference Libraries" and that collection
exists, holding every site tagged the same way.

- **Tags are folded into slugs.** "Reference Libraries", "reference libraries"
  and `reference-libraries` are one collection, so capitalisation on a phone
  keyboard does not matter. The page shows the words; the URL uses the hyphens.
- **A site can be in several collections, or none.** They overlap on purpose.
  None is the ordinary case.
- **`published` and `failed` are reserved.** The pipeline writes those two tags
  back to Raindrop itself (see *When something fails*), so they are refused as
  collection names. Tagging a bookmark `published` by hand does nothing. The
  reserved set is `RESERVED_TAGS` in `pipeline/entries.mjs`, defined next to the
  constants the pipeline tags with, so the two cannot drift apart.
- **Tag before the run picks it up.** Collections are read once, when the entry
  is first written. Re-tagging in Raindrop afterwards does not reach a site that
  has already published — edit `src/data/sites.json` instead, which is the
  better tool for it anyway.
- **/tools and /reading ignore tags.** They already have `category` and `kind`.

The collections line on /sites appears once there are two collections. Below
that it renders nothing, the same way an empty section hides itself.

Do not want to wait three hours:

```
gh workflow run publish.yml
```

To see what a run would do without publishing anything:

```
RAINDROP_TOKEN=... node pipeline/publish.mjs --dry-run
```

## Editing content by hand

Everything here is a plain file. Edit, commit, push. Vercel builds. A malformed
entry fails the build rather than rendering half a page, so a mistake is loud and
nothing broken reaches the site.

**Tool verdicts** live in `src/data/tools.json`. When a tool graduates from
"saved" to an actual opinion, edit three fields on its entry:

- `verdict` is one of `using`, `watching`, `on-hold`, `skipped`.
- `note` is one line, in my voice, rendered as written.
- `status_date` is the ISO date the verdict was last true. It shows next to the
  verdict, because an opinion with an old date on it is a warning.

Worth fixing `category` at the same time. Categories become routes, so two
spellings of one idea land on two pages.

**Site collections** live on each entry in `src/data/sites.json`, as
`"collections": ["portfolios", "personal-sites"]`. Leave the field out for a site
that is in none. Each value has to be a slug already — lowercase, digits, single
hyphens — because it is the route segment and the join key at once, and the build
fails on anything else rather than guessing. Adding a collection is adding the
same string to a second entry; deleting the last mention of one deletes its page.

**Notes** are markdown files in `src/content/notes/`. Frontmatter:

```yaml
---
title: Building this site
date: 2026-08-26
type: musing        # or: scratch
image: /notes/x.webp   # required for scratch, optional for musing
links: ["/tools"]      # optional, a short see-also row
---
```

A `scratch` is a picture with a line under it, so its image is required and has
to exist in `public/notes/` at build time. A `musing` is prose.

**Experiments** live in `src/data/experiments.json`: `slug`, `name`, `status`,
`one_liner`, `started`, and optional `links`. Killed experiments stay in the file
with the status changed. That is the point of the page.

Empty sections hide themselves. `src/lib/sections.ts` counts entries and drops
any section at zero from the nav and the home index, so there are no "coming
soon" pages. Delete every note and /notes stops existing.

## When something fails

The pipeline treats a link that will not screenshot as data, not as an error. The
run stays green and reports it.

- **Three attempts.** A bookmark that fails gets retried on the next two runs.
  After the third, it is dead-lettered: the bookmark is tagged `failed` in
  Raindrop and never picked up again. The tag is the notification. It shows up
  where the link was saved, so a scroll through the collection is the whole
  triage step.
- **x.com and twitter.com fail on sight.** Deliberate. Tweets block a headless
  browser, so the shot would fail three times and dead-letter anyway. The
  pipeline skips the pointless retries. Save the product's URL, not the post
  about it.
- **Infrastructure failure goes red.** A missing token, a renamed collection, an
  unreachable API, or generated data that will not build. GitHub emails on a
  failed workflow run. That email is the only alerting there is, and it is
  enough.
- **A crash mid-run repairs itself.** The next run starts with `reconcile()`,
  which makes the state file, the JSON galleries and `public/shots` agree again
  before anything external happens. Nothing needs a manual cleanup.

## Kill criterion

Written down in advance so it is a decision and not a mood.

If a 30-day window produces fewer than 5 new entries, the pipeline is not earning
its keep. Disable the cron: comment out the `schedule:` block in
`.github/workflows/publish.yml` and commit. `workflow_dispatch` stays, so a
manual run is still one command.

The site stays up either way. It is static files in git. Nothing about killing
the automation touches what is already published.

## Local development

```
npm install
npm run dev      # local server
npm run build    # production build, and the real gate on content
npm run test     # pipeline unit tests
npm run check    # astro check, types across .astro and .ts
npm run og       # regenerate public/og.png
```

`npm run og` rewrites the 1200x630 social card. It renders through Playwright
rather than an SVG rasteriser so the card is actually set in Geist instead of
falling back to whatever sans the build machine happens to have. The output is
committed.

## DNS cutover

Moving from `aayushmanchandacom.vercel.app` to `aayushmanchanda.com`.

```
scripts/dns-cutover-wizard.sh
```

The wizard is interactive and safe to re-run. It walks the Vercel domain add, the
registrar records, removing the old GitHub Pages A records, and the wait for
propagation, confirming at each stage. It reads the exact A and CNAME values off
the Vercel domain card rather than assuming them, because Vercel now issues
project-specific ones.

Two things happen after DNS resolves, and the wizard prompts for both:

1. **Flip the origin.** `SITE_URL` in `src/lib/site.ts` is the canonical origin
   and the only place it is written down. Change that one line to
   `https://aayushmanchanda.com` and commit. The Astro config, canonical tags,
   sitemap, JSON-LD, `/llms.txt`, `/robots.txt` and every absolute URL in the
   markdown variants are all derived from it. That is why `/llms.txt` and
   `/robots.txt` are generated rather than kept as static files.
2. **Set the production domain in Vercel** so the new apex is the primary one and
   `www` redirects to it.

## How agents read this site

Every section page has a markdown variant generated from the same parsed data the
HTML page renders, so the two cannot drift. `src/lib/markdown.ts` holds the shared
shape; `src/pages/*.md.ts` are the endpoints.

Two ways to get one:

- Send `Accept: text/markdown` to the page's own URL. `vercel.json` rewrites to
  the `.md` file when the header matches.
- Or fetch the `.md` URL directly.

### Why vercel.json carries no comments

Vercel validates that file against a strict schema and rejects any property it
does not recognise, a `_comment` key included. It fails the deployment rather
than ignoring the key, so the reasoning lives here instead.

- The `has` condition on `accept` is what makes negotiation work on a static
  deployment. No server, no adapter, no middleware. The `.*text/markdown.*`
  regex is deliberately loose because real clients send a q-weighted list rather
  than a bare type.
- `Vary: Accept` is attached to the **source** paths, not the destinations,
  because Vercel applies `headers` by incoming request path. One rule therefore
  covers both variants of a URL. Without it a CDN can hand cached HTML to an
  agent that asked for markdown, depending on which variant landed in the cache
  first.
- `Content-Type` is set explicitly on the `.md` routes rather than left to
  extension sniffing, so the negotiated response is unambiguous.

## Where things are

| Path | What |
| --- | --- |
| `pipeline/` | Raindrop to site. `publish.mjs` is the entry point; read its header comment first. |
| `pipeline/state.json` | What has been published, what failed, how many attempts. Committed. |
| `src/data/` | `tools.json`, `sites.json`, `experiments.json`. Parsed at build time by `src/lib/`. |
| `src/content/notes/` | Notes, as markdown. Schema in `src/content.config.ts`. |
| `src/lib/site.ts` | `SITE_URL`. The one place the origin is written down. |
| `public/shots/` | Screenshots, written by the pipeline. Orphans are deleted on the next run. |
| `scripts/` | `og.mjs` (social card), `dns-cutover-wizard.sh`. |
| `qa/` | QA passes, one file per batch. |
