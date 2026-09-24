/**
 * `/og/<page>.jpg`: every share card in `lib/og.ts`, one static file each.
 *
 * Cached by content hash in `og-cache/` (committed): the card's data, the
 * bytes of any picture on it, and the template files. A build draws only the
 * cards whose hash is new (`lib/og-render.ts`), so a warm build starts no
 * browser, and a machine with no browser (Vercel) builds from the cache. The
 * publish workflow builds with Chromium and commits `og-cache/` after it, so a
 * new entry's card lands with the entry. A card still missing where no browser
 * can start ships the site card (`/og.png`, re-encoded) and says so in the log.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { APIRoute, GetStaticPaths, InferGetStaticPropsType } from "astro";

import { ogCards } from "../../lib/og";
import { TEMPLATE_FILES, renderCards } from "../../lib/og-render";

const CACHE = path.join(process.cwd(), "og-cache");

const sha = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const fileHash = (file: string) => sha(readFileSync(path.join(process.cwd(), file)));

export const getStaticPaths = (async () => {
  const template = sha(TEMPLATE_FILES.map(fileHash).join());
  const cards = (await ogCards()).map((card) => {
    const pictures = [card.picture, card.logo].filter((p): p is string => p !== null).map((p) => fileHash(`public${p}`));
    return { card, file: path.join(CACHE, `${sha(JSON.stringify([card, pictures, template])).slice(0, 20)}.jpg`) };
  });

  mkdirSync(CACHE, { recursive: true });
  const missing = cards.filter((entry) => !existsSync(entry.file));
  if (missing.length > 0) {
    const started = Date.now();
    try {
      await renderCards(missing.map(({ card, file }) => ({ card, save: (jpeg) => writeFileSync(file, jpeg) })));
      console.log(`[og] drew ${missing.length} card(s) in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    } catch (error) {
      console.warn(`[og] ${missing.length} card(s) not in og-cache and no browser to draw them; they share /og.png until a build with Chromium runs.`, (error as Error).message.split("\n")[0]);
    }
  }

  // Drop cards no page uses any more, so the cache is exactly the site's cards.
  const live = new Set(cards.map((entry) => path.basename(entry.file)));
  for (const name of readdirSync(CACHE)) if (name.endsWith(".jpg") && !live.has(name)) unlinkSync(path.join(CACHE, name));

  return cards.map(({ card, file }) => ({ params: { card: card.page.slice(1) }, props: { file } }));
}) satisfies GetStaticPaths;

type Props = InferGetStaticPropsType<typeof getStaticPaths>;

let fallback: Promise<Buffer> | undefined;

export const GET: APIRoute<Props> = async ({ props }) => {
  const body = existsSync(props.file)
    ? readFileSync(props.file)
    : await (fallback ??= import("sharp").then(({ default: sharp }) => sharp(path.join(process.cwd(), "public/og.png")).jpeg({ quality: 86 }).toBuffer()));
  return new Response(new Uint8Array(body), { headers: { "Content-Type": "image/jpeg" } });
};
