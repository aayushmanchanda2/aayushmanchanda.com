// @ts-nocheck: a one-off evidence script, not site code.
// A publish run with a fake Raindrop and the REAL capturePreview: a new tool lands its preview.
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { NESTED, TOOLS_ID, bookmark, deps, makeRepo, raindropServer, recorder } from "../../../pipeline/fixtures.mjs";
import { run } from "../../../pipeline/publish.mjs";
import { capturePreview } from "../../../pipeline/preview.mjs";
const after = [];
const { paths } = await makeRepo({ after: (fn) => after.push(fn) });
const server = raindropServer({ ...NESTED, raindrops: { [TOOLS_ID]: [bookmark(301, "https://linear.app", { title: "Linear" })] } });
const out = recorder();
const code = await run([], { ...deps({ paths, server, out }), capturePreview });
const file = path.join(paths.previewsDir, "linear.webp");
const meta = await sharp(await readFile(file)).metadata();
console.log(out.out.filter((l) => /preview|published/.test(l)).join("\n"));
console.log({ code, file: path.basename(file), format: meta.format, width: meta.width, height: meta.height, bytes: meta.size });
for (const fn of after) await fn();
