/**
 * "2026-08-13" -> "Aug 13, 2026", the one way this site prints a day.
 *
 * Every date in the content is an ISO calendar string, and that string stays
 * the `<time datetime>` value; this is only the words a reader sees. UTC on
 * both ends, so the build machine's zone can never move the day.
 */
const DAY = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export function formatDay(iso: string): string {
  return DAY.format(new Date(`${iso}T00:00:00Z`));
}
