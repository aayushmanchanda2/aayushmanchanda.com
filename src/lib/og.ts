/**
 * The share cards (VET-281): one 1200x630 stamp per section index, tool, site,
 * library entry, note, tip, /about and /experiments, drawn by `lib/og-render.ts`
 * and served from `pages/og/[...card].jpg.ts` at `/og/<page>.jpg`.
 *
 * This module is the list, and nothing but data: `layouts/Base.astro` reads it
 * on every page (including the on-demand /me ones), so it touches no browser
 * and no file beyond `lib/assets.ts`'s listing. A page with no card of its own
 * (a filter page) gets its section's; everything else gets `/og.png`.
 */
import { getCollection } from "astro:content";

import { assetFor } from "./assets";
import { library } from "./library";
import { monogram } from "./post";
import { CATALOGUE, SECTION_HREFS, type SectionHref } from "./sections";
import { sites } from "./sites";
import { tools } from "./tools";

export interface OgCard {
  /** The page this card is for, e.g. `/tools/agent-browser`. */
  page: string;
  /** The mat colour: `data-section` on the card's `<html>`. */
  section: string;
  title: string;
  /** One line under the title. */
  line: string | null;
  /** The stamp's denomination, bottom right. */
  label: string;
  /** ISO day struck in the postmark, or none. */
  date: string | null;
  /** A `public/` path shown framed beside the text: a preview or a screenshot. */
  picture: string | null;
  /** A tool's own icon (`public/icons`), else its initial in `letter`. */
  logo: string | null;
  letter: string | null;
}

export interface OgImage {
  src: string;
  alt: string;
  width: number;
  height: number;
}

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

/** The one static card (`npm run og`): home, the footer pages, the 404. */
export const SITE_CARD: OgImage = {
  src: "/og.png",
  alt: "Aayush Manchanda: tools, sites, library, notes, experiments",
  width: OG_WIDTH,
  height: OG_HEIGHT,
};

/** `/tools/agent-browser` → `/og/tools/agent-browser.jpg`. */
export const cardPath = (page: string) => `/og${page}.jpg`;

/** The words on the card, which is what its alt text has to say. */
export const cardAlt = (card: OgCard) => (card.line ? `${card.title}: ${card.line}` : card.title);

const name = (href: SectionHref) => CATALOGUE[href].name;

let memo: Promise<OgCard[]> | undefined;

/** Every card, built once per build. */
export function ogCards(): Promise<OgCard[]> {
  return (memo ??= build());
}

async function build(): Promise<OgCard[]> {
  const base = { date: null, picture: null, logo: null, letter: null };
  const [notes, tips] = await Promise.all([getCollection("notes"), getCollection("computer")]);

  const indexes: OgCard[] = SECTION_HREFS.map((href) => ({
    ...base,
    page: href,
    section: href.slice(1),
    title: name(href),
    line: CATALOGUE[href].blurb,
    label: "Aayush Manchanda",
  }));

  const about: OgCard = {
    ...base,
    page: "/about",
    section: "other",
    title: "Aayush Manchanda",
    line: "Runs Vetted, co-founded Orbis, and builds things with AI.",
    label: "About",
  };

  return [
    ...indexes,
    about,
    ...tools.map((tool) => {
      const logo = assetFor("icons", tool.slug);
      return {
        page: `/tools/${tool.slug}`,
        section: "tools",
        title: tool.name,
        line: tool.description ?? tool.note,
        label: name("/tools"),
        date: tool.status_date,
        picture: assetFor("previews", tool.slug),
        logo,
        letter: logo ? null : monogram(tool.name),
      };
    }),
    ...sites.map((site) => ({
      ...base,
      page: `/sites/${site.slug}`,
      section: "sites",
      title: site.title,
      line: site.domain,
      label: name("/sites"),
      date: site.saved_date,
      picture: site.shot,
    })),
    ...library.map((entry) => ({
      ...base,
      page: `/library/${entry.slug}`,
      section: "library",
      title: entry.title,
      line: entry.domain,
      label: `${name("/library")} · ${entry.kind}`,
      date: entry.saved_date,
      picture: entry.kind === "video" ? (entry.video?.thumb ?? null) : entry.kind === "article" ? assetFor("previews/library", entry.slug) : null,
    })),
    ...notes.map((note) => ({
      ...base,
      page: `/notes/${note.id}`,
      section: "notes",
      title: note.data.title,
      line: null,
      label: name("/notes"),
      date: note.data.date.toISOString().slice(0, 10),
    })),
    ...tips.map((tip) => ({
      ...base,
      page: `/notes/${tip.id}`,
      section: "notes",
      title: tip.data.title,
      line: tip.data.summary,
      label: `${name("/notes")} · tip`,
    })),
  ];
}

/**
 * The card a page shares: its own, else its section's (a filter page), else
 * the site card. `page` is normalised (no trailing slash).
 */
export async function ogImageFor(page: string): Promise<OgImage> {
  const cards = await ogCards();
  const card =
    cards.find((c) => c.page === page) ??
    cards.find((c) => c.page !== "/about" && page.startsWith(`${c.page}/`) && !c.page.slice(1).includes("/"));
  return card ? { src: cardPath(card.page), alt: cardAlt(card), width: OG_WIDTH, height: OG_HEIGHT } : SITE_CARD;
}
