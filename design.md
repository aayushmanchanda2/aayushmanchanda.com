# design.md

The design contract for this site, written from the shipped code. Read it before touching UI. Every claim names the file and the selector or symbol that enforces it, so any of it can be checked with one grep. **If the code and this file disagree, fix whichever is wrong, in the same commit.**

Paths are relative to `src/`. `file › thing` means "grep for `thing` in that file".

**`/design` is the public half of this file**, and it is the half you can press. It renders the mark, the tokens, the type scale, the chips, the link styles and the press states using the shipped components and the live stylesheet, so it cannot describe a system the site does not have. When a rule below changes, open that page: if it still shows the old thing, the rule did not actually land.

---

## 1. Tokens

All of them live in `styles/global.css › :root`. If you typed a hex outside `styles/`, you broke something. `/design` prints this table at runtime, painting each swatch `var(--token)` and reading the value back with `getComputedStyle`, so it follows the theme toggle instead of describing one theme and lying about the other. A token added below appears there the moment it is declared.

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

**Chip tones** (`styles/chip.css`). A tone sets three numbers and the tint, the hairline and the ink all derive from them, so light and dark stay in step without a second palette. Soft tint, never a solid fill: twenty rows should read as one page, not a traffic light.

**Every ink clears 6:1 over its own tint** — over the colour the tint composites to, not over the bare page background. That distinction is the measurement. The tint lightens the ground in the light theme and darkens it in the dark one, so ink-over-tint is always the lower of the two numbers and it is the one a reader is actually subject to; measuring against the page flatters every tone by roughly 0.8 of a point. Four values were set from the page-background reading and did not in fact hold over their own tint — light green 5.59, light amber 5.44, light gray 5.48, dark blue 5.73 — and are corrected below. The tint alphas did not move, so the fills are unchanged; only the ink deepened, by two or three points of lightness.

| Tone | Light `h s l` | ink/tint | Dark `h s l` | ink/tint |
|---|---|---|---|---|
| green | `148 65% 24%` | 6.19 | `148 55% 64%` | 8.85 |
| amber | `32 90% 27%` | 6.29 | `38 90% 64%` | 8.95 |
| gray | `0 0% 35%` | 6.15 | `0 0% 62%` | 6.21 |
| red | `0 70% 38%` | 6.46 | `0 80% 70%` | 6.05 |
| blue | `231 80% 45%` | 7.52 | `231 100% 75%` | 6.04 |

The `.chip--link` hover deepens the tint to 20% / 26%, which costs about a point: that state holds **AA (4.5:1)**, not 6:1. The floor there is dark blue at 4.63. The `.chip` block's own fallback lightness is kept identical to the gray tone so an untoned chip and a gray one cannot drift apart.

Tint `0.09` light / `0.14` dark; hairline `0.2` / `0.26`. A `.chip--link` deepens both on hover instead of changing colour. Blue is the accent hue held back from the accent lightness on purpose: an inline link and a shipped chip must not be the same blue on the same page. Held back by two dials in the light theme (saturation 80 against the accent's 100, lightness 45 against 58.4) and by lightness alone in the dark one, where nothing darker than the link blue survives the tint. Measured separation, CIE76: 14.7 light, 22.2 dark — the dark pair is the wider of the two, so the tighter-looking lightness gap there is not the problem it reads as on paper. Which word earns which tone is the only thing the components decide — `VerdictBadge.astro › TONES`, `StatusChip.astro › TONES` — and both are `Record<T, string>`, so a new verdict or status will not compile until it has a tone.

**Hairlines.** `--hairline` rules every border on the site. `--hairline-strong` is the hover state of a row border and the inset edge of a swatch. There is no third weight.

**Dotted grid.** `styles/global.css › .dotted-grid`: `radial-gradient(var(--dot) 1px, transparent 1px)` at 16px, `--fine` at 10px. It is the backdrop for framed imagery only (`ShotFrame.astro`, `ImageFrame.astro`), never a page texture.

**Motion + layout.** `--ease` `cubic-bezier(.22,1,.36,1)`, `--ease-out` `cubic-bezier(.16,1,.3,1)`; `--dur-fast` 120ms, `--dur` 220ms, `--dur-slow` 420ms. `--page-max` 44rem, `--page-pad` `clamp(1.5rem, 5vw, 3rem)`, `--gap-masthead` `clamp(3.5rem, 12vh, 6rem)`. Radii: `--r-sm` 4px, and that is the whole scale (see §3).

**`--gap-masthead` is the space under a masthead**, before whatever the page is about — every section index, every filter page, `/design`, the 404 and the three `.doc` pages, fourteen surfaces in all. It was the same `clamp()` written out fourteen times in fourteen scoped style blocks, which is a number nobody can retune: changing it meant finding all fourteen, and the one that got missed would be the page nobody had open. Note that these layout tokens are not on `/design` — that page's table reads colour tokens through `getComputedStyle`, and a length has no swatch to paint.

---

## 2. Type

Geist Sans for prose, Geist Mono for labels, display and metadata. Both are variable fonts bundled from npm and served from our own origin; the site loads nothing from a third-party CDN (`layouts/Base.astro › @fontsource-variable`).

**The mono-label convention.** `styles/global.css › .mono` is 11px, weight 500, `letter-spacing: 0.08em`, **uppercase**. That is the site's label voice: section heads, field labels, dates, footer items, key caps. Section heads open it up to `0.1em` (`index.astro › .index__title`, `ToolList.astro › .group__head`, `VoiceBlocks.astro › .voice__label`).

Four places deliberately undo the uppercase, and each says why in place: a file path is not a label (`styles/palette.css › .palette__row-where`), a hex is a value you are about to paste so it must read exactly as it will arrive (`PaletteRow.astro › .swatch__hex`), a key cap is printed `esc` on the keyboard the reader is looking at, so shouting it would name a different key (`sites/[slug].astro › .hints__row`), and a token name, a property or a class on `/design` is code for the same reason a hex is (`design.astro › .code`). The rule under all four: **the label voice shouts a category, and a value that will be retyped somewhere has to survive being read.**

**Tabular numbers are not optional.** Any digit that changes in place, or sits in a column, gets `.tabular-nums`: the footer clocks, every `as of` / `saved` / `since` date, group counts, the index row numbers, the copyright year.

**Scale.**

| | Size | Where |
|---|---|---|
| `.page-title` | `clamp(2.75rem, 10vw, 5.25rem)`, `-0.045em`, lh `0.98` | every section masthead, home included |
| `.page-title--entry` | `clamp(2rem, 6vw, 3.25rem)`, `-0.035em`, `overflow-wrap: anywhere` | entry pages: a tool, not a section — **and every filter page**, whose title is a hostname or a collection name that arrived from data rather than from someone choosing a heading that fits |
| `.page-title--mono` | `clamp(2.25rem, 8vw, 4.25rem)`, lowercase, `-0.02em` | `/notes` and the 404 |
| `.standfirst` | `clamp(1.0625rem, 1.6vw, 1.1875rem)` / 1.65, `--muted` | one line under every title |
| prose | `1.0625rem` / 1.7 | note bodies, `/privacy` |
| row note | `0.9375rem` / 1.55 | list rows |
| `.mono` | `0.6875rem` | every label |

Headings are 600 / lh 1.05 / `-0.03em` with `text-wrap: balance`; paragraphs get `text-wrap: pretty`. Both are already global — do not re-declare them.

**Measures.** Standfirst **46ch** (`styles/global.css › .standfirst`). Note prose **65ch** (`notes/[slug].astro › .prose`). Labelled prose blocks **62ch** (`VoiceBlocks.astro › .voice`, `styles/global.css › .doc`). The shell itself **44rem** (`--page-max`).

Optical corrections in force: the masthead pulls `-0.04em` left so the first stem is flush with the column edge, and `--mono` sets that back to 0 because mono has no side bearing to correct for. Metadata columns take a `0.2rem` padding-top to line up with the name rather than the row box (`ToolList.astro › .row__meta`, `LibraryList.astro › .row__meta`).

---

## 3. Structure

**The shell** (`layouts/Base.astro › .shell`) is a flex column at `min-height: 100svh` — main, then footer, both capped at `--page-max`. Left padding is what clears whichever nav is showing: `calc(var(--page-pad) + 2.5rem)` for the fixed vertical MENU label, and `clamp(17rem, 24vw, 21rem)` above 900px for the dash rail.

**The site mark** is his initials, **AM**, drawn on the same 16-unit grid as the icon system, `currentColor`. One stroke weight throughout (1.5), and every diagonal in it runs at one angle, 27.8° off vertical. It is **two files**: `components/MarkGlyph.astro` is the drawing and nothing else, and `components/SiteMark.astro` is where it sits — fixed at the top left of every page, `aria-label="Home"`, 40px hit area via a `::before`. They split when `/design` needed to render the same lockup as an inline specimen; a second surface that pasted the paths in would have been a fourth copy of a glyph the test below exists to hold at three. **A page that wants the mark imports `MarkGlyph`**, and `lib/mark.test.mjs` fails on any other file in `src/` drawing a `<path>` of its own.

**The A is the drawing that shipped before it, unchanged to the decimal.** The M is built to that A's *ink* metrics rather than its centreline ones, which is the only way two stroked letters can be made to share a cap line: stems flat at 1.7, so the A's mitred apex tip (1.492) stands above them by 1.7% of cap height, the overshoot a point takes over a flat cap in any real face; stems flat on 14.1, which is where the A's foot centreline lands; and a valley that is the A's apex reflected, same 55.6° included angle and same 2.144 miter ratio, with its tip on 14.4498, the A's own lowest ink.

**Nothing in the mark touches anything.** The crossbar is 0.5 units off the legs and the M is 0.5 units off the A, both measured at the tightest point, which for the letterfit is the outer corner of the A's right foot. That is the rail's own grammar carried into the glyph: the left edge of every page is a stack of free-floating dashes, and this is a monogram held together by proximity rather than by contact. It is also what makes the mark separable, which is what the favicon needs.

`stroke-miterlimit="2.4"` on the M is the one attribute doing work. The A's apex and the M's valley are 2.144 ratios and stay points; the M's two top corners are 4.163 — a 3.1-unit spike out of the top of the box — and are cut flat, which is what a geometric sans does at that junction.

**The favicon is the A alone, and that is a measurement rather than a preference.** Rasterised into 16x16 the lockup has no fully inked pixel in it at all: its strokes land at 0.81 device pixels, peak ink 87%, against the A alone's eighteen pixels at 100%. Four other AM constructions were drawn and every one failed the same way; the only one that kept solid ink at 16px bought it by being square and stopped reading as two letters. So `public/favicon.svg` and `public/favicon.ico` carry the A, the page and the card carry the lockup, and the A lifts out of the lockup whole rather than as a fragment, because nothing in there touches it.

**20px below 900px, 24px above.** The lockup is 2.06 ink widths where the A was one, and below 900px the mark has to stay inside the `--page-pad + 2.5rem` strip the shell already clears for the vertical MENU label: 40px of it, 33.4px of which is ink. It sits at `left: var(--page-pad)` there, so the page scrolls past to the right of it rather than underneath it; above 900px it moves to `clamp(1.5rem, 3vw, 2.75rem)`, the rail's own left edge, so mark and dashes share a column. The `::before` derives its vertical padding from `--mark-size`, so the 40px hit floor holds at both sizes without a second number to keep in step.

**The left bearing is 0.096 of the mark's height, and adding the M did not move it.** The leftmost ink is still the outer corner of the A's left foot, 1.5366 of 16 units, so `margin-left: calc(var(--mark-size) * -0.096)` still lines the *ink* up with the rail instead of the box; measured delta 0.008px. `scripts/og.mjs` takes the same pull plus the `h1`'s own `-0.04em` where the two share a column, and the card's mark needs `align-self: flex-start` now that it is no longer a square box — a column flex default of `stretch` on an `auto`-width SVG centres the glyph across the whole card.

The A's two paths live in three files (`MarkGlyph.astro`, `public/favicon.svg`, `scripts/og.mjs`) and the M's path in two. `lib/mark.test.mjs` compares every copy and fails on a moved point, on a second stroke weight anywhere in the mark, or on an M appearing in the favicon, naming the reason in the message. `npm run og` regenerates the card and the raster icon from the copy in that script.

> **Never spell a CSS custom property inside `public/favicon.svg`'s comment.** XML forbids a double hyphen anywhere in a comment, so a token written with its two leading hyphens makes the file fail to parse and the browser draws a broken image instead of the mark. **This shipped, and nothing caught it**: a tab strip with no icon in it looks like a tab strip, and every other surface draws the mark from the component. It surfaced the first time `/design` rendered the real file on a page at 64px. `lib/mark.test.mjs` now fails on a `--` inside any comment in that file. The general shape of the lesson is the reason `/design` exists at all: **an asset nothing renders on a page is an asset nobody is checking.**

**The colophon is the footer, not the nav.** `/about`, `/contact`, `/design` and `/privacy` are the four pages about the site rather than in it, and all four live in `layouts/Base.astro › .foot__meta` at the copyright's weight, in that order: the two about the person first, because that is what most readers are looking for down there, then the two about the machinery, with `/privacy` last because nobody comes looking for it until they need it. The nav — both surfaces — stays the five content sections, which is what `lib/sections.ts` enumerates and what the empty-section rule governs; none of the four appears there, in `getSections`, or in a markdown variant. `.foot__meta` wraps: six items plus the copyright is wider than a 375px column, and an unwrapped flex row pushes the year off the side rather than dropping it to a second line.

Three of the four share one prose shell, `styles/global.css › .doc`, because pages that read as siblings must not each keep their own copy of the measure. **`/design` is the one that does not, and the reason is §5.** `.doc a` gives every link inside the shell the prose treatment, which is right for three pages that are paragraphs from top to bottom and wrong for a page whose sections are chips, swatches, specimen words and buttons. Sharing the class would have meant bolding and underlining a chip and then writing a rule to un-bold it, which is exactly the override §5 forbids. So `design.astro › .sheet` is scoped at `.doc`'s proportions, and its paragraphs opt into the prose-link rule **by being paragraphs** — `.sheet p a` is in the selector list in `global.css` rather than restated on the page, so /design cannot end up drawing a prose link the rest of the site has stopped drawing.

**`/design` has no markdown variant, and that is a judgement rather than an omission.** The `PAGES` machinery would make one cheap to add, but the document it produced would be a lie: the page's content is CSS and live components, and markdown can render neither a chip nor a swatch, so the variant would have to be prose transcribed by hand — the one thing `lib/markdown.ts` exists to prevent. The markdown version of this page already exists and is the file you are reading; `/design` links to it in the repository, and `/llms.txt` names both and says which is the source.

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

**Safe-area insets are written but not yet live, and the distinction is the whole point.** The three surfaces welded to a viewport edge carry `env(safe-area-inset-*)` guards: the palette's full-screen sheet takes `padding-top` (`styles/palette.css`, below 900px), the MENU panel takes all four paddings through `max()` against its own `--mnav-pad` (`MobileNav.astro › .mnav__panel`), and the MENU trigger takes `left` (`› .mnav__trigger`). **All three resolve to `0px` today.** `env()` only returns a real number when the viewport meta says `viewport-fit=cover`, and `layouts/Base.astro` ships plain `width=device-width, initial-scale=1` — so iOS letterboxes the page inside the safe area, nothing is under a notch, and there is no bug on screen. `max()` was chosen over addition for exactly this reason: at zero it degrades to the number the design already asked for, so the guards are a no-op on the current build by construction rather than by luck.

They are written now because the change that makes them matter is **one attribute**, and the surfaces it would break first are a search field under a notch and a blue sheet stopping short of the home indicator. **`viewport-fit=cover` is not a one-line change, and must not be added as one.** It puts every edge-anchored surface into the unsafe zone at once, and the three above are not the whole list: `SiteMark.astro` sits at `left: var(--page-pad)` (24px floor, against a 44–59px landscape inset), the shell's own `--page-pad`, and `Base.astro › .skip`. Adding the meta means auditing those too, on real hardware in both orientations — §8 gate 7, and a simulator is not it.

**Command palette panel** (`styles/palette.css`). The proportions are beui.dev's command-palette block, measured off its shadcn registry entry (`beui.dev/r/command-palette.json`) and its live DOM rather than copied by eye, then translated into house tokens. Adopted: the **36rem** panel (their `max-w-xl`, 576px) at **18vh**, `shadow-2xl` as `0 25px 50px -12px rgb(0 0 0 / 0.25)`, a **3rem** field whose height sits on the input and not on the wrapper, a 16px leading search glyph, the `esc` cap as a filled key rather than an outlined word, **0.5rem** of padding on the results list, rows at **0.5rem** padding with a `0.75rem` gap and `--r-sm`, section headings at `0.375rem 0.5rem`, `0.25rem` between groups, and a centred empty state in a `2rem` box.

The 0.5rem on the list is the change that does the work: it is what turns the highlighted row from a band running edge to edge into an inset block with panel showing either side of it. Rows align to **centre**, not baseline, because baseline-aligned content sits low in a block with a radius and reads bottom-heavy.

Three of their choices are rejected, each for a rule already in this file. `rounded-2xl` on the panel stays **0** (the sharp-corners rule above). Their `bg-background/5` + `backdrop-filter: blur(12px) saturate(140%)` glass scrim stays a **flat 40% black**, because a frosted texture is a register this site does not use anywhere else. And their active row — a 5% wash, with every *inactive* row dimmed to the muted foreground so one row can stand out — stays the solid `--accent-panel` pair: focus never leaves the input (§4), so that block is the only cursor a reader has, and the half of their trick that does the real work costs twenty unselected results their contrast. The loudness came out of the geometry instead.

**Kind tabs** (`components/KindTabs.astro`). The site's third nav idiom, after the rail dashes and the mono crumb, and the only one with a selected state. It renders identically on `/library` and on all three `/library/kind/<kind>` pages — same component, same slot, `1.25rem` above the list on every one of them — because a filter row that changes between the page you filtered from and the page you landed on is two controls that happen to resemble each other. `All` is the fourth tab rather than a separate way back.

**A chip says what a thing is; a tab says where you are.** The row used to be `KindChip` in its `href` form, on the reasoning that a filter for `video` and the `video` on a row are the same word. Adding a selected state broke that: a chip's tone is already spent naming the kind, and the accent a selection needs is the blue an `article` chip is wearing on the row below it — the exact collision §1 holds the chip palette back from the link palette to avoid. So the chip lost its `href` and `count` props and went back to being a label, `styles/chip.css › .chip--link` is now only `CollectionChips`, and the selected tab takes `--accent` as **ink** plus a 1px bar at `bottom: -1px` that lands on the row's own hairline rather than stacking a second line over it. `aria-current="page"` carries it, which is one of the four uses §1 reserves the accent for.

Three things there are deliberate. They are **links with `aria-current`, never `role="tab"`** — they navigate to real pages, and a tablist role promises arrow-key movement inside the row that a static site does not implement. The row **wraps rather than scrolls** (`.tabs__row`, `flex-wrap`), the same call `.foot__meta` makes for the same reason: a flex row that cannot wrap pushes its last item off the side of a 375px column instead of dropping it to a second line, and a wrapped tab keeps its bar directly under itself. And an unselected tab is **`--muted`, not the `--faint`** the row metadata beside it uses, because a date is metadata and a tab is a control, and a control has to clear AA on its own rather than lean on the selected one being brighter.

**Prefetch is opt-in** (`astro.config.mjs › prefetch`). `prefetchAll` stays off: a section index is forty links, and on `/tools` most of them leave the site. Only markup that says `data-astro-prefetch` prefetches, which today is the four tab links and nothing else, at the default `hover` strategy — `viewport` or `load` would pull all four down for a reader crossing the row on the way to the third.

**The empty-section rule.** `lib/sections.ts › getSections` filters to `count > 0`, and both nav surfaces plus the home index read it. A section with no entries is not linked, not listed, and has no page. There are no "coming soon" pages. Delete every note and `/notes` stops existing.

**Library was Reading, and the pipeline still is.** A third of the section is videos, so the reader-facing name moved and every public surface moved with it: routes, the sections manifest, `/library.md`, `/llms.txt`, the palette index, the JSON-LD `ItemList`, `/about`. `vercel.json` 308s `/reading`, `/reading.md` and `/reading/*` to their `/library` equivalents, and those three routes sit **above** the markdown-negotiation block on purpose, so an agent asking for `text/markdown` at the old URL is told the URL moved instead of being served the old document forever. Note that Vercel refuses `routes` and `redirects` in the same file, so a redirect here is a `routes` entry with `status: 308` and a `Location` header, not a `redirects` block. Inside `pipeline/`, the section key stays `reading`: it is the name of the Raindrop collection Aayush saves into (`Publish/Reading`), it is written into every published row of `pipeline/state.json`, and it is his to rename rather than this repo's. The translation happens on one line, `pipeline/state.mjs › galleryFor`.

**Sharp corners.** The site rounds exactly one **value**, `--r-sm`, and the things that carry it are all small, filled and interactive: the chip, the focus ring that has to sit around it, the palette's highlighted row and its `esc` key cap. Everything structural — frames, swatches, panels, the palette panel itself — states `border-radius: 0` rather than inheriting it. That is the line: a 4px corner marks a token you could pick up, never a surface you look through. Concentrically it leaves three radii on the whole site: **4px** (`--r-sm`), **3px** (16px favicon marks, `ToolList.astro › .row__mark`), and **0**. A fourth needs a reason you can write down — which is why the palette's row takes `--r-sm` and not the 6px its reference used.

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

**Scroll chaining, the VET-32 lesson.** `overscroll-behavior: contain` is for **modals only**: the palette results and the mobile nav panel. Anything in the normal flow of a page states `overscroll-behavior-y: auto` and lets the page take over at either edge (`ShotFrame.astro › .scroller`). `contain` on a details page whose main content *is* the scroller is a trap — the reader hits the bottom of the picture, keeps scrolling to read the notes below it, and nothing happens until they physically move the pointer off the frame. Nothing looks broken; the page just stops answering the gesture it is built around, which is why this is a rule nobody re-derives by reading the CSS. `lib/overscroll.test.mjs` sweeps every shipped file under `src/` and fails on a `contain` outside those two, so a third one has to be a deliberate edit to that allowlist **and** to this paragraph.

**The theme toggle** (`components/ThemeToggle.astro`, state in `lib/theme.ts`). One button, three states, cycling system → light → dark → system. It renders twice — quiet in the footer beside the clocks, and on the mobile nav panel where the footer is a long scroll away — and the hoisted script drives every instance from one listener. 14px glyph in a 40px `::before` hit area, the same trick the rail dashes use, so a control with a toolbar's hit area does not put a toolbar's height into the footer row.

Three things are worth not re-deriving. **The glyph is swapped by CSS off `[data-theme]`, never by script**, because the attribute is written before the first paint and a JS swap would show a sun for a frame to everyone who pinned dark. **The accessible name is the half CSS cannot do**, so `aria-label` and `title` ship saying `system` — which is the truth with scripting off — and the module corrects them on load; the label names the current state *and* the next one, because `aria-pressed` cannot describe three states honestly. **One `aria-live` region for the whole page** (`layouts/Base.astro › [data-theme-live]`), outside the buttons, because text inside a control is that control's accessible name, and two regions would announce one change twice.

Nothing is written to storage until a press. `/privacy` names the one key that then exists, and anything else reaching for `localStorage` has to go and edit that page.

**Analytics is one deferred tag, and it is same-origin.** `layouts/Base.astro` ships `<script is:inline defer src="/_vercel/insights/script.js">` behind `import.meta.env.PROD`, not `@vercel/analytics/astro`. The component's job is to register a custom element that re-fires a pageview across *client-side* route changes, and a static site with no client router has none, so the bare tag counts the same loads without the dependency or the bundled module. Both URLs it touches are paths on this domain — the script, and the `/_vercel/insights/event` beacon — added to the deployment by Vercel's edge once Web Analytics is on for the project. **That is the whole reason `/privacy`'s "one outside request" is still true**, which makes it the claim to re-check before changing how analytics loads: a script that starts arriving from a Vercel host is a second host, and `/privacy` names it in the same commit. The package only reaches `va.vercel-scripts.com` in debug mode, which is development-only and not what this tag loads. The `PROD` gate is because the route exists only on a deployment: under `astro dev` it 404s on every page load, which teaches you to ignore the console in the one workflow §8 tells you to verify in.

**Hit areas: 40px floor.** Rail dashes get 110×41 via a `::before`, swatches are 44×44 (`PaletteRow.astro › .swatch__chip`), the mobile close is 44×44, shot actions set `min-height: 40px`. One stated exception: the `/sites` hint row uses `padding-block: 0.5rem` instead, because those are text hints and a 40px block would give the foot of the page a toolbar's weight.

**Focus.** `styles/global.css › :focus-visible` is 2px `--accent`, offset 3px, radius `--r-sm`. It flips to `--accent-panel-ink` on the blue panel, widens to a 12px offset on the 1px rail dash, and on the screenshot scroller the frame *is* the ring (`ShotFrame.astro › .scroller:focus-visible`). The palette input sets `outline: none` on purpose: it is the only focusable control in an open palette, so a permanent ring would be furniture rather than a signal, and the highlighted row is the cursor.

---

## 5. Links

**Prose links are bold and underlined.** Weight 600 plus `text-decoration-line: underline`, scoped to where prose actually lives: `.prose a, .doc a, .sheet p a, .standfirst a, .voice__body a, .source a:not(.source__repo), .fact dd a:not(.chip)` (`styles/global.css`). `.sheet p a` is the one entry keyed to the paragraph rather than the container, because /design's shell holds specimens as well as prose and those have to be exempt structurally — see §3. The reason is that body text is set at `--muted`, so a blue word at weight 400 is a colour difference and nothing else — the one signal that goes missing on a bad screen, in bright sun, or for a reader who cannot separate those two hues at all. Weight and a line are two more, and neither depends on seeing colour.

**Exempt surfaces are exempt structurally, not by an override.** Nav dashes, chips, footer items, index rows, tool and library rows, tab links, crumbs, hint rows and metadata strips are simply **not in that selector list**, and each sets its own `text-decoration: none`. Bolding and underlining them would turn navigation into a paragraph of shouting. Do not extend that selector unless the link sits inside a sentence, and do not "fix" a nav link for missing an underline.

Furniture that still needs to read as a link uses the quiet pattern: `color: inherit` with an underline in `--hairline-strong`, going `--accent` + `currentColor` on hover (`ToolList.astro › .row__link`, `LibraryList.astro › .row__domain`, `tools/[slug].astro › .strip a`, which the repo link at the foot joins rather than restating). It carries its own underline because on touch there is no hover to reveal one.

**Two exemptions in that selector list are `:not()`, and both are the same bug.** A quiet-pattern anchor sets a colour and an underline; it does not think to set `font-weight`, because nothing on it looks like it is asking for one. So a container in the prose list catches it and it ships at 600 having visibly opted out — which is what `.source__repo` was doing, bolding the one word §5 calls "a word, not a second URL". `:not(.chip)` and `:not(.source__repo)` are the structural exemption; a `font-weight: 400` on the page would be the override this section forbids. **Adding a furniture anchor inside `.source`, `.fact dd`, or any other prose container means adding it to the `:not()`, not restyling it locally.**

**A tool has two links and they are different kinds of thing.** `url` is the product's own site and `repo` is its GitHub repository (`lib/tools.ts › Tool`), and a repository written into `url` **fails the build** — `readUrl` refuses it by name, because that one conflation is what put a column of identical GitHub logos on /tools and hid the real site of every tool that had one. Either may be null; half the list is software whose only home is a repository. What counts as a repository is one function, `lib/links.ts › githubRepo`: exactly two path segments on github.com, canonically spelled, so a profile, a branch, a file, a gist and a release are all refused. The publish pipeline keeps its own copy because it runs outside the bundler (`pipeline/entries.mjs › repoFrom`), and `links.test.mjs` holds the two to the contract that matters — whatever the pipeline writes, the parser accepts unchanged.

**A row links one of them; a details page shows both.** The row links the product when there is one and the repository when there is not, because a page about the thing beats the source of it (`ToolList.astro`). The Source line at the foot of a details page sends the reader to that same destination and then adds the repository as a quiet mono `repo` — a word, not a second URL, because two full link labels side by side read as a decision the reader has to make (`tools/[slug].astro › .source__also`). Its `·` is a `::before` on the wrapper span, never on the anchor, per §6.

**The 16px mark is `lib/links.ts › markFor`, and it will not fetch a GitHub avatar.** A product site gets its logo from logo.dev; a repository-only row gets **its own initial** in the same square (`ToolList.astro › .row__mark--initial`, 9px, `letter-spacing: 0` because label tracking on a single centred glyph is padding on one side only). The avatar was the obvious alternative and is refused on purpose: `github.com/{owner}.png` redirects to `avatars.githubusercontent.com`, so it is two new third-party hosts rather than one; most owners here are individuals, whose avatar is a stranger's face at 16px or a generated identicon, which is not identity; and /privacy's **"The one outside request"** is a claim that whole page is built around. `links.test.mjs` asserts the branch is absent, so adding it fails a test that names the page to edit. The rule is the same one `faviconUrl` carries: **a new image host means editing /privacy in the same commit.**

**External links get `↗` from CSS, never from markup.** `styles/global.css › .ext::after` uses `content: "\2197" / ""` — the alt-text form, which gives the glyph an empty accessible name so a screen reader announces the link and not "north east arrow" after it. `inline-block` keeps the parent's underline from running under the arrow. Hand-typing the character is how a convention ends up on nine links and missing from the tenth.

**The full treatment — `rel="noopener nofollow"`, `target="_blank"` and `.ext` — is the rule for an off-site anchor in a row, a card or a metadata strip**, which is where nearly all of them are. `EntryLink.astro` owns that branch once so the pages rendering link rows cannot forget it. Those surfaces are a directory: the reader is scanning a list of destinations, the arrow is what marks which ones leave, and a new tab is right because they are coming back to the list.

Three kinds of anchor sit outside it, and all three are prose.

- **Identity links**, at `rel="me noopener"` — `rel=me` is a claim of identity, so only real resolvable profiles go there. That is the two footer rows on every page, and the same two profiles written out as prose on `/contact`, which carry `.ext` on top because those two sit inside a sentence *and are still destinations*: sending the reader to them is what that page is for.
- **His own properties that are not identity claims** (the takedown-issue link on `/privacy`) keep `rel="noopener"` without `nofollow` — nofollowing your own profile is self-sabotage, and the anchor is an instruction, not an endorsement.
- **Citations in `/privacy`'s prose take `rel` and nothing else.** No `target="_blank"`, no `.ext`. The four of them — Vercel's analytics policy, logo.dev, Buttondown, and the GitHub issue above — are provenance rather than destination: they are the receipt for a claim the sentence just made, and most readers will never follow one. Four arrows through a page of paragraphs read as decoration, and forcing a new tab on someone reading a document top to bottom is the browser deciding for them what `back` should mean. **The distinction that governs all three: an arrow and a new tab are for a link the reader is being offered, not for one that is evidence.** Leave these as they are; adding `.ext` to a citation is the kind of tidying that makes a page worse.

**`mailto:` is not an off-site anchor.** No `.ext`, no `target`, no `rel`: the arrow means "this leaves the site for another page", and a mail client is not one. The single `mailto` on the site is `contact.astro › .mailto`, which is the index-row idiom instead — full bleed, hairline top and bottom, arrow on hover. **Its `href` is entity-encoded, every character of the address, and it has to stay static attribute text**: built from a template expression, Astro escapes the ampersands and the page ships literal `&amp;#97;`. `scripts/validate-schema.mjs` greps every built page for the plain address, `lib/schema.ts › contactJsonLd` emits no `email`, and the visible text says "Email me" and never the address itself.

---

## 6. Copy

Applies to everything a reader sees: data notes, standfirsts, blurbs, labels, alt text.

**Everything has to earn its place. Writing exists for the reader, not to show its work.** A sentence whose job is to prove the thinking happened is a sentence the reader is paying for and not receiving. Cut it. The three shapes this takes here: narrating the page's own construction ("I keep the rules in one file and the site in another, and this page is the second one showing its work"), qualifying a true statement until it reads as a disclaimer ("I co-founded Orbis. I am not the one running it"), and foreclosing a future to sound principled today ("the answer is no before you ask it, and it is still no the second time"). Accuracy without defensiveness: **"co-founded Orbis" carries the whole truth**, and copy is there to build a reader's confidence rather than to manage liability. `PURPOSE.md` at the repo root is the check, and it is short on purpose.

**Audit voice stays in audits.** "State the call", "the reasoning is", "four of these were set that way and quietly did not hold" — that register belongs in `qa/`, in an audit file, in this document. Never on a page. A page reports what is true; the file that got it there reports how it was decided.

**The voice guide is required reading before any copy change**, including a one-word one. It is `feature-research/aayushmanchanda-com/voice-guide-for-site.md` in the AayushOS repo, extracted from the gbrain page `voice-guide` (built from Aayush's own transcribed speech, texts and approved emails). It carries the register rule the web needs — the guide's baseline is his *spoken* voice, and site copy uses the written registers filtered through the improved layer, so no "bud", no "right?", no scene-grounding openers — and the invariant core that must survive: warm-direct, forward-looking close, self-aware wink, plain emotion. Motivational tone without the wink is instantly fake. One aphorism per page maximum, and it has to feel found.

- **First person, present tense.** "Things I actually installed and ran, with an honest verdict" (`lib/sections.ts › CATALOGUE`). "Killed experiments stay on the page, because deleting them would make me look better than I am" (`experiments.astro`).
- **Plain words.** No *leverage*, *seamless*, *powerful*, *journey*, *delve*. The bar is the tools data: "Lost the same head-to-head to Cabinet on my use case."
- **Real opinions only.** A verdict is a judgement someone can disagree with. `watching` plus "Saved from Raindrop. Not tested yet." is the honest placeholder the pipeline writes; anything stronger has to be earned by actually running the thing.
- **Honest dates.** Every opinion carries the ISO date it was last true — `status_date`, `saved_date`, `started` — rendered beside it in tabular numerals, because an opinion with an old date on it is a warning.
- **Verdicts as prose, not a template.** Five fields, each a sentence in his voice: `note`, `why`, `like`, `dislike`, `try`. Absent means absent — a null field renders no block, and a caller with nothing at all renders nothing (`VoiceBlocks.astro › blocks`). An empty labelled box is worse than silence: it reads as a page that failed rather than a tool he has not written up yet.
- **No em dashes in new copy.** Use a period, a colon or a comma. *Known deviation:* seven strings written before this rule still carry one — five notes in `data/tools.json`, plus the `sites.astro` standfirst and the `sites/[slug].astro` shot caption. Fix on touch; do not add more. The `sites/collection/[slug].astro` lead was the eighth and was fixed the next time it was touched, which is what the rule means.
- **A line break next to a tag is not a space. It is nothing.** Astro drops the whitespace at a text/tag boundary when it contains a newline, so an anchor that starts its own line comes out welded to the previous word: `about it.\n<a href="/privacy">/privacy</a>` ships as `about it./privacy`. A newline *between two plain words* still collapses to a space, and a break *inside* a tag is harmless — it is only the boundary that bites, which is why the source always looks right. **Keep the space on the same line as the tag**, and break inside the opening tag when the line gets long. Two of these were live on `/privacy` for months. `scripts/validate-schema.mjs › GLUED` now fails **CI** on either half of the pattern — the validator reads `dist/` and runs as its own step, so it is not the build that catches this (§8).
- **Separators are drawn by CSS, never typed into content.** The `·` between metadata items is a `::before` on the list item, outside the anchor, so it is never part of a link's text or its target (`tools/[slug].astro › .strip__item + .strip__item::before`).
- **Alt text says what the picture is of**; decorative marks take `alt=""`.

---

## 7. Structured data

Every page carries one `application/ld+json` block, and every node in it is built by `lib/schema.ts`. Nothing else on the site writes JSON-LD. `layouts/Base.astro › jsonLd` types the prop as `JsonLd`, so the only thing a page can hand the layout is something a builder returned — there is no route by which a page hand-writes a node.

**The parity rule is the whole contract: every property maps to something a reader can see on that page.** It is §6 applied to the machine-readable copy, and it is enforced in three places — the builders, `lib/schema.test.mjs`, and `scripts/validate-schema.mjs`, which reads the built HTML rather than the source that produced it. Only the first of the three fails a plain `npm run build`; the other two are gates that have to be *run*, which is why they now run on every push (§8).

**No ratings. Not one, not anywhere.** No `reviewRating`, no `aggregateRating`, no `ratingValue`. A verdict here is a sentence someone can disagree with, and there is no number on the page to carry into one. The cost is stated rather than discovered: Google's Review rich result *requires* `reviewRating`, so these reviews will never draw stars. That is the trade — a citable, honest claim instead of a decorated, invented one. Also absent for the same reason: `keywords` (nothing here is a keyword list) and `SearchAction` (the palette is a client-side filter, not a query endpoint, and advertising a search URL that 404s is a lie a crawler finds out about).

**And no `email`, which is the parity rule pointing the same way from both ends.** `/contact` does not print the address as text, so nothing on it may claim the address as text; and the encoding in that `mailto:` href is worthless the moment a graph hands the plain string back somewhere easier to read than the markup. `email` is in `FORBIDDEN` in both the validator and `schema.test.mjs`, and the validator also greps every built page for the address itself — the key is banned, and so is the value under any other key.

| Page | `@graph` |
|---|---|
| `/` | `WebSite` + `Person`, the site naming the person as both `author` and `publisher` |
| `/about` | `AboutPage` + `Person`, the page naming the person as its `mainEntity` |
| `/contact` | `ContactPage` + `Person`, same shape, compact `Person`, and **no `email`** |
| `/design` | `WebPage`, one node, `name` and `url` and nothing else |
| `/tools` `/sites` `/library` `/experiments` `/notes` | `ItemList` |
| `/tools/<slug>` | `SoftwareApplication` + `Review` + `Person` + `BreadcrumbList` |
| `/sites/<slug>` | `WebPage` (`about` the external site) + `ImageObject` + `BreadcrumbList` |
| `/notes/<slug>` | `Article` + `Person` + `BreadcrumbList` |
| filter pages | `ItemList` + `BreadcrumbList` |
| `/privacy`, 404 | none, on purpose — the reasoning for each is written at the foot of `lib/schema.ts`, next to the builders it is explaining the absence of |

**`/design` is the parity rule at its shortest, and the reason the validator grew a second axis.** The page is a specimen sheet: its content is CSS and components rather than text, it has no byline, no date and no image, so its graph is one `WebPage` carrying a name and a URL. That collided with `scripts/validate-schema.mjs › REQUIRED`, which held every `WebPage` to the five properties a `/sites` entry has. So `REQUIRED` is now what is true of a type **everywhere** (`WebPage`: `name`, `url`) and `EXPECTED[].requires` is what is true of it **on one page type** (a site details page's `WebPage` still owes `about`, `primaryImageOfPage` and `dateCreated`). A shared type held to one page's shape is a rule that fails the second page to use it.

Five things are worth not re-deriving.

**Every document is an `@graph`, even a one-node one**, so the validator and anything reading the built HTML walk one shape. **A `{"@id": …}` reference must resolve inside its own graph** — a parser reading one page cannot follow a reference to a node that only exists on another — which is why the `Person` is repeated on every page that attributes something to him, and absent from every page that does not. **That `Person` is compact off the home and about pages**: `name`, `url`, `sameAs` and nothing else, because those are the three things the site mark and the two `rel="me"` footer rows make visible *everywhere*, while the biography is only visible on those two. `/about` gets the long form because it is the home page's hero at length; `/contact` does not, because it prints no biography. **The opinion never leaks onto the thing being reviewed** — a `SoftwareApplication` gets name, url, category; every judgement lives in the `Review`, attributed and dated. Its `url` is the destination the Source line actually offers, which is the repository when there is no product site, and `sameAs` carries the repository **only when it is a second page** — never the same URL twice under two properties, which would claim a source that is not there. **`lib/schema.ts › pageUrl` must agree with the canonical link**, because Astro builds directory-format routes and `/tools/paperclip` vs `/tools/paperclip/` is two URLs for one document; the validator compares the two on every built page. **The 404 has neither, and that is the rule rather than an exception to it** — it is served at whatever URL the reader mistyped, so the `/404/` it is built at is not its address. It ships `<meta name="robots" content="noindex">` and omits `rel=canonical` and `og:url` entirely (`layouts/Base.astro › noindex`, the only caller). Pointing them at `/` was the alternative and is worse: it claims the error page is a duplicate of the home page, which is a different false statement rather than a fix.

`serialize()` escapes `<`, `>`, `&` and both line separators. The block goes out through `set:html`, so a note containing `</script>` would otherwise end it early and put the rest of the graph into the document as markup.

---

## 8. Before you ship UI

**Gates, all of them, every time.**

**The first three run on every push and every pull request** (`.github/workflows/ci.yml`). They were a list a person was trusted to run, which is discipline, and discipline is what goes first on the day a change looks too small to bother — so they are a machine's job now. Run them locally anyway: CI is the backstop, not the loop. The last four cannot be automated and are still yours.

1. `npx astro check` → **0 errors, 0 warnings.** Hints have a known baseline of 13 (eleven `z is deprecated` from `content.config.ts`, one unused `Props`, one unreachable-code hint); do not add to it. Note that `checkJs` is on, so a new `.mjs` under `scripts/` or `pipeline/` is type-checked too and needs its JSDoc. **CI cannot hold the hint baseline for you** — `astro check` exits 0 on a hint, so a fourteenth passes the step and only the count in the log says otherwise.
2. `npm test` → all pass (283 at the time of writing).
3. `npm run build` → clean, then `npm run validate:schema` → clean. The second reads `dist/`, so it is only meaningful after the first, and it is a separate CI step for the same reason: a failure should name which of the two broke.
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

  The newsletter is the same rule one step earlier, at build time rather than on load. `lib/site.ts › NEWSLETTER_ACTION` is one string, `null` until there is a Buttondown account to post to, and `NewsletterSignup.astro`'s **entire template is a single expression guarded on it** — so an unconfigured newsletter is not a hidden box or a disabled field, it is no markup at all. **The copy on `/privacy` is gated on the same string**, both directions: the paragraph naming Buttondown only exists when the form does, and the sentence "no accounts, no forms, no comments, no newsletter box" only exists while it does not. That is §6's honesty rule applied to a page that would otherwise be truthful today and wrong on the day someone fills in a const. Activation is that one line and nothing else, which is why the home page places the component unconditionally (`index.astro`) and `lib/newsletter.ts` — not the markup — owns the field names Buttondown requires. `lib/newsletter.test.mjs` parses both `.astro` files and fails if anything renders outside a gate. The form is a plain POST with no client script, because Buttondown's docs say the subscriber sometimes has to see and follow the response; a `fetch` would swallow a CAPTCHA. The one thing that does ship while it is off is the component's scoped CSS, inlined on the home page and matching no element, because Astro collects styles from a page's imports rather than from what rendered.
