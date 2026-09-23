/**
 * post-schema.ts — the `post` object on a /library entry, parsed (QA phase 2,
 * B15: split out of `library.ts`, which had grown past 900 lines). The shape
 * `pipeline/post.mjs` writes: X's syndication record for the author, avatar,
 * media, quoted post and Article header, with every picture a committed copy.
 *
 * Also the two readers `library.ts` shares with it: `readCommittedPath`, the
 * one rule for a picture's path, and `readList`.
 */
import type { Fail } from "./parse.ts";
import { readers } from "./parse.ts";

export const READ = readers("library.json");
/** Annotated, or TypeScript stops treating a call as the end of control flow. */
export const fail: Fail = READ.fail;
const { readString, readDate, readOptional, isRecord } = READ;

/** A picture or a video attached to a post, copied under `/posts/<id>/`. */
export interface PostMedia {
  type: "photo" | "video";
  /** The webp for a photo, the mp4 for a video. Null on a video too big to keep: poster only. */
  src: string | null;
  /** A video's still. Null on a photo. */
  poster: string | null;
  /** Source pixels, so the box is reserved before the file arrives. */
  w: number;
  h: number;
}

/** A link in the post, as X displays it and where it goes. */
export interface PostLink {
  text: string;
  href: string;
}

/**
 * An x.com post, as `pipeline/post.mjs` stored it: X's syndication record for
 * the author, avatar, media, quoted post and Article header, and the fullest
 * text anyone has read (the Firecrawl copy on a long post).
 *
 * Every picture is a path under `/posts/`. A remote URL is refused rather than
 * stored, which is `/privacy` made structural: a page that renders this cannot
 * reach X's CDN, because there is no shape it could hold that would let it.
 */
export interface Post {
  /** X's numeric id, as a string. Null for a post read before syndication was. */
  id: string | null;
  /** Display name, spelled as the poster spells it. The handle when they have none. */
  author: string;
  /** The @handle, without the @. */
  handle: string;
  /** ISO calendar date (YYYY-MM-DD) the post was POSTED, not saved. */
  date: string;
  /** The post's own words, whole. Paragraph breaks where the source kept them. */
  text: string;
  avatar: string | null;
  links: PostLink[];
  media: PostMedia[];
  /** The post this one quotes, or null. Never itself quoting: X nests one deep. */
  quoted: Post | null;
  /** An X Article's header. Its body is not republished here (F3 adds highlights). */
  article: { title: string; cover: string | null } | null;
  /** Gone on X. The saved copy is all there is. */
  removed: boolean;
}

/**
 * A committed file's web path, spelled exactly as its writer spells it, or the
 * build stops.
 *
 * Refusing a remote URL is the whole function. A `https://pbs.twimg.com/…` here
 * would render as an `<img>` pointed at a third party's CDN, which hands every
 * reader of the page to it and breaks a promise `/privacy` makes by name.
 * There is no flag to turn that on: the parser will not carry the value, so no
 * page can render it. `shape` names the spelling in the error.
 */
export function readCommittedPath(value: unknown, field: string, where: string, pattern: RegExp, shape: string): string {
  if (typeof value !== "string" || !pattern.test(value)) {
    fail(where, `needs "${field}" to be ${shape}, never a remote URL (got ${JSON.stringify(value)})`);
  }
  return value;
}

/** A file `pipeline/post.mjs` wrote: `/posts/<id>/<name>.webp` or `.mp4`. */
const POST_FILE = /^\/posts\/\d+\/[a-z0-9-]+\.(?:webp|mp4)$/;

function readPostFile(value: unknown, field: string, where: string): string {
  return readCommittedPath(value, field, where, POST_FILE, "a copy under /posts (`/posts/<id>/<name>.webp`)");
}

/** Absent or null reads as none; a present value is held to `POST_FILE`. */
function readPostFileOrNull(value: unknown, field: string, where: string): string | null {
  return value === undefined || value === null ? null : readPostFile(value, field, where);
}

/** Absent reads as none. Present means a non-empty array, as `readTags` rules (`library.ts`). */
export function readList<T>(
  value: unknown,
  field: string,
  where: string,
  read: (item: unknown, index: number) => T,
): T[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length === 0) {
    fail(where, `needs "${field}" to be a non-empty array, or to leave the key out`);
  }
  return value.map(read);
}

function readMedia(item: unknown, index: number, where: string): PostMedia {
  const field = `post.media[${index}]`;
  if (!isRecord(item)) fail(where, `needs "${field}" to be an object`);
  const { type, w, h } = item;
  if (type !== "photo" && type !== "video") {
    fail(where, `needs "${field}.type" to be photo or video (got ${JSON.stringify(type)})`);
  }
  if (typeof w !== "number" || typeof h !== "number" || !(w > 0 && h > 0 && Number.isFinite(w * h))) {
    fail(where, `needs "${field}.w" and ".h" to be finite numbers above 0`);
  }
  return type === "photo"
    ? { type, src: readPostFile(item["src"], `${field}.src`, where), poster: null, w, h }
    : {
        type,
        src: readPostFileOrNull(item["src"], `${field}.src`, where),
        poster: readPostFile(item["poster"], `${field}.poster`, where),
        w,
        h,
      };
}

/** `quoting` is true inside a quote, which may not quote again: X nests one deep. */
export function readPostObject(value: Record<string, unknown>, where: string, quoting = false): Post {
  const at = `${where} post`;
  const id = readOptional(value, "id", at);
  if (id !== null && !/^\d+$/.test(id)) fail(where, `needs "post.id" to be X's numeric id (got ${JSON.stringify(id)})`);
  const removed = value["removed"] ?? false;
  if (typeof removed !== "boolean") fail(where, `needs "post.removed" to be true, false or absent`);
  const article = value["article"];
  if (article !== undefined && !isRecord(article)) {
    fail(where, `needs "post.article" to be an object or absent`);
  }
  const quoted = value["quoted"];
  if (quoted !== undefined && !isRecord(quoted)) {
    fail(where, `needs "post.quoted" to be an object or absent`);
  }
  if (quoting && quoted !== undefined) fail(where, `has a quoted post that quotes another; X nests one deep`);

  return {
    id,
    author: readString(value, "author", at),
    handle: readString(value, "handle", at),
    date: readDate(value, "date", at),
    text: readString(value, "text", at),
    avatar: readPostFileOrNull(value["avatar"], "post.avatar", where),
    links: readList(value["links"], "post.links", where, (item) => {
      if (!isRecord(item)) fail(where, `needs every "post.links" item to be an object`);
      const href = readString(item, "href", at);
      if (!/^https?:\/\//.test(href)) fail(where, `needs every "post.links" href to be http(s) (got ${JSON.stringify(href)})`);
      return { text: readString(item, "text", at), href };
    }),
    media: readList(value["media"], "post.media", where, (item, index) => readMedia(item, index, where)),
    quoted: quoted === undefined ? null : readPostObject(quoted, `${where} quoted`, true),
    article:
      article === undefined
        ? null
        : {
            title: readString(article, "title", at),
            cover: readPostFileOrNull(article["cover"], "post.article.cover", where),
          },
    removed,
  };
}
