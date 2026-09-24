# VET-307 accessibility pass

**TLDR.** 25 kinds of control were under 44px on a touch screen. Two text spots were under 4.5:1. The /tools table broke at 200% zoom, and the menu kept its blue in forced colours. All four are fixed, and the after run is clean on every check. Aayush needs to do nothing. One item still wants a real iPad: the dvh mat when the toolbar collapses, carried over from VET-306.

Run: `node qa/evidence/2026-09-24-vet-307/a11y.mjs <base> <before|after>` against `dist/` served statically (`python3 -m http.server 4391 --directory dist`). "Before" is the build at `4697d1a` (the design.md refresh). "After" is the same build with this commit's fixes. The per-check detail is in `before-a11y.json` and `after-a11y.json`. The shots are `<tag>-*.png`, and `sheet-<tag>-*.png` are contact sheets (`sheet.mjs`). PNGs are gitignored and can be re-created from the script.

| Check | How | Before | After |
|---|---|---|---|
| Touch targets, 44px | WebKit (Safari's engine), `hasTouch` + `isMobile` + iOS UA, 390x844 and 1024x1366. 12 routes plus the open menu and palette. `elementFromPoint` probes 21px out from each control's centre, four ways. | 274 misses across 25 kinds of control (518 checked) | 0 |
| 200% zoom | Chromium at 640x400 CSS px, DPR 2 (a 1280x800 window at 200%). Sideways scroll, boxes past the window, and a read of the shots. | 0 bleeds, but the /tools header ran "Desc" into "Category" (seen in the shot, not caught by the bleed check) | fixed |
| Forced colours | Chromium `forcedColors: active` on a light and a dark OS, 1280 and 390. Home, /tools, a site, a library entry, /design, the menu and the palette. | Menu panel kept its blue gradient and grain under backplated words | plain Canvas with a CanvasText edge |
| Contrast | Chromium's own background resolution (`CSS.getBackgroundColors`), 4,184 text nodes, both themes. 4.5:1, or 3:1 for large text. | 3: tertiary meta on a lit pane row (4.35), "(estimate)" in the time chip (4.35) | 0 |
| Labels | Chromium AX tree: every exposed button, link, field, checkbox and image has a name, including with the palette open. | 0 | 0 |
| Focus | Tab through the first 40 stops per route, 369 in all. Each focused control's pixels must differ from the same pixels blurred. | 0 invisible | 0 |

## What changed

- **44px under a finger** (`(pointer: coarse)` only; desktop is unchanged):
  - Glyph boxes go from 40 to 44: `ThemeToggle`, `SoundToggle`, the footer's X, and the post card's ↗.
  - Pseudo-element reach grows: `.seg__item`, `.strip__chip`, `.ctl` −7px, `.tag` −9px. An inset is measured inside a 1px border, so the old −6 and −8 drew 42.
  - `min-height` goes from 40 to 44: sort headers, shot actions, library search, menu Search, newsletter, the /design press boxes.
  - Text links grow by padding and give the room back by margin, so the layout doesn't move: footer words, Read more, entry host links, tool strip and Source links, hint row.
  - Collection chips get a 12px reach.
  - Wrapped rows open up so targets touch but don't overlap: tags `1rem`, collections `1.5rem`, colophon `1.5rem`, footer glyphs `2rem`.
- **Contrast.** `LibraryRows.astro`: the meta line on a lit row goes to `--text-secondary`. `EntryBlock.astro`: `.blk__est` goes to `--text-secondary`.
- **Zoom / tablet.** `ToolList.astro`: from 640 to 899px the Description column hides and the description sits under the name, as it does on a phone.
- **Forced colours.** `MobileNavPanel.astro`: a `forced-colors` block paints the panel Canvas with an edge.
- `design.md` §3, §4 and the /tools paragraph describe all of this.

## Checked and left alone

- **Inline links inside running text** (post text, prose, fact values) are exempt from the 44px rule. WCAG 2.5.8 exempts them too.
- **The palette's glass.** Its text sits under `backdrop-filter`, which DevTools resolves to the scrim, so these nodes are listed as unknown, not checked. VET-247 measured it at 6.01:1 light and 8.12:1 dark.
- **Menu links.** The non-current links are white at .62 on the flat blue: 3.19:1. At 28px+ they are large text, so the floor is 3:1 and they pass. It is tight over the grain's lightest specks. That's worth a look if the veil ever changes.
- **Kind glyphs** (`i.ki`). The word is pushed out of a clipped box. The glyph is `--text-tertiary`: 4.74:1, over the 3:1 a graphic needs.

## Limits

- WebKit here is Playwright's desktop WebKit 26.5 with touch and mobile emulation. It is Safari's engine, not iOS Safari on a device. VET-306 found one real-device-only bug: the iPad toolbar collapse and the `100dvh` mat. No emulator reproduces it, and it still needs Aayush's iPad.
- Chromium's forced-colors emulation is Windows High Contrast's model. The shots were read by eye; there is no automatic check.
