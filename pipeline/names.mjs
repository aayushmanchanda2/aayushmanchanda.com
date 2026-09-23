/**
 * names.mjs — a product name out of a page title, for new saves.
 *
 * "Voyage AI | Home" is a browser tab, not a name. `cleanName` keeps the part
 * that is the product, matched against the saved URL's domain, and returns null
 * when it cannot tell, so the caller falls back to the hostname and a human
 * types the real name later. It never truncates into a name nobody chose.
 *
 * `lib/parse.ts › readName` holds the site to the same rule from the other
 * side (at most 4 words, none of `| : — ·`); anything this returns passes it.
 */

const SEP = /\s+(?:\||—|–|-|·|›)\s+|:\s+/;
const GENERIC = new Set(["home", "official site", "pricing", "components", "about", "docs", "github"]);
const FORBIDDEN = /[|:—·]/;
/** @param {string} s */
const squash = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
/** @param {string} s */
const words = (s) => s.split(/\s+/).length;

/**
 * The product-side name from a page title, or null when a human must type one.
 *
 * In order: split on title separators, drop generic segments, then keep the
 * segment that equals the domain's first label, else "X by/from Y" where X
 * does, else a short segment loosely matching a host label, else the first
 * segment minus a trailing "by Someone". Longer than 3 words is null.
 *
 * @param {string} title @param {string} url
 * @returns {string | null}
 */
export function cleanName(title, url) {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {}
  const label = host ? squash(host.split(".")[0] ?? "") : "";
  const labels = host.split(".").slice(0, -1).filter((l) => l.length >= 4).map(squash);
  const parts = title.split(SEP).map((p) => p.trim()).filter((p) => p && !GENERIC.has(p.toLowerCase()));
  const ok = (/** @type {string} */ p) => (words(p) <= 3 && !FORBIDDEN.test(p) ? p : null);
  if (parts.length === 0) return null;

  for (const p of parts) if (label && squash(p) === label) return ok(p);
  for (const p of parts) {
    const m = p.match(/^(.+?)\s+(?:by|from)\s+/);
    if (m?.[1] && label && squash(m[1]) === label) return ok(m[1]);
  }
  for (const p of parts) {
    const q = squash(p);
    if (words(p) <= 3 && q.length >= 4 && labels.some((l) => l.includes(q) || q.includes(l))) return ok(p);
  }
  let p = /** @type {string} */ (parts[0]);
  const m = p.match(/^(.+?)\s+(?:by|from)\s+[A-Z]/);
  if (m?.[1] && words(p) > 2) p = m[1];
  return ok(p);
}
