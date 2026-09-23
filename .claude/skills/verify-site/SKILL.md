---
name: verify-site
description: Verify aayushmanchanda.com (Astro 7 static site) the way a reader sees it. Builds and previews dist/ (or targets the live/preview Vercel URL) and drives headless Playwright to screenshot routes at 390x844 and 1280x800 in light and dark, dump computed type styles, list third-party request hosts, click a control, and check hover reveals. Use to prove any UI change (briOS wave, tools/library/notes/sites pages) before claiming it works.
---

# verify-site

The harness is `shoot.mjs` in this directory: plain Node + the repo's own `playwright` devDependency (the same one `pipeline/capture.mjs` uses). No MCP browser.

**Run every command from the repo root** (`/Users/aayushmanchanda/Downloads/Aayush/aayushmanchanda.com`). Node started from another cwd on this machine fails with `uv_cwd` errors.

## Launch

Local (proves the current checkout):

```sh
npm run build                                   # "[build] Complete!" + "N page(s) built"
npx astro preview --background --port 4329      # ready line: "Preview server running at http://localhost:4329 (pid N)"
```

Astro 7's preview daemonizes (`--background`, and it also backgrounds itself when stdout is not a TTY). It serves `dist/` as built: rebuild after every source change, a running preview does not pick edits up.

Deployed: skip the build and pass `--base https://aayushmanchandacom.vercel.app` (production) or a Vercel preview URL. Deployed runs prove what shipped, not your working tree.

## Doctor

Read-only; run first, and whenever output looks wrong:

```sh
npx astro preview status          # "running at http://localhost:4329 (pid N, uptime ...)" — note the port/pid
curl -sI http://localhost:4329/tools | head -1   # HTTP/1.1 200 OK
ls -la dist/index.html            # timestamp newer than your last src edit? if not, rebuild
```

If `status` shows a server you did not start (different port, older uptime), it is the user's: drive it read-only or start yours on another `--port`, and do not `stop` it. Only one background preview per project can be tracked by `astro preview stop`, so do not run two verifications side by side against separate local previews; share one instance and use distinct `--label`s.

## Drive

```sh
node .claude/skills/verify-site/shoot.mjs --base <url> --routes /,/tools --label t15 \
  [--styles 'h1,.prose p'] [--click '<selector>'] \
  [--hover '<selector>' --expect '<selector>' --wait 400] \
  [--sizes 390x844,1280x800] [--themes light,dark] [--full]
```

Per route x size x theme it:

- **Theme:** sets Playwright `colorScheme` AND pins the site's own toggle state (`localStorage.theme = light|dark`, read by the PREPAINT script in `src/lib/theme.ts`, which writes `html[data-theme]`). The report records `dataTheme` and `bodyBg`; a mismatch is a failure. Dark `bodyBg` is `rgb(0, 0, 0)` (#000000), light is `rgb(255, 255, 255)`.
- **Screenshot:** `<route>-<width>-<theme>.png`, viewport only unless `--full`; CSS animations disabled.
- **`--click`:** one real user click on the first match after load (e.g. `[data-tools-view-set="grid"]`), before styles and screenshot.
- **`--styles`:** comma list (commas inside `:is(...)` are safe); for the first 3 matches of each: `color, font-size, font-weight, letter-spacing, line-height` plus a text snippet.
- **Network:** `thirdPartyHosts` = every request host not equal to `--base`'s host (e.g. `/tools` shows none since VET-226 self-hosted the icons; X embed pages show `platform.twitter.com` etc.). Uncaught page errors land in `pageErrors`.
- **`--hover`/`--expect`:** desktop widths only (>=768). Hovers the first `--hover` match, waits `--wait` ms, reports `visibleBefore`/`visibleAfter` of the first `--expect` match. Visibility is `checkVisibility({checkOpacity, checkVisibilityCSS})` + non-zero box, so opacity-0 fades count as hidden (Playwright's `isVisible` alone does not). A `--hover` target missing on a route is a failure: pass only routes that have it. Tip: `--expect '<trigger>:hover <revealed>'` scopes the reveal to the hovered element.

Exit code 0 = no failures; 1 = any non-200, theme mismatch, thrown error, or failed hover; 2 = bad args. Stable handles live in `features/`; read the matching file before driving a feature.

## Evidence

`qa/evidence/<YYYY-MM-DD>-<label>/` (local date): PNGs (`*.png`, gitignored: too heavy to commit, re-creatable) and `report.json` (committable; the machine-readable proof). Re-running with the same `--label` on the same day overwrites `report.json` and same-named PNGs: use one label per run (`t15`, `t15-grid`, `t15-hover`). Proof standards:

- Drive the real reader path: click the actual button, hover the actual element. Setting `localStorage` directly is allowed only for the theme pin above (it is exactly what the toggle persists).
- Capture the action and the resulting state: pair a `--click`/`--hover` run with a baseline run, and cite `visibleBefore` as well as `visibleAfter`.
- Side effects count: "no requests to X" is proven by `thirdPartyHosts` in `report.json`, not by the screenshot.
- Local preview proves the build; say so. Claims about production need a run with `--base https://aayushmanchandacom.vercel.app`.
- Every mapped entry point in `features/<feature>.md` is part of the proof; do not report one route as covering the others.

## Cleanup

```sh
npx astro preview stop     # stops the background preview this project started (only if you started it)
```

Leaves `qa/evidence/` alone. Nothing else is created: each shoot run launches and closes its own headless Chromium. Evidence survives cleanup; delete old evidence dirs only when the user asks.

## Helpers

- `shoot.mjs` — the harness above. Executable; always invoke with `node` from the repo root.
- `features/` — the feature map. Maintain it with `/maintain-verification-skill` when routes or selectors change.
