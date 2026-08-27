# design.md

The design contract for this site, written from the shipped code. Read it before touching UI. Every claim names the file and the selector or symbol that enforces it, so any of it can be checked with one grep. **If the code and this file disagree, fix whichever is wrong, in the same commit.**

Paths are relative to `src/`. `file › thing` means "grep for `thing` in that file".

---

## 1. Tokens

All of them live in `styles/global.css › :root`. If you typed a hex outside `styles/`, you broke something.

| | Light | Dark |
|---|---|---|
| `--bg` | `#ffffff` | `#09090b` |
| `--fg` | `#171717` | `#fafafa` |
| `--muted` | fg @ 75% | same |
| `--faint` | fg @ 45% | same |
| `--hairline` | fg @ 10% | same |
| `--hairline-strong` | fg @ 18% | same |
| `--outline` | `rgb(0 0 0 / 0.1)` | `rgb(255 255 255 / 0.1)` |
| `--dot` | fg @ 14% | fg @ 10% |
| `--accent` | `#2b4bff` | `#5c74ff` |

**Light is the base; dark is declared twice.** The theme is three-state — follow the OS, or pin light, or pin dark — and it lives in one place at runtime, `data-theme` on `<html>`, always carrying one of `system` / `light` / `dark`. Light is plain `:root`, so it is what a page is with no attribute, no media query and no scripting. Dark then has to arrive from two directions, and both blocks must declare **exactly** the same properties with the same values:

```css
:root { /* light: the base */ }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { /* dark */ } }
:root[data-theme="dark"] { /* dark, again, identically */ }
```

The `:not()` is what lets a pinned light theme win on a dark OS, and `system` matches it on purpose. CSS has no way to say a block twice without writing it twice, so `lib/theme.test.mjs` parses `global.css` and `chip.css`, keys every dark rule by its selector with the guard stripped off, and fails if the two sets differ by a property, a value or a selector — or if a rule inside the media query forgets its guard. **Add a token to one block, add it to the other.** The failure it exists to catch is silent: a token declared only under `prefers-color-scheme` looks right to everyone whose OS is already dark, and ships a half-themed page to everyone who pinned dark on a light machine.

Everything else derives. `palette.css` has no theme-conditional declaration at all and must keep it that way; the same test asserts it. The only other theme-conditional thing in the build is the pair of `theme-color` metas, which JS re-points by rewriting their `media` to `all` / `not all` when a theme is pinned (`lib/theme.ts › THEME_COLOR_MEDIA`), because a browser resolves those queries against the OS and not against us.

**The accent is one hue at two lightnesses**, `hsl(231 100% 58.4%)` and `hsl(231 100% 68%)`. Hue is identical across themes; lightness is the only difference, because no single lightness clears 4.5:1 against both `#FFFFFF` and `#09090B`. Measured: `#2B4BFF` on white is 5.91:1, `#5C74FF` on `#09090B` is 5.11:1. Both AA for normal text.

**`--accent` vs `--accent-panel`.** `--accent` is for ink: links, hover, `aria-current`, focus rings. The moment the accent becomes a *background with text on it*, switch to `--accent-panel` (`#2b4bff`, held at the vivid blue in **both** themes) with `--accent-panel-ink` (`#ffffff`). White on the dark theme's `--accent` is **3.89:1 and fails AA**; white on `--accent-panel` is 5.91:1 either way. In force at `MobileNav.astro › .mnav__panel`, `styles/palette.css › .palette__row[data-active]`, `layouts/Base.astro › .skip`, `styles/global.css › ::selection`.

**Chip tones** (`styles/chip.css`). A tone sets three numbers and the tint, the hairline and the ink all derive from them, so light and dark stay in step without a second palette. Soft tint, never a solid fill: twenty rows should read as one page, not a traffic light. Every ink clears 6:1 over its own tint.

| Tone | Light `h s l` | Dark `h s l` |
|---|---|---|
| green | `148 65% 26%` | `148 55% 64%` |
| amber | `32 90% 30%` | `38 90% 64%` |
| gray | `0 0% 38%` | `0 0% 62%` |
| red | `0 70% 38%` | `0 80% 70%` |
| blue | `231 80% 45%` | `231 100% 74%` |

Tint `0.09` light / `0.14` dark; hairline `0.2` / `0.26`. A `.chip--link` deepens both on hover instead of changing colour. Blue is the accent hue held back from the accent lightness on purpose: an inline link and a shipped chip must not be the same blue on the same page. Which word earns which tone is the only thing the components decide — `VerdictBadge.astro › TONES`, `StatusChip.astro › TONES` — and both are `Record<T, string>`, so a new verdict or status will not compile until it has a tone.

**Hairlines.** `--hairline` rules every border on the site. `--hairline-strong` is the hover state of a row border and the inset edge of a swatch. There is no third weight.

**Dotted grid.** `styles/global.css › .dotted-grid`: `radial-gradient(var(--dot) 1px, transparent 1px)` at 16px, `--fine` at 10px. It is the backdrop for framed imagery only (`ShotFrame.astro`, `ImageFrame.astro`), never a page texture.

**Motion + layout.** `--ease` `cubic-bezier(.22,1,.36,1)`, `--ease-out` `cubic-bezier(.16,1,.3,1)`; `--dur-fast` 120ms, `--dur` 220ms, `--dur-slow` 420ms. `--page-max` 44rem, `--page-pad` `clamp(1.5rem, 5vw, 3rem)`. Radii: `--r-sm` 4px, and that is the whole scale (see §3).

---

## 2. Type

Geist Sans for prose, Geist Mono for labels, display and metadata. Both are variable fonts bundled from npm and served from our own origin; the site loads nothing from a third-party CDN (`layouts/Base.astro › @fontsource-variable`).

**The mono-label convention.** `styles/global.css › .mono` is 11px, weight 500, `letter-spacing: 0.08em`, **uppercase**. That is the site's label voice: section heads, field labels, dates, footer items, key caps. Section heads open it up to `0.1em` (`index.astro › .index__title`, `ToolList.astro › .group__head`, `VoiceBlocks.astro › .voice__label`).

Three places deliberately undo the uppercase, and each says why in place: a file path is not a label (`styles/palette.css › .palette__row-where`), a hex is a value you are about to paste so it must read exactly as it will arrive (`PaletteRow.astro › .swatch__hex`), and a key cap is printed `esc` on the keyboard the reader is looking at, so shouting it would name a different key (`sites/[slug].astro › .hints__row`).

**Tabular numbers are not optional.** Any digit that changes in place, or sits in a column, gets `.tabular-nums`: the footer clocks, every `as of` / `saved` / `since` date, group counts, the index row numbers, the copyright year.

**Scale.**

| | Size | Where |
|---|---|---|
| `.page-title` | `clamp(2.75rem, 10vw, 5.25rem)`, `-0.045em`, lh `0.98` | every section masthead, home included |
| `.page-title--entry` | `clamp(2rem, 6vw, 3.25rem)`, `-0.035em` | entry pages: a tool, not a section |
| `.page-title--mono` | `clamp(2.25rem, 8vw, 4.25rem)`, lowercase, `-0.02em` | `/notes` and the 404 |
| `.standfirst` | `clamp(1.0625rem, 1.6vw, 1.1875rem)` / 1.65, `--muted` | one line under every title |
| prose | `1.0625rem` / 1.7 | note bodies, `/privacy` |
| row note | `0.9375rem` / 1.55 | list rows |
| `.mono` | `0.6875rem` | every label |

Headings are 600 / lh 1.05 / `-0.03em` with `text-wrap: balance`; paragraphs get `text-wrap: pretty`. Both are already global — do not re-declare them.

**Measures.** Standfirst **46ch** (`styles/global.css › .standfirst`). Note prose **65ch** (`notes/[slug].astro › .prose`). Labelled prose blocks **62ch** (`VoiceBlocks.astro › .voice`, `privacy.astro`). The shell itself **44rem** (`--page-max`).

Optical corrections in force: the masthead pulls `-0.04em` left so the first stem is flush with the column edge, and `--mono` sets that back to 0 because mono has no side bearing to correct for. Metadata columns take a `0.2rem` padding-top to line up with the name rather than the row box (`ToolList.astro › .row__meta`, `ReadingList.astro › .row__meta`).

---

## 3. Structure

**The shell** (`layouts/Base.astro › .shell`) is a flex column at `min-height: 100svh` — main, then footer, both capped at `--page-max`. Left padding is what clears whichever nav is showing: `calc(var(--page-pad) + 2.5rem)` for the fixed vertical MENU label, and `clamp(17rem, 24vw, 21rem)` above 900px for the dash rail.

**The site mark** (`components/SiteMark.astro`) is a constructed geometric A on a 16-unit grid, fixed at the top left of every page, 24px, `currentColor`, `aria-label="Home"`, 40px hit area via a `::before`. One stroke weight throughout (1.5) and one idea: the crossbar does not touch the legs. The rail below it is a stack of free-floating dashes and the crossbar is one more of them. The gap is **0.5 units, measured at the bar's top corner** where the leg leans furthest inboard, which is the tightest point — wide enough to read from 24px up, narrow enough that when it closes at favicon size the mark degrades into a plain solid A instead of a smudge.

It sits at `left: var(--page-pad)` below 900px, inside the strip the shell already clears for the MENU label, so the page scrolls past to the right of it rather than underneath it; above 900px it moves to `clamp(1.5rem, 3vw, 2.75rem)`, the rail's own left edge, so mark and dashes share a column. The same geometry is copied into `public/favicon.svg` and `scripts/og.mjs` — three files, changed together. `npm run og` regenerates the card and the raster icon from the copy in that script.

**900px is the only structural breakpoint.** Above it: the rail. Below it: the MENU panel, and the palette becomes a full-screen sheet. 599px and 639px exist only to reflow list rows from three columns to a stack.

**Proximity sidebar contract** (`components/ProximitySidebar.astro`). A vanilla port of rareui's `proximity-sidebar` — same dash presets, same scaleX-from-distance mapping, same spring constants, no framework JS.

- Each dash is 1px tall and scales along X from a base set by `data-kind`: title 40, subtitle 36, section 30, body 24, bumping by 70 / 64 / 56 / 50 on approach (`› DASH_BUMP`).
- Falloff is `gateX * gateY` with `RADIUS_Y` 96 and `RADIUS_X` 260. The horizontal gate is a deviation from the reference and deliberate: the rail is welded to the viewport edge, so it should react as the pointer *approaches* it, not only once inside the container.
- Only the single nearest dash past `NEAR_THRESHOLD` 0.62 reveals its label. Several labels at once reads as clutter.
- Spring: stiffness 320, damping 34, mass 0.7, semi-implicit Euler in rAF, and the frame loop **stops** once everything is at rest (`› function step`).
- 40px gap + 1px dash = a 41px pitch, which is exactly one hit area, so adjacent targets touch but never overlap (`› .rail__item::before`).
- Measure the `<a>`, never the inner `<span>` — the span carries the transform, so its rect moves with the animation (`› function measure`).
- `prefers-reduced-motion`, or below 900px, detaches every listener and removes the inline `--dash-scale` (`› function sync`). The rail degrades to a plain list of links; labels still reveal on hover.

**Mobile MENU panel** (`components/MobileNav.astro`). A rotated vertical label on the left edge opens a full-height `--accent-panel` sheet, `min(86vw, 380px)`, mono items entering on a 70ms stagger after an 80ms lead-in; the actions row (search, then the theme toggle) continues the same stagger via `--search-i`. The **row** is what carries the entrance, not the controls in it, so a second control did not mean a second delay to keep in step. Closing sets every delay to 0 — nothing leaves on a stagger. Layers: rail 40, mark 50, trigger 60, scrim 70, panel 80, palette 100 — the mark is above the rail and under everything modal, so an open panel covers it rather than fighting it.

Every transition here is a **CSS transition, never a keyframe animation**, so an interrupted open/close reverses from wherever it is instead of snapping. `visibility` flips only after the slide-out finishes.

> **Never write a bare `<` in that file's frontmatter, comments included.** It makes the Astro compiler lose the `Props` interface when it generates TSX, and every prop silently stops being typed. Write "below 900px". `npx astro check` is what caught it.

**The empty-section rule.** `lib/sections.ts › getSections` filters to `count > 0`, and both nav surfaces plus the home index read it. A section with no entries is not linked, not listed, and has no page. There are no "coming soon" pages. Delete every note and `/notes` stops existing.

**Sharp corners.** The site rounds exactly one thing, the chip, plus the focus ring that has to sit around it. Frames, swatches and panels state `border-radius: 0` rather than inheriting it. Concentrically that leaves three radii on the whole site: **4px** (`--r-sm`), **3px** (16px favicon marks, `ToolList.astro › .row__mark`), and **0**. A fourth needs a reason you can write down.

---

## 4. Interactions

**Press.** `styles/global.css › .press` scales to `--press-scale`, default **0.96**, over `--dur-fast`. Wide elements dial it back rather than shrinking by 4%: full-bleed list rows use **0.995** (`index.astro › .row`, `notes/index.astro › .row`, `404.astro`) because a full-width row shrinking 4% reads as a glitch, not a press; a gallery card uses **0.985** (`SiteGrid.astro › .card__link`).

**Never `transition: all`.** Every transition names its properties, everywhere, without exception. Corollary: if an element already carries `.press`, do not add a second `transition-property` to it — the two race depending on stylesheet order (`ShotActions.astro › .act`, `sites/[slug].astro › .hint`).

**Reduced motion** (`styles/global.css › prefers-reduced-motion`) flattens every animation and transition to 0.01ms, zeroes delays, kills `scroll-behavior: smooth`, and disables the press scale. What that global brake **cannot** do is two things, so components handle them:

1. It cannot undo a transform an element *rests* at. Anything resting on one restates it under `prefers-reduced-motion` (`styles/palette.css › .palette__panel`, `ProximitySidebar.astro › .rail__label`, `MobileNav.astro › .mnav__item`).
2. It shortens durations but leaves *entrance* delays meaningful. So a staggered entrance gates the whole animation on `prefers-reduced-motion: no-preference` instead (`SiteGrid.astro › card-in`) — otherwise a card sits invisible for its delay and then pops in.

**Keyboard, the palette** (`lib/palette.ts`). Cmd/Ctrl+K toggles from anywhere. Arrows move with wrap, Home/End jump, Enter follows, Escape closes. Tab is swallowed: the field is the only focusable control in an open palette, so swallowing Tab *is* the focus trap. Focus never leaves the input — the highlight is `aria-activedescendant` (`› setActive`). Focus returns to the opener, which is passed in explicitly rather than read off `document.activeElement`, because Safari does not focus a clicked button (`› setOpen`). Navigation assigns `location.href`; a synthetic `row.click()` on a subtree that is no longer rendered silently does nothing (`› const go`).

**Keyboard, `/sites` entry pages** (`sites/[slug].astro › KEYS`). Escape closes to `/sites`, ← and → walk the gallery in the order the grid renders it, wrapping. Destinations are read off the *visible* hint anchors, so the legend a reader can see and the behaviour a keyboard gets cannot drift: delete a link and the key goes quiet with it. Any modifier bails (Cmd+← is Back, and taking that over is a hijack), and so does a focused text field.

**Precedence: an open palette wins.** Three surfaces listen for keys on `document`, and the order two document-level listeners run in is a bundling detail, not a guarantee — so none of them may depend on running first. Every other surface **asks the document** whether a palette is open: `MobileNav.astro` queries `[data-palette][data-open]`, `sites/[slug].astro` queries `[aria-modal="true"][data-open]`. The palette sets `data-open` **synchronously**, which is exactly why `styles/palette.css` hides with `visibility` rather than `display` — visibility can still be transitioned off one synchronous attribute. The full note is the header comment of `lib/palette.ts`.

**Scroll chaining, the VET-32 lesson.** `overscroll-behavior: contain` is for **modals only**: the palette results and the mobile nav panel. Anything in the normal flow of a page states `overscroll-behavior-y: auto` and lets the page take over at either edge (`ShotFrame.astro › .scroller`). `contain` on a details page whose main content *is* the scroller is a trap — the reader hits the bottom of the picture, keeps scrolling to read the notes below it, and nothing happens until they physically move the pointer off the frame.

**The theme toggle** (`components/ThemeToggle.astro`, state in `lib/theme.ts`). One button, three states, cycling system → light → dark → system. It renders twice — quiet in the footer beside the clocks, and on the mobile nav panel where the footer is a long scroll away — and the hoisted script drives every instance from one listener. 14px glyph in a 40px `::before` hit area, the same trick the rail dashes use, so a control with a toolbar's hit area does not put a toolbar's height into the footer row.

Three things are worth not re-deriving. **The glyph is swapped by CSS off `[data-theme]`, never by script**, because the attribute is written before the first paint and a JS swap would show a sun for a frame to everyone who pinned dark. **The accessible name is the half CSS cannot do**, so `aria-label` and `title` ship saying `system` — which is the truth with scripting off — and the module corrects them on load; the label names the current state *and* the next one, because `aria-pressed` cannot describe three states honestly. **One `aria-live` region for the whole page** (`layouts/Base.astro › [data-theme-live]`), outside the buttons, because text inside a control is that control's accessible name, and two regions would announce one change twice.

Nothing is written to storage until a press. `/privacy` names the one key that then exists, and anything else reaching for `localStorage` has to go and edit that page.

**Hit areas: 40px floor.** Rail dashes get 110×41 via a `::before`, swatches are 44×44 (`PaletteRow.astro › .swatch__chip`), the mobile close is 44×44, shot actions set `min-height: 40px`. One stated exception: the `/sites` hint row uses `padding-block: 0.5rem` instead, because those are text hints and a 40px block would give the foot of the page a toolbar's weight.

**Focus.** `styles/global.css › :focus-visible` is 2px `--accent`, offset 3px, radius `--r-sm`. It flips to `--accent-panel-ink` on the blue panel, widens to a 12px offset on the 1px rail dash, and on the screenshot scroller the frame *is* the ring (`ShotFrame.astro › .scroller:focus-visible`). The palette input sets `outline: none` on purpose: it is the only focusable control in an open palette, so a permanent ring would be furniture rather than a signal, and the highlighted row is the cursor.

---

## 5. Links

**Prose links are bold and underlined.** Weight 600 plus `text-decoration-line: underline`, scoped to where prose actually lives: `.prose a, .standfirst a, .voice__body a, .source a, .fact dd a:not(.chip)` (`styles/global.css`). The reason is that body text is set at `--muted`, so a blue word at weight 400 is a colour difference and nothing else — the one signal that goes missing on a bad screen, in bright sun, or for a reader who cannot separate those two hues at all. Weight and a line are two more, and neither depends on seeing colour.

**Exempt surfaces are exempt structurally, not by an override.** Nav dashes, chips, footer items, index rows, tool and reading rows, crumbs, hint rows and metadata strips are simply **not in that selector list**, and each sets its own `text-decoration: none`. Bolding and underlining them would turn navigation into a paragraph of shouting. Do not extend that selector unless the link sits inside a sentence, and do not "fix" a nav link for missing an underline.

Furniture that still needs to read as a link uses the quiet pattern: `color: inherit` with an underline in `--hairline-strong`, going `--accent` + `currentColor` on hover (`ToolList.astro › .row__link`, `ReadingList.astro › .row__domain`, `tools/[slug].astro › .strip a`). It carries its own underline because on touch there is no hover to reveal one.

**External links get `↗` from CSS, never from markup.** `styles/global.css › .ext::after` uses `content: "\2197" / ""` — the alt-text form, which gives the glyph an empty accessible name so a screen reader announces the link and not "north east arrow" after it. `inline-block` keeps the parent's underline from running under the arrow. Hand-typing the character is how a convention ends up on nine links and missing from the tenth. Every off-site anchor also carries `rel="noopener nofollow" target="_blank"`; `EntryLink.astro` owns that branch once so the pages rendering link rows cannot forget it. The two footer identity links are the exception, at `rel="me noopener"` — `rel=me` is a claim of identity, so only real resolvable profiles go there.

---

## 6. Copy

Applies to everything a reader sees: data notes, standfirsts, blurbs, labels, alt text.

- **First person, present tense.** "Things I actually installed and ran, with an honest verdict" (`lib/sections.ts › CATALOGUE`). "Killed experiments stay on the page, because deleting them would make me look better than I am" (`experiments.astro`).
- **Plain words.** No *leverage*, *seamless*, *powerful*, *journey*, *delve*. The bar is the tools data: "Lost the same head-to-head to Cabinet on my use case."
- **Real opinions only.** A verdict is a judgement someone can disagree with. `watching` plus "Saved from Raindrop. Not tested yet." is the honest placeholder the pipeline writes; anything stronger has to be earned by actually running the thing.
- **Honest dates.** Every opinion carries the ISO date it was last true — `status_date`, `saved_date`, `started` — rendered beside it in tabular numerals, because an opinion with an old date on it is a warning.
- **Verdicts as prose, not a template.** Five fields, each a sentence in his voice: `note`, `why`, `like`, `dislike`, `try`. Absent means absent — a null field renders no block, and a caller with nothing at all renders nothing (`VoiceBlocks.astro › blocks`). An empty labelled box is worse than silence: it reads as a page that failed rather than a tool he has not written up yet.
- **No em dashes in new copy.** Use a period, a colon or a comma. *Known deviation:* eight strings written before this rule still carry one — five notes in `data/tools.json`, plus the `sites.astro` standfirst, the `sites/[slug].astro` shot caption, and the `sites/collection/[slug].astro` lead. Fix on touch; do not add more.
- **Separators are drawn by CSS, never typed into content.** The `·` between metadata items is a `::before` on the list item, outside the anchor, so it is never part of a link's text or its target (`tools/[slug].astro › .strip__item + .strip__item::before`).
- **Alt text says what the picture is of**; decorative marks take `alt=""`.

---

## 7. Structured data

Every page carries one `application/ld+json` block, and every node in it is built by `lib/schema.ts`. Nothing else on the site writes JSON-LD. `layouts/Base.astro › jsonLd` types the prop as `JsonLd`, so the only thing a page can hand the layout is something a builder returned — there is no route by which a page hand-writes a node.

**The parity rule is the whole contract: every property maps to something a reader can see on that page.** It is §6 applied to the machine-readable copy, and it is enforced in three places — the builders, `lib/schema.test.mjs`, and `scripts/validate-schema.mjs`, which reads the built HTML rather than the source that produced it.

**No ratings. Not one, not anywhere.** No `reviewRating`, no `aggregateRating`, no `ratingValue`. A verdict here is a sentence someone can disagree with, and there is no number on the page to carry into one. The cost is stated rather than discovered: Google's Review rich result *requires* `reviewRating`, so these reviews will never draw stars. That is the trade — a citable, honest claim instead of a decorated, invented one. Also absent for the same reason: `keywords` (nothing here is a keyword list) and `SearchAction` (the palette is a client-side filter, not a query endpoint, and advertising a search URL that 404s is a lie a crawler finds out about).

| Page | `@graph` |
|---|---|
| `/` | `WebSite` + `Person`, the site naming the person as both `author` and `publisher` |
| `/tools` `/sites` `/reading` `/experiments` `/notes` | `ItemList` |
| `/tools/<slug>` | `SoftwareApplication` + `Review` + `Person` + `BreadcrumbList` |
| `/sites/<slug>` | `WebPage` (`about` the external site) + `ImageObject` + `BreadcrumbList` |
| `/notes/<slug>` | `Article` + `Person` + `BreadcrumbList` |
| filter pages | `ItemList` + `BreadcrumbList` |
| `/privacy`, 404 | none, on purpose |

Five things are worth not re-deriving.

**Every document is an `@graph`, even a one-node one**, so the validator and anything reading the built HTML walk one shape. **A `{"@id": …}` reference must resolve inside its own graph** — a parser reading one page cannot follow a reference to a node that only exists on another — which is why the `Person` is repeated on every page that attributes something to him, and absent from every page that does not. **That `Person` is compact off the home page**: `name`, `url`, `sameAs` and nothing else, because those are the three things the site mark and the two `rel="me"` footer rows make visible *everywhere*, while the biography is only visible on the home page. **The opinion never leaks onto the thing being reviewed** — a `SoftwareApplication` gets name, url, category; every judgement lives in the `Review`, attributed and dated. **`lib/schema.ts › pageUrl` must agree with the canonical link**, because Astro builds directory-format routes and `/tools/paperclip` vs `/tools/paperclip/` is two URLs for one document; the validator compares the two on every built page.

`serialize()` escapes `<`, `>`, `&` and both line separators. The block goes out through `set:html`, so a note containing `</script>` would otherwise end it early and put the rest of the graph into the document as markup.

---

## 8. Before you ship UI

**Gates, all of them, every time.**

1. `npx astro check` → **0 errors, 0 warnings.** Hints have a known baseline of 13 (eleven `z is deprecated` from `content.config.ts`, one unused `Props`, one unreachable-code hint); do not add to it. Note that `checkJs` is on, so a new `.mjs` under `scripts/` or `pipeline/` is type-checked too and needs its JSDoc.
2. `npm test` → all pass (191 at the time of writing).
3. `npm run build` → clean, then `npm run validate:schema` → clean. The second reads `dist/`, so it is only meaningful after the first.
4. **Both themes, and both forced states.** Four looks, not two: OS light, OS dark, and then a pinned theme fighting each of them — `data-theme="dark"` on a light OS is the one that catches a token declared in only one of the two dark blocks. Every colour is a token; a hex outside `styles/` is the bug.
5. **Mobile.** At 375px: the MENU rail and panel, the row reflows at 599/639, the palette as a full-screen sheet.
6. **Reduced motion.** Turn it on and look again. Nothing resting on a transform may be left displaced; nothing may sit invisible waiting out a stagger delay.
7. **Live verification against the real page.** `npm run dev`, open it, and press the thing you changed. Reading the built HTML is not verification.

**Already in force. Do not regress these.**

- **Image outlines.** Every image sitting on the page background carries a 1px inset outline (`styles/global.css › .outlined`) so a white screenshot is not a hole in a white page. The scroller is the one exception and uses a real `outline` at `-1px` offset, because an inset shadow paints *under* a 12,000px child.
- **`text-wrap: balance` on headings, `pretty` on paragraphs.** Already global. Do not re-declare per component.
- **Stagger etiquette.** Entrance staggers cap: `SiteGrid.astro › STAGGER_CAP` is 8 at 80ms, so card forty is not waiting three seconds; nav items are 70ms after an 80ms lead-in. Nothing staggers on the way out.
- **Reserve the box.** An image whose size is not known at build time gets its box from `aspect-ratio` or a fixed scroller height, never from absent `width`/`height` attributes (`ShotFrame.astro`).
- **Optical over literal.** A 16-unit icon set at 14px sits at the weight of the 11px mono beside it instead of shouting over it (`ShotActions.astro › .act__icon`).
- **A control that cannot work is not shown.** The copy-image button renders hidden and reveals itself only once the page has established the browser can actually do it (`ShotActions.astro › canCopyImages`). A control that looks live and fails on press is worse than an absent one.
