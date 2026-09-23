/**
 * post.mjs — an x.com post, read from X's syndication endpoint and copied here.
 *
 * react-tweet's endpoint and token, no auth. It gives the author, avatar,
 * photos, video, quoted post and an Article's title and cover; not a long
 * post's full text or an Article's body, so the saved (Firecrawl) text wins
 * there. Everything a card shows is copied into `public/posts/<id>/` once, so
 * a reader's browser never asks X for anything.
 */

import { access } from "node:fs/promises";
import path from "node:path";

import { fetchWebp } from "./thumb.mjs";
import { isRecord, writeAtomic } from "./util.mjs";

/** @typedef {import("./types.js").Post} Post */
/** @typedef {typeof globalThis.fetch} Fetch */

const SYNDICATION = "https://cdn.syndication.twimg.com/tweet-result";

/** react-tweet's feature flags, verbatim. The endpoint answers without them, but differently. */
const FEATURES =
  "tfw_timeline_list:;tfw_follower_count_sunset:true;tfw_tweet_edit_backend:on;tfw_refsrc_session:on;" +
  "tfw_fosnr_soft_interventions_enabled:on;tfw_show_birdwatch_pivots_enabled:on;tfw_show_business_verified_badge:on;" +
  "tfw_duplicate_scribes_to_settings:on;tfw_use_profile_image_shape_enabled:on;tfw_show_blue_verified_badge:on;" +
  "tfw_legacy_timeline_sunset:true;tfw_show_gov_verified_badge:on;tfw_show_business_affiliate_badge:on;" +
  "tfw_tweet_edit_frontend:on";

/** Over this a video is kept as its poster. 26 posts at 720p came to 155MB, in git. */
export const VIDEO_MAX_BYTES = 4 * 1024 * 1024;

const AVATAR_WIDTH = 96;
const PICTURE_WIDTH = 1200;

/** The id in `x.com/<handle>/status/<id>`, or null for a profile. @param {string} url @returns {string | null} */
export function postId(url) {
  return /\/status(?:es)?\/(\d{5,25})\b/.exec(url)?.[1] ?? null;
}

/** react-tweet's token formula. @param {string} id @returns {string} */
export function tokenFor(id) {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
}

/**
 * The raw tweet record, or null when X says the post is gone (404, a
 * tombstone, or a body with no author). Anything else that is not a 200 throws.
 *
 * @param {string} id @param {typeof globalThis.fetch} [fetch]
 * @returns {Promise<Record<string, any> | null>}
 */
export async function fetchSyndication(id, fetch = globalThis.fetch) {
  const url = new URL(SYNDICATION);
  url.searchParams.set("id", id);
  url.searchParams.set("lang", "en");
  url.searchParams.set("features", FEATURES);
  url.searchParams.set("token", tokenFor(id));

  const response = await fetch(url.toString(), { signal: AbortSignal.timeout(20_000) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`syndication returned HTTP ${response.status} for ${id}`);

  const body = await response.json().catch(() => null);
  if (!isRecord(body) || body["__typename"] === "TweetTombstone" || !isRecord(body["user"])) {
    return null;
  }
  return body;
}

/** X escapes these three in `text`; `&amp;` last. @param {string} text @returns {string} */
function decode(text) {
  return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

/** mp4s at or under 720p, largest first. @param {Record<string, any>} detail @returns {string[]} */
function videoSources(detail) {
  /** @type {{ content_type?: string, url?: string, bitrate?: number }[]} */
  const variants = detail["video_info"]?.variants ?? [];
  return variants
    .filter((v) => v.content_type === "video/mp4" && typeof v.url === "string")
    .filter((v) => {
      const size = /\/(\d+)x(\d+)\//.exec(String(v.url));
      return size === null || Math.min(Number(size[1]), Number(size[2])) <= 720;
    })
    .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))
    .map((v) => String(v.url));
}

/**
 * @typedef {{ id: string, author: string, handle: string, date: string, text: string,
 *   links: { text: string, href: string }[], avatar: string | null,
 *   media: { type: "photo" | "video", photo: string, sources: string[], w: number, h: number }[],
 *   quoted: Tweet | null, article: { title: string, cover: string | null } | null, long: boolean }} Tweet
 */

/**
 * The tweet record as remote URLs and plain fields, before anything is fetched.
 *
 * @param {Record<string, any>} tweet
 * @returns {Tweet}
 */
export function readTweet(tweet) {
  const user = tweet.user;
  const details = Array.isArray(tweet.mediaDetails) ? tweet.mediaDetails : [];

  let text = decode(String(tweet.text ?? ""));
  /** @type {{ text: string, href: string }[]} */
  const links = [];
  for (const entity of tweet.entities?.urls ?? []) {
    text = text.replaceAll(entity.url, entity.display_url);
    links.push({ text: entity.display_url, href: entity.expanded_url });
  }
  // The shortlink X appends for attached media: the media is on the card.
  for (const detail of details) text = text.replaceAll(detail.url, "");

  const article = isRecord(tweet.article)
    ? {
        title: String(tweet.article.title ?? "").trim(),
        cover: /** @type {any} */ (tweet.article).cover_media?.media_info?.original_img_url ?? null,
      }
    : null;

  return {
    id: String(tweet.id_str),
    author: String(user.name || user.screen_name),
    handle: String(user.screen_name),
    date: String(tweet.created_at).slice(0, 10),
    text: text.trim(),
    links,
    avatar: String(user.profile_image_url_https ?? "").replace("_normal.", "_200x200.") || null,
    media: details.map((/** @type {Record<string, any>} */ detail) => ({
      type: detail.type === "photo" ? "photo" : "video",
      photo: `${String(detail.media_url_https).replace(/\.\w+$/, "")}?format=jpg&name=large`,
      sources: videoSources(detail),
      w: Number(detail.original_info?.width ?? 0),
      h: Number(detail.original_info?.height ?? 0),
    })),
    quoted: isRecord(tweet.quoted_tweet) && isRecord(tweet.quoted_tweet.user) ? readTweet(tweet.quoted_tweet) : null,
    article,
    long: tweet.note_tweet !== undefined || article !== null,
  };
}

/** @param {string} file */
async function exists(file) {
  return access(file).then(() => true, () => false);
}

/**
 * A webp copy under `public/posts/<id>/`, fetched once. Returns the web path.
 * @param {string} url @param {string} id @param {string} name @param {number} width
 * @param {string} publicDir @param {Fetch} fetch @returns {Promise<string>}
 */
async function picture(url, id, name, width, publicDir, fetch) {
  const web = `/posts/${id}/${name}.webp`;
  const file = path.join(publicDir, web);
  if (!(await exists(file))) await writeAtomic(file, await fetchWebp(url, width, fetch));
  return web;
}

/**
 * The first source that fits `VIDEO_MAX_BYTES`, or null for poster-only.
 * @param {string[]} sources @param {string} id @param {string} name
 * @param {string} publicDir @param {Fetch} fetch @returns {Promise<string | null>}
 */
async function video(sources, id, name, publicDir, fetch) {
  const web = `/posts/${id}/${name}.mp4`;
  const file = path.join(publicDir, web);
  if (await exists(file)) return web;
  for (const url of sources) {
    const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    // A 503 here is common and passing: try the next size; a later run retries.
    if (!response.ok || Number(response.headers.get("content-length")) > VIDEO_MAX_BYTES) {
      await response.body?.cancel();
      continue;
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > VIDEO_MAX_BYTES) continue;
    await writeAtomic(file, bytes);
    return web;
  }
  return null;
}

/**
 * The tweet with every picture and video copied into `public/`, in the shape
 * `library.json` stores. Empty fields are left out, not written as `[]`.
 * @param {Tweet} tweet @param {string} publicDir @param {Fetch} fetch
 * @returns {Promise<Post>}
 */
async function localise(tweet, publicDir, fetch) {
  const { id } = tweet;
  const avatar = tweet.avatar && (await picture(tweet.avatar, id, "avatar", AVATAR_WIDTH, publicDir, fetch));

  /** @type {NonNullable<Post["media"]>} */
  const media = [];
  for (const [index, item] of tweet.media.slice(0, 4).entries()) {
    const n = String(index + 1);
    if (item.type === "photo") {
      media.push({ type: "photo", src: await picture(item.photo, id, n, PICTURE_WIDTH, publicDir, fetch), w: item.w, h: item.h });
      continue;
    }
    const poster = await picture(item.photo, id, `${n}-poster`, PICTURE_WIDTH, publicDir, fetch);
    const src = await video(item.sources, id, n, publicDir, fetch);
    media.push({ type: "video", ...(src ? { src } : {}), poster, w: item.w, h: item.h });
  }

  const cover = tweet.article?.cover;
  const article = tweet.article && {
    title: tweet.article.title,
    ...(cover ? { cover: await picture(cover, id, "cover", PICTURE_WIDTH, publicDir, fetch) } : {}),
  };

  return {
    id,
    author: tweet.author,
    handle: tweet.handle,
    date: tweet.date,
    text: tweet.text,
    ...(avatar ? { avatar } : {}),
    ...(tweet.links.length > 0 ? { links: tweet.links } : {}),
    ...(media.length > 0 ? { media } : {}),
    ...(tweet.quoted ? { quoted: await localise(tweet.quoted, publicDir, fetch) } : {}),
    ...(article ? { article } : {}),
  };
}

const flat = (/** @type {string} */ text) => text.replace(/\s+/g, " ").trim();

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
  const whole = flat(saved);
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
  if (tweet.long || flat(saved).length > flat(tweet.text).length) return withBreaks(saved, tweet.text);
  return tweet.text;
}

/**
 * The post a `post` entry should store, from its URL and what it was saved with.
 *
 * - No status id (a profile link): the saved post, unchanged.
 * - Gone on X: the saved copy marked `removed`, or null when there is none.
 * - Otherwise: X's record, localised, with the text `pickText` chose.
 *
 * Network and CDN failures throw; the caller decides whether that is fatal.
 * @param {{ url: string, saved: Post | null, publicDir: string, fetch?: Fetch }} input
 * @returns {Promise<Post | null>}
 */
export async function postFrom({ url, saved, publicDir, fetch = globalThis.fetch }) {
  const id = postId(url);
  if (id === null) return saved;

  const raw = await fetchSyndication(id, fetch);
  if (raw === null) {
    if (saved === null) return null;
    const { media: _legacy, ...rest } = saved;
    return { ...rest, id, removed: true };
  }

  const tweet = readTweet(raw);
  const post = await localise(tweet, publicDir, fetch);
  return { ...post, text: pickText(saved?.text, tweet) };
}
