# voice.md

How copy on this site is written. Read it before changing a word a reader sees: a standfirst, a tool note, a label, alt text, a meta description, the markdown variants, `llms.txt`.

## The voice

A smart friend telling you what he found out this week, in the time it takes to walk to the car. First person, present tense. Opens on the point, gives the number, hedges as a guess, ends on a quip or a question.

## The test

Every sentence gives the reader a fact or an opinion they'd want. A fact is a verdict from real use, a price, a date, a name, a count, a version. An opinion is something a reader could disagree with.

If a sentence describes the site, narrates how something got made, or reassures, cut it.

## Rules

- Contractions, always.
- Hedge as a guess ("I suspect", "my hunch is"), never as a disclaimer.
- Name the tool, the price, the count, the model version, the date.
- End on a quip or an open question, never a summary.
- One home per idea. If it's in a tool note, it isn't on About. If it's in the hero, it isn't in the bio.
- Facts only. Nothing gets invented for rhythm.

## Banned

Em dashes. "Not X, Y" and "rather than" more than once on a page. Vendor-blurb openings ("A self-hosted..."). Groups of three for padding. "Actually" and "honest" as filler. Inflated adjectives. Rhetorical questions the next sentence answers. Promises about what a future commit will do.

## Patterns that don't ship

Each of these was live once.

| Pattern | It looked like |
|---|---|
| The site describing itself | "A section only exists here if it has something in it. There are no coming-soon pages and no drafts folder." |
| Process narration | "I built this site overnight by telling agents what I wanted." |
| Reassurance | "Buttondown runs the list; nobody else sees it." |
| Disclaimers about my limits | "That is also the limit of it: my use case is agent tooling and small-team software, and a tool that lost a head-to-head on my work might win on yours." |
| Aphorisms about dates | "Every opinion carries the date it was last true. An old date is a warning, not a badge." |

## Caps

| Surface | Formula | Cap |
|---|---|---|
| Hero | Who, in one sentence. What's here, in one more. | 2 sentences |
| Section standfirst | What the section holds. One quip allowed. | 25 words |
| Section blurb | What's in it. | 12 words |
| Tool description | Fragment, sentence case, no period: what it does for me | 7 words |
| Tool note | The point first, then the one detail that earned the verdict | 20 words |
| Library TLDR | What the source claims, so you can skip the source | 25 words |
| About bio | What I do, in order, present tense, no adjectives about myself | 120 words |
| Notes | Bullets for first impressions, prose for one idea. Close on a hunch or a question | 400 words |
| Tips | Imperative title, one paragraph of why, the exact steps, one caveat | 80 words |
| Privacy | The facts: what's collected, what's stored, which third parties, how to take something down | as short as the facts allow |
| Meta description | One sentence a search result can show | 160 characters |
| Microcopy | The noun or the verb | 4 words |

## Before and after, from this site

| Before | After |
|---|---|
| Part entrepreneur, part marketer, part operator. I co-founded Orbis, run Vetted, and use AI to build things on the internet from Canada. | I co-founded Orbis, run Vetted, and build things with AI from Canada. |
| Software I installed, ran, and formed an opinion about. Every verdict is dated. | Software I installed and ran, with a dated verdict on each. |
| Things I saved to read or watch properly. Saved is not read, and neither is a recommendation. Every row has a page now, and the ones I have read carry cliff notes and an honest call on whether it is worth your time. | Articles, posts and videos I saved to read or watch. The ones I've read carry cliff notes and a call on whether they're worth your time. |
| Things I am running right now, and the ones I stopped. Killed experiments stay on the page, because deleting them would make me look better than I am. | What's running right now, and what I stopped. Killed ones stay listed. |
| Unsubscribe at the bottom of every issue. Buttondown runs the list; nobody else sees it. | (cut) |
| Since 26 August 2026 this site counts page views with Vercel Web Analytics. I wanted to know which pages people actually read, because that is most of what tells me whether any of this was worth someone's time. | Since 26 August 2026 the site counts page views with Vercel Web Analytics. |
| This URL does not exist. Either it never did, or I moved it and left no forwarding note. Everything the site actually has is listed below, and the front page has not moved. | This URL doesn't exist. Everything the site has is below, and the front page hasn't moved. |
| Agent org control plane. Verified working on the overnight bench, boots clean, embedded Postgres, telemetry off. | Boots clean with embedded Postgres, telemetry off. Ran it on the overnight bench. |

## Markup

A line break next to a tag is not a space in Astro. Keep the space on the same line as the anchor. `design.md` §6 has the detail.
