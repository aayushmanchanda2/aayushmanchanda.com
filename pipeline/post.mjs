/**
 * post.mjs — an x.com post, read from X's syndication endpoint and copied here.
 *
 * react-tweet's endpoint and token, no auth. It gives the author, avatar,
 * photos, video, quoted post and an Article's title and cover; not a long
 * post's full text or an Article's body, so the saved (Firecrawl) text wins
 * there. Everything a card shows is copied into `public/posts/<id>/` once, so
 * a reader's browser never asks X for anything.
 */

import path from "node:path";

import { pickText } from "./post-text.mjs";
import { fetchWebp } from "./thumb.mjs";
import { describe, exists, isRecord, readCapped, writeAtomic } from "./util.mjs";

/** @typedef {import("./types.js").Post} Post */
/** @typedef {typeof globalThis.fetch} Fetch */

export { pickText };

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
 * The raw tweet record, or null when X says the post is gone: a 404 or a
 * `TweetTombstone`. Anything else that is not a tweet with an author throws,
 * a 200 that is not JSON included, so a bad minute at X never reads as removed.
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

  const body = await response.json().catch(() => {
    throw new Error(`syndication answered ${id} with something that is not JSON`);
  });
  if (isRecord(body) && body["__typename"] === "TweetTombstone") return null;
  if (!isRecord(body) || !isRecord(body["user"])) throw new Error(`syndication answered ${id} with no tweet in it`);
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

const NUMERIC = /^\d+$/;

/** @param {Record<string, any>} entity */
const wellFormed = (entity) =>
  isRecord(entity) && ["url", "display_url", "expanded_url"].every((key) => typeof entity[key] === "string");

/**
 * The tweet record as remote URLs and plain fields, before anything is fetched.
 * Throws on an id that is not X's numeric one; a quote with one is dropped, and
 * a quote's own quote is never read (X nests one deep, and so does `library.ts`).
 *
 * @param {Record<string, any>} tweet
 * @param {boolean} [quoting]  True while reading the quoted post.
 * @returns {Tweet}
 */
export function readTweet(tweet, quoting = false) {
  if (!NUMERIC.test(String(tweet.id_str))) throw new Error(`syndication id_str is not numeric (${JSON.stringify(tweet.id_str)})`);
  const user = tweet.user;
  const details = Array.isArray(tweet.mediaDetails) ? tweet.mediaDetails : [];

  let text = decode(String(tweet.text ?? ""));
  /** @type {{ text: string, href: string }[]} */
  const links = [];
  for (const entity of (tweet.entities?.urls ?? []).filter(wellFormed)) {
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
    quoted:
      !quoting && isRecord(tweet.quoted_tweet) && isRecord(tweet.quoted_tweet.user) && NUMERIC.test(String(tweet.quoted_tweet.id_str))
        ? readTweet(tweet.quoted_tweet, true)
        : null,
    article,
    long: tweet.note_tweet !== undefined || article !== null,
  };
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
    if (!response.ok) {
      await response.body?.cancel();
      continue;
    }
    const bytes = await readCapped(response, VIDEO_MAX_BYTES);
    if (bytes === null) continue;
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
  // One picture that will not fetch costs that picture, never the post. It
  // gets a second try and a log line: a single silent miss left the Waterloo
  // post without its avatar for good (VET-284), and nothing retries later.
  const tryPicture = async (/** @type {string} */ url, /** @type {string} */ name) => {
    const get = () => picture(url, id, name, name === "avatar" ? AVATAR_WIDTH : PICTURE_WIDTH, publicDir, fetch);
    try {
      return await get().catch(get);
    } catch (error) {
      console.warn(`warn: post ${id} kept no ${name} — ${describe(error)}`);
      return null;
    }
  };
  const avatar = tweet.avatar && (await tryPicture(tweet.avatar, "avatar"));

  /** @type {NonNullable<Post["media"]>} */
  const media = [];
  for (const [index, item] of tweet.media.slice(0, 4).entries()) {
    // `library.ts` refuses a picture with no size, so one is dropped here.
    if (!(item.w > 0 && item.h > 0)) continue;
    const n = String(index + 1);
    if (item.type === "photo") {
      const src = await tryPicture(item.photo, n);
      if (src) media.push({ type: "photo", src, w: item.w, h: item.h });
      continue;
    }
    const poster = await tryPicture(item.photo, `${n}-poster`);
    if (!poster) continue;
    const src = await video(item.sources, id, n, publicDir, fetch).catch(() => null);
    media.push({ type: "video", ...(src ? { src } : {}), poster, w: item.w, h: item.h });
  }

  const cover = tweet.article?.cover && (await tryPicture(tweet.article.cover, "cover"));
  const article = tweet.article && { title: tweet.article.title, ...(cover ? { cover } : {}) };

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
