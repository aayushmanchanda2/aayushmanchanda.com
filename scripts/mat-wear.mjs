/**
 * mat-wear.mjs — the mat's wear patches (`styles/frame.css › --age`), rendered
 * once to `public/mat-wear.webp` and tiled, instead of a 1440×900 SVG filter
 * stretched over the window and rasterised by every browser on load (QA phase 2,
 * B10). Same recipe as the SVG it replaced: one low-frequency fractal noise, its
 * red channel as white wear and its green as dark wear. `stitchTiles` makes the
 * tile seamless. Rendered at half size; the noise is smooth enough to scale.
 *
 * Run by hand (`node scripts/mat-wear.mjs`) and commit the file.
 */
import sharp from "sharp";
import { fileURLToPath } from "node:url";

/** Rendered edge in px; `frame.css` shows it at twice this. */
const EDGE = 240;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${EDGE}" height="${EDGE}">
<filter id="w" x="0" y="0" width="1" height="1">
<feTurbulence type="fractalNoise" baseFrequency=".0136 .02" numOctaves="3" seed="4" stitchTiles="stitch" result="n"/>
<feColorMatrix in="n" result="a" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 1.1 0 0 0 -.6"/>
<feColorMatrix in="n" result="b" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1.3 0 0 -.68"/>
<feMerge><feMergeNode in="a"/><feMergeNode in="b"/></feMerge>
</filter>
<rect width="${EDGE}" height="${EDGE}" filter="url(#w)"/>
</svg>`;

const out = fileURLToPath(new URL("../public/mat-wear.webp", import.meta.url));
const info = await sharp(Buffer.from(svg)).webp({ quality: 80, alphaQuality: 80, effort: 6 }).toFile(out);
console.log(`${out}: ${info.width}x${info.height}, ${info.size} bytes`);
