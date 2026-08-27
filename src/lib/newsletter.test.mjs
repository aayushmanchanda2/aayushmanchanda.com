/**
 * The newsletter, under test, in the state it ships in: off.
 *
 * Two halves, and the second is the reason this file exists.
 *
 * The first is `lib/newsletter.ts`, which is ordinary: a switch and five field
 * values. Worth checking anyway, because four of those five are Buttondown's
 * names rather than ours, and getting one wrong is invisible. The form still
 * renders, still submits, still redirects to a page that looks like a success,
 * and the subscriber is dropped. Nothing in a static build notices.
 *
 * The second half is the components, and it is here for the same reason
 * `theme.test.mjs` parses stylesheets: the claim is structural, so nothing else
 * can check it. The claim is that a newsletter which is not configured does not
 * exist on the page — not hidden, not disabled, absent — and that /privacy does
 * not describe it either. An `.astro` file cannot be rendered by this runner, so
 * the proof is done in two pieces that meet in the middle. `newsletterForm(null)`
 * returns null, which is asserted directly; and the component's entire template
 * is a single expression guarded on that value, which is asserted by parsing it.
 * A falsy guard around the whole template emits nothing, so the two together say
 * the page is clean.
 *
 * The failure this exists to catch is the quiet one: someone adds a heading, or
 * a wrapper, or a "coming soon" line *outside* the guard, and a control that was
 * meant to be invisible starts advertising itself on the front page of a site
 * whose privacy policy says there are no forms on it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { newsletterForm } from "./newsletter.ts";
import { NEWSLETTER_ACTION } from "./site.ts";

/**
 * A configured action that is deliberately not a real account, so nothing in the
 * suite can post a live address anywhere.
 */
const FIXTURE = "https://buttondown.com/api/emails/embed-subscribe/fixture-only";

/** The endpoint shape the activation runbook tells you to paste. */
const ENDPOINT = "https://buttondown.com/api/emails/embed-subscribe/";

/**
 * @param {string} relative
 * @returns {string}
 */
const read = (relative) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

const SITE = read("./site.ts");
const COMPONENT = read("../components/NewsletterSignup.astro");
const HOME = read("../pages/index.astro");
const PRIVACY = read("../pages/privacy.astro");

/* -------------------------------------------------------------------------- */
/* the module                                                                  */
/* -------------------------------------------------------------------------- */

test("no action means no form, and empty string counts as no action", () => {
  assert.equal(newsletterForm(null), null);
  // An empty action is not an error in HTML: it posts to the current page. A
  // box that swallows an address and reloads the home page is worse than none.
  assert.equal(newsletterForm(""), null);
});

test("a configured action produces Buttondown's documented embed form", () => {
  assert.deepEqual(newsletterForm(FIXTURE), {
    action: FIXTURE,
    method: "post",
    emailField: "email",
    embedField: "embed",
    embedValue: "1",
  });
});

test("the action is passed through untouched, whatever the username", () => {
  const other = `${ENDPOINT}someone-else`;
  assert.equal(newsletterForm(other)?.action, other);
});

test("site.ts writes down the endpoint the runbook says to paste", () => {
  assert.ok(
    SITE.includes(ENDPOINT),
    "the activation comment must carry the real endpoint, not a paraphrase",
  );

  // The union annotation, not the value. Without it TypeScript infers `null`
  // from the initialiser, narrows every read of it to `null`, and the guards on
  // both surfaces become dead code the day someone fills it in.
  assert.match(SITE, /export const NEWSLETTER_ACTION: string \| null =/);
});

test("whatever the switch is set to, it is a shape Buttondown answers", () => {
  // Off is a valid state and asserted nowhere else on purpose: nothing in this
  // suite may depend on the const's current value, or turning the newsletter on
  // would mean editing one line and then fixing the tests that fact broke.
  if (NEWSLETTER_ACTION === null) return;

  assert.ok(
    NEWSLETTER_ACTION.startsWith(ENDPOINT),
    "that is not Buttondown's embed endpoint; the dashboard URL is not it",
  );
  assert.ok(
    NEWSLETTER_ACTION.slice(ENDPOINT.length).length > 0,
    "the endpoint needs the account's username on the end of it",
  );
});

/* -------------------------------------------------------------------------- */
/* the components                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Everything an `.astro` file can put on the page: the markup after the
 * frontmatter fence, with the scoped `style` and `script` blocks taken out.
 * Both ship whether or not the newsletter exists — Astro collects them from the
 * page's imports, not from what rendered — so they sit outside the guard the
 * template tests reason about, and the component's header comment owns that
 * trade-off.
 *
 * @param {string} source
 * @returns {string}
 */
function template(source) {
  const fence = source.indexOf("\n---", 3);
  assert.ok(fence > 0, "expected a closing frontmatter fence");
  return source
    .slice(fence + 4)
    .replace(/<style>[\s\S]*<\/style>/, "")
    .replace(/<script>[\s\S]*<\/script>/, "")
    .trim();
}

/**
 * The index of the `}` closing the `{` at `open`, or -1 if it never closes.
 *
 * @param {string} text
 * @param {number} open
 * @returns {number}
 */
function closingBrace(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === "{") depth += 1;
    else if (text[i] === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Every `{NEWSLETTER_ACTION ...}` expression in a template, as `[start, end]`.
 *
 * @param {string} text
 * @returns {[number, number][]}
 */
function gates(text) {
  /** @type {[number, number][]} */
  const ranges = [];
  const pattern = /\{\s*NEWSLETTER_ACTION\b/g;

  let match = pattern.exec(text);
  while (match !== null) {
    const end = closingBrace(text, match.index);
    assert.notEqual(end, -1, "a NEWSLETTER_ACTION gate never closes");
    ranges.push([match.index, end]);
    match = pattern.exec(text);
  }

  return ranges;
}

/**
 * @param {[number, number][]} ranges
 * @param {number} index
 * @returns {boolean}
 */
const inside = (ranges, index) =>
  ranges.some(([start, end]) => index > start && index < end);

/**
 * A template with its line wrapping collapsed, so a sentence can be searched for
 * as a sentence rather than as however the source happened to break it. Brace
 * balance and the order of everything survive, so `gates` still works on it.
 *
 * @param {string} text
 * @returns {string}
 */
const flat = (text) => text.replace(/\s+/g, " ");

/**
 * @param {string} text
 * @param {string} needle
 * @returns {number[]}
 */
function everyIndexOf(text, needle) {
  /** @type {number[]} */
  const found = [];
  for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + 1)) {
    found.push(at);
  }
  return found;
}

test("the component's whole template is one guarded expression", () => {
  const markup = template(COMPONENT);

  assert.ok(markup.startsWith("{"), "the template must open with the guard");
  assert.match(markup, /^\{\s*form\s*&&\s*\(/);

  // The brace that opens the template is the one that closes it, so there is
  // exactly one top-level expression and no markup sits outside the guard. With
  // `form` null, Astro renders that expression as nothing at all.
  assert.equal(
    closingBrace(markup, 0),
    markup.length - 1,
    "something in this template renders whether or not the newsletter exists",
  );
});

test("the component renders from the model rather than a second copy of it", () => {
  for (const bound of [
    "action={form.action}",
    "method={form.method}",
    "name={form.emailField}",
    "name={form.embedField}",
    "value={form.embedValue}",
  ]) {
    assert.ok(COMPONENT.includes(bound), `the form must bind ${bound}`);
  }

  // Hard-coding Buttondown's field names here as well would give them two
  // places to drift apart, and the copy the tests check is not the one that
  // ships.
  assert.doesNotMatch(COMPONENT, /name="(email|embed)"/);
});

test("the script is an enhancement over the POST, never a replacement for it", () => {
  // Buttondown's docs warn the response is sometimes a CAPTCHA or a validation
  // error the subscriber has to see, so the native submit must remain the
  // fallback for every path the script cannot vouch for — and the plain POST
  // keeps the box working with scripting off.
  const script = COMPONENT.match(/<script>([\s\S]*)<\/script>/)?.[1] ?? "";
  assert.ok(script.length > 0, "expected the progressive-enhancement script");

  assert.ok(script.includes("event.preventDefault()"), "the script must intercept the submit");
  assert.ok(script.includes("form.submit()"), "the fallback to the native POST is the contract");
  assert.ok(
    /catch\s*\{[\s\S]*form\.submit\(\)/.test(script),
    "the native submit must be the failure path, not the success path",
  );
});

test("the confirmation line exists, announces itself, and starts hidden", () => {
  const markup = template(COMPONENT);
  const done = markup.match(/<p class="news__done"[^>]*>/)?.[0] ?? "";

  assert.ok(done.length > 0, "expected the news__done confirmation line");
  assert.ok(done.includes('role="status"'), "screen readers must hear the confirmation");
  assert.ok(done.includes("hidden"), "the confirmation must not show before subscribing");
  assert.ok(done.includes('tabindex="-1"'), "focus must be able to land on it");
});

test("the home page places it unconditionally, so activation is one line", () => {
  assert.match(HOME, /import NewsletterSignup from "\.\.\/components\/NewsletterSignup\.astro";/);
  assert.ok(HOME.includes("<NewsletterSignup />"));

  // The switch lives in the component. A second gate here would be a second
  // thing to remember on the day the newsletter is turned on.
  assert.equal(gates(template(HOME)).length, 0);
});

test("/privacy mentions Buttondown only inside a gate on the same string", () => {
  const markup = flat(template(PRIVACY));
  const ranges = gates(markup);
  assert.equal(ranges.length, 2, "expected the collect paragraph and the section");

  const mentions = everyIndexOf(markup, "Buttondown");
  assert.ok(mentions.length > 0, "the configured page must name who gets the address");

  for (const at of mentions) {
    assert.ok(
      inside(ranges, at),
      "/privacy describes the newsletter outside the gate that decides it exists",
    );
  }
});

test("/privacy keeps the no-newsletter-box sentence for the state that ships", () => {
  const markup = flat(template(PRIVACY));
  const ranges = gates(markup);

  const at = markup.indexOf("no newsletter box");
  assert.notEqual(at, -1, "the unconfigured page still has to say there is no box");

  // Gated too, and that is the point: the day the form exists, this sentence
  // becomes a lie, and it has to leave with the same switch that brings the box.
  assert.ok(inside(ranges, at), "the sentence a live form would falsify is ungated");
});
