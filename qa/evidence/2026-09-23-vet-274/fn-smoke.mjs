// Loads the built Vercel function from its own directory (as Vercel does) and
// asks it for /me pages with no private env set. Proves the bundle imports
// (assets.ts finds public/, link-previews.json is there) and /me degrades.
const dir = new URL("../../../.vercel/output/functions/_render.func/", import.meta.url);
process.chdir(dir.pathname);
for (const key of ["PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY", "PUBLIC_CONVEX_URL", "ALLOWED_EMAIL"]) delete process.env[key];
const { default: fn } = await import(new URL(".vercel/output/server/entry.mjs", dir).href);
for (const path of ["/me/library", "/me/library/anything"]) {
  const res = await fn.fetch(new Request(`https://example.test${path}`));
  const html = await res.text();
  console.log(path, res.status, res.headers.get("x-robots-tag"), res.headers.get("cache-control"), /Not configured/.test(html) ? "not-configured-rendered" : "?", /noindex/.test(html) ? "meta-noindex" : "");
}
