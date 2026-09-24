/**
 * Signed-in mode on public pages: the cookie check, the rows endpoint's gate
 * with a mocked identity, and where a private row lands in the pane. Synthetic
 * rows and a made-up address only.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { ConvexHttpClient } from "convex/browser";

import { FIXTURE_ROWS } from "../fixtures/private.ts";
import { FILTER, PREPAINT } from "./library-pane.ts";
import { rowsResponse } from "./me.ts";
import { FILTER_MARK } from "./pane-merge.ts";
import { paneRows, toEntries, toEntry } from "./private.ts";
import { SIGNED_IN, signedInCheck } from "./signed-in-check.ts";

test("only a non-zero __client_uat, suffixed or not, counts as signed in", () => {
  const yes = ["__client_uat=1727000000", "theme=dark; __client_uat_Ab-9_x=1727000000", "__client_uat_x=0; __client_uat=1727000000"];
  const no = ["", "theme=dark", "__client_uat=0", "__client_uat_Ab-9_x=0; __client_uat=0", "x__client_uat=1727000000", "__client_uat="];
  for (const cookie of yes) assert.equal(SIGNED_IN.test(cookie), true, cookie);
  for (const cookie of no) assert.equal(SIGNED_IN.test(cookie), false, cookie);
});

test("the inline check stays under 600 bytes and imports nothing but the module", () => {
  const check = signedInCheck("/signed-in.js");
  assert.ok(Buffer.byteLength(check) < 600, `${Buffer.byteLength(check)} bytes`);
  assert.deepEqual(check.match(/import\([^)]*\)/g), ['import("/signed-in.js")']);
});

test("the pane finds FILTER on the page by its mark, and never PREPAINT", () => {
  assert.ok(FILTER.includes(FILTER_MARK));
  assert.ok(!PREPAINT.includes(FILTER_MARK));
});

const ALLOWED = "owner@example.com";
const ENV = { PUBLIC_CLERK_PUBLISHABLE_KEY: "pk", CLERK_SECRET_KEY: "sk", PUBLIC_CONVEX_URL: "https://synthetic.convex.cloud", ALLOWED_EMAIL: ALLOWED };

/**
 * Clerk's `locals` as the middleware leaves them, for an identity or none: only the parts `gate` reads.
 * @param {string | null} email
 * @returns {App.Locals}
 */
const locals = (email) =>
  /** @type {App.Locals} */ (
    /** @type {unknown} */ ({
      auth: () => ({ userId: email ? "user_1" : null, sessionClaims: { aud: "convex" }, getToken: async () => "token" }),
      currentUser: async () => (email ? { primaryEmailAddress: { emailAddress: email } } : null),
    })
  );

test("/me/api/rows: no identity or the wrong email is a bare 404; the owner gets rows; never cached", async (t) => {
  const saved = { ...process.env };
  Object.assign(process.env, ENV);
  t.after(() => {
    for (const key of Object.keys(ENV)) if (saved[key] === undefined) delete process.env[key];
    Object.assign(process.env, saved);
  });
  t.mock.method(ConvexHttpClient.prototype, "query", async () => FIXTURE_ROWS);

  for (const email of [null, "someone@example.com"]) {
    const response = await rowsResponse(locals(email));
    assert.equal(response.status, 404, String(email));
    assert.equal(await response.text(), "");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }

  const response = await rowsResponse(locals(` ${ALLOWED.toUpperCase()} `));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const rows = await response.json();
  assert.deepEqual(rows.map((/** @type {{ slug: string }} */ row) => row.slug), toEntries(FIXTURE_ROWS).map((entry) => entry.slug));
  assert.equal(rows[0].href, "/me/library/fixture-private-article");
});

/**
 * @param {string} slug
 * @param {string} saved_date
 * @param {Record<string, unknown>} [extra]
 */
const entry = (slug, saved_date, extra = {}) =>
  toEntry({ slug, title: slug, url: `https://example.com/${slug}`, domain: "example.com", saved_date, kind: "article", ...extra });

test("a private row sits above the public row the /me pane puts after it, also_saved or not (VET-284)", () => {
  const pub = [entry("pub-sep", "2026-09-10"), entry("pub-aug", "2026-08-10"), entry("pub-also", "2026-09-01", { also_saved: true })];
  const block = { best_for: "Me.", tip: "The tip.", needs: [], start_here: ["Go."], next_step: "Open it." };
  const rows = paneRows(
    [entry("newest", "2026-09-20", { tags: ["agents"], block }), entry("same-day", "2026-09-10"), entry("oldest", "2026-07-01"), entry("kept", "2026-09-05", { also_saved: true })],
    pub,
  );
  assert.deepEqual(
    rows.map((row) => [row.slug, row.before, row.month]),
    [
      ["newest", "/library/pub-sep", "September 2026"],
      ["same-day", "/library/pub-also", "September 2026"],
      ["oldest", null, "July 2026"],
      ["kept", "/library/pub-also", "September 2026"],
    ],
  );
  assert.deepEqual([rows[0].summary, rows[0].tip, rows[0].tags], ["The tip.", true, [{ slug: "agents", label: "agents" }]]);
});
