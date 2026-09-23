# Copy audit, repo status (VET-249, VET-250, VET-235)

Copy of the vault audit (`AayushOS/feature-research/aayushmanchanda-com/briOS-wave/copy-audit.md`, written against `f298864`) with a **status** column, applied on branch `vet-250-copy` from `5e2f1bb`. Strings were re-located by text, not line.

Status counts: applied 113 (rewrite/cut rows, some adapted to facts that changed since), superseded 5 (About rows replaced by the VET-235 layout), kept 127, not found 5, new 15.

---

# Copy audit: aayushmanchanda.com in Guide A (VET-249 I1, VET-250 I2)

Audited 2026-09-23 against commit `f298864`. Read-only pass over the repo; nothing in `src/` was edited. Every rewrite below is ready for a repo agent to paste. Facts are preserved exactly; nothing is invented. Out of scope by ticket: `data/tools.json` descriptions and notes (VET-234), library `note` fields and TLDRs (VET-233), Hermes `draft` blocks, `/computer` tips (VET-236).

## Summary

| | Count |
|---|---|
| Strings audited | 250 |
| Cut | 11 |
| Rewritten | 109 |
| Kept | 130 |

Of the 130 keeps, 13 rows (238 to 250) are groups of microcopy (controls, aria labels, column heads) listed once per component. The prose and meta surfaces a reader actually reads are rows 1 to 237.

Verdict rules used: **cut** = the string goes and nothing replaces it; **rewrite** = same slot, new words; **keep** = ships as is. Line numbers are from `f298864`.

### The 10 most improved lines

| # | Where | Before | After |
|---|---|---|---|
| 1 | about.astro:88-93 | Me, on my own work. I test this software on my companies and on client projects, so a verdict here is one I formed while trying to ship something rather than while reading a launch post. That is also the limit of it: my use case is agent tooling and small-team software, and a tool that lost a head-to-head on my work might win on yours. | (cut; the one fact, "agent tooling and small-team software", moves into the Tools line of the sections paragraph) |
| 2 | about.astro:95-97 | Every opinion carries the date it was last true. An old date is a warning, not a badge. | (cut) |
| 3 | notes/building-this-site.md:7 | I built this site overnight, mostly by telling agents what I wanted and then reading what they wrote back. | (cut; the note now opens on the pipeline) |
| 4 | NewsletterSignup.astro:85-87 | Unsubscribe at the bottom of every issue. Buttondown runs the list; nobody else sees it. | (cut) |
| 5 | index.astro:31-33 | Part entrepreneur, part marketer, part operator. I co-founded Orbis, run Vetted, and use AI to build things on the internet from Canada. | I co-founded Orbis, run Vetted, and build things with AI from Canada. |
| 6 | library.astro:49-53 | Things I saved to read or watch properly. Saved is not read, and neither is a recommendation. Every row has a page now, and the ones I have read carry cliff notes and an honest call on whether it is worth your time. | Articles, posts and videos I saved to read or watch. The ones I've read carry cliff notes and a call on whether they're worth your time. |
| 7 | privacy.astro:186-191 | Since 26 August 2026 this site counts page views with Vercel Web Analytics. I wanted to know which pages people actually read, because that is most of what tells me whether any of this was worth someone's time. | Since 26 August 2026 the site counts page views with Vercel Web Analytics. |
| 8 | privacy.astro:242-247 | I used to draw those cards myself from the saved copy, and this page used to say why that was better. It was better for your privacy and it looked wrong: a hand-built imitation of a post is uncanny in a way the real one is not. So I took the real embed, first on the posts page and then on each post's own page, and kept the saved copy under it. That is the trade written out rather than quietly made. | (cut) |
| 9 | experiments.astro:44-47 | Things I am running right now, and the ones I stopped. Killed experiments stay on the page, because deleting them would make me look better than I am. | What's running right now, and what I stopped. Killed ones stay listed. |
| 10 | llms.txt.ts:39-41 | The site publishes itself: he saves a link from his phone, and the next run puts it here with a screenshot next to it. That run happens every three hours, or on demand when he starts one himself, which takes a couple of minutes. | New entries arrive from a pipeline that runs every three hours. |

### Needs Aayush

- **Vetted descriptor.** The Voice lab's Guide A bio says Vetted is "where I build automations for small businesses". That isn't on the live site, so the rewrite keeps "my AI consulting practice". Say the word and it goes in.
- **`contact.astro:151-152` and `about.astro:112-113` claim the site collects "nothing".** /privacy says it counts page views. Both lines are cut in this audit; flagging because it was a live inaccuracy.
- **Schema parity.** `lib/schema.ts:129` (the `Person` description) is rewritten to match the new hero word for word, because `scripts/validate-schema.mjs` and design.md §7 require every graph property to map to visible copy. The repo agent should run the validator after pasting.
- **`design.astro:527-528` says "The last row is the filter form" and 512 says "The last row is the site's seven identity hues."** One of them is wrong (the chip--link row is fifth of six). Rewritten below to name the row; worth a glance.

## Root cause (I1)

The fluff wasn't accidental. Seven rules in the guides asked for it, and one sample legitimised it. Each is quoted from the file as it stood before this pass.

1. **The wink.** `voice-guide-for-site.md:8`: "**Self-aware wink** — catches his own clichés ('I know that's a cliche thing to say, but…'). Motivational tone WITHOUT the wink is instantly fake." Restated in `design-contract-copy.md:9` and the site's `design.md` §6: "the invariant core that must survive: warm-direct, forward-looking close, self-aware wink, plain emotion. Motivational tone without the wink is instantly fake." Produced: "deleting them would make me look better than I am" (experiments.astro:45-47), "I would rather be caught being boring than caught being impressive" (building-this-site.md:13), "you do not need to be polite about it" (contact.astro:100-101).

2. **The aphorism habit.** `voice-guide-for-site.md:34-35`: "He compresses lessons into quotable rules… One per page maximum; must feel found, not manufactured." Produced: "An old date is a warning, not a badge" (about.astro:96-97, PURPOSE.md bar item 3), "Saved is not read, and neither is a recommendation" (library.astro:50-51, library.md.ts:331), "a bought verdict is worth nothing to the person reading it" (contact.astro:114-115).

3. **"Honest dates".** `design-contract-copy.md:148` and site `design.md:151`: "**Honest dates.** Every opinion carries the ISO date it was last true… because an opinion with an old date on it is a warning." The rule's own justification became copy on three pages (about, the first note, llms.txt) and the reason line in `library/[slug].astro:130-133`'s comment.

4. **"The honest placeholder".** `design-contract-copy.md:150` / `design.md:150`: "**Real opinions only.**… `watching` plus 'Saved from Raindrop. Not tested yet.' is the honest placeholder the pipeline writes." Produced: "Some rows say nothing more than that I saved the thing and have not tested it yet, which is the truth on that date" (about.astro:101-103).

5. **"Actually" and "honest" as the example.** `design-contract-copy.md:148` / `design.md:148`: "First person, present tense. 'Things I actually installed and ran, with an honest verdict' (`lib/sections.ts › CATALOGUE`)." The exemplar carried both fillers, and they spread: "What is actually here" (404.astro:44), "Work that is actually interesting" (contact.astro:104), "installed and actually run" (llms.txt.ts:32), "an honest note about what I answer" (contact.astro:55), "an honest call" (library.astro:52).

6. **"Keep honest humility" plus "accuracy without defensiveness".** `voice-guide-for-site.md:14`: "Halve the hedges… but keep honest humility." and `:40`: "Accuracy without defensiveness: 'co-founded Orbis' carries the whole truth; no disclaimers about what he doesn't run." The second rule forbade one disclaimer and the first invited the next: "That is also the limit of it: my use case is agent tooling and small-team software, and a tool that lost a head-to-head on my work might win on yours" (about.astro:91-93).

7. **"Forward-looking close".** `voice-guide-for-site.md:7`: "**Forward-looking close** — never ends on the problem; lands on a plan or what's next." On a privacy page that became promises about future commits: "If that ever moves to someone else, the new name lands here on the commit that moves it" (privacy.astro:212-213), "a third host would be named in this section on the commit that added it" (privacy.astro:267-268). The file header at privacy.astro:102-107 codifies it: "every claim here is a claim about today's build, and it says so… names the commit that would have to change it."

8. **The "explain how the site works" mandate.** `about.astro:5-8` header: "This page is the same claims at length: what he builds, what the five sections actually hold, and where a verdict on this site comes from before anyone decides how much to trust one." Produced the whole "Where the data comes from" section, and the same sentence in llms.txt: "The site publishes itself: he saves a link from his phone" (llms.txt.ts:39-41).

9. **The Voice lab sample.** The Guide A version of "Building this site" in the Claude Doc opens with "I built this site overnight by telling agents what I wanted and reading what came back." Aayush rejected that line on 2026-09-23. It was the guide's own sample, so this audit cuts it and the guide no longer shows it as an example.

10. **Reassurance had no rule for it, and no rule against it.** `contact.astro:5-8` header ("No form, for the same reason /privacy can say the site collects nothing") and `index.astro:94-99` ("the quietest way to ask, and the opposite of a popup") show the mindset: privacy-first as a thing to say, not a thing to be. Produced: "Buttondown runs the list; nobody else sees it" (NewsletterSignup.astro:86-87), "nothing reads it but this site" (privacy.astro:172), "asking is all I can do from here" (privacy.astro:236). The new guides add the value test, which cuts reassurance by name.

What changed in the guides (I1): `voice-guide-for-site.md` rewritten to Guide A with the value test, the banned-patterns list quoting Aayush's four examples, per-surface formulas and caps, and a "retired rules" section. `design-contract-copy.md` §6 rewritten to match (§1 to §5 and §7 untouched). `briOS-wave/voice.md` is the public draft: rules and before/after pairs from live copy only. `Context/WRITING.md` has no site-copy rules in it (it's the content-vision file) and is untouched.

## The audit (I2)

Columns: file:line, before, after, verdict, why. A blank "after" on a cut means delete the element. Markup notes sit under the table for any paragraph with anchors in it.

### src/pages/index.astro

| # | file:line | before | after | verdict | why | status |
|---|---|---|---|---|---|---|
| 1 | index.astro:30 | Hey, I'm Aayush. | Hey, I'm Aayush. | keep | Opens on the person | kept |
| 2 | index.astro:31-33 | Part entrepreneur, part marketer, part operator. I co-founded Orbis, run Vetted, and use AI to build things on the internet from Canada. | I co-founded Orbis, run Vetted, and build things with AI from Canada. | rewrite | Rule-of-three self-label; the Guide A pair | applied |
| 3 | index.astro:35-38 | There's a lot of noise in AI. I read it, test it on my own companies and my clients, and what survives shows up here with a date on it. | There's a lot of noise in AI. I test it on my own companies and my clients, and what survives shows up here with a date on it. | rewrite | Drops the triad's first verb | applied |
| 4 | index.astro:42 | The mindscape | The mindscape | keep | Aayush's own label for the index | kept |
| 5 | index.astro:79 | Latest | Latest | keep | Label | kept |
| 6 | index.astro:88 | Follow it all by RSS | Follow it all by RSS | keep | Functional link | kept |

### src/lib/sections.ts (home index blurbs, llms.txt, 404, feeds)

| # | file:line | before | after | verdict | why | status |
|---|---|---|---|---|---|---|
| 7 | sections.ts:73 | Things I actually installed and ran, with an honest verdict. | Software I installed and ran, with a verdict on each. | rewrite | "actually" and "honest" filler | applied |
| 8 | sections.ts:79 | Design and craft I keep coming back to. | Design and craft I keep coming back to. | keep | An opinion, 8 words | kept |
| 9 | sections.ts:85 | Articles, posts and videos I saved to get to properly. | Articles, posts and videos I saved to read or watch later. | rewrite | "get to properly" is vague | applied |
| 10 | sections.ts:91 | A commonplace book. Short thoughts, kept as they come. | Short thoughts, kept as they come. | rewrite | The site naming its own genre | applied |
| 11 | sections.ts:97 | What's running right now, including what I killed. | What's running right now, including what I killed. | keep | Fact with a quip | kept |

### src/pages/about.astro

| # | file:line | before | after | verdict | why | status |
|---|---|---|---|---|---|---|
| 12 | about.astro:32 | Who Aayush Manchanda is, what this site is, and where everything on it comes from. | Aayush Manchanda co-founded Orbis, an AI healthcare company, and runs Vetted, an AI consulting practice. What he builds, and what's on this site. | rewrite | Triad of abstractions; now carries facts | applied (adapted: meta names work, sections, profiles) |
| 13 | about.astro:36 | About | About | keep | Title | kept |
| 14 | about.astro:38 | Who I am, what this site is, and where the things on it come from. | What I do, and what this site holds. | rewrite | Same triad as the meta | superseded (VET-235: bio replaces the standfirst) |
| 15 | about.astro:44 | Who I am | Who I am | keep | Section label | kept |
| 16 | about.astro:46-48 | I co-founded Orbis, an AI healthcare company, and I run Vetted, my AI consulting practice. Between them I am building with this stuff every week, and that is where everything on this site comes from. | I co-founded Orbis, an AI healthcare company that makes a voice receptionist for dental clinics, and I run Vetted, my AI consulting practice, from Canada. Between the two I'm shipping with agents every week, which is where every verdict on this site comes from. | rewrite | Adds the approved what-it-does line, contractions, "this stuff" gone | applied (adapted: receptionist clause lives in the Orbis Work row) |
| 17 | about.astro:51-53 | Part entrepreneur, part marketer, part operator is the closest I get to an honest job title. I build things on the internet with AI, from Canada. I stopped trying to pick one of those three words a while ago. | | cut | Self-labelling and a wink; Canada moved into row 16 | applied |
| 18 | about.astro:58 | What this site is | What's here | rewrite | Shorter label, same job | superseded (VET-235: Projects rows) |
| 19 | about.astro:60-61 | My mindscape, in public. Five sections, each holding a kind of thing I would otherwise lose track of. | Five sections. | rewrite | The site describing itself | superseded (VET-235: Projects rows) |
| 20 | about.astro:70-78 | Tools is software I installed and actually ran, with a verdict and the date that verdict was last true. Sites is other people's websites, saved for how they look, each with a full-page screenshot of the day I saved it. Library is what I read and watch, kept for the record rather than as a list of recommendations. Notes is short writing. Experiments is what is running right now, with the ones I killed still on the page. | Tools is software I installed and ran, mostly agent tooling and small-team software, each with a dated verdict. Sites is other people's websites, saved for how they look, with a full-page screenshot from the day I saved them. Library is what I read and watch. Notes is short writing. Experiments is what's running now, killed ones included. | rewrite | Keeps every fact, drops "actually", the dates line and the recommendations disclaimer; the scope fact from row 23 lands here | superseded (VET-235: Projects rows use section blurbs) |
| 21 | about.astro:81-82 | A section only exists here if it has something in it. There are no coming-soon pages and no drafts folder. | | cut | Site describing itself | applied |
| 22 | about.astro:90 | Where the data comes from | | cut | Section goes with rows 23 to 25 | applied |
| 23 | about.astro:89-93 | Me, on my own work. I test this software on my companies and on client projects, so a verdict here is one I formed while trying to ship something rather than while reading a launch post. That is also the limit of it: my use case is agent tooling and small-team software, and a tool that lost a head-to-head on my work might win on yours. | | cut | Aayush's example; testing-on-my-companies already in the hero; the scope fact moved to row 20 | applied |
| 24 | about.astro:96-97 | Every opinion carries the date it was last true. An old date is a warning, not a badge. | | cut | Aayush's example | applied |
| 25 | about.astro:100-103 | The site publishes itself. I save a link on my phone, and a few hours later a run puts it here with a screenshot beside it. Some rows say nothing more than that I saved the thing and have not tested it yet, which is the truth on that date. | | cut | Process narration and a disclaimer | applied |
| 26 | about.astro:108 | Elsewhere | Elsewhere | keep | Label | kept |
| 27 | about.astro:110-113 | GitHub and X are in the footer of every page. If you want to write to me, /contact has the address and what I answer. /privacy covers what this site collects, which is nothing, and how to get a screenshot of your own site taken down. | I'm @amanchanda7 on X and aayushmanchanda2 on GitHub. Email is on /contact. | rewrite | "which is nothing" is false (page views are counted); the footer line is site narration | superseded (VET-235: Elsewhere rows) |

Paste-ready `about.astro` body (rows 14 to 27). Anchors keep their neighbouring space on the same line, per design.md §6:

```astro
  <header>
    <h1 class="page-title">About</h1>
    <p class="standfirst">What I do, and what this site holds.</p>
  </header>

  <div class="doc">
    <section>
      <h2 class="doc__head mono">Who I am</h2>
      <p>
        I co-founded Orbis, an AI healthcare company that makes a voice
        receptionist for dental clinics, and I run Vetted, my AI consulting
        practice, from Canada. Between the two I&rsquo;m shipping with agents
        every week, which is where every verdict on this site comes from.
      </p>
    </section>

    <section>
      <h2 class="doc__head mono">What&rsquo;s here</h2>
      <p>Five sections.</p>
      <p>
        <a href="/tools">Tools</a> is software I installed and ran, mostly agent
        tooling and small-team software, each with a dated verdict. <a
          href="/sites">Sites</a> is other people&rsquo;s websites, saved for how
        they look, with a full-page screenshot from the day I saved them. <a
          href="/library">Library</a> is what I read and watch. <a
          href="/notes">Notes</a> is short writing. <a
          href="/experiments">Experiments</a> is what&rsquo;s running now, killed
        ones included.
      </p>
    </section>

    <section>
      <h2 class="doc__head mono">Elsewhere</h2>
      <p>
        I&rsquo;m <a class="ext" rel="me noopener" target="_blank"
          href="https://x.com/amanchanda7">@amanchanda7</a> on X and <a
          class="ext" rel="me noopener" target="_blank"
          href="https://github.com/aayushmanchanda2">aayushmanchanda2</a> on
        GitHub. Email is on <a href="/contact">/contact</a>.
      </p>
    </section>
  </div>
```

Update the meta `description` prop on the `<Base>` to row 12's text. The file header comment (about.astro:2-22) references the cut section and "where a verdict on this site comes from"; trim it to match.

### src/pages/tools.astro and tools.md.ts

| # | file:line | before | after | verdict | why | status |
|---|---|---|---|---|---|---|
| 28 | tools.astro:27, tools.md.ts:516 | Software Aayush Manchanda installed, ran, and formed an opinion about, with a dated verdict on each one. | Software Aayush Manchanda installed and ran, with a dated verdict on each. | rewrite | Triad; same string in both files | applied |
| 29 | tools.astro:33 | Tools | Tools | keep | Title | kept |
| 30 | tools.astro:34 | Software I installed, ran, and formed an opinion about. Every verdict is dated. | Software I installed and ran, with a dated verdict on each. | rewrite | The Guide A pair | applied |
| 31 | tools.astro:48 | All verdicts | All verdicts | keep | Control | kept |
| 32 | tools.astro:53 | All categories | All categories | keep | Control | kept |
| 33 | tools.astro:22, 249 | N tool / N tools | (same) | keep | Count | kept |
| 34 | tools.astro:57 | Tools layout | Tools layout | keep | aria-label | kept |
| 35 | tools.astro:76 | No tools match both filters. Show all | No tools match both filters. Show all | keep | Empty state, functional | kept |
| 36 | tools.md.ts:494 | In the daily stack right now. | In the daily stack right now. | keep | Definition | kept |
| 37 | tools.md.ts:495 | Runs fine and has not earned a place in the daily stack. | Runs fine and hasn't made the daily stack yet. | rewrite | Contraction; "earned a place" is padding | applied |
| 38 | tools.md.ts:496 | Testing started, then stopped before reaching a verdict. | Testing started, then stopped before a verdict. | rewrite | Shorter | applied |
| 39 | tools.md.ts:497 | Looked at and set aside. The note says why. | Looked at and set aside. The note says why. | keep | Definition | kept |
| 40 | tools.md.ts:524 | Every verdict carries the date it was last true. How stale that makes it is the reader's call to make, not a thing the page decides. | Every verdict carries the date it was last true. | rewrite | The second sentence is the dates aphorism | applied |
| 41 | tools.md.ts:522, 527, 544 | Verdicts / Filtered views / One page per tool | (same) | keep | Section labels | kept |

### src/pages/tools/verdict/[verdict].astro, tools/category/[category].astro, tools/[slug].astro

| # | file:line | before | after | verdict | why | status |
|---|---|---|---|---|---|---|
| 42 | verdict:14 | Tools that earned a place in how I work day to day. | Tools I use day to day. | rewrite | "earned a place" padding | applied |
| 43 | verdict:15 | Tools that run fine and have not made it into the daily stack yet. | Tools that run fine and haven't made the daily stack yet. | rewrite | Contraction | applied |
| 44 | verdict:16 | Tools I started testing and stopped before reaching a verdict. | Tools I started testing and stopped before a verdict. | rewrite | Shorter | applied |
| 45 | verdict:17 | Tools I looked at and set aside, with the reason I set them aside. | Tools I looked at and set aside. Each note says why. | rewrite | Repeats "set aside" | applied |
| 46 | category:23 | N tools I filed under X. | N tools I filed under X. | keep | Fact | kept |
| 47 | [slug]:93 | As of {date} | As of {date} | keep | Date label | kept |
| 48 | [slug]:116, 127 | Source / Repo | Source / Repo | keep | Labels | kept |
| 49 | [slug]:69 | (description = tool.note) | (same) | keep | Data field, VET-234 | kept |

### src/pages/sites.astro, sites.md.ts, sites/*

| # | file:line | before | after | verdict | why | status |
|---|---|---|---|---|---|---|
| 50 | sites.astro:36, sites.md.ts:454 | Websites Aayush Manchanda saved for how they look, each one captured as a full-page screenshot on the day it was saved. | Websites Aayush Manchanda saved for how they look, each a full-page screenshot from the day it was saved. | rewrite | Tighter, same facts | applied |
| 51 | sites.astro:40 | Sites | Sites | keep | Title | kept |
| 52 | sites.astro:42-44 | Sites I saved for how they look. Every screenshot was taken the day I saved it, top to bottom. Open one to scroll the whole page. | Sites I saved for how they look, each a full-page screenshot from the day I saved it. | rewrite | Drops the instruction; the caption on the entry page already says "Scroll inside the frame" | applied (string now in sites.astro standfirst) |
| 53 | sites.astro:59-60 | Filter sites by collection / Collections | (same) | keep | Labels | kept |
| 54 | sites/[slug]:74 | Full-page screenshot of X (domain), saved DATE. | (same) | keep | Facts | kept |
| 55 | sites/[slug]:83, schema.ts:513, SiteGrid:49 | Full page of X / Screenshot of X | (same) | keep | Alt text says what it is of | kept |
| 56 | sites/[slug]:92 | Full page. Scroll inside the frame | Full page. Scroll inside the frame | keep | Functional hint | kept |
| 57 | sites/[slug]:107, 122, 131, 144, 154 | Domain / Collections / Saved / Palette / Link | (same) | keep | Fact labels | kept |
| 58 | sites/[slug]:157 | Visit {domain} | Visit {domain} | keep | Link label | kept |
| 59 | sites/[slug]:171-174, library/[slug]:217-220 | Sites entries; Close and go back to Sites; Previous site: X; Next site: X (and the Library set) | (same) | keep | aria, functional | kept |
| 60 | sites/collection:31, 54 | N sites I filed under X. Collections overlap: a site can be in several, or in none. | N sites I filed under X. | rewrite | Second sentence is the site describing its data model | applied |
| 61 | sites/domain:24 | N pages I saved from X. | N pages I saved from X. | keep | Fact | kept |
| 62 | sites.md.ts:463-466 | About the screenshots: These are screenshots of other people's sites, captured automatically on the day the site was saved. Every row credits the original with a link to it. / Each shot is the whole page, top to bottom, in whatever colour scheme the site itself renders by default. Very long pages are cut off after 12,000 pixels. / The palette is read off the pixels of that screenshot, most-used colour first. It is measured, not chosen, so it is a description of the capture rather than the designer's own swatches. | Screenshots of other people's sites, taken the day each was saved. Every row links to the original. / Each shot is the whole page in the site's default colour scheme, cut off after 12,000 pixels. / The palette is the screenshot's most-used colours, measured from the pixels, not the designer's swatches. | rewrite | Same three facts, half the words | applied |
| 63 | sites.md.ts:469-471 | About the collections: Collections are groupings I made by hand. They overlap: a site can be in several of them, or in none, and the column is empty for most entries. / Each one is browsable at /sites/collection/<slug>, using the slug exactly as it appears in the column. | Collections are hand-made groupings. A site can be in several or none. / Each is at /sites/collection/<slug>, using the slug in the column. | rewrite | Agents need the route, not the apology for empty cells | applied |

### src/pages/library.astro, library.md.ts, library/*

| # | file:line | before | after | verdict | why | status |
|---|---|---|---|---|---|---|
| 64 | library.astro:43, library.md.ts:319 | Articles, posts and videos Aayush Manchanda saved to read or watch properly, with the date he saved each one. | Articles, posts and videos Aayush Manchanda saved to read or watch, with the date he saved each one. | rewrite | "properly" adds nothing | applied |
| 65 | library.astro:48 | Library | Library | keep | Title | kept |
| 66 | library.astro:50-53 | Things I saved to read or watch properly. Saved is not read, and neither is a recommendation. Every row has a page now, and the ones I have read carry cliff notes and an honest call on whether it is worth your time. | Articles, posts and videos I saved to read or watch. The ones I've read carry cliff notes and a call on whether they're worth your time. | rewrite | Disclaimer, site narration and "honest" all gone | applied (string moved to LibraryViews.astro) |
| 67 | library/kind:38 | Long enough to need a chair and a cup of something. | Long enough to need a chair and a cup of something. | keep | A quip that says what an article is | kept |
| 68 | library/kind:39 | Short things somebody put on a timeline, saved before they scrolled away. | Short things somebody put on a timeline, saved before they scrolled away. | keep | Same | kept |
| 69 | library/kind:40 | Talks and interviews. These want a block of time before they give anything back. | Talks and interviews. These want a block of time before they give anything back. | keep | Same | kept |
| 70 | library/tag:37, 58 | N links I filed under X. Tags overlap: a link can carry a couple, or none at all. | N links I filed under X. | rewrite | Same cut as row 60 | applied |
| 71 | library/domain:26 | N links I saved from X. | N links I saved from X. | keep | Fact | kept |
| 72 | library/[slug]:99 | A {kind} I saved from {domain}. | A {kind} I saved from {domain}. | keep | Fact | kept |
| 73 | library/[slug]:148, 153, 160 | Saved / Digested / Drafted | (same) | keep | Date labels | kept |
| 74 | KindTabs:54, TagFilters:77, 135 | All / Show all N / Show fewer | (same) | keep | Controls | kept |
| 75 | KindTabs:45, TagFilters:85, LibraryPane:30 | Filter the library by kind / Filter the library by tag / Library list | (same) | keep | aria | kept |
| 76 | library.md.ts:294-296 | article: A piece of writing on someone's own site or newsletter. / post: A short thing published on a social timeline. / video: A talk, an interview, or a recorded workshop. | (same) | keep | Definitions | kept |
| 77 | library.md.ts:331 | A saved link is not a finished one, and neither is a recommendation. The date is the day it was saved and nothing more. | The date is the day the link was saved. | rewrite | Aphorism and disclaimer | applied |
| 78 | library.md.ts:364-368 | Every entry has a page of its own at /library/<slug>, and the Title column above links it. A page holds the kind, the host, the tags, the saved date and the note in the table, plus whatever else that entry carries: a saved post's full text, a saved video's poster, a digest where one has been written, and a draft where the pipeline has written one and Aayush has not read the piece yet. A drafted block is labelled as a draft on the page and is not his verdict. {Nothing has been digested yet. / The digested entries are listed in the Digests section above.} The Source column is the thing itself, which is off this site. | Every entry has a page at /library/<slug>, linked from the Title column. It holds the kind, host, tags, saved date and note, plus a saved post's full text, a saved video's poster, a digest where one exists, and a draft where the pipeline wrote one and Aayush hasn't read the piece yet. A draft is labelled as one and isn't his verdict. {Nothing has been digested yet. / Digested entries are listed under Digests above.} The Source column is the original, off this site. | rewrite | Same facts, fewer words; keep the conditional | applied |
| 79 | library.md.ts:329, 334, 359 | Kinds / Filtered views / Pages per entry | (same) | keep | Section labels | kept |
| 80 | markdown.ts:288 | These entries have been read properly, not just saved. Each carries cliff notes and a call on whether it is worth your time. | Entries I've read. Each carries cliff notes and a call on whether it's worth your time. | rewrite | "not just X" | applied |
| 81 | markdown.ts:227 | Some entries carry more than the one-line note. Most do not, and an entry missing from this list simply means I have not written it up, not that I had nothing good to say. | Entries with more than the one-line note. | rewrite | The second sentence is a disclaimer | applied |
| 82 | markdown.ts:226, 287 | In my words / Digests | (same) | keep | Section labels | kept |
| 83 | markdown.ts:190-193, 251-253 | Why / What I like / What I don't / Try / Cliff notes / Read it? | (same) | keep | Field labels | kept |

### src/components (library and post surfaces)

| # | file:line | before | after | verdict | why | status |
|---|---|---|---|---|---|---|
| 84 | DraftBlock.astro:45 | Drafted, not read | Drafted, not read | keep | The provenance label; "not X" is the point here | kept |
| 85 | DraftBlock.astro:54-55 | My pipeline wrote this from the piece itself. I haven't read it yet, so take it as a summary and not a call. | Written by my pipeline from the piece itself. I haven't read it yet. | rewrite | Drops the instruction to the reader | applied |
| 86 | DraftBlock.astro:70 | Drafted {date} | Drafted {date} | keep | Date | kept |
| 87 | PostBody.astro:81 | Saved copy | Saved copy | keep | Label | not found (PostBody.astro gone; posts drawn by PostCard) |
| 88 | PostBody.astro:101-102, TweetCard.astro:178-179 | Picture attached to the post by X / Picture N of M attached to the post by X | (same) | keep | Stated alt exception | kept |
| 89 | TweetCard.astro:201 | Source: the post by X | (same) | keep | Link label plus hidden title | not found (TweetCard.astro gone) |
| 90 | TweetCard.astro:216 | Notes on {title} | (same) | keep | Link label plus hidden title | not found (TweetCard.astro gone) |
| 91 | VideoFacade (play control) | Play video: {title} | (same) | keep | Control name | kept |

### src/pages/notes/index.astro, notes.md.ts, notes/[slug].astro

| # | file:line | before | after | verdict | why | status |
|---|---|---|---|---|---|---|
| 92 | notes/index:35 | Short notes from Aayush Manchanda: musings written out, and whiteboard scratches with a line underneath. | Short notes from Aayush Manchanda. Some are typed out, some are a whiteboard photo with one line under it. | rewrite | Plainer | applied |
| 93 | notes/index:39 | Notes | Notes | keep | Title | kept |
| 94 | notes/index:41-42 | Short things I wanted somewhere public. Some are written out, some are a photo of a whiteboard with one line under it. | Short writing. Some typed out, some a whiteboard photo with one line under it. | rewrite | "wanted somewhere public" is the site talking about itself | applied |
| 95 | notes.md.ts:407 | Every note Aayush Manchanda has published, newest first, with the full text of each one. | Every note Aayush Manchanda has published, newest first, with the full text of each one. | keep | Facts | kept |
| 96 | notes.md.ts:411, 415 | No notes yet. / Note bodies are reproduced as written. A link inside one that starts with a slash is a path on this site, so resolve it against the Source URL above. | (same) | keep | Agent instruction | kept |
| 97 | notes/[slug]:59 | A note by Aayush Manchanda, written {day}: {title}. | (same) | keep | Facts | kept |
| 98 | notes/[slug]:81-82, 98 | Elsewhere on this site / See also / Read next | (same) | keep | Labels | kept |

### src/content/notes/building-this-site.md

| # | file:line | before | after | verdict | why | status |
|---|---|---|---|---|---|---|
| 99 | :7 | I built this site overnight, mostly by telling agents what I wanted and then reading what they wrote back. | | cut | Aayush's example | applied |
| 100 | :9 | The part I care about is [the pipeline](/experiments). I save a link from my phone and a few hours later it turns up here with a screenshot next to it. No dashboard, no drafts folder. That was the whole point. Every system I have walked away from broke in the same place: it asked me to sit down and do a second job after the first one was already done. | The part of this site I care about is [the pipeline](/experiments). I save a link on my phone and a few hours later it's here with a screenshot beside it. No dashboard, no drafts folder. / Every system I've abandoned broke in the same place: it asked me to sit down and do a second job after the first one was done. This one doesn't. | rewrite | One idea, contractions, "That was the whole point" cut | applied |
| 101 | :11 | Verdicts carry a date because opinions go stale. I liked something for a week in March. That tells you very little about whether I still open it. If [a tool](/tools) is sitting at "using" with an old date beside it, read that as a warning rather than a recommendation. | | cut | The dates aphorism at length | applied |
| 102 | :13 | I think most personal sites are a pitch. This one is closer to a log, and I would rather be caught being boring than caught being impressive. | Most personal sites are a pitch. This one is a log. I suspect the boring version ages better. | rewrite | Ends on a hunch, not a wink | applied |

Paste-ready note body (frontmatter unchanged):

```markdown
The part of this site I care about is [the pipeline](/experiments). I save a link on my phone and a few hours later it's here with a screenshot beside it. No dashboard, no drafts folder.

Every system I've abandoned broke in the same place: it asked me to sit down and do a second job after the first one was done. This one doesn't.

Most personal sites are a pitch. This one is a log. I suspect the boring version ages better.
```

### src/pages/experiments.astro, experiments.md.ts

| # | file:line | before | after | verdict | why | status |
|---|---|---|---|---|---|---|
| 103 | experiments.astro:38, experiments.md.ts:257 | What Aayush Manchanda is running right now, with a status and a start date on each one. The dead ones stay listed. | What Aayush Manchanda is running right now, with a status and start date on each. Killed ones stay listed. | rewrite | Matches the chip word | applied |
| 104 | experiments.astro:42 | Experiments | Experiments | keep | Title | kept |
| 105 | experiments.astro:44-47 | Things I am running right now, and the ones I stopped. Killed experiments stay on the page, because deleting them would make me look better than I am. | What's running right now, and what I stopped. Killed ones stay listed. | rewrite | Self-deprecating disclaimer | applied |
| 106 | experiments.astro:67 | Since {date} | Since {date} | keep | Date label | kept |
| 107 | experiments.md.ts:236-239 | running: Going right now. / paused: Stopped for the moment, not abandoned. / shipped: Finished and out. / killed: Stopped for good. Still listed rather than deleted. | running: Going right now. / paused: Stopped for the moment, not abandoned. / shipped: Finished and out. / killed: Stopped for good. Still listed. | rewrite | Only the last one changes: "rather than" | applied |
| 108 | experiments.md.ts:261, 266 | Nothing is listed right now. / Rows are ordered live work first and dead work last, newest first inside each band. | (same) | keep | Agent facts | kept |

### src/pages/contact.astro

| # | file:line | before | after | verdict | why | status |
|---|---|---|---|---|---|---|
| 109 | contact.astro:49 | How to reach Aayush Manchanda: one email address, two profiles, and an honest note about what is worth writing about and what is not. | How to reach Aayush Manchanda, and what gets a reply. | rewrite | Triad, "honest" | applied |
| 110 | contact.astro:53 | Contact | Contact | keep | Title | kept |
| 111 | contact.astro:55 | One address, two profiles, and an honest note about what I answer. | Email, X or GitHub, and what gets a reply. | rewrite | Same | applied |
| 112 | contact.astro:72 | Email me | Email me | keep | Control | kept |
| 113 | contact.astro:90 | Worth writing about | Worth writing about | keep | Label | kept |
| 114 | contact.astro:92-95 | A tool I should be running, especially if you built it. Tell me what it is for and what it replaces. I test things on real work rather than on a demo, so I will say honestly whether it fits what I do, and if it does not fit, that is a fast no rather than a slow silence. | A tool I should be running, especially if you built it. Tell me what it's for and what it replaces. If it doesn't fit my work, you'll get a fast no. | rewrite | "honestly", two "rather than"s, the hero already says real work | applied |
| 115 | contact.astro:98-101 | Something wrong on this site. A dead link, a verdict that has gone stale, a screenshot that stopped looking like that site a year ago. Corrections get the quickest reply out of me, and you do not need to be polite about it. | Something wrong here: a dead link, a stale verdict, a screenshot that no longer looks like the site. Corrections get the fastest reply, and you don't need to be polite about it. | rewrite | Tighter; the quip earns its place as the ending | applied |
| 116 | contact.astro:104-106 | Work that is actually interesting. Vetted takes a small number of clients, so a real problem with a real budget is a conversation worth having. Put the problem in the first paragraph. | Work. Vetted takes a small number of clients. A real problem with a real budget is a conversation; put the problem in the first paragraph. | rewrite | "actually" | applied |
| 117 | contact.astro:111 | Not worth writing about | Not worth writing about | keep | Label | kept |
| 118 | contact.astro:113-116 | Link exchanges, guest posts, and sponsored placements. The verdicts on /tools are not for sale, because a bought verdict is worth nothing to the person reading it. If you want to work on something real together, that is the section above. | Link exchanges, guest posts and sponsored placements. The verdicts on /tools aren't for sale. | rewrite | The aphorism and the pointer go | applied |
| 119 | contact.astro:119-122 | Cold pitches for services I did not ask about. Anything that opens by telling me it noticed my website. Requests to add a link to a page you have written on the same topic. None of these get a reply, and I am saying that here so you can spend the email somewhere better. | Cold pitches, anything that opens by telling me it noticed my website, and requests to add your link to a page. None of these get a reply. | rewrite | The meta closer | applied |
| 120 | contact.astro:127 | Elsewhere | Elsewhere | keep | Label | kept |
| 121 | contact.astro:135-141 | I am @amanchanda7 on X and aayushmanchanda2 on GitHub. Both are in the footer of every page here too. X is the faster route for a short question; email is better for anything that needs more than a sentence. | I'm @amanchanda7 on X and aayushmanchanda2 on GitHub. X for a short question, email for anything longer. | rewrite | Footer line is site narration | applied |
| 122 | contact.astro:146 | A screenshot of your site | A screenshot of your site | keep | Label | kept |
| 123 | contact.astro:148-152 | If one of the screenshots in /sites is yours and you want it gone, you do not need to email me about it. /privacy has the route, it is a GitHub issue, and you do not have to explain why. That page is also where I say what this site collects, which is nothing. | If a screenshot in /sites is yours and you want it gone, open a GitHub issue; the link is on /privacy. No reason needed. | rewrite | "which is nothing" is false; the rest was padding | applied |

Paste-ready `contact.astro` `.doc` (rows 113 to 123):

```astro
  <div class="doc">
    <section>
      <h2 class="doc__head mono">Worth writing about</h2>
      <p>
        A tool I should be running, especially if you built it. Tell me what
        it&rsquo;s for and what it replaces. If it doesn&rsquo;t fit my work,
        you&rsquo;ll get a fast no.
      </p>
      <p>
        Something wrong here: a dead link, a stale verdict, a screenshot that no
        longer looks like the site. Corrections get the fastest reply, and you
        don&rsquo;t need to be polite about it.
      </p>
      <p>
        Work. Vetted takes a small number of clients. A real problem with a real
        budget is a conversation; put the problem in the first paragraph.
      </p>
    </section>

    <section>
      <h2 class="doc__head mono">Not worth writing about</h2>
      <p>
        Link exchanges, guest posts and sponsored placements. The verdicts on <a
          href="/tools">/tools</a> aren&rsquo;t for sale.
      </p>
      <p>
        Cold pitches, anything that opens by telling me it noticed my website,
        and requests to add your link to a page. None of these get a reply.
      </p>
    </section>

    <section>
      <h2 class="doc__head mono">Elsewhere</h2>
      <p>
        I&rsquo;m <a class="ext" rel="me noopener" target="_blank"
          href="https://x.com/amanchanda7">@amanchanda7</a> on X and <a
          class="ext" rel="me noopener" target="_blank"
          href="https://github.com/aayushmanchanda2">aayushmanchanda2</a> on
        GitHub. X for a short question, email for anything longer.
      </p>
    </section>

    <section>
      <h2 class="doc__head mono">A screenshot of your site</h2>
      <p>
        If a screenshot in <a href="/sites">/sites</a> is yours and you want it
        gone, open a GitHub issue; the link is on <a
          href="/privacy">/privacy</a>. No reason needed.
      </p>
    </section>
  </div>
```

### src/pages/privacy.astro

Legal facts kept: what's collected, each storage key's purpose, the two third parties and when they load, the analytics vendor and what it records, hosting logs, the newsletter processor, the takedown route, ownership. Cut: history, promises about future commits, comfort.

| # | file:line | before | after | verdict | why | status |
|---|---|---|---|---|---|---|
| 124 | privacy.astro:124 | What this site collects, what it loads from elsewhere, and how to get a screenshot of your site taken down. | What this site collects, what it loads from elsewhere, and how to get a screenshot of your site taken down. | keep | Three real things, not a rhythm triad | kept |
| 125 | privacy.astro:127 | Privacy | Privacy | keep | Title | kept |
| 126 | privacy.astro:129-131 | Short version: this site is a pile of static files. It counts how many people open a page, and it has no idea who any of them are. Two pages borrow something from somebody else, and they are named below. | This site is static files. It counts page views, and two things on it load from outside hosts. Both are named below. | rewrite | "no idea who any of them are" is reassurance | applied |
| 127 | privacy.astro:137 | What I collect | What I collect | keep | Label | kept |
| 128 | privacy.astro:141-145 (newsletter on) | Almost nothing you hand over, and the one exception is a box you have to fill in yourself. There are no accounts and no comments. The only form on the site is the newsletter signup on the front page, and what happens to what you type into it is written out below. The site also counts page views, which is the next section. | No accounts, no comments. The one form is the newsletter signup on the front page, covered below. Page views are counted, covered next. | rewrite | Same facts | applied |
| 129 | privacy.astro:149-152 (newsletter off) | Nothing you hand over. There are no accounts, no forms, no comments, no newsletter box. There is nothing here for you to fill in, and nowhere for it to go if there were. The site does count page views, and that is the next section. | No accounts, no forms, no comments. Page views are counted, covered next. | rewrite | Same | applied |
| 130 | privacy.astro:157-158 | The fonts are bundled into the build and served from this domain, so reading a page here does not tell a font CDN that you were reading it. | Fonts are served from this domain, not a font CDN. | rewrite | The fact without the comfort | applied |
| 131 | privacy.astro:161-166 | It writes two things to local storage, and only after you ask it to. If you press the theme button in the footer, the site saves the word light, dark or system so the next page you open is the colour you picked. If you switch /tools between list and grid, it saves which one. Until you press one of them, nothing goes in local storage. | Two things go in local storage, both only after you press something: the theme you picked in the footer (light, dark or system), and the list-or-grid view on /tools. | rewrite | Both keys named, once | applied (adapted: three keys now, incl. /sites view and click sound) |
| 132 | privacy.astro:169-173 | One number goes in session storage, which your browser drops when you close the tab: how far you scrolled the list beside a library entry, so moving to the next entry does not throw you back to the top. None of it leaves your browser, nothing reads it but this site, and clearing your site data forgets it. | One number goes in session storage, dropped when you close the tab: your scroll position in the list beside a library entry. None of it leaves your browser. | rewrite | Drops "nothing reads it but this site" | applied |
| 133 | privacy.astro:176-179 | That covers what this site stores. It does not cover what X stores inside its own embeds on each saved post's own page and on the posts page, which is filed under X and not under me. The section below is what those pages cost you. | What X stores inside its embeds on the posts page and on each saved post's page is X's, covered in the next section. | rewrite | Same fact | not found (X embeds removed in VET-244) |
| 134 | privacy.astro:184 | Counting page views | Counting page views | keep | Label | kept |
| 135 | privacy.astro:186-191 | Since 26 August 2026 this site counts page views with Vercel Web Analytics. I wanted to know which pages people actually read, because that is most of what tells me whether any of this was worth someone's time. | Since 26 August 2026 the site counts page views with Vercel Web Analytics. | rewrite | Motive cut; keep the link on "Vercel Web Analytics" | applied |
| 136 | privacy.astro:194-197 | There are no cookies, and nothing is written to your browser. You are not given an ID, and nothing recorded here can be joined up with your visit to any other site. Vercel counts a visit by hashing the request it already received, and that hash is discarded after 24 hours. | No cookies, no ID, nothing written to your browser. Vercel counts a visit by hashing the request and discards the hash after 24 hours. | rewrite | Facts only | applied |
| 137 | privacy.astro:200-205 | What gets recorded is the page you opened, the site that sent you, your browser and operating system, whether you are on a phone, a tablet or a desktop, and the country, region and city the request came from. That is the whole list. It reaches me as totals: this page got this many views this week, most of them from that referrer. There is no view of it that is one person, and I could not build one. | Recorded: the page, the referrer, your browser and operating system, device type, and the country, region and city of the request. I see totals only. | rewrite | Same list; "I could not build one" is comfort | applied |
| 138 | privacy.astro:208-213 | The script is served from this domain rather than from an analytics company, and the counts it sends go to the same place. So counting page views did not add a host to the list below: it added a script, and the script is mine. Vercel holds the numbers, which is the company already serving you these pages. If that ever moves to someone else, the new name lands here on the commit that moves it. | The script and its beacon are served from this domain. Vercel, which hosts the site, holds the numbers. | rewrite | Promise about a future commit cut | applied |
| 139 | privacy.astro:218 | The pages that load from somewhere else | The pages that load from somewhere else | keep | Label | kept |
| 140 | privacy.astro:220-226 | Two things here load from somewhere else, and I'd rather name them than claim a clean sweep. The tool icons used to be a third. They came from logo.dev, a logo API, so opening /tools told them your IP address. Now each icon is fetched once, when I add the tool, and saved into this site's own files. Your browser gets it from this domain, like everything else on those pages. | Two things load from elsewhere. Tool icons aren't one of them: each is stored in this site's files and served from this domain. | rewrite | History of logo.dev cut; the current fact stays | applied (adapted: logo.dev is live again per VET-254; row 251) |
| 141 | privacy.astro:229-239 | The saved posts are the first, and the heavier one. Every post on the posts page is X's own embed, and so is the post at the top of each saved post's own page. Opening either loads a script from X and turns each post into a frame of theirs. X sees your IP address, sees that the frame is on this site, and whatever happens inside it is theirs rather than mine. Each embed is marked do-not-track, which asks X not to use the visit to tailor anything, and asking is all I can do from here. If that trade is not one you want, turn off JavaScript or block X's widget script: both pages then load nothing from X, and each post's page still has the whole text under the embed, as a copy I saved. | Saved posts. Every post on the posts page, and the one at the top of each saved post's page, is X's own embed. Opening either loads X's script and puts each post in an X frame: X sees your IP address and that the frame is on this site. Each embed is marked do-not-track. With JavaScript off or X's widget script blocked, both pages load nothing from X, and each post's page shows the saved copy instead. | rewrite | Every fact kept; "asking is all I can do" cut | applied (adapted: posts no longer load from X; row 252) |
| 142 | privacy.astro:242-247 | I used to draw those cards myself from the saved copy, and this page used to say why that was better. It was better for your privacy and it looked wrong: a hand-built imitation of a post is uncanny in a way the real one is not. So I took the real embed, first on the posts page and then on each post's own page, and kept the saved copy under it. That is the trade written out rather than quietly made. | | cut | History | not found (replaced upstream; its successor cut in row 252) |
| 143 | privacy.astro:250-262 | The saved videos are the outside request you can make yourself, and nothing loads from YouTube until you press play. A video on the videos page shows a still I copied into this repository when I saved it, the same way the screenshots work, so the page arrives with a picture from this domain and no player in it. Press play and the still is replaced by one, and that is the moment your browser first talks to Google: the player comes from youtube-nocookie.com, which holds off the usual cookies until something is actually played, and is still Google either way. They get your IP address and the name of this site, not the page you were reading, and anything stored after that is stored under their name rather than mine. On a page with no video on it there is nothing to press, so there is nothing to load. | Saved videos. Nothing loads from YouTube until you press play; the still on the page is served from this domain. On play, the player comes from youtube-nocookie.com, which holds off cookies until something is played. Google gets your IP address and this site's name, not the page you were on. | rewrite | Every fact kept | applied |
| 144 | privacy.astro:265-268 | That is the whole list: X on the posts page and each saved post's page, YouTube if you press play. Every other page here loads nothing from anyone, and a third host would be named in this section on the commit that added it. | That's the whole list. Every other page loads from this domain only. | rewrite | Promise cut | applied (adapted: list is logo.dev + YouTube) |
| 145 | privacy.astro:275 | The newsletter | The newsletter | keep | Label | kept |
| 146 | privacy.astro:277-280 | The signup box on the front page is the one thing here you can type into. Nothing loads from Buttondown to draw it or watch it: it is plain HTML served from this domain, so the section above still stands. Nothing goes anywhere until you press Subscribe. | The signup box on the front page is plain HTML served from this domain. Nothing is sent until you press Subscribe. | rewrite | Same facts | applied |
| 147 | privacy.astro:283-293 | When you do, your browser sends your address to Buttondown, which runs the list and sends the issues. Usually you stay on this page and the box says it went through; Buttondown then emails you a link to confirm. If Buttondown wants to check something first, a CAPTCHA or an address it does not like, your browser goes to their page so they can ask you directly. Either way Buttondown gets your address, and sees your IP the way any host does when a browser talks to it. This site never receives either. There is no server here to receive them with. | Pressing it sends your address to Buttondown, which runs the list, sends the issues, and emails you a confirmation link. If Buttondown wants a CAPTCHA or rejects the address, your browser goes to their page. Buttondown gets your address and your IP; this site has no server and receives neither. | rewrite | Same facts; keep the link on "Buttondown" | applied |
| 148 | privacy.astro:296-299 | Your address is for sending you the newsletter and nothing else. I do not sell it, and I do not upload it anywhere. Every issue has an unsubscribe link at the bottom, and pressing it takes you off the list without going through me. | Your address is used for the newsletter only and never sold. Every issue has an unsubscribe link. | rewrite | The legal commitment, once | applied |
| 149 | privacy.astro:306 | Server logs | Server logs | keep | Label | kept |
| 150 | privacy.astro:308-313 | The site is hosted on Vercel, and Vercel keeps its own standard request logs, same as any host. I do not read them, I do not analyse them, and I have not wired anything to them. They are a side effect of being on the internet, not something I set up to learn about you. They are also separate from the page counting above, which is a script running in the page and not something read back out of a log. | Vercel hosts the site and keeps standard request logs. I don't read them or wire anything to them. | rewrite | Facts only | applied |
| 151 | privacy.astro:318 | Screenshots, saved posts and video stills | Screenshots, saved posts and video stills | keep | Label | kept |
| 152 | privacy.astro:320-330 | The /sites gallery is screenshots of other people's websites. A pipeline takes them automatically when I save a link, and every one of them gets a page that links out to the site it came from. If one of them is yours and you want it gone, open an issue at github.com/aayushmanchanda2 and I will take it down. You do not have to explain why. An issue is the route I would rather you used for this, because it leaves a record that the request was made and answered. If you would rather not open one, /contact has my address. | /sites is screenshots of other people's websites, each linking to the site it came from. If one is yours and you want it gone, open an issue at github.com/aayushmanchanda2 and I'll take it down, no reason needed. Or email me via /contact. | rewrite | Route kept; the justification for the route cut | applied |
| 153 | privacy.astro:333-341 | The saved posts work the same way underneath. When I save something from x.com, the pipeline copies the words and any pictures into this repository, and the page for that post shows that copy under X's own embed. The embed is the trade in the section above; the copy is what stays if the original is deleted. The post is still the poster's either way. Every one of them names who wrote it and links back to the original, and its row on /library carries the date I saved it. If one of them is yours, the same issue link works and the same answer applies. | A saved post's page holds a copy of its text and pictures under X's embed. Every one names the author, links to the original, and carries the date I saved it on /library. If one is yours, the same issue link works. | rewrite | Same facts | applied (adapted: copy includes profile picture, photos, video) |
| 154 | privacy.astro:344-349 | A saved video is the same arrangement with one picture in it. What sits on the page before you press play is YouTube's own poster frame for that video, fetched once when I saved the link and stored here, so that showing you what you are about to watch does not cost you a request to Google. If it is your video and you would rather I did not, the issue link above takes it down too. | A saved video's page holds its YouTube poster frame, stored here. Same issue link if it's yours. | rewrite | Same facts | applied |
| 155 | privacy.astro:354 | Who owns what | Who owns what | keep | Label | kept |
| 156 | privacy.astro:356-358 | My writing and my notes are mine. The screenshots and anything I quote belong to whoever made the thing they are of. If you want to reuse something I wrote, go ahead. A link back is plenty. | My writing is mine. Screenshots and quotes belong to whoever made the original. Reuse anything I wrote; a link back is plenty. | rewrite | Tighter | applied |

Paste-ready `privacy.astro` from `<header>` to `</Base>` (rows 125 to 156). The `NEWSLETTER_ACTION` gates and every `href`/`rel` are unchanged:

```astro
  <header>
    <h1 class="page-title">Privacy</h1>
    <p class="standfirst">
      This site is static files. It counts page views, and two things on it
      load from outside hosts. Both are named below.
    </p>
  </header>

  <div class="doc">
    <section>
      <h2 class="doc__head mono">What I collect</h2>
      {
        NEWSLETTER_ACTION ? (
          <p>
            No accounts, no comments. The one form is the newsletter signup on
            the front page, covered below. Page views are counted, covered next.
          </p>
        ) : (
          <p>
            No accounts, no forms, no comments. Page views are counted, covered
            next.
          </p>
        )
      }
      <p>Fonts are served from this domain, not a font CDN.</p>
      <p>
        Two things go in local storage, both only after you press something:
        the theme you picked in the footer (<em>light</em>, <em>dark</em> or
        <em>system</em>), and the list-or-grid view on <a
          href="/tools">/tools</a>.
      </p>
      <p>
        One number goes in session storage, dropped when you close the tab:
        your scroll position in the list beside a library entry. None of it
        leaves your browser.
      </p>
      <p>
        What X stores inside its embeds on <a
          href="/library/kind/post">the posts page</a> and on each saved
        post&rsquo;s page is X&rsquo;s, covered in the next section.
      </p>
    </section>

    <section>
      <h2 class="doc__head mono">Counting page views</h2>
      <p>
        Since 26 August 2026 the site counts page views with <a
          href="https://vercel.com/docs/analytics/privacy-policy"
          rel="noopener nofollow"
        >Vercel Web Analytics</a>.
      </p>
      <p>
        No cookies, no ID, nothing written to your browser. Vercel counts a
        visit by hashing the request and discards the hash after 24 hours.
      </p>
      <p>
        Recorded: the page, the referrer, your browser and operating system,
        device type, and the country, region and city of the request. I see
        totals only.
      </p>
      <p>
        The script and its beacon are served from this domain. Vercel, which
        hosts the site, holds the numbers.
      </p>
    </section>

    <section>
      <h2 class="doc__head mono">The pages that load from somewhere else</h2>
      <p>
        Two things load from elsewhere. Tool icons aren&rsquo;t one of them:
        each is stored in this site&rsquo;s files and served from this domain.
      </p>
      <p>
        Saved posts. Every post on <a href="/library/kind/post">the posts
        page</a>, and the one at the top of each saved post&rsquo;s page, is
        X&rsquo;s own embed. Opening either loads X&rsquo;s script and puts each
        post in an X frame: X sees your IP address and that the frame is on
        this site. Each embed is marked do-not-track. With JavaScript off or
        X&rsquo;s widget script blocked, both pages load nothing from X, and
        each post&rsquo;s page shows the saved copy instead.
      </p>
      <p>
        Saved videos. Nothing loads from YouTube until you press play; the
        still on <a href="/library/kind/video">the videos page</a> is served
        from this domain. On play, the player comes from youtube-nocookie.com,
        which holds off cookies until something is played. Google gets your IP
        address and this site&rsquo;s name, not the page you were on.
      </p>
      <p>That&rsquo;s the whole list. Every other page loads from this domain only.</p>
    </section>

    {
      NEWSLETTER_ACTION && (
        <section>
          <h2 class="doc__head mono">The newsletter</h2>
          <p>
            The signup box on the front page is plain HTML served from this
            domain. Nothing is sent until you press Subscribe.
          </p>
          <p>
            Pressing it sends your address to <a
              href="https://buttondown.com"
              rel="noopener nofollow"
            >Buttondown</a>, which runs the list, sends the issues, and emails
            you a confirmation link. If Buttondown wants a CAPTCHA or rejects
            the address, your browser goes to their page. Buttondown gets your
            address and your IP; this site has no server and receives neither.
          </p>
          <p>
            Your address is used for the newsletter only and never sold. Every
            issue has an unsubscribe link.
          </p>
        </section>
      )
    }

    <section>
      <h2 class="doc__head mono">Server logs</h2>
      <p>
        Vercel hosts the site and keeps standard request logs. I don&rsquo;t
        read them or wire anything to them.
      </p>
    </section>

    <section>
      <h2 class="doc__head mono">Screenshots, saved posts and video stills</h2>
      <p>
        <a href="/sites">/sites</a> is screenshots of other people&rsquo;s
        websites, each linking to the site it came from. If one is yours and
        you want it gone, open an issue at <a
          href="https://github.com/aayushmanchanda2"
          rel="noopener">github.com/aayushmanchanda2</a> and I&rsquo;ll take it
        down, no reason needed. Or email me via <a
          href="/contact">/contact</a>.
      </p>
      <p>
        A saved post&rsquo;s page holds a copy of its text and pictures under
        X&rsquo;s embed. Every one names the author, links to the original, and
        carries the date I saved it on <a href="/library">/library</a>. If one
        is yours, the same issue link works.
      </p>
      <p>
        A saved video&rsquo;s page holds its YouTube poster frame, stored here.
        Same issue link if it&rsquo;s yours.
      </p>
    </section>

    <section>
      <h2 class="doc__head mono">Who owns what</h2>
      <p>
        My writing is mine. Screenshots and quotes belong to whoever made the
        original. Reuse anything I wrote; a link back is plenty.
      </p>
    </section>
  </div>
```

The 115-line header comment in `privacy.astro:2-115` narrates the history this rewrite removes. Cut it to the one rule that still applies: anything that reaches for storage or a third-party host edits this page in the same commit, and `scripts/validate-schema.mjs` enforces the X-host rule.

### src/pages/404.astro, 404.md.ts

| # | file:line | before | after | verdict | why | status |
|---|---|---|---|---|---|---|
| 157 | 404.astro:26 | That page does not exist. Links to everything this site actually has. | That page doesn't exist. Links to everything on the site. | rewrite | "actually" | applied |
| 158 | 404.astro:35 | Nothing here. | Nothing here. | keep | Title | kept |
| 159 | 404.astro:37-39 | This URL does not exist. Either it never did, or I moved it and left no forwarding note. Everything the site actually has is listed below, and the front page has not moved. | This URL doesn't exist. Everything the site has is below, and the front page hasn't moved. | rewrite | Keep the `{" "}` and the anchor on "the front page" | applied |
| 160 | 404.astro:44 | What is actually here | What's here | rewrite | "actually" | applied |
| 161 | 404.astro:61-62 | Agents can start at /llms.txt. Every URL is in /sitemap-index.xml. | (same) | keep | Facts | kept |
| 162 | 404.md.ts:218 | This URL does not exist on aayushmanchanda.com. What follows is everything the site actually has. | This URL doesn't exist on aayushmanchanda.com. Everything the site has follows. | rewrite | "actually" | applied |
| 163 | 404.md.ts:219 | Where to look instead | Where to look instead | keep | Label | kept |

### src/layouts/Base.astro, src/lib/schema.ts, src/lib/feeds.ts

| # | file:line | before | after | verdict | why | status |
|---|---|---|---|---|---|---|
| 164 | Base.astro:94 | Part entrepreneur, part marketer, part operator. Aayush Manchanda co-founded Orbis, runs Vetted, and uses AI to build things on the internet from Canada. What survives his testing shows up here with a date on it. | Aayush Manchanda co-founded Orbis, runs Vetted, and builds things with AI from Canada. Software he ran, sites he saved, and what he's reading, each with a date on it. | rewrite | Default meta; the triad goes | applied |
| 165 | Base.astro:352, 377, 484, 487-490, 496 | Skip to content / Search ⌘K / About / Contact / Design / Privacy / © {year} Aayush Manchanda | (same) | keep | Furniture | kept |
| 166 | Base.astro:146-147 | Winnipeg / New Delhi | (same) | keep | Clock labels | kept |
| 167 | schema.ts:129 | Aayush Manchanda is part entrepreneur, part marketer, part operator. He co-founded Orbis, runs Vetted, and uses AI to build things on the internet from Canada. There is a lot of noise in AI, so he reads it, tests it on his own companies and his clients, and what survives shows up on this site with a date on it. | Aayush Manchanda co-founded Orbis, runs Vetted, and builds things with AI from Canada. There is a lot of noise in AI. He tests it on his own companies and his clients, and what survives shows up on this site with a date on it. | rewrite | Mirrors the new hero for the parity rule; run `scripts/validate-schema.mjs` | applied |
| 168 | feeds.ts:134 | Everything new on the site: tools I ran, sites I keep going back to, things I saved to read, and notes. | Everything new on the site: tools I ran, sites I keep going back to, things I saved to read, and notes. | keep | A list of four real things | kept |
| 169 | feeds.ts:59 | Source: {host} | Source: {host} | keep | Feed footer | kept |

### src/components/NewsletterSignup.astro

| # | file:line | before | after | verdict | why | status |
|---|---|---|---|---|---|---|
| 170 | NewsletterSignup.astro:51 | The short list | The short list | keep | Name of the thing | kept |
| 171 | NewsletterSignup.astro:55-58 | New tools ship faster than anyone can test them. I test them anyway, on real work at my own companies, and send you the short list: what survived, what didn't, and why. Plain language, only when there's something worth sending. | Which tools survived real work and which didn't. Sent only when there's something worth sending. | rewrite | Triad and the "on real work at my own companies" repeat | applied |
| 172 | NewsletterSignup.astro:62-63 | You're in. Buttondown just emailed you a confirmation link. One click there and it's done. | You're in. Buttondown has emailed you a confirmation link. | rewrite | Drops the coaching | applied |
| 173 | NewsletterSignup.astro:68, 75, 81 | Email address / you@example.com / Subscribe | (same) | keep | Form controls | kept |
| 174 | NewsletterSignup.astro:85-87 | Unsubscribe at the bottom of every issue. Buttondown runs the list; nobody else sees it. | | cut | Aayush's example; /privacy carries the unsubscribe fact. Delete the whole `<p class="news__fine">` and its CSS | applied |

### src/pages/llms.txt.ts and index.md.ts

| # | file:line | before | after | verdict | why | status |
|---|---|---|---|---|---|---|
| 175 | llms.txt.ts:31-34 | The personal site of Aayush Manchanda: a running log of software he has installed and actually run, websites whose design he keeps going back to, links he saved to read and watch, short notes, and experiments that are in flight right now. | Aayush Manchanda's site: software he installed and ran, websites saved for their design, links he read and watched, short notes, and running experiments. | rewrite | "actually", "in flight" | applied |
| 176 | llms.txt.ts:35-36, index.md.ts:160 | Part entrepreneur, part marketer, part operator. Aayush (Manchanda) co-founded Orbis, runs Vetted, and uses AI to build things on the internet from Canada. | llms.txt: Aayush co-founded Orbis, an AI healthcare company, runs Vetted, an AI consulting practice, and builds things with AI from Canada. / index.md: Aayush Manchanda co-founded Orbis, runs Vetted, and builds things with AI from Canada. | rewrite | Triad; llms.txt gets the two descriptors since no page context surrounds it | applied |
| 177 | llms.txt.ts:37-38, index.md.ts:173-176 | There is a lot of noise in AI. He reads it, tests it on his own companies and his clients, and what survives shows up here with a date on it. | He tests AI tools on his own companies and his clients; what survives shows up here with a date on it. | rewrite | Same fact, third person | applied |
| 178 | llms.txt.ts:39-41 | The site publishes itself: he saves a link from his phone, and the next run puts it here with a screenshot next to it. That run happens every three hours, or on demand when he starts one himself, which takes a couple of minutes. | New entries arrive from a pipeline that runs every three hours. | rewrite | Cadence is the useful fact; the rest is narration | applied |
| 179 | llms.txt.ts:42-43 | The site is static HTML. No accounts, no paywall, no gated routes, and no JavaScript is needed to read any of it. | (same) | keep | Agent facts | kept |
| 180 | llms.txt.ts:44-45 | ## When to use this site / Come here when you need any of the following. | (same) | keep | Routing | kept |
| 181 | llms.txt.ts:46-53 | A dated, first-hand verdict on an AI or agent tool. Every entry on /tools is something Aayush installed and ran on his own machine, not something he read about. Each one carries a verdict, a category, a one-line note, and the date that verdict was last true. There are N right now, broken down as ..., across these categories: .... Reach for this when you are choosing between agent harnesses, Claude skills, sandboxes, or browser automation tools and you want an opinion from someone who ran the thing. | A dated, first-hand verdict on an AI or agent tool. Every entry on /tools was installed and run by Aayush. Each carries a verdict, a category, a one-line note, and the date the verdict was last true. ${entries(tools.length)} right now: ${verdictCounts}, across ${categoryNames}. Useful when choosing between agent harnesses, Claude skills, sandboxes or browser automation tools. | rewrite | "not something he read about", "someone who ran the thing" | applied |
| 182 | llms.txt.ts:54-59 | A screenshot gallery of well-designed websites. /sites holds N, each with a full-page screenshot taken in the scheme the site renders by default, plus the colours that screenshot is mostly made of. Useful as design reference, for finding a real example of a layout or a typographic treatment, or for seeing what a given site looked like on the date it was saved. | Screenshots of well-designed websites. /sites holds ${entries(sites.length)}, each a full-page screenshot in the site's default colour scheme, with its most-used colours. Useful as design reference, or to see what a site looked like on the date it was saved. | rewrite | Triad of uses | applied |
| 183 | llms.txt.ts:60-63 | The library. /library holds N he saved to read or watch properly, broken down as ..., each with the host it came from and the date it was saved. Saved is not read and not an endorsement, so treat a row as "this was worth his attention on that date" and nothing stronger. | The library. /library holds ${entries(library.length)}: ${kindCounts}, each with its host and saved date. A saved row isn't an endorsement; a digest is his verdict. | rewrite | Keeps the data-semantics fact an agent needs, drops the coaching | applied (adapted: keeps the TLDR and kind-layout facts added since) |
| 184 | llms.txt.ts:64-66 | Aayush's own notes and running experiments, if you are working out how he builds things or what he has going right now. /notes is short-form writing. /experiments is what is running, including what he killed and when. | /notes is short writing. /experiments is what's running, including what he killed and when. | rewrite | The lead-in was padding | applied |
| 185 | llms.txt.ts:67-69 | Two things this site is not, so you can rule it out fast. It is not product documentation, and there is no API to call. It is also not a company site: for Orbis or Vetted, this is the wrong place to look. | Not here: product documentation, an API, or anything about Orbis or Vetted as companies. | rewrite | Same three facts | applied |
| 186 | llms.txt.ts:70-75 | ## How to read this site as an agent / Every page has a markdown variant with the same data as the HTML, generated from the same source, so the two cannot drift. / Send Accept: text/markdown ... / Or request the .md URL directly ... | ## How to read this site as an agent / The home page and every section page have a markdown variant with the same data as the HTML. / (bullets unchanged) | rewrite | "Every page" is wrong (only home and sections have `.md`); "cannot drift" is process | applied |
| 187 | llms.txt.ts:76-78 | Filter pages exist under ... Every tool, site, note and library entry has its own page. | (same) | keep | Routes | kept |
| 188 | llms.txt.ts:79-87 | A library entry's page lives at /library/<slug> and holds what the site actually has on it: the kind, the host, the tags, the date it was saved, the one line he wrote, and the source. X of Y have been digested, which adds cliff notes and a call on whether it is worth reading. A saved post's page carries the post in full, where the card that points at it cuts off at 700 characters. Some pages carry a block drafted by his pipeline: it is labelled as a draft where a reader can see it, it is not his verdict, and only a digest is. /library.md carries every row, and the sitemap lists every URL. | A library entry's page at /library/<slug> holds the kind, host, tags, saved date, his one-line note, and the source. ${digested.length} of ${library.length} are digested, with cliff notes and a call on whether it's worth reading. A saved post's page carries the full post. A block labelled as a draft was written by his pipeline and isn't his verdict. /library.md carries every row. | rewrite | Same facts; sitemap is already under Machine-readable | applied (adapted: card cut-off is now 280 characters) |
| 189 | llms.txt.ts:89-90 | Home: who he is and an index of the five sections. | (same) | keep | Route description | kept |
| 190 | llms.txt.ts:92-93 | About: who Aayush is, what the five sections hold, and where the verdicts on this site come from. | About: who Aayush is and what the sections hold. | rewrite | Matches the new page | applied |
| 191 | llms.txt.ts:94-96 | Contact: how to reach him, and what he does and does not answer. The address is entity-encoded in the page rather than printed, so read the mailto: href rather than the visible text. | Contact: how to reach him and what gets a reply. The address is entity-encoded; read the mailto: href, not the visible text. | rewrite | Two "rather than"s in one line | applied |
| 192 | llms.txt.ts:97-101 | Design: the design language of the site, rendered by the components themselves. The mark, the colour tokens, the type scale, the chip palette, the link rules and the interaction rules. Note that the token values on it are read out of the stylesheet by script at runtime, so they are not in the served HTML; the stylesheets in the repository are the source. | Design: the mark, colour tokens, type scale, chip palette, link and interaction rules, rendered by the site's own components. Token values are read from the stylesheet at runtime and aren't in the served HTML; the repository's stylesheets are the source. | rewrite | Tighter | applied |
| 193 | llms.txt.ts:102-103 | Privacy: what this site does and does not collect, and how to get a screenshot of your own site removed. | Privacy: what the site collects, what it loads from elsewhere, and how to get a screenshot removed. | rewrite | Matches the page's own meta | applied |
| 194 | llms.txt.ts:104-107 | ## Machine-readable / Sitemap: every indexable URL. / robots.txt: everything is allowed, AI crawlers included and named. | (same) | keep | Facts | kept |
| 195 | llms.txt.ts:108-111 | ## Feeds / RSS 2.0, newest 50 entries each. Every item carries the entry's own text: a tool's verdict and note, a library entry's digest or note, what he thinks of a site when he has said, a note in full. The first feed is every section at once. | ## Feeds / RSS 2.0, newest 50 entries each. Every item carries the entry's own text: a tool's verdict and note, a library entry's digest or note, a site's like and dislike lines where written, a note in full. The first feed is every section at once. | rewrite | "when he has said" | applied (adapted: 'his notes on a site where he wrote any') |
| 196 | index.md.ts:178-181 | The site is a log rather than a portfolio. Every entry carries the date it was written or last checked, and nothing is deleted once it stops being flattering. | | cut | The site describing itself, with a wink | applied |
| 197 | index.md.ts:182-192 | Sections / Latest / For agents (four bullets) | (same) | keep | Routes | kept |

Paste-ready `llms.txt.ts` body header (rows 175 to 186), template literal intact:

```ts
  const body = `# Aayush Manchanda
> Aayush Manchanda's site: software he installed and ran, websites saved for
> their design, links he read and watched, short notes, and running
> experiments.
Aayush co-founded Orbis, an AI healthcare company, runs Vetted, an AI
consulting practice, and builds things with AI from Canada.
He tests AI tools on his own companies and his clients; what survives shows up
here with a date on it.
New entries arrive from a pipeline that runs every three hours.
The site is static HTML. No accounts, no paywall, no gated routes, and no
JavaScript is needed to read any of it.
## When to use this site
Come here when you need any of the following.
- A dated, first-hand verdict on an AI or agent tool. Every entry on /tools was
  installed and run by Aayush. Each carries a verdict, a category, a one-line
  note, and the date the verdict was last true. ${entries(tools.length)} right
  now: ${verdictCounts}, across ${categoryNames}. Useful when choosing between
  agent harnesses, Claude skills, sandboxes or browser automation tools.
- Screenshots of well-designed websites. /sites holds ${entries(sites.length)},
  each a full-page screenshot in the site's default colour scheme, with its
  most-used colours. Useful as design reference, or to see what a site looked
  like on the date it was saved.
- The library. /library holds ${entries(library.length)}: ${kindCounts}, each
  with its host and saved date. A saved row isn't an endorsement; a digest is
  his verdict.
- /notes is short writing. /experiments is what's running, including what he
  killed and when.
Not here: product documentation, an API, or anything about Orbis or Vetted as
companies.
## How to read this site as an agent
The home page and every section page have a markdown variant with the same
data as the HTML.
```

### src/pages/design.astro

The page is a colophon: its job is design facts, so most paragraphs pass the value test as they are. Cuts are the sentences that narrate the build or promise future commits.

| # | file:line | before | after | verdict | why | status |
|---|---|---|---|---|---|---|
| 198 | design.astro:135 | The design language of this site: the mark, the colour tokens, the type scale, the chip palette and the interaction rules, rendered by the components themselves. | (same) | keep | Facts | kept |
| 199 | design.astro:139-142 | design. / What this site is made of: the mark, the tokens, the type, the chips and the rules, drawn by the code that draws every other page. | (same) | keep | The page's claim, once | kept |
| 200 | design.astro:151-155 | My initials on a 16-unit grid, one stroke weight, every diagonal at the same angle... | (same) | keep | Facts | kept |
| 201 | design.astro:162-168 | It is also what makes the A separable... 0.81 device pixels and peak at 87% ink... | (same) | keep | Numbers | kept |
| 202 | design.astro:193 | The favicon: the A from the lockup, on its own | (same) | keep | Alt | kept |
| 203 | design.astro:203-208 | Those three are the real file, at the three sizes a browser asks for it. Its colours are pinned rather than inherited, and they answer to your browser's own light or dark setting rather than to the theme button in the footer: this glyph sits in the tab strip, not on the page, so it should match the chrome around it. | The favicon at the three sizes a browser asks for. Its colours follow your browser's light or dark setting, not the theme button in the footer, because it sits in the tab strip. | rewrite | Two "rather than"s | applied |
| 204 | design.astro:216-221 | Every colour on the site is one of these. If I typed a hex outside the stylesheets, I broke something. Light is the base, so it is what a page is with no attribute, no media query and no scripting; dark is written out twice, once for a reader following their OS and once for a reader who pinned it, and a test parses both blocks and fails if they drift apart. | Every colour on the site is one of these. Light is the base. Dark is written twice: once for a reader following their OS, once for a reader who pinned it. | rewrite | Process narration ("I broke something", "a test parses") | applied |
| 205 | design.astro:223-229 | The swatches are painted from the tokens and the values beside them are read back out of the live stylesheet. Press the theme button in the footer and both halves move, because neither half is written down here. They are the shipped strings rather than the ones I typed, so the build's minifier has been at them: it shortens a six-digit hex to three and folds an alpha into the hex where it can. Same colours, one step further along. | The values beside the swatches are read from the live stylesheet, so they follow the theme button in the footer. They're the shipped strings, so the minifier has shortened some hexes to three digits and folded alpha in where it could. | rewrite | Same facts | applied |
| 206 | design.astro:253-256 | The accent is one hue at two lightnesses... | (same) | keep | Facts | kept |
| 207 | design.astro:280-284 | The moment the accent becomes a background with text on it... 3.89:1... 5.91:1... | (same) | keep | Numbers | kept |
| 208 | design.astro:287-293 | And a real palette row, the component that sits under every screenshot in the gallery. Every swatch is a button, because the point of the row is that you can take the colour out of it. These six were read off the {capture} capture by the pipeline, so they are a fact about the screenshot rather than an opinion about the site. | The palette row that sits under every screenshot in the gallery. Every swatch is a button that copies its hex. These six were measured off the {capture} screenshot. | rewrite | Keep the anchor on the capture title | applied |
| 209 | design.astro:305-308 | Geist Sans for prose and labels, Geist Mono for data: dates, counts, clocks, hex values and code. Both are variable fonts bundled into the build and served from this domain, so reading a page here does not tell a font CDN that you were reading it. | Geist Sans for prose and labels, Geist Mono for data: dates, counts, clocks, hex values and code. Both are variable fonts served from this domain. | rewrite | Privacy comfort has one home | applied |
| 210 | design.astro:335, 340, 345 | One line under every title, and never two. / Cliff notes / Saved Sep 22, 2026 | (same) | keep | Specimens | kept |
| 211 | design.astro:350-357 | The masthead at the top of this page is the mono variant... | (same) | keep | Facts about the classes | kept |
| 212 | design.astro:359-363 | Two rules are global... | (same) | keep | Facts | kept |
| 213 | design.astro:365-369 | Mono is for what you might retype... | (same) | keep | Facts | kept |
| 214 | design.astro:372-374, 380-388 | Text comes in four levels... / Titles, names, links / Prose, notes, and every control / Labels, dates, counts | (same) | keep | Facts | kept |
| 215 | design.astro:396-400 | Spacing runs on three numbers... | (same) | keep | Numbers | kept |
| 216 | design.astro:403-406, 420-423 | Tabular numbers are not optional... / Watch the right edge of the second one... | (same) | keep | The demonstration needs its caption | kept |
| 217 | design.astro:431-435, 437-441 | A soft tint, never a solid fill... / Every ink clears 6:1 over its own tint... | (same) | keep | Numbers | kept |
| 218 | design.astro:505-509 | The tag is the one chip that is not a tint... | (same) | keep | Reasoned fact | kept |
| 219 | design.astro:512-517 | The last row is the site's seven identity hues. A saved post on /library is drawn as a card, and a card like that opens with a face. This site does not fetch faces, so the circle holds the poster's initial and takes its colour from their handle, hashed into one of seven slots. | The monogram row is the site's seven identity hues. A saved post's card opens with a circle holding the poster's initial, coloured by hashing their handle into one of seven slots. This site doesn't fetch faces. | rewrite | Names the row; "The last row" is used twice on this page | applied (adapted: posts now show the profile picture, initial as fallback) |
| 220 | design.astro:520-525 | Those are every verdict on /tools, every status on /experiments and every kind on /library, iterated from the same lists those pages read. A fifth verdict will show up here on the commit that adds it, and it will not compile until it has a tone. | Those are every verdict on /tools, every status on /experiments and every kind on /library, read from the same lists those pages use. | rewrite | Promise about a future commit | applied |
| 221 | design.astro:527-532 | The last row is the filter form. Same tone, same size, and the only things added are the affordances a label has no use for: a pointer cursor, and a tint that deepens on hover instead of changing colour. Hover one. That state holds AA rather than 6:1, which is the one place the vocabulary spends contrast on purpose. | The chip--link row is the filter form: same tone, same size, plus a pointer cursor and a tint that deepens on hover. Hover one. That state holds AA rather than 6:1, the one place the vocabulary spends contrast on purpose. | rewrite | "The last row" was wrong (it's the fourth of six) | applied |
| 222 | design.astro:534-538 | Blue is the accent hue held back from the accent lightness... | (same) | keep | Facts | kept |
| 223 | design.astro:546-551 | A link inside a sentence is blue with a 2px underline... | (same) | keep | Facts | kept |
| 224 | design.astro:553-560 | A link that leaves the site takes an arrow, and the arrow comes from CSS rather than from markup: rareui.com. Typing the character by hand is how a convention ends up on nine links and missing from the tenth, and how the arrow ends up inside the text a screen reader has to read out. The generated one has an empty accessible name, so it announces the link and not "north east arrow" after it. | A link that leaves the site takes an arrow, drawn by CSS: rareui.com. It has an empty accessible name, so a screen reader announces the link and not "north east arrow" after it. | rewrite | Process lesson cut; a11y fact kept | applied |
| 225 | design.astro:562-568 | Everything else is exempt, and exempt structurally rather than by an override... | (same) | keep | Facts | kept |
| 226 | design.astro:570-578 | Furniture that still has to read as a link uses the quiet pattern instead: it keeps the ink it already had and carries an underline in the hairline colour, going accent on hover. It looks like this. It carries the underline permanently rather than revealing one, because on a touchscreen there is no hover to reveal it with. It is a rule rather than a shared class, so this one specimen is drawn rather than rendered, and the three surfaces that use it each keep their own colour and alignment. | Furniture that still has to read as a link uses the quiet pattern: it keeps its ink and carries a permanent underline in the hairline colour, going accent on hover. It looks like this. The underline is permanent because a touchscreen has no hover to reveal one. | rewrite | Three "rather than"s | applied |
| 227 | design.astro:586-590 | Everything presses... Hold each of these down. | (same) | keep | Numbers plus the instruction the demo needs | kept |
| 228 | design.astro:610-612 | They do nothing else. A control that cannot work is not shown on this site, so these three exist to be pressed. | They do nothing else. | rewrite | The site describing its own rule | applied |
| 229 | design.astro:614-618 | Every transition names its properties... | (same) | keep | Facts | kept |
| 230 | design.astro:620-627 | Reduced motion flattens... | (same) | keep | Facts | kept |
| 231 | design.astro:629-637 | The command palette opens on Cmd or Ctrl K... | (same) | keep | Keyboard facts | kept |
| 232 | design.astro:639-643 | Scroll chaining is contained in modals and nowhere else... | (same) | keep | Fact with the reason | kept |
| 233 | design.astro:645-650 | Focus is a 2px accent ring... | (same) | keep | Numbers | kept |
| 234 | design.astro:657-660 | If the code and the contract disagree, fix whichever is wrong, in the same commit. | (same) | keep | The rule | kept |
| 235 | design.astro:662-666 | The contract is design.md, in the repository. Every claim in it names the file and the selector that enforces it, so any of it can be checked with one grep, and this page is the half of it you can press. | The contract is design.md, in the repository. This page is the half of it you can press. | rewrite | Process narration | applied |
| 236 | design.astro:62-73, 77-80, 90-93 | Token notes and press-scale notes ("the page", "titles, long-form prose, and the mark", "a full-bleed row on the index and /notes") | (same) | keep | Data labels | kept |
| 237 | design.astro:159 | The AM lockup, drawn large | (same) | keep | aria-label | kept |

### Remaining microcopy (all keep)

| # | file:line | string | verdict | why | status |
|---|---|---|---|---|---|
| 238 | CommandPalette.astro:54, 89, 102, 106, 109-111 | Search this site / Search tools, sites, library… / Results / No matches / ↑↓ move · ↵ open · esc close | keep | Controls | kept |
| 239 | MobileNav.astro:39, 50, 57, 68, 110 | Menu / Site navigation / Close menu / Primary / Search | keep | Controls | kept |
| 240 | ThemeToggle via theme.ts:81, 86, 91 | Theme: X. Switch to Y. / Theme: X / X theme | keep | aria, title, live region | kept |
| 241 | ShotActions.astro:39, 56, 65, 75, 244, 255, 259 | Copy the X screenshot to the clipboard / Copy image / Download the X screenshot / Download / Copying / Copied / Could not copy the screenshot. Use Download instead. | keep | Controls and status | kept |
| 242 | PaletteRow.astro:36, 40 | Colours read off the X screenshot / Copy #hex | keep | aria | kept |
| 243 | copy-flash.ts:52 | copied / failed | keep | Status | kept |
| 244 | SiteFoundations.astro:78-84, 92, 130 | Design / Copy as DESIGN.md / Copy X's tokens as DESIGN.md / Read from {domain} on {date}. / Rendered in your fallback if X isn't installed. / Show all N | keep | Controls and facts | kept |
| 245 | EntryNav.astro:51-56 | esc close / ← prev / → next | keep | Keys | kept |
| 246 | Breadcrumbs.astro:25, schema.ts:387 | Breadcrumb / Aayush Manchanda | keep | Nav | kept |
| 247 | ToolList.astro:32-36 | Name / Description / Category / Verdict / Date | keep | Column heads | kept |
| 248 | search-index.ts:39-44 | Pages / Tools / Sites / Library / Notes / Experiments | keep | Group labels | kept |
| 249 | VERDICT_LABELS, KIND_LABELS, collectionLabel | Using / Watching / On hold / Skipped / Articles / Posts / Videos / slug-with-spaces | keep | Vocabulary | kept |
| 250 | markdown.ts:359-363, 376 | Other pages / Site summary for agents / Every URL the site publishes / Source: {url} | keep | Agent routes | kept |

## Count check

Rows 1 to 250, counted by the verdict column: 11 cut, 109 rewritten, 130 kept. A row that lists several labels for one component counts once. The two em dashes in this file are inside verbatim quotes of the retired rules in the Root cause section; none are in any "after" cell.

## After pasting

1. `npx astro check`, `npm test`, `npm run build`, then `node scripts/validate-schema.mjs` for the Person-description parity (row 167) and the glued-anchor check on /about, /contact and /privacy.
2. Read /about, /contact and /privacy in the browser at 375px: every anchor should have a space either side.
3. Trim the header comments in `about.astro`, `contact.astro` and `privacy.astro` that describe cut copy; `design.md` §6 in the repo should be replaced with the §6 from `feature-research/aayushmanchanda-com/design-contract-copy.md`, and `voice.md` at the repo root is `briOS-wave/voice.md`.
4. `PURPOSE.md` bar item 3 still says "An old date is a warning, not a badge." It's a repo file, not a page, so it's out of this audit's scope; a one-line edit ("Dated. Every opinion carries the day it was last true.") keeps it consistent.


## New rows since f298864 (added by the repo pass)

| # | file | before | after | verdict | why | status |
|---|---|---|---|---|---|---|
| 251 | privacy.astro › Logos | The logos on /tools, on each tool's page and on /sites load from logo.dev… I'd rather keep copies here, but their free plan doesn't allow it… Nothing else on those pages loads from anyone else. | Logos. The logos on /tools, each tool's page, /sites and /about load from logo.dev, a logo API. They see your IP address and this site's address, not the page you were on. When logo.dev has no logo, the icon comes from this domain or is a letter. | rewrite | Legal fact kept; motive cut; /about added for the Work rows | new |
| 252 | privacy.astro › posts | The saved posts used to load from X. For a while the posts page and each post's own page showed X's own embeds… | Saved posts load nothing from X. Each post's words, profile picture, photos and video are stored in this site's files. The link to the original is the only way to X. | rewrite | History cut, current fact kept | new |
| 253 | privacy.astro › storage | …If you turn the click sound off or on, from the footer or the search box, it saves on or off. Until you press one of them, nothing goes in local storage. | (folded into row 131: three keys, each only after you press something) | rewrite | Sound key is a legal fact; the closer repeated the lead | new |
| 254 | sites.md.ts › About the pages | Every row is one saved page. Pages saved from the same domain share one card… | (same) | keep | Agent facts | new |
| 255 | ReaderBlocks.astro | Highlights / From {domain} | (same) | keep | Labels | new |
| 256 | EntryDetail.astro | Read the full article | (same) | keep | Link label | new |
| 257 | SoundToggle.astro, ui-sound.ts | Sound / Sound on / Sound off | (same) | keep | aria, title | new |
| 258 | palette.ts | Search didn't load. Close and try again. / No matches / Ctrl K | (same) | keep | Status | new |
| 259 | PostCard.astro, PostMedia.astro | Read on X / Read more / Removed on X / Watch on X | (same) | keep | Link labels | new |
| 260 | LibraryToolbar.astro, LibraryPane.astro | All tags / No entries match both filters. Show all | (same) | keep | Controls | new |
| 261 | about.astro › Work | (new) | Orbis · Voice receptionist for dental clinics / Vetted · AI consulting practice · Founder | new | VET-235; Orbis has no role or period | new |
| 262 | about.astro › Projects | (new) | One row per section: name, blurb from lib/sections.ts, entry count | new | VET-235; one home per blurb | new |
| 263 | about.astro › Elsewhere | (new) | X @amanchanda7 / GitHub aayushmanchanda2 / Email /contact | new | VET-235 | new |
| 264 | Avatar.astro | (new) | alt: Aayush Manchanda | new | Photo on /about and the home hero | new |
| 265 | index.astro header comment | …which is the quietest way to ask, and the opposite of a popup. | Below the index on purpose: it is the last thing on the page. | rewrite | Comment, not copy; reassurance mindset trimmed | new |
