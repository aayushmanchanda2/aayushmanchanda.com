/**
 * The sitemap's `<lastmod>` per page (`astro.config.mjs`), from the dates the
 * pages print: a tool's verdict date, a site's save, a library entry's newest
 * of saved, digested and drafted, a note's date. A section index takes its
 * newest entry, home the newest of all. A page with no date of its own (the
 * footer pages, a filter page, a tip) gets none: an honest blank beats the
 * build time, which said every page changed on every deploy.
 *
 * Plain modules only, because the config imports this outside the build: the
 * notes' dates are read off their frontmatter rather than `astro:content`.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { experiments } from "./experiments";
import { library } from "./library";
import { NOW_UPDATED } from "./now";
import { sites } from "./sites";
import { tools } from "./tools";

const newest = (dates: (string | null | undefined)[]) =>
  dates.filter((date): date is string => Boolean(date)).sort().at(-1);

/** Keyed by path with no trailing slash (`/` for home). */
export function lastmods(): Map<string, string> {
  const dir = path.join(process.cwd(), "src/content/notes");
  const notes = readdirSync(dir)
    .filter((file) => file.endsWith(".md"))
    .map((file) => ({
      path: `/notes/${file.slice(0, -3)}`,
      date: readFileSync(path.join(dir, file), "utf8").match(/^date:\s*["']?(\d{4}-\d{2}-\d{2})/m)?.[1],
    }));

  const entries = [
    ...tools.map((tool) => ({ path: `/tools/${tool.slug}`, date: tool.status_date })),
    ...sites.map((site) => ({ path: `/sites/${site.slug}`, date: site.saved_date })),
    ...library.map((entry) => ({
      path: `/library/${entry.slug}`,
      date: newest([entry.saved_date, entry.digest?.digested, entry.draft?.drafted]),
    })),
    ...notes,
  ];

  const map = new Map<string, string>();
  for (const { path: page, date } of entries) if (date) map.set(page, date);
  for (const section of ["/tools", "/sites", "/library", "/notes"]) {
    const date = newest(entries.filter((entry) => entry.path.startsWith(`${section}/`)).map((entry) => entry.date));
    if (date) map.set(section, date);
  }
  const started = newest(experiments.map((experiment) => experiment.started));
  if (started) map.set("/experiments", started);
  const home = newest([...map.values()]);
  if (home) map.set("/", home);
  map.set("/now", NOW_UPDATED);
  return map;
}
