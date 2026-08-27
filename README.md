# aayushmanchanda.com

A personal site that fills itself. Tools I actually ran, sites whose craft I keep
coming back to, notes, and whatever experiment is running. It is an Astro 5
static build with git as the database, deployed on Vercel. There is no CMS and no
drafts folder: content arrives either from a link I saved on my phone, or from a
file I edited and committed. Everything else is a build step.

## Daily use

Save a link. That is the whole workflow.

1. On the iPhone, share sheet, Raindrop.
2. Pick the collection: **Publish/Tools**, **Publish/Sites** or
   **Publish/Reading**. That decides which section the link lands in, and it is
   the only thing that has to be right.
3. Optionally, tag it. Tags are curation — see below. Skipping this is fine;
   most entries have no tags.
4. Wait.

A GitHub Actions cron (`.github/workflows/publish.yml`, `23 */3 * * *`, so :23
past every third hour) reads the three collections, screenshots what is new,
commits the result to `main`, and Vercel deploys the push.

Sites get one full-page screenshot, taken in whatever colour scheme the site
renders by default and cut off after 12,000px, plus the dominant colours read
off it. Tools do not get a picture, only an entry, and it lands as category
`unsorted` with verdict `watching` and the note "Saved from Raindrop. Not tested
yet." Fix it later by hand, see below.

Two things in the run are done by [Firecrawl](https://firecrawl.dev) rather than
by the runner, and both are optional: they happen when the `FIRECRAWL_API_KEY`
repo secret is set and are skipped silently when it is not, so a run on a laptop
never touches the service. The first is x.com. Raindrop cannot see past the login
wall, so every post I save arrives titled "A post from @someone" — a /reading row
that says nothing. When the key is present the pipeline reads the post and uses
its opening line as the title, with more of it and the handle as the note. A note
I typed in Raindrop myself always wins over the fetched one. The second is the
last-chance screenshot: a **Publish/Sites** link that has already failed twice
gets one Firecrawl attempt on its third, before it dead-letters, because coming
from a different network is sometimes the whole difference for a site that blocks
the runner. That shot goes through the same WebP and palette path as any other,
so nothing about the entry gives it away; `pipeline/state.json` notes `"via":
"firecrawl"` on the row and that is the only trace. Either failing costs a line
in the run log and nothing else — the entry publishes exactly as it would have.
None of this touches the site a reader loads, which is why /privacy does not
mention it.

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

## Turning the newsletter on

There is no newsletter yet, and while there is not, nothing on the site says
there is. `NEWSLETTER_ACTION` in `src/lib/site.ts` is `null`, and that one value
is the whole switch: the signup block is absent from the home page HTML, and the
paragraph describing it is absent from /privacy. Not hidden with CSS, not
rendered and disabled. Absent. A control that cannot work is not shown, and a
privacy page must not describe a form the site does not have.

To turn it on: make a free account at [buttondown.com](https://buttondown.com),
take the username off it, and set the const to
`https://buttondown.com/api/emails/embed-subscribe/USERNAME`. Commit. That is the
entire activation, and there is deliberately nothing else to remember. The box
appears under the section index on the home page, the newsletter paragraph
appears on /privacy, and the sentence on /privacy saying there is no newsletter
box leaves with the same switch that brings the box.

The form is a plain HTML POST, so it needs no JavaScript and works with scripting
off, and there is no third-party script on the page either way. Buttondown's own
pages handle the confirmation, the CAPTCHA and every error, which is why this
component has no success or failure state of its own to keep honest. Do not
"improve" it into a `fetch`: Buttondown documents that the subscriber sometimes
has to see and follow that response, and a fetch swallows it.

`src/lib/newsletter.ts` holds the field names the endpoint expects (`email`, plus
a hidden `embed` of `1`). They are data rather than markup because getting one
wrong is invisible: the form still renders, still submits, still looks like it
worked, and the subscriber is dropped. `src/lib/newsletter.test.mjs` asserts
those names, asserts the component renders nothing while the const is null, and
asserts /privacy cannot describe the newsletter outside that same switch.

## When something fails

The pipeline treats a link that will not screenshot as data, not as an error. The
run stays green and reports it.

- **Three attempts.** A bookmark that fails gets retried on the next two runs.
  After the third, it is dead-lettered: the bookmark is tagged `failed` in
  Raindrop and never picked up again. The tag is the notification. It shows up
  where the link was saved, so a scroll through the collection is the whole
  triage step. The third attempt is also where Firecrawl gets its one try at the
  shot, if a key is configured — see *Daily use* above.
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

## DNS cutover (done)

The site is on `aayushmanchanda.com`. DNS resolves to the Vercel deployment, and
`SITE_URL` in `src/lib/site.ts` is the apex, so every canonical tag, `og:url`,
sitemap `<loc>`, the `Sitemap:` line in `/robots.txt`, every link in `/llms.txt`
and every `source:`/`canonical:` field in the markdown variants advertises it.

`aayushmanchandacom.vercel.app` still serves the same build, because Vercel keeps
the project domain alive alongside the production one. Nothing on the site points
at it any more, so search engines and agents that arrive there are told the apex
is canonical.

The cutover itself was run by:

```
scripts/dns-cutover-wizard.sh
```

The wizard is interactive and safe to re-run, so it is still the tool to reach for
if the origin ever moves again. It walks the Vercel domain add, the registrar
records, removing the old GitHub Pages A records, and the wait for propagation,
confirming at each stage. It reads the exact A and CNAME values off the Vercel
domain card rather than assuming them, because Vercel now issues project-specific
ones.

Two things happen after DNS resolves, and the wizard prompts for both. Both are
done:

1. **Flip the origin.** `SITE_URL` in `src/lib/site.ts` is the canonical origin
   and the only place it is written down. It now reads
   `https://aayushmanchanda.com`. The Astro config, canonical tags, sitemap,
   JSON-LD, `/llms.txt`, `/robots.txt` and every absolute URL in the markdown
   variants are all derived from it, which is the whole reason `/llms.txt` and
   `/robots.txt` are generated rather than kept as static files: moving origin is
   a one-line change, not a find-and-replace.
2. **Set the production domain in Vercel** so the apex is the primary one and
   `www` redirects to it.

`public/og.png` needed no regeneration. The card renders the wordmark and the
section list, not the URL, so it carries no origin to go stale.

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
| `src/lib/site.ts` | `SITE_URL` and `NEWSLETTER_ACTION`. The origin, and the newsletter switch. |
| `public/shots/` | Screenshots, written by the pipeline. Orphans are deleted on the next run. |
| `scripts/` | `og.mjs` (social card), `dns-cutover-wizard.sh`. |
| `qa/` | QA passes, one file per batch. |
