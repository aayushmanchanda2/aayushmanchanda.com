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

const MONTH = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

/** "2026-09-22" -> "September 2026": the /library pane's month headers. */
export function formatMonth(iso: string): string {
  return MONTH.format(new Date(`${iso.slice(0, 7)}-01T00:00:00Z`));
}

/** A `Date` as its ISO calendar day, "2026-09-22", in UTC. */
export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** "2026-09-22" -> "Tue, 22 Sep 2026 00:00:00 GMT", the RFC 822 form RSS wants. */
export function rfc822(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toUTCString();
}
