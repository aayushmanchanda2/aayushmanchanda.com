/**
 * signed-in.ts — what Aayush gets on every page while he is signed in
 * (VET-276). Only `lib/signed-in-check.ts` loads it, and only when Clerk's
 * `__client_uat` cookie says a session exists, so no other visitor downloads
 * a byte of it. The build serves it at `/signed-in.js` (`astro.config.mjs`).
 *
 * Clerk's session cookie lives 60 seconds and only Clerk's own script renews
 * it, so a request from a public page would reach the server signed out a
 * minute after /me. So this loads Clerk first (its UI stays unloaded), asks it
 * for a fresh token, and sends that to `/me/api/rows`, the /me gate as JSON.
 * No session, a refused token or any failure ends it there, quietly: a stale
 * or forged cookie costs one request and shows nothing. Clerk writes a stale
 * `__client_uat` back to 0 when it finds no session, so the next page does
 * not ask again.
 *
 * With the rows it adds "Private N" and "Sign out" to the top bar, merges the
 * rows into a library pane when the page has one (`lib/pane-merge.ts`; on a
 * phone, where the pane hides, on top of /library's All view), and
 * puts them in ⌘K. Sign out is Clerk's own, in place, and lands back on this
 * page signed out (on a /me page, home, since /me would only ask him to sign in).
 */
import { runInjectionScript } from "@clerk/astro/internal";

import { LOCK_SVG, mergePane, mergePhone } from "./pane-merge";
import type { PaneRow } from "./private";
import type { SearchEntry } from "./search";

const CSS = `
.me-bar{display:flex;align-items:center;flex-shrink:0;margin-left:auto}
@media (min-width:600px){.me-bar{margin-left:.25rem}}
@media (max-width:599px){.me-bar__word{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}}
.me-bar__item{display:inline-flex;align-items:center;gap:.375rem;min-height:40px;padding:.625rem .5rem;color:var(--text-secondary);text-decoration:none;cursor:pointer;transition-property:color;transition-duration:var(--dur-fast);transition-timing-function:var(--ease)}
.me-bar__item .tabular-nums{color:var(--text-tertiary)}
.me-bar__item[aria-current]{color:var(--text-primary)}
.me-bar__item:disabled{cursor:progress;color:var(--text-tertiary)}
@media (hover:hover){.me-bar__item:not(:disabled):hover{color:var(--accent)}}
`;

type Clerk = NonNullable<typeof window.Clerk>;

async function signedIn(): Promise<Clerk | null> {
  try {
    // Clerk loads once per page, with the first caller's options. On a /me
    // page the sign-in form may be the other caller and needs Clerk's UI.
    await runInjectionScript(location.pathname.startsWith("/me/") ? {} : { prefetchUI: false });
  } catch {
    return null;
  }
  return window.Clerk?.session ? window.Clerk : null;
}

async function privateRows(clerk: Clerk): Promise<PaneRow[] | null> {
  try {
    const token = await clerk.session?.getToken();
    const response = await fetch("/me/api/rows", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    return response.ok ? ((await response.json()) as PaneRow[]) : null;
  } catch {
    return null;
  }
}

/** "Private N" and "Sign out" at the end of the top bar: the one sign-out control on any page. */
function bar(clerk: Clerk, count: number): void {
  const host = document.querySelector("[data-bar]");
  if (!host) return;
  document.head.append(Object.assign(document.createElement("style"), { textContent: CSS }));
  const link = Object.assign(document.createElement("a"), { className: "me-bar__item mono press", href: "/me/library" });
  link.insertAdjacentHTML("afterbegin", LOCK_SVG);
  link.querySelector("svg")?.setAttribute("aria-hidden", "true");
  // A phone's bar is the trail's: there the lock stands for the word.
  link.append(Object.assign(document.createElement("span"), { className: "me-bar__word", textContent: "Private " }), Object.assign(document.createElement("span"), { className: "tabular-nums", textContent: String(count) }));
  if (location.pathname === "/me/library") link.setAttribute("aria-current", "page");
  const out = Object.assign(document.createElement("button"), { type: "button", className: "me-bar__item mono press", textContent: "Sign out" });
  out.setAttribute("data-sign-out", "");
  out.addEventListener("click", async () => {
    out.disabled = true;
    await clerk.signOut({ redirectUrl: location.pathname.startsWith("/me/") ? "/" : location.href }).catch(() => (out.disabled = false));
  });
  const wrap = Object.assign(document.createElement("span"), { className: "me-bar" });
  wrap.append(link, out);
  host.append(wrap);
}

/**
 * The private rows join ⌘K's index. The palette fetches `/search.json` on
 * first open (`lib/palette.ts`); this answers that one request with the public
 * index plus these, so the public bundle carries no hook for it.
 */
function search(rows: PaneRow[]): void {
  const entries: SearchEntry[] = rows.map((row) => ({
    title: row.title,
    section: "Private",
    href: row.href,
    terms: [row.domain, row.kind, ...row.tags.map((tag) => tag.label)].join(" "),
    lead: row.lead,
    sub: row.domain,
    date: row.date,
    glyph: row.kind,
  }));
  const base = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    input === "/search.json"
      ? base(input, init).then(async (response) => (response.ok ? Response.json([...((await response.json()) as SearchEntry[]), ...entries]) : response))
      : base(input, init)) as typeof fetch;
}

const clerk = await signedIn();
const rows = clerk && (await privateRows(clerk));
if (clerk && rows) {
  if (document.readyState === "loading") await new Promise((done) => document.addEventListener("DOMContentLoaded", done, { once: true }));
  bar(clerk, rows.filter((row) => !row.also).length);
  mergePhone(rows);
  mergePane(rows);
  search(rows);
}
