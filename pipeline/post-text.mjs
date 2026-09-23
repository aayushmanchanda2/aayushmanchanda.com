/**
 * post-text.mjs — which copy of a post's words to keep: the saved (Firecrawl)
 * text or X's, with X's paragraph breaks put back where they can be.
 * Split out of `post.mjs`, which is the fetching half.
 */

import { oneLine } from "./util.mjs";

/** @typedef {import("./post.mjs").Tweet} Tweet */


/**
 * The saved text with X's paragraph breaks put back over the part X returned.
 *
 * The saved copy is whole but flattened to one line; X's is cut at 280
 * characters on a long post but keeps its line breaks. Walking both at once
 * restores the breaks for as far as X's copy goes. Any disagreement, and the
 * saved text comes back unchanged.
 * @param {string} saved @param {string} x @returns {string}
 */
function withBreaks(saved, x) {
  const whole = oneLine(saved);
  let at = 0;
  let out = "";
  for (const run of x.trim().split(/(\s+)/)) {
    if (/^\s+$/.test(run)) {
      if (whole[at] !== " ") return saved;
      at += 1;
      out += run;
    } else if (whole.startsWith(run, at)) {
      at += run.length;
      out += run;
    } else {
      // X cut mid-word: the last run may be a prefix of the saved word.
      return run !== "" && whole.startsWith(run.slice(0, -1), at) ? out + whole.slice(at) : saved;
    }
  }
  return out + whole.slice(at);
}

/**
 * The saved text or X's. X's `text` stops at 280 characters on a long post and
 * is a stub on an Article, so the saved copy wins there and wherever it is
 * longer, with X's paragraph breaks restored over the start (`withBreaks`).
 * X's wins otherwise: same words, and it kept the breaks.
 * @param {string | undefined} saved @param {Tweet} tweet
 */
export function pickText(saved, tweet) {
  if (!saved?.trim()) return tweet.text;
  if (tweet.article) return saved;
  // A saved copy with its own breaks (Firecrawl keeps them since VET-246) is
  // already whole; `withBreaks` would flatten everything past X's 280.
  if (tweet.long || oneLine(saved).length > oneLine(tweet.text).length) {
    return saved.includes("\n") ? saved : withBreaks(saved, tweet.text);
  }
  return tweet.text;
}
