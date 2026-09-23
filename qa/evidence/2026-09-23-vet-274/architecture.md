# VET-274 architecture sketch (pstack:architect, short form)

Grounded on: `src/lib/library.ts › parseLibrary`, `LibraryPane.astro`, `KindSegments.astro`,
`EntryDetail.astro`, `lib/assets.ts` (reads `public/` at module scope), `vercel.json` (legacy
`routes`), `@astrojs/vercel@11` (writes `.vercel/output/config.json`; `vercel build` merges
vercel.json routes ahead of it, verified), `@clerk/astro@4` (its `clerk()` integration
injects a page script into EVERY page, so it is not used).

## Candidates

A. **Client-side on /library.** Inline cookie sniff (`__client_uat`) on /library, lazy-load
   Clerk + Convex when it looks signed in, merge rows in the browser. Public HTML changes on
   every library page (+~300 B inline), cookie heuristics differ on Clerk dev instances,
   private rows render through client JS the site does not have. Rejected.

B. **Server-side on /me/library (chosen).** /library stays prerendered and byte-identical.
   `/me/library` and `/me/library/<slug>` are on-demand; middleware runs Clerk only under
   `/me`; the page reads Convex server-side with the Clerk "convex" JWT, so Convex's own
   owner check runs too. Signed-out visitors of public pages download 0 bytes of new JS.

## Modules

```
convex/
  schema.ts        entries (library-entry columns + raindrop_note, sweep_note, raindrop_id, bucket),
                   media (path -> storageId, sha256)
  auth.config.ts   Clerk issuer (CLERK_JWT_ISSUER_DOMAIN), applicationID "convex"
  owner.ts         isOwner(email, allowed): boolean          -- pure, unit-tested
  entries.ts       list(), get({slug})  [owner-only queries]
                   importRows({rows, mode}) internal mutation: upsert | insert-if-new
                   putMedia / mediaSha / counts  internal
  http.ts          POST /import (JSON rows), POST /import/media (bytes), GET /import (counts)
                   guard: Bearer INGEST_SECRET, constant-time (SHA-256 both, XOR compare)

src/lib/private.ts
  type PrivateRow = LibraryEntry-ish JSON + raindrop_note + sweep_note
  meConfig(env): {clerk, convexUrl, allowed} | null      -- null => "not configured"
  toEntry(row, media): LibraryEntry                        -- parseLibrary([row])[0] + media path -> URL
  privateHref(slug)
src/lib/me.ts (server only)
  ownerGate(Astro): "unconfigured" | "sign-in" | "forbidden" | {token}
  privateQuery(token, name, args)                          -- ConvexHttpClient
src/middleware.ts   /me/* only, and only when Clerk keys exist: clerkMiddleware()
src/components/MeGate.astro       sign-in (Clerk <SignIn/> + runInjectionScript) or not-configured
src/components/WhyCard.astro      "Why I saved it": raindrop_note, sweep_note
src/components/PrivateEntry.astro Base + LibraryPane(extra) + WhyCard + EntryDetail + EntryNav
src/pages/me/library/index.astro, [slug].astro   prerender = false, noindex, no-store
LibraryPane/LibraryToolbar/KindSegments: optional `extra` rows / segment; absent => same bytes
src/fixtures/MeFixture.astro      dev-only injected route (/me/fixture/[view]), synthetic data

scripts/private-setup-wizard.sh   mattpocock wizard template
scripts/private-import.mjs        archive + media -> /import (dev by default, --prod explicit)
scripts/vercel-build.sh           production: npx convex deploy --cmd 'npm run build'; else npm run build
pipeline/private-sync.mjs         Internal/{Reading,Tools,Process,Vetted} -> /import (insert-if-new)
```

## Not doing
- Client-side Convex/Clerk on public pages; Convex validators duplicating `parseLibrary`
  (nested objects are `v.any()`; the site's parser is the one validator, run at import and render).
- Screenshots, enrichment, or media for synced raindrops.
