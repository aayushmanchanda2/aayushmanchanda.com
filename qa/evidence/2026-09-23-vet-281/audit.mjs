// VET-281 SEO audit over dist/: counts issues by category, prints JSON.
// node qa/evidence/2026-09-23-vet-281/audit.mjs [label]
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const DIST = "dist";
const ORIGIN = "https://aayushmanchanda.com";
const label = process.argv[2] ?? "run";

const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = path.join(dir, f);
  return statSync(p).isDirectory() ? (f === "_astro" ? [] : walk(p)) : p.endsWith(".html") ? [p] : [];
});
const files = walk(DIST);
const route = (f) => "/" + path.relative(DIST, f).replace(/index\.html$/, "").replace(/\.html$/, "").replace(/\/$/, "");
const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
const meta = (html, key) => {
  for (const m of html.matchAll(/<meta\s[^>]*>/g)) if (attr(m[0], "name") === key || attr(m[0], "property") === key) return attr(m[0], "content");
};
const decode = (s) => s?.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
const exists = (p) => {
  const clean = p.replace(/[?#].*$/, "").replace(/\/$/, "") || "/";
  return clean === "/" || existsSync(path.join(DIST, clean)) && statSync(path.join(DIST, clean)).isFile() || existsSync(path.join(DIST, clean, "index.html"));
};

const issues = {};
const add = (cat, r, detail) => (issues[cat] ??= []).push(detail ? `${r} ${detail}` : r);
const pages = files.map((f) => ({ f, r: route(f), html: readFileSync(f, "utf8") }));
const titles = new Map(), descs = new Map(), inbound = new Map();

for (const { r, html } of pages) {
  const noindex = /<meta name="robots" content="noindex"/.test(html);
  const title = decode(html.match(/<title>([^<]*)<\/title>/)?.[1]);
  const desc = decode(meta(html, "description"));
  if (!title) add("title.missing", r); else {
    if (title.length > 60) add("title.long", r, `(${title.length})`);
    titles.set(title, [...(titles.get(title) ?? []), r]);
  }
  if (!desc) add("description.missing", r); else if (!noindex) {
    if (desc.length > 160) add("description.long", r, `(${desc.length})`);
    if (desc.length < 50) add("description.short", r, `(${desc.length})`);
    if (!noindex) descs.set(desc, [...(descs.get(desc) ?? []), r]);
  }
  const canon = html.match(/<link rel="canonical" href="([^"]*)"/)?.[1];
  if (!noindex) {
    if (!canon) add("canonical.missing", r);
    else {
      if (canon !== ORIGIN + (r === "/" ? "/" : r)) add("canonical.notSelfNoSlash", r, canon);
      if (meta(html, "og:url") !== canon) add("canonical.ogUrlMismatch", r);
    }
  }
  const img = meta(html, "og:image");
  if (!img) add("og.imageMissing", r);
  else {
    if (!exists(img.replace(ORIGIN, ""))) add("og.imageFileMissing", r, img);
    if (img.endsWith("/og.png") && /^\/(tools|sites|library|notes)\/[^/]+$|^\/(about|experiments|tools|sites|library|notes)$/.test(r)) add("og.genericCardOnEntry", r);
  }
  if (!meta(html, "og:image:alt") || meta(html, "og:image:alt") === "Aayush Manchanda" && r !== "/") add("og.altGeneric", r);
  if (meta(html, "twitter:card") !== "summary_large_image") add("og.twitterCard", r);
  if (!noindex && !/application\/ld\+json/.test(html)) add("jsonld.missing", r);

  // headings, inside <main> only (the chrome has none that count)
  const main = html.match(/<main[\s\S]*<\/main>/)?.[0] ?? html;
  const hs = [...main.matchAll(/<h([1-6])[\s>]/g)].map((m) => +m[1]);
  const h1s = hs.filter((h) => h === 1).length;
  if (h1s !== 1) add("headings.h1Count", r, `(${h1s})`);
  hs.forEach((h, i) => { if (i && h > hs[i - 1] + 1) add("headings.skip", r, `h${hs[i - 1]}->h${h}`); });

  for (const m of html.matchAll(/<img\s[^>]*>/g)) {
    if (attr(m[0], "alt") === undefined && !/\salt[\s>=]/.test(m[0])) add("images.noAlt", r, attr(m[0], "src"));
    // boxes reserved in CSS (aspect-ratio / fixed height) are not a shift; checked by hand in the components
    const reserved = /class="(crop|vtile__thumb|tile__thumb|pc__cover|screen__shot)\b/.test(m[0]);
    if (!attr(m[0], "width") && !reserved) add("images.unreservedBox", r, attr(m[0], "src")?.slice(0, 60));
  }
  // the page's hero picture (a site's full shot, a tool's preview) must load eagerly with high priority
  const hero = main.match(/<img\s[^>]*class="(scroller__shot|tool-preview__img)[^>]*>/)?.[0];
  if (hero && !/fetchpriority="high"/.test(hero)) add("perf.lcpImageNotPrioritised", r);
  if (/^\/tools\/[^/]+$/.test(r) && existsSync(path.join("public/previews", r.split("/")[2] + ".webp")) && !hero) add("tools.previewNotShown", r);
  // an article title and its own section heads at one level (VET-279's Articles view)
  if (/page-title--entry[^>]*>/.test(main) && /<h2 class="page-title/.test(main) && /<h2 class="sec__head/.test(main)) add("headings.sectionSameLevelAsTitle", r);

  for (const m of html.matchAll(/<a\s[^>]*href="(\/[^"]*)"/g)) {
    const href = decode(m[1]);
    if (href.startsWith("//")) continue;
    const target = href.replace(/[?#].*$/, "");
    if (!exists(target)) add("links.broken", r, href);
    else if (target.length > 1 && target.endsWith("/")) add("links.trailingSlash", r, href);
    const key = target.replace(/\/$/, "") || "/";
    if (key !== r) inbound.set(key, (inbound.get(key) ?? 0) + 1);
  }
}
for (const [t, rs] of titles) if (rs.length > 1) add("title.duplicate", t, rs.join(","));
for (const [d, rs] of descs) if (rs.length > 1) add("description.duplicate", rs.join(","));
for (const { r, html } of pages) if (!/noindex/.test(html) && r !== "/" && !inbound.get(r)) add("links.orphan", r);

// sitemap
const sm = readFileSync(path.join(DIST, "sitemap-0.xml"), "utf8");
const locs = [...sm.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
const lastmods = new Set([...sm.matchAll(/<lastmod>([^<]*)<\/lastmod>/g)].map((m) => m[1]));
if (lastmods.size <= 1) add("sitemap.lastmodBuildTime", `${lastmods.size} distinct lastmod for ${locs.length} urls`);
for (const loc of locs) if (!loc.endsWith(".md") && loc !== ORIGIN + "/" && loc.endsWith("/")) add("sitemap.trailingSlash", loc);
const smSet = new Set(locs.map((l) => l.replace(ORIGIN, "").replace(/\/$/, "") || "/"));
for (const { r, html } of pages) if (!/noindex/.test(html) && !smSet.has(r)) add("sitemap.missingPage", r);

// robots, llms
const robots = readFileSync(path.join(DIST, "robots.txt"), "utf8");
if (!/Disallow: \/me/.test(robots)) add("robots.meNotDisallowed", "/robots.txt");
if (!existsSync(path.join(DIST, "llms.txt"))) add("ai.llmsMissing", "/llms.txt");
const vercel = readFileSync("vercel.json", "utf8");
if (!/"\^\/\(\.\+\)\/\$"/.test(vercel)) add("canonical.slashNot308", "vercel.json serves /x and /x/ both 200");

const counts = Object.fromEntries(Object.entries(issues).map(([k, v]) => [k, v.length]).sort());
const total = Object.values(counts).reduce((a, b) => a + b, 0);
const out = { label, pages: pages.length, total, counts, issues };
writeFileSync(new URL(`./audit-${label}.json`, import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify({ label, pages: pages.length, total, counts }, null, 1));
