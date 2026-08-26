/**
 * The /notes data boundary.
 *
 * Same job as `lib/tools.ts` and `lib/experiments.ts`, done by the tool that
 * already exists for it: Astro's content layer parses every markdown file
 * against the schema below at build time, and a note that does not fit fails
 * `astro build` rather than rendering half a page.
 *
 * The schema is a discriminated union rather than one object with optional
 * fields, because the two note types are genuinely different documents. A
 * musing is prose. A scratch is a picture with a line under it, so its image
 * is not optional and the template gets to know that without a cast.
 */

import { existsSync } from "node:fs";
import path from "node:path";

import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

// The same two link shapes every other section checks against, from the module
// that owns them.
import { EXTERNAL_URL, INTERNAL_PATH } from "./lib/links";

/** Web paths under `public/notes`. Kept narrow so a note cannot link out. */
const IMAGE_PATH = /^\/notes\/[a-z0-9][a-z0-9-]*\.(webp|png|jpe?g|svg)$/;

/**
 * A scratch note is mostly its image, and an image that 404s is worse than no
 * note at all: the page renders, the caption reads fine, and nothing looks
 * broken until you notice the empty box. So the file has to be on disk now.
 *
 * Anchored to the working directory, like the shot guard in `lib/sites.ts`,
 * because Astro runs from the project root in both dev and build.
 */
const image = z
  .string()
  .regex(IMAGE_PATH, "must be a /notes/<name>.<webp|png|jpg|svg> path")
  .refine((value) => existsSync(path.join(process.cwd(), "public", value)), {
    message: "points at a file that is missing from public/notes",
  });

/** Every note carries these, whatever kind of note it is. */
const common = {
  title: z.string().min(1),
  date: z.coerce.date(),
  /**
   * A short "see also" row under the note. The body links to whatever it wants
   * with plain markdown; this is the deliberate list, so it is checked. A bare
   * `tools` would resolve against the current page rather than the site root,
   * so it is rejected instead of guessed at.
   */
  links: z
    .array(
      z
        .string()
        .refine(
          (value) => INTERNAL_PATH.test(value) || EXTERNAL_URL.test(value),
          { message: "must be a site path (/tools) or an http(s) URL" },
        ),
    )
    .optional(),
};

const notes = defineCollection({
  loader: glob({ base: "./src/content/notes", pattern: "**/*.md" }),
  schema: z.discriminatedUnion("type", [
    z.object({ type: z.literal("musing"), image: image.optional(), ...common }),
    z.object({ type: z.literal("scratch"), image, ...common }),
  ]),
});

export const collections = { notes };
