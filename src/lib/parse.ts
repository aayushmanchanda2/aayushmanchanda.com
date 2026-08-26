/**
 * The shared floor under the three JSON data boundaries.
 *
 * `lib/tools.ts`, `lib/sites.ts` and `lib/experiments.ts` each parse an
 * untrusted file at build time and throw on the first bad entry. Three quarters
 * of that work was the same three quarters in all three files: the slug shape,
 * the date shape, "is this an object", "is this a non-empty string", and the
 * one-line `fail()` that puts the filename in front of the message.
 *
 * Only that floor moved here. Everything each boundary knows that the other two
 * do not — `readUrl` in /tools, `readShots` in /sites, `readLinks` in
 * /experiments — stayed where it is, along with every hand-written error
 * message. The messages are the reason these parsers are worth having: a
 * generic "invalid entry 3" would send a person to the file to guess, and the
 * whole point is that they should not have to. So this file deliberately does
 * not own them.
 *
 * No schema library. A dependency here would have to earn its way into a build
 * that currently pulls in nothing to read four JSON files, and it would trade
 * those messages for its own.
 */

/** URL-safe id: lowercase, digits, single hyphens, no leading or trailing one. */
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Free text folded down to one route segment.
 *
 * Three boundaries mint a filter route out of a value a human typed — a /tools
 * category, a /sites domain, a /reading domain — and each had written this same
 * fold. It lives here rather than in one of them because there is a fourth kind
 * of caller: a row that links to `/reading/domain/<x>` has to spell the segment
 * exactly the way the route answering it does, and importing a whole data
 * boundary to borrow a string function is the wrong direction.
 *
 * `designengineer.tools` becomes `designengineer-tools`. A dot is legal in a
 * path segment but reads as a file extension to a static host, so it is
 * flattened with everything else that is not a letter or a digit.
 *
 * The empty string is a possible answer — a value with no URL-safe characters
 * in it at all — and every caller treats that as a data error rather than
 * minting a route with no name.
 */
export function routeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Shape only. Whether it is a real calendar date is `readDate`'s job. */
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Ends the build with a located message.
 *
 * IMPORTANT: annotate the binding you pull this out into —
 * `const fail: Fail = READ.fail` — or TypeScript will not treat a call to it as
 * the end of control flow, and every `readX` that leans on that will stop
 * compiling. A destructured or property-accessed binding does not qualify.
 */
export type Fail = (where: string, problem: string) => never;

export interface Readers {
  fail: Fail;
  /** A present, non-empty string, or the build stops. */
  readString: (
    entry: Record<string, unknown>,
    key: string,
    where: string,
  ) => string;
  /**
   * A real `YYYY-MM-DD` calendar date under `key`.
   *
   * Round-tripped through `Date` rather than only regex-tested, because
   * `2026-02-31` matches the shape and is not a day.
   */
  readDate: (
    entry: Record<string, unknown>,
    key: string,
    where: string,
  ) => string;
  isRecord: (value: unknown) => value is Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The readers for one data file, with its name already baked into every
 * message it can produce.
 *
 * @param filename Bare name under `src/data`, e.g. `"tools.json"`.
 */
export function readers(filename: string): Readers {
  const fail: Fail = (where, problem) => {
    throw new Error(`src/data/${filename}: ${where} ${problem}`);
  };

  const readString = (
    entry: Record<string, unknown>,
    key: string,
    where: string,
  ): string => {
    const value = entry[key];
    if (typeof value !== "string" || value.trim() === "") {
      fail(where, `needs a non-empty string "${key}" (got ${JSON.stringify(value)})`);
    }
    return value;
  };

  const readDate = (
    entry: Record<string, unknown>,
    key: string,
    where: string,
  ): string => {
    const value = readString(entry, key, where);
    const time = Date.parse(`${value}T00:00:00Z`);
    const isRealDate =
      ISO_DATE.test(value) &&
      !Number.isNaN(time) &&
      new Date(time).toISOString().slice(0, 10) === value;

    if (!isRealDate) {
      fail(where, `needs "${key}" as a real YYYY-MM-DD date (got ${JSON.stringify(value)})`);
    }
    return value;
  };

  return { fail, readString, readDate, isRecord };
}
