# Local end-to-end suite

Run `npm run e2e` from the worktree root. It builds `dist/`, starts a local Python static server on 127.0.0.1:4329 and an Astro dev server for synthetic `/me/fixture/*` pages on 127.0.0.1:4330, then stops both. The runner writes `.e2e/report.json` and traces under `.e2e/`. A final visual pass starts and stops another static server on 127.0.0.1:4331, writes `.e2e/visual-report.json`, and takes 40 screenshots at 375px: key routes in both themes with reduced motion, plus the home and Sites pages with system and forced themes under opposite OS settings. It reuses the DOM overflow scan from `.claude/skills/verify-site/overflow.mjs`. All three ports must be free. Every browser check blocks requests outside its local origin(s).

The agent goals use the stored ChatGPT subscription with `chatgpt('gpt-6-luna')`. Aayush handles `npx e2e login openai`; the suite never signs in. Set `E2E_TELEMETRY_DISABLED=1` for any direct `npx e2e` command. A narrow run uses `npm run e2e -- --grep '<test name>'`.

The Python server serves the prerendered site, and the dev server serves only synthetic private fixture states. Neither reproduces Vercel redirects or markdown content negotiation. Third-party image and embed content is blocked. The static server returns its own default body for an unknown path, so the custom 404 page is checked at `/404.html` and an unknown route is checked for HTTP 404 separately.

Library currently uses kind and tag filters with list/detail navigation; it has no grid toggle or slide-over panel. Those interactions are exercised on Tools and Sites where they exist.
