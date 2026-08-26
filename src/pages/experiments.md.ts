/**
 * /experiments.md — what is running and what stopped, for an agent that asked
 * for markdown.
 *
 * Rows come from `lib/experiments.ts` in the order that boundary already sorted
 * them: live work first, dead work last, newest first inside each band. The
 * one-liner is Aayush's sentence with nothing done to it but table escaping.
 *
 * This is the one section that is allowed to be empty, so the table is only
 * rendered when there is something to put in it.
 */
import type { APIRoute } from "astro";

import type { Status } from "../lib/experiments";
import { STATUSES, experiments } from "../lib/experiments";
import { absolutize } from "../lib/links";
import {
  PAGES,
  list,
  markdownDocument,
  section,
  table,
  newest,
} from "../lib/markdown";

/**
 * What the four words mean. Keyed by `Status`, so adding a fifth one fails the
 * build here rather than shipping an unexplained column value.
 */
const MEANING: Record<Status, string> = {
  running: "Going right now.",
  paused: "Stopped for the moment, not abandoned.",
  shipped: "Finished and out.",
  killed: "Stopped for good. Still listed rather than deleted.",
};

/** An experiment links at the section it produced, or out at something else. */
function links(paths: readonly string[]): string {
  if (paths.length === 0) return "none";
  return paths.map(absolutize).join(" ");
}

export const GET: APIRoute = () => {
  const rows = experiments.map((experiment) => [
    experiment.name,
    experiment.status,
    experiment.started,
    experiment.one_liner,
    links(experiment.links),
  ]);

  return markdownDocument({
    page: PAGES.experiments,
    title: "Experiments",
    description:
      "What Aayush Manchanda is running right now, with a status and a start date on each one. The dead ones stay listed.",
    updated: newest(experiments.map((experiment) => experiment.started)),
    blocks: [
      rows.length === 0
        ? "Nothing is listed right now."
        : table(["Experiment", "Status", "Started", "One-liner", "Links"], rows),
      section(
        "Statuses",
        list(STATUSES.map((status) => `\`${status}\`: ${MEANING[status]}`)),
        "Rows are ordered live work first and dead work last, newest first inside each band.",
      ),
    ],
  });
};
