/**
 * plaster.mjs: palette-knife plaster with one small painted figure, in plain Node.
 *
 *   node feature-research/art-plaster/plaster.mjs
 *
 * The method, rebuilt from the /tokens skies (their generator is not in this
 * repo):
 *
 *   1. Every knife stroke lays colour and paint height into two fields. The
 *      knife flattens the middle of a stroke, squeezes a ridge out along both
 *      edges and piles one up where it lifts off, and drags fine streaks along
 *      its length. Later strokes cover earlier ones.
 *   2. A low raking light reads the height field: a normal from the slope, a
 *      lambert term normalised so flat paint is its own colour, a little gloss,
 *      crevice darkening, and shadows marched across the height field so a
 *      ridge shades the plaster behind it.
 *   3. The figure goes on last, small and bright, as low-relief dabs with a
 *      painted shadow, the way paint on a dry ground would sit.
 *   4. The PNG is written by hand (zlib, no image library). `sharp`, already a
 *      dev dependency, only re-encodes that PNG to WebP for the browser.
 *
 * Every scene is drawn twice: plaster by day for the light theme, and the same
 * plaster under moonlight for the dark one, so a white slab never glares out of
 * a black page.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";

/** @typedef {[number, number, number]} RGB */
/** @typedef {{ azimuth: number, elevation: number, colour: RGB, ambient: number, gloss: number }} Light */
/** A band of ground, down to `until` (0 to 1 of the height), mixed from these paints. @typedef {{ until: number, paints: RGB[] }} Field */
/** @typedef {{ fields: Field[], light: Light }} Ground */
/** @typedef {{ name: string, width: number, height: number, seed: number, day: Ground, night?: Ground, figure: (canvas: Canvas) => void }} Scene */

const OUT = path.join(process.cwd(), "public", "lab", "plaster");
const PNG_DIR = path.join(process.cwd(), "feature-research", "art-plaster", "png");

/** @param {number} seed */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** @param {number} e0 @param {number} e1 @param {number} x */
const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Value noise on a lattice, smooth between points. @param {number} seed */
function noise2(seed) {
  const size = 256;
  const r = rng(seed);
  const table = Float32Array.from({ length: size * size }, () => r());
  /** @param {number} x @param {number} y */
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    /** @param {number} i @param {number} j */
    const at = (i, j) => table[(((j % size) + size) % size) * size + (((i % size) + size) % size)] ?? 0;
    const top = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * sx;
    const bottom = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * sx;
    return top + (bottom - top) * sy;
  };
}

class Canvas {
  /** @param {number} width @param {number} height @param {number} seed */
  constructor(width, height, seed) {
    this.width = width;
    this.height = height;
    this.random = rng(seed);
    this.noise = noise2(seed + 1);
    const n = width * height;
    this.h = new Float32Array(n);
    this.r = new Float32Array(n);
    this.g = new Float32Array(n);
    this.b = new Float32Array(n);
    /** Painted shadow, 0 to 1, applied after lighting. */
    this.shade = new Float32Array(n);
    /** 1 where a figure is: lit flatter, so a dab of colour stays its colour. */
    this.figure = new Float32Array(n);
    /**
     * Drawing scale. A sprite is painted at 3x the pixels it shows at, so the
     * browser scales it down and the figure stays sharp; every drawing call
     * below multiplies its coordinates, sizes and paint height by this.
     */
    this.k = 1;
  }

  /**
   * One palette-knife stroke.
   * @param {{ x: number, y: number, angle: number, length: number, width: number, thickness: number, colour: RGB }} s
   */
  knife(s) {
    const { width: W, height: H } = this;
    const ca = Math.cos(s.angle);
    const sa = Math.sin(s.angle);
    const half = s.width / 2;
    const reach = s.length + s.width;
    const x0 = Math.max(0, Math.floor(s.x - reach));
    const x1 = Math.min(W - 1, Math.ceil(s.x + reach));
    const y0 = Math.max(0, Math.floor(s.y - reach));
    const y1 = Math.min(H - 1, Math.ceil(s.y + reach));
    const streakSeed = this.random() * 1000;
    const edgeWobble = this.random() * 1000;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - s.x;
        const dy = y - s.y;
        const u = dx * ca + dy * sa; // along, 0 at the start
        const v = -dx * sa + dy * ca; // across
        if (u < -half || u > s.length + half * 0.6) continue;
        // Ragged edges: the knife's side wanders a little along its length.
        const edge = half * (0.86 + 0.22 * this.noise(u / 38 + edgeWobble, 3.1));
        const across = Math.abs(v) / edge;
        if (across > 1.12) continue;
        // The knife's edge is curved, so the lip it leaves where it lifts is an arc.
        const t = (u + s.width * 0.35 * (v / half) ** 2) / s.length; // 0 at the start, 1 where the knife lifts
        // The start feathers in thin; the end is a hard lip.
        const start = smooth(-0.08, 0.18, t);
        const end = 1 - smooth(0.98, 1.08, t + 0.05 * this.noise(v / 9 + streakSeed, 7));
        const side = 1 - smooth(0.9, 1.08, across);
        // Skips: near the start the knife leaves older paint showing through.
        const skip = smooth(0.25, 0.55, this.noise(u / 14 + streakSeed, v / 6) + t * 0.8);
        const cover = start * end * side * skip;
        if (cover <= 0.002) continue;
        const streak = (this.noise(streakSeed + v / 1.8, u / 260) - 0.5) * 0.14 + (this.noise(v / 7 + 40, u / 120) - 0.5) * 0.16;
        const ridgeSide = Math.exp(-(((across - 0.93) / 0.1) ** 2)) * 0.4;
        const ridgeEnd = Math.exp(-(((t - 0.97) / 0.06) ** 2)) * 0.7 * side;
        const layer = s.thickness * (0.55 + 0.45 * t + streak + ridgeSide + ridgeEnd);
        const i = y * W + x;
        const under = this.h[i] ?? 0;
        // The knife scrapes the old surface part way down, then sits its layer on top.
        const next = under * 0.55 + layer;
        this.h[i] = under + (next - under) * cover;
        const tone = 1 + (this.noise(u / 60 + streakSeed, v / 30) - 0.5) * 0.03;
        this.r[i] = (this.r[i] ?? 0) + ((s.colour[0] * tone) - (this.r[i] ?? 0)) * cover;
        this.g[i] = (this.g[i] ?? 0) + ((s.colour[1] * tone) - (this.g[i] ?? 0)) * cover;
        this.b[i] = (this.b[i] ?? 0) + ((s.colour[2] * tone) - (this.b[i] ?? 0)) * cover;
      }
    }
  }

  /**
   * Fill the canvas with plaster: broad, mostly level knife strokes, then a
   * layer of smaller ones, so the ground reads as drifts rather than stripes.
   * Fields stack top to bottom; a stroke takes its paint from the field its
   * middle lands in, so bands meet in a ragged, knifed edge.
   * @param {Field[]} fields
   * @param {number} drift radians the strokes lean
   */
  plaster(fields, drift) {
    const { width: W, height: H } = this;
    /** @param {number} y */
    const field = (y) => (fields.find((f) => y / H <= f.until) ?? fields[fields.length - 1])?.paints ?? [[240, 240, 240]];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        // The under-layer's band edge wanders, so no straight seam shows through a skip.
        const base = field(y + 60 * (this.noise(x / 140, 9.5) - 0.5))[0] ?? [240, 240, 240];
        const i = y * W + x;
        this.r[i] = base[0];
        this.g[i] = base[1];
        this.b[i] = base[2];
        this.h[i] = 2;
      }
    }
    const passes = [
      { count: Math.round((W * H) / 6500), length: [240, 520], width: [90, 190], thickness: [2.5, 5] },
      { count: Math.round((W * H) / 26000), length: [90, 220], width: [30, 70], thickness: [1.8, 3.2] },
    ];
    for (const pass of passes) {
      // Shorter strokes need more of them to cover the canvas.
      for (let k = 0; k < pass.count * (fields.length > 1 ? 1.7 : 1); k++) {
        const pick = (/** @type {number[]} */ [a = 0, b = 0]) => a + (b - a) * this.random();
        const x = this.random() * (W + 200) - 100;
        const y = this.random() * (H + 120) - 60;
        // Long strokes reach across a band edge, so a field is chosen from the
        // stroke's middle and the strokes near an edge are kept shorter.
        const paints = field(Math.min(H, Math.max(0, y)));
        const colour = paints[Math.floor(this.random() * paints.length)] ?? [240, 240, 240];
        const flip = this.random() < 0.5 ? 0 : Math.PI;
        this.knife({
          x,
          y,
          angle: flip + drift + (this.random() - 0.5) * 0.55,
          length: pick(pass.length) * (fields.length > 1 ? 0.6 : 1),
          width: pick(pass.width),
          thickness: pick(pass.thickness),
          colour,
        });
      }
    }
  }

  /**
   * A raised dab along a segment, the unit a figure is built from. Distance
   * from the segment gives an anti-aliased edge and a domed top.
   * @param {number} ax @param {number} ay @param {number} bx @param {number} by
   * @param {number} radius @param {RGB} colour @param {number} [relief]
   */
  dab(ax, ay, bx, by, radius, colour, relief = 1.6) {
    const k = this.k;
    [ax, ay, bx, by, radius, relief] = [ax * k, ay * k, bx * k, by * k, radius * k, relief * k];
    const { width: W, height: H } = this;
    const pad = radius + 2;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - pad));
    const x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + pad));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by) - pad));
    const y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + pad));
    const vx = bx - ax;
    const vy = by - ay;
    const len2 = vx * vx + vy * vy || 1;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = Math.min(1, Math.max(0, ((x - ax) * vx + (y - ay) * vy) / len2));
        const d = Math.hypot(x - (ax + vx * t), y - (ay + vy * t));
        const cover = Math.min(1, Math.max(0, radius - d + 0.5));
        if (cover <= 0) continue;
        const i = y * W + x;
        const dome = Math.sqrt(Math.max(0, 1 - (d / (radius + 0.5)) ** 2));
        this.h[i] = Math.max(this.h[i] ?? 0, (this.groundAt(i) ?? 0) + relief * dome * cover);
        this.r[i] = (this.r[i] ?? 0) + (colour[0] - (this.r[i] ?? 0)) * cover;
        this.g[i] = (this.g[i] ?? 0) + (colour[1] - (this.g[i] ?? 0)) * cover;
        this.b[i] = (this.b[i] ?? 0) + (colour[2] - (this.b[i] ?? 0)) * cover;
        this.figure[i] = Math.max(this.figure[i] ?? 0, cover);
      }
    }
  }

  /**
   * A flat painted rectangle (a towel, a sign), rotated, with soft corners.
   * @param {number} cx @param {number} cy @param {number} w @param {number} h @param {number} angle @param {RGB} colour @param {number} [relief]
   */
  rect(cx, cy, w, h, angle, colour, relief = 0.8) {
    const k = this.k;
    [cx, cy, w, h, relief] = [cx * k, cy * k, w * k, h * k, relief * k];
    this.paint(cx, cy, Math.hypot(w, h) / 2 + 2, (x, y) => {
      const u = (x - cx) * Math.cos(angle) + (y - cy) * Math.sin(angle);
      const v = -(x - cx) * Math.sin(angle) + (y - cy) * Math.cos(angle);
      const d = Math.max(Math.abs(u) - w / 2, Math.abs(v) - h / 2);
      return [Math.min(1, Math.max(0, 0.5 - d)), colour, relief];
    });
  }

  /**
   * A disc in alternating panels: an umbrella from above.
   * @param {number} cx @param {number} cy @param {number} r @param {RGB[]} colours @param {number} panels @param {number} [relief]
   */
  disc(cx, cy, r, colours, panels, relief = 2.4) {
    const k = this.k;
    [cx, cy, r, relief] = [cx * k, cy * k, r * k, relief * k];
    this.paint(cx, cy, r + 2, (x, y) => {
      const d = Math.hypot(x - cx, y - cy);
      const k = Math.floor(((Math.atan2(y - cy, x - cx) + Math.PI) / (Math.PI * 2)) * panels);
      const dome = Math.sqrt(Math.max(0, 1 - (d / (r + 0.5)) ** 2));
      return [Math.min(1, Math.max(0, r - d + 0.5)), colours[k % colours.length] ?? [240, 240, 240], relief * dome];
    });
  }

  /**
   * A convex polygon with rounded corners (a coat, a skirt), domed across its
   * width so it catches the light like a dab of paint.
   * @param {number[][]} points corners, clockwise @param {RGB} colour @param {number} [relief] @param {number} [round]
   */
  poly(points, colour, relief = 1.8, round = 0.6) {
    const k = this.k;
    const pts = points.map(([x = 0, y = 0]) => [x * k, y * k]);
    const r = round * k;
    const xs = pts.map((p) => p[0] ?? 0);
    const ys = pts.map((p) => p[1] ?? 0);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const reach = Math.max(Math.max(...xs) - cx, Math.max(...ys) - cy) + r + 2;
    const half = (Math.max(...xs) - Math.min(...xs)) / 2 || 1;
    // Edges as inward half-planes: distance outside is the largest of them.
    const edges = pts.map((p, i) => {
      const q = pts[(i + 1) % pts.length] ?? p;
      const ex = (q[0] ?? 0) - (p[0] ?? 0);
      const ey = (q[1] ?? 0) - (p[1] ?? 0);
      const len = Math.hypot(ex, ey) || 1;
      return { px: p[0] ?? 0, py: p[1] ?? 0, nx: ey / len, ny: -ex / len };
    });
    const rel = relief * k;
    this.paint(cx, cy, reach, (x, y) => {
      let d = -Infinity;
      for (const e of edges) d = Math.max(d, (x - e.px) * e.nx + (y - e.py) * e.ny);
      const cover = Math.min(1, Math.max(0, r - d + 0.5));
      const dome = Math.sqrt(Math.max(0, 1 - ((x - cx) / (half + r)) ** 2));
      return [cover, colour, rel * (0.55 + 0.45 * dome)];
    });
  }

  /**
   * Shared by rect and disc: `shape` gives coverage, colour and relief per pixel.
   * @param {number} cx @param {number} cy @param {number} reach
   * @param {(x: number, y: number) => [number, RGB, number]} shape
   */
  paint(cx, cy, reach, shape) {
    const { width: W, height: H } = this;
    for (let y = Math.max(0, Math.floor(cy - reach)); y <= Math.min(H - 1, Math.ceil(cy + reach)); y++) {
      for (let x = Math.max(0, Math.floor(cx - reach)); x <= Math.min(W - 1, Math.ceil(cx + reach)); x++) {
        const [cover, colour, relief] = shape(x, y);
        if (cover <= 0) continue;
        const i = y * W + x;
        this.h[i] = Math.max(this.h[i] ?? 0, (this.groundAt(i) ?? 0) + relief * cover);
        this.r[i] = (this.r[i] ?? 0) + (colour[0] - (this.r[i] ?? 0)) * cover;
        this.g[i] = (this.g[i] ?? 0) + (colour[1] - (this.g[i] ?? 0)) * cover;
        this.b[i] = (this.b[i] ?? 0) + (colour[2] - (this.b[i] ?? 0)) * cover;
        this.figure[i] = Math.max(this.figure[i] ?? 0, cover);
      }
    }
  }

  /** The plaster height under a figure, frozen before the figure goes on. @param {number} i */
  groundAt(i) {
    return this.ground ? this.ground[i] : this.h[i];
  }

  /** Freeze the plaster's height, so overlapping dabs sit on the ground and not on each other. */
  freeze() {
    this.ground = Float32Array.from(this.h);
  }

  /**
   * A painted shadow: a soft ellipse of darkening, laid where the figure's
   * feet meet the ground and stretched away from the light.
   * @param {number} cx @param {number} cy @param {number} rx @param {number} ry @param {number} strength
   */
  shadow(cx, cy, rx, ry, strength) {
    const k = this.k;
    [cx, cy, rx, ry] = [cx * k, cy * k, rx * k, ry * k];
    const { width: W, height: H } = this;
    for (let y = Math.max(0, Math.floor(cy - ry - 2)); y <= Math.min(H - 1, Math.ceil(cy + ry + 2)); y++) {
      for (let x = Math.max(0, Math.floor(cx - rx - 2)); x <= Math.min(W - 1, Math.ceil(cx + rx + 2)); x++) {
        const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
        const s = (1 - smooth(0.35, 1, d)) * strength;
        const i = y * W + x;
        this.shade[i] = Math.max(this.shade[i] ?? 0, s);
      }
    }
  }

  /**
   * A dent pressed into the plaster: a footprint, a hole.
   * @param {number} cx @param {number} cy @param {number} rx @param {number} ry @param {number} depth @param {number} [angle]
   */
  dent(cx, cy, rx, ry, depth, angle = 0) {
    const k = this.k;
    [cx, cy, rx, ry, depth] = [cx * k, cy * k, rx * k, ry * k, depth * k];
    const { width: W, height: H } = this;
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    const reach = Math.max(rx, ry) + 3;
    for (let y = Math.max(0, Math.floor(cy - reach)); y <= Math.min(H - 1, Math.ceil(cy + reach)); y++) {
      for (let x = Math.max(0, Math.floor(cx - reach)); x <= Math.min(W - 1, Math.ceil(cx + reach)); x++) {
        const u = (x - cx) * ca + (y - cy) * sa;
        const v = -(x - cx) * sa + (y - cy) * ca;
        const d = Math.hypot(u / rx, v / ry);
        if (d > 1.6) continue;
        const i = y * W + x;
        // A pressed dent pushes a small lip up round its rim.
        const bowl = -depth * (1 - smooth(0.2, 1, d));
        const lip = depth * 0.35 * Math.exp(-(((d - 1.1) / 0.18) ** 2));
        this.h[i] = (this.h[i] ?? 0) + bowl + lip;
      }
    }
  }

  /**
   * A mound of the ground's own paint, heaped beside a hole.
   * @param {number} cx @param {number} cy @param {number} rx @param {number} ry @param {number} height
   */
  mound(cx, cy, rx, ry, height) {
    const k = this.k;
    [cx, cy, rx, ry, height] = [cx * k, cy * k, rx * k, ry * k, height * k];
    const { width: W, height: H } = this;
    for (let y = Math.max(0, Math.floor(cy - ry - 2)); y <= Math.min(H - 1, Math.ceil(cy + ry + 2)); y++) {
      for (let x = Math.max(0, Math.floor(cx - rx - 2)); x <= Math.min(W - 1, Math.ceil(cx + rx + 2)); x++) {
        const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
        if (d > 1) continue;
        const lumps = 0.75 + 0.5 * this.noise(x / 3.2, y / 3.2);
        const i = y * W + x;
        this.h[i] = (this.h[i] ?? 0) + height * (1 - d * d) * lumps;
      }
    }
  }

  /**
   * Light the height field and return 8-bit RGB, or, for a sprite, RGBA:
   * a figure keeps its lit colour, and bare ground becomes black or white at
   * the alpha that darkens or lightens whatever plaster it is laid over by the
   * same amount (a shadow, a dent's lit rim). Flat bare ground lights to
   * exactly 1, so it comes out fully transparent.
   * @param {Light} light
   * @param {boolean} [sprite]
   */
  render(light, sprite = false) {
    const { width: W, height: H, h } = this;
    const az = light.azimuth;
    const el = light.elevation;
    const L = [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)];
    const lx = L[0] ?? 0;
    const ly = L[1] ?? 0;
    const lz = L[2] ?? 1;
    const slope = 0.8; // how steep a unit of paint height reads
    const blur = boxBlur(h, W, H, Math.round(6 * this.k));
    const channels = sprite ? 4 : 3;
    const out = Buffer.alloc(W * H * channels);
    const stepX = -lx / Math.hypot(lx, ly);
    const stepY = -ly / Math.hypot(lx, ly);
    const rise = Math.tan(el) / slope;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const at = (/** @type {number} */ xx, /** @type {number} */ yy) =>
          h[Math.min(H - 1, Math.max(0, yy)) * W + Math.min(W - 1, Math.max(0, xx))] ?? 0;
        const nx = -(at(x + 1, y) - at(x - 1, y)) * slope * 0.5;
        const ny = -(at(x, y + 1) - at(x, y - 1)) * slope * 0.5;
        const nl = Math.hypot(nx, ny, 1);
        const dot = (nx * lx + ny * ly + lz) / nl;
        // Shadow: walk toward the light; anything standing higher than the ray blocks it.
        let lit = 1;
        const h0 = h[i] ?? 0;
        for (let s = 1; s < 48 * this.k; s += s < 10 ? 1 : 2) {
          const above = at(Math.round(x + stepX * s), Math.round(y + stepY * s)) - (h0 + rise * s);
          if (above > 0) {
            lit = Math.min(lit, 1 - Math.min(1, above / (3 * this.k)));
            if (lit <= 0) break;
          }
        }
        const fig = this.figure[i] ?? 0;
        const diffuse = Math.max(0, dot) / lz;
        const flat = light.ambient + (1 - light.ambient) * Math.min(1.3, diffuse) * (0.55 + 0.45 * lit);
        const shadeTerm = flat * (1 - fig) + (0.82 + 0.25 * Math.min(1.2, diffuse)) * fig;
        // Blinn gloss with the viewer straight above: wet acrylic sheen on the ridges.
        const hz = lz + 1;
        const hn = Math.hypot(lx, ly, hz);
        const spec = Math.max(0, (nx * lx + ny * ly + hz) / (nl * hn)) ** 60 * light.gloss * lit;
        const crevice = 1 - Math.min(0.22, Math.max(0, ((blur[i] ?? 0) - h0) * (0.06 / this.k)));
        const painted = 1 - (this.shade[i] ?? 0);
        if (sprite) {
          // Bare ground: how much darker or lighter than flat plaster.
          const v = flat * crevice * painted;
          const dark = Math.min(1, Math.max(0, 1 - v));
          // No lightening right beside a figure: the slope of its own paint
          // would ring it with a pale halo. A footprint's rim keeps its light.
          const reach = Math.round(2 * this.k);
          const fAt = (/** @type {number} */ xx, /** @type {number} */ yy) => this.figure[Math.min(H - 1, Math.max(0, yy)) * W + Math.min(W - 1, Math.max(0, xx))] ?? 0;
          const besideFigure = fAt(x - reach, y) + fAt(x + reach, y) + fAt(x, y - reach) + fAt(x, y + reach) > 0;
          const light2 = besideFigure ? 0 : Math.min(1, Math.max(0, (v - 1) * 1.2 + spec * (1 - fig)));
          const under = dark > 0 ? 0 : 255;
          const underA = Math.max(dark, light2);
          const alpha = fig + (1 - fig) * underA;
          for (let c = 0; c < 3; c++) {
            const base = c === 0 ? this.r[i] ?? 0 : c === 1 ? this.g[i] ?? 0 : this.b[i] ?? 0;
            const tint = (light.colour[c] ?? 255) / 255;
            const lit = Math.min(255, base * shadeTerm * tint * painted + spec * 255);
            const v2 = alpha > 0 ? (lit * fig + under * (1 - fig) * underA) / alpha : 0;
            out[i * 4 + c] = Math.max(0, Math.min(255, Math.round(v2)));
          }
          out[i * 4 + 3] = Math.round(Math.min(1, alpha) * 255);
          continue;
        }
        for (let c = 0; c < 3; c++) {
          const base = c === 0 ? this.r[i] ?? 0 : c === 1 ? this.g[i] ?? 0 : this.b[i] ?? 0;
          const tint = (light.colour[c] ?? 255) / 255;
          const v = base * shadeTerm * tint * crevice * painted + spec * 255;
          out[i * 3 + c] = Math.max(0, Math.min(255, Math.round(v)));
        }
      }
    }
    return out;
  }
}

/** @param {Float32Array} src @param {number} W @param {number} H @param {number} r */
function boxBlur(src, W, H, r) {
  const tmp = new Float32Array(W * H);
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[y * W + Math.min(W - 1, Math.max(0, x))] ?? 0;
    for (let x = 0; x < W; x++) {
      tmp[y * W + x] = acc / (2 * r + 1);
      acc += (src[y * W + Math.min(W - 1, x + r + 1)] ?? 0) - (src[y * W + Math.max(0, x - r)] ?? 0);
    }
  }
  for (let x = 0; x < W; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(H - 1, Math.max(0, y)) * W + x] ?? 0;
    for (let y = 0; y < H; y++) {
      out[y * W + x] = acc / (2 * r + 1);
      acc += (tmp[Math.min(H - 1, y + r + 1) * W + x] ?? 0) - (tmp[Math.max(0, y - r) * W + x] ?? 0);
    }
  }
  return out;
}

/** @param {Buffer} rgb RGB, or RGBA when `alpha` @param {number} W @param {number} H @param {boolean} [alpha] */
function png(rgb, W, H, alpha = false) {
  const n = alpha ? 4 : 3;
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  /** @param {Buffer} buf */
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = (crcTable[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  /** @param {string} type @param {Buffer} data */
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(W, 0);
  header.writeUInt32BE(H, 4);
  header[8] = 8; // bit depth
  header[9] = alpha ? 6 : 2; // truecolour, with or without alpha
  const raw = Buffer.alloc((W * n + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * n + 1)] = 0;
    rgb.copy(raw, y * (W * n + 1) + 1, y * W * n, (y + 1) * W * n);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---------------------------------------------------------------- figures */

/** Bright, flat colours that read at 20px on white and on slate. */
const PAINT = /** @type {Record<string, RGB>} */ ({
  coat: [232, 62, 44],
  trousers: [34, 46, 92],
  skin: [236, 184, 146],
  hat: [255, 196, 30],
  paper: [250, 248, 240],
  blue: [36, 110, 236],
  green: [40, 170, 96],
  map: [250, 222, 140],
  fold: [196, 160, 80],
  box: [214, 36, 30],
  boxDark: [120, 18, 22],
  steel: [150, 156, 166],
  handle: [150, 100, 52],
  pit: [92, 86, 80],
  pink: [244, 92, 150],
  teal: [0, 176, 170],
  orange: [255, 128, 20],
  white: [250, 250, 248],
  purple: [130, 70, 220],
});

/** Coats and towels for a crowd, in the order they are handed out. */
const CROWD = [PAINT.coat, PAINT.blue, PAINT.hat, PAINT.teal, PAINT.pink, PAINT.orange, PAINT.green, PAINT.purple].map((c) => c ?? [200, 60, 50]);

/** Skin and hair, a few of each, so a crowd is not one person repeated. */
const SKIN = /** @type {RGB[]} */ ([[241, 200, 168], [224, 172, 128], [190, 132, 92], [140, 92, 60], [96, 64, 44]]);
const HAIR = /** @type {Record<string, RGB>} */ ({ black: [32, 26, 24], brown: [98, 62, 38], blonde: [222, 186, 108], grey: [196, 196, 192], red: [178, 84, 42] });

/**
 * What someone looks like. `top` is a coat (to the knee), a jacket (to the
 * hip), a tee (short sleeves) or a dress; `bottom` is trousers, shorts or a
 * skirt. `build` widens the shoulders and hips; `child` makes the head bigger
 * and the legs shorter, the way a child is built.
 * @typedef {{ skin: RGB, hair: { style: "short" | "long" | "bun" | "cap" | "beanie" | "bald", colour: RGB, hat?: RGB }, top: { kind: "coat" | "jacket" | "tee" | "dress", colour: RGB }, bottom: { kind: "trousers" | "shorts" | "skirt", colour: RGB }, shoes: RGB, build: number, child?: boolean }} Look
 */

/** @type {Record<string, Look>} */
const PEOPLE = {
  parka: { skin: SKIN[1] ?? [224, 172, 128], hair: { style: "beanie", colour: HAIR.brown ?? [98, 62, 38], hat: [255, 196, 30] }, top: { kind: "jacket", colour: [228, 58, 42] }, bottom: { kind: "trousers", colour: [36, 48, 92] }, shoes: [40, 34, 32], build: 1.05 },
  camel: { skin: SKIN[2] ?? [190, 132, 92], hair: { style: "short", colour: HAIR.black ?? [32, 26, 24] }, top: { kind: "coat", colour: [196, 148, 92] }, bottom: { kind: "trousers", colour: [44, 46, 58] }, shoes: [30, 26, 24], build: 0.95 },
  dress: { skin: SKIN[0] ?? [241, 200, 168], hair: { style: "long", colour: HAIR.brown ?? [98, 62, 38] }, top: { kind: "dress", colour: [222, 44, 70] }, bottom: { kind: "skirt", colour: [222, 44, 70] }, shoes: [120, 24, 36], build: 0.85 },
  kid: { skin: SKIN[1] ?? [224, 172, 128], hair: { style: "short", colour: HAIR.blonde ?? [222, 186, 108] }, top: { kind: "jacket", colour: [255, 204, 0] }, bottom: { kind: "trousers", colour: [40, 110, 210] }, shoes: [200, 40, 40], build: 0.9, child: true },
  puffer: { skin: SKIN[3] ?? [140, 92, 60], hair: { style: "beanie", colour: HAIR.black ?? [32, 26, 24], hat: [255, 120, 20] }, top: { kind: "jacket", colour: [40, 160, 96] }, bottom: { kind: "trousers", colour: [110, 112, 118] }, shoes: [36, 32, 30], build: 1.3 },
  skirt: { skin: SKIN[4] ?? [96, 64, 44], hair: { style: "bun", colour: HAIR.black ?? [32, 26, 24] }, top: { kind: "jacket", colour: [0, 168, 164] }, bottom: { kind: "skirt", colour: [36, 36, 44] }, shoes: [30, 28, 28], build: 0.9 },
  elder: { skin: SKIN[0] ?? [241, 200, 168], hair: { style: "cap", colour: HAIR.grey ?? [196, 196, 192], hat: [70, 72, 84] }, top: { kind: "coat", colour: [120, 124, 134] }, bottom: { kind: "trousers", colour: [60, 52, 46] }, shoes: [40, 30, 26], build: 1.0 },
  hoodie: { skin: SKIN[1] ?? [224, 172, 128], hair: { style: "short", colour: HAIR.red ?? [178, 84, 42] }, top: { kind: "jacket", colour: [246, 112, 168] }, bottom: { kind: "trousers", colour: [62, 92, 150] }, shoes: [240, 240, 236], build: 0.95 },
  tee: { skin: SKIN[2] ?? [190, 132, 92], hair: { style: "cap", colour: HAIR.black ?? [32, 26, 24], hat: [36, 110, 236] }, top: { kind: "tee", colour: [250, 250, 246] }, bottom: { kind: "shorts", colour: [196, 172, 120] }, shoes: [40, 40, 44], build: 1.05 },
  overalls: { skin: SKIN[3] ?? [140, 92, 60], hair: { style: "cap", colour: HAIR.black ?? [32, 26, 24], hat: [228, 58, 42] }, top: { kind: "jacket", colour: [36, 110, 236] }, bottom: { kind: "trousers", colour: [120, 84, 52] }, shoes: [44, 34, 28], build: 1.1 },
};

/**
 * A person standing, about `s` pixels tall, feet at (x, y), built to adult
 * proportions: a head a seventh of their height, shoulders wider than hips,
 * elbows and knees. `pose.arms` are the two hands, from a point on the chest
 * just under the shoulders, in tenths of their height.
 * @param {Canvas} c @param {number} x @param {number} y @param {number} s
 * @param {{ arms: number[][], lean?: number, look?: Look, coat?: RGB, hat?: RGB, stride?: number, turn?: number }} pose `stride` from -1 to 1 swings the legs for a walking frame; `turn` moves the head sideways; `coat` and `hat` recolour the look
 */
function person(c, x, y, s, pose) {
  const base = pose.look ?? PEOPLE.parka ?? /** @type {Look} */ ({});
  const look = { ...base, top: { ...base.top, colour: pose.coat ?? base.top.colour }, hair: { ...base.hair, hat: pose.hat ?? base.hair.hat } };
  const u = s / 10;
  const b = look.build;
  const kid = look.child === true;
  const lean = (pose.lean ?? 0) * u;
  const stride = (pose.stride ?? 0) * u;
  const hr = (kid ? 0.92 : 0.68) * u; // head radius
  const headY = y - s + hr;
  const shoulderY = headY + hr + (kid ? 0.35 : 0.55) * u;
  const hipY = y - (kid ? 4.4 : 5.0) * u;
  const kneeY = y - (kid ? 2.2 : 2.6) * u;
  const sw = (kid ? 1.0 : 1.15) * u * b; // half the shoulders
  const hw = 0.95 * u * b; // half the hips
  /** @param {number} along 0 at the hips, 1 at the shoulders */
  const tilt = (along) => lean * along;

  c.shadow(x + 3.0 * u, y + 0.45 * u, 3.6 * u * b, 0.8 * u, 0.3);

  // Long hair falls behind the shoulders, so it goes down first.
  if (look.hair.style === "long") c.dab(x + tilt(1), headY, x + tilt(0.8), shoulderY + 1.6 * u, hr * 1.05, look.hair.colour, 1.6);

  // Legs: hip, knee, foot. A stride swings the knee and foot forward and back.
  const legColour = look.bottom.kind === "trousers" ? look.bottom.colour : look.skin;
  for (const side of [-1, 1]) {
    const swing = -side * stride;
    const hx = x + side * 0.45 * u * b;
    const kx = x + side * 0.4 * u + swing * 0.6;
    const fx = x + side * 0.36 * u + swing;
    const lift = Math.max(0, side * stride) * 0.2;
    c.dab(hx + tilt(0), hipY, kx, kneeY - lift * 0.5, 0.44 * u * Math.min(1.15, b), legColour, 1.6);
    c.dab(kx, kneeY - lift * 0.5, fx, y - 0.3 * u - lift, 0.34 * u, legColour, 1.5);
    if (look.bottom.kind === "shorts") c.dab(hx, hipY, kx, kneeY - 0.9 * u, 0.48 * u * b, look.bottom.colour, 1.7);
    c.dab(fx - side * 0.05 * u, y - 0.22 * u - lift, fx + 0.32 * u, y - 0.18 * u - lift, 0.27 * u, look.shoes, 1.4);
  }

  // A skirt, or the skirt of a dress, flares from the hips.
  if (look.bottom.kind === "skirt" || look.top.kind === "dress") {
    const hem = y - 2.7 * u;
    c.poly([[x - hw * 0.95 + tilt(0), hipY - 0.3 * u], [x + hw * 0.95 + tilt(0), hipY - 0.3 * u], [x + hw * 1.45, hem], [x - hw * 1.45, hem]], look.bottom.kind === "skirt" ? look.bottom.colour : look.top.colour, 1.8, 0.25 * u);
  }

  // The top: shoulders to its hem. A coat reaches the knee and flares a little.
  const hem = { coat: y - 2.5 * u, jacket: hipY + 0.35 * u, tee: hipY - 0.1 * u, dress: hipY }[look.top.kind];
  const flare = look.top.kind === "coat" ? 1.18 : 1.0;
  // Sloped shoulders: narrow at the neck, widest at the shoulder point.
  c.poly(
    [
      [x - 0.5 * u + tilt(1), shoulderY - 0.1 * u],
      [x + 0.5 * u + tilt(1), shoulderY - 0.1 * u],
      [x + sw + tilt(0.95), shoulderY + 0.55 * u],
      [x + hw * flare + tilt(0), hem],
      [x - hw * flare + tilt(0), hem],
      [x - sw + tilt(0.95), shoulderY + 0.55 * u],
    ],
    look.top.colour,
    2.2,
    0.45 * u,
  );

  // Arms: shoulder, elbow (pushed out and down), hand.
  const sx = x + tilt(1);
  const sy = y - 7.1 * u;
  // Sleeves a shade darker than the body, the way an arm in front of a coat is shaded.
  const sleeve = /** @type {RGB} */ (look.top.colour.map((v) => Math.round(v * 0.86)));
  const arm = look.top.kind === "tee" ? look.skin : sleeve;
  for (const [ax = 0, ay = 0] of pose.arms) {
    const side = Math.sign(ax) || 1;
    const shx = sx + side * (sw - 0.2 * u);
    const shy = shoulderY + 0.6 * u;
    const hx2 = sx + ax * u;
    const hy2 = sy + ay * u;
    const ex = (shx + hx2) / 2 + side * 0.3 * u;
    const ey = (shy + hy2) / 2 + 0.25 * u;
    c.dab(shx, shy, shx, shy, 0.4 * u, look.top.kind === "tee" ? look.top.colour : sleeve, 2.4);
    c.dab(shx, shy, ex, ey, 0.32 * u, look.top.kind === "tee" ? look.top.colour : sleeve, 2.4);
    c.dab(ex, ey, hx2, hy2, 0.27 * u, arm, 2);
    c.dab(hx2, hy2, hx2, hy2, 0.3 * u, look.skin, 2);
  }

  // Neck, head, hair.
  const hx = sx + (pose.turn ?? 0) * u;
  c.dab(sx, shoulderY, sx, headY + hr * 0.6, 0.26 * u, look.skin, 1.8);
  const hair = look.hair;
  if (hair.style !== "bald") c.dab(hx, headY - hr * 0.2, hx, headY - hr * 0.2, hr * 1.04, hair.colour, 2.2);
  c.dab(hx + (pose.turn ?? 0) * 0.2 * u, headY + hr * 0.16, hx + (pose.turn ?? 0) * 0.2 * u, headY + hr * 0.16, hr * 0.86, look.skin, 2.3);
  if (hair.style === "bun") c.dab(hx, headY - hr * 1.15, hx, headY - hr * 1.15, hr * 0.45, hair.colour, 2.4);
  if (hair.style === "beanie") c.dab(hx - hr * 0.55, headY - hr * 0.55, hx + hr * 0.55, headY - hr * 0.55, hr * 0.62, hair.hat ?? [255, 196, 30], 2.5);
  if (hair.style === "cap") {
    c.dab(hx - hr * 0.5, headY - hr * 0.5, hx + hr * 0.5, headY - hr * 0.5, hr * 0.58, hair.hat ?? [36, 110, 236], 2.5);
    c.dab(hx + hr * 0.2, headY - hr * 0.2, hx + hr * 1.3, headY - hr * 0.15, hr * 0.22, hair.hat ?? [36, 110, 236], 2.5);
  }
}

/**
 * Someone lying on their front on a towel, reading, seen from above. `s` is the
 * towel's length; `angle` turns the whole towel.
 * @param {Canvas} c @param {number} x @param {number} y @param {number} s @param {number} angle @param {RGB} towel @param {RGB} top
 * @returns {number[]} where the book is, and its angle, for the page that turns over it
 */
function reader(c, x, y, s, angle, towel, top) {
  const u = s / 10;
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  /** Towel coordinates to canvas: along, across. @param {number} a @param {number} b @returns {[number, number]} */
  const at = (a, b) => [x + (a * ca - b * sa) * u, y + (a * sa + b * ca) * u];
  c.shadow(x + 1.4 * u, y + 1.4 * u, 5.6 * u, 2.4 * u, 0.16);
  c.rect(x, y, 10 * u, 4 * u, angle, towel, 0.6);
  c.rect(...at(4.1, 0), 1.2 * u, 3.6 * u, angle, PAINT.white, 0.7); // the towel's stripe
  const [hx, hy] = at(-3.4, 0);
  const [nx, ny] = at(-1.8, 0);
  const [wx, wy] = at(0.6, 0);
  const [fx, fy] = at(3.6, 0.5);
  const [gx, gy] = at(3.6, -0.5);
  c.dab(wx, wy, fx, fy, 0.5 * u, PAINT.trousers, 1.2);
  c.dab(wx, wy, gx, gy, 0.5 * u, PAINT.trousers, 1.2);
  c.dab(nx, ny, wx, wy, 0.95 * u, top, 1.6);
  // Elbows out, book under the chin.
  c.dab(nx, ny, ...at(-3.2, 1.3), 0.38 * u, top, 1.4);
  c.dab(nx, ny, ...at(-3.2, -1.3), 0.38 * u, top, 1.4);
  c.dab(hx, hy, hx, hy, 0.8 * u, PAINT.skin, 1.8);
  const book = at(-4.6, 0);
  c.rect(...book, 0.9 * u, 2.2 * u, angle, PAINT.white, 1.4);
  return [...book, angle, u];
}

/**
 * A beach umbrella from above, with its shadow thrown down and right.
 * @param {Canvas} c @param {number} x @param {number} y @param {number} r @param {RGB} a @param {RGB} b
 */
function umbrella(c, x, y, r, a, b) {
  c.shadow(x + r * 0.8, y + r * 0.6, r * 1.05, r * 0.6, 0.3);
  c.disc(x, y, r, [a, b], 8);
  c.dab(x, y, x, y, r * 0.1, PAINT.white, 3);
}

/** Low sun from the upper left, and the same angle under moonlight. */
const DAY = /** @type {Light} */ ({ azimuth: Math.PI * 1.22, elevation: 0.5, colour: [255, 252, 246], ambient: 0.62, gloss: 0.1 });
const NIGHT = /** @type {Light} */ ({ azimuth: Math.PI * 1.22, elevation: 0.46, colour: [190, 205, 255], ambient: 0.5, gloss: 0.16 });

/** The grounds. Each is a few close paints, so the knife marks show as tone as well as relief. */
const PAINTS = /** @type {Record<string, RGB[]>} */ ({
  plaster: [[246, 244, 238], [242, 241, 236], [248, 247, 243], [238, 238, 236]],
  slate: [[44, 48, 62], [40, 44, 58], [48, 52, 66], [38, 42, 54]],
  clay: [[206, 112, 64], [196, 102, 58], [214, 124, 74], [188, 96, 56]],
  ember: [[92, 40, 34], [84, 36, 32], [100, 46, 38], [78, 34, 30]],
  sea: [[38, 96, 196], [52, 120, 214], [30, 82, 178], [70, 140, 222]],
  shallows: [[120, 186, 232], [140, 200, 238], [104, 172, 226]],
  pool: [[150, 214, 230], [138, 206, 226], [164, 222, 236]],
  coping: [[240, 236, 226], [232, 228, 218]],
  salt: [[240, 186, 196], [246, 204, 210], [232, 172, 186], [250, 236, 236]],
  mustard: [[232, 184, 64], [240, 194, 78], [224, 174, 56]],
  teal: [[40, 140, 138], [48, 150, 146], [34, 130, 128]],
  lawn: [[136, 184, 104], [146, 192, 112], [126, 174, 96], [154, 198, 120]],
  moss: [[30, 52, 40], [34, 58, 44], [26, 46, 36]],
});

/** @param {RGB[]} paints @param {Light} [light] @returns {Ground} */
const one = (paints, light = DAY) => ({ fields: [{ until: 1, paints }], light });

/**
 * A sprite: something small that moves, drawn on flat ground so the page can
 * lay it over the plaster. Frames sit side by side in one strip. Keep the box
 * at least 8px below the feet: a shadow cut off by the box edge shows as a
 * hard line on the page.
 * @typedef {{ name: string, w: number, h: number, ax: number, ay: number, frames: ((c: Canvas, x: number, y: number) => void)[] }} Sprite
 */
/**
 * A living scene: the still part painted into the ground, and the sprites that
 * move over it. `points` are the positions the page animates between, in the
 * ground's own pixels; they go into the manifest with the sprites' sizes.
 * @typedef {{ name: string, width: number, height: number, seed: number, day: Ground, night: Ground, still: (c: Canvas, points: Record<string, number[][]>) => void, sprites: Sprite[], points: Record<string, number[][]>, scale?: number }} Living
 */

/** The footprint trail on the 404, and the line the walker follows along it. */
const LOST_END = 930;
/** @param {number} x */
const lostY = (x) => {
  const t = x / LOST_END;
  return 410 - 80 * t + 14 * Math.sin(t * 5.2);
};

/** Seven different people in the contact queue, a child among them. */
const QUEUE = ["camel", "dress", "kid", "puffer", "skirt", "elder", "hoodie", "tee", "overalls", "parka"].map((name) => PEOPLE[name] ?? PEOPLE.parka);

/** @type {Living[]} */
const LIVING = [
  {
    // 404: someone walks in along a trail of their own footprints and stops to read a map.
    name: "lost",
    width: 1344,
    height: 560,
    seed: 404,
    day: one(PAINTS.plaster ?? []),
    night: one(PAINTS.slate ?? [], NIGHT),
    points: {
      prints: (() => {
        const r = rng(7);
        /** @type {number[][]} */
        const out = [];
        for (let k = 0, x = 10; x < LOST_END - 22; k++, x += 19 + r() * 3) out.push([Math.round(x), Math.round(lostY(x) + (k % 2 ? 6 : -6))]);
        return out;
      })(),
      path: Array.from({ length: 13 }, (_, k) => {
        const x = -20 + ((LOST_END + 20) * k) / 12;
        return [Math.round(x), Math.round(lostY(Math.max(0, x)))];
      }),
    },
    still() {},
    sprites: [
      { name: "print", w: 16, h: 12, ax: 8, ay: 6, frames: [(c, x, y) => c.dent(x, y, 5.2, 2.8, 2.6, -0.2)] },
      {
        name: "walker",
        w: 62,
        h: 64,
        ax: 22,
        ay: 52,
        frames: [1, -1].map((side) => (/** @type {Canvas} */ c, /** @type {number} */ x, /** @type {number} */ y) =>
          person(c, x, y, 46, { arms: [[-1.6 - side * 0.5, 2.7], [1.6 - side * 0.5, 2.7]], stride: side * 0.9, look: PEOPLE.parka }),
        ),
      },
      {
        name: "reader",
        w: 62,
        h: 64,
        ax: 22,
        ay: 52,
        frames: [
          (c, x, y) => {
            person(c, x, y, 46, { arms: [[-2.4, 1.6], [2.4, 1.6]], look: PEOPLE.parka });
            c.rect(x, y - 25.5, 19, 7, 0, [252, 236, 180], 2.6);
            c.rect(x, y - 25.5, 0.6, 7, 0, PAINT.fold ?? [196, 160, 80], 2.8);
          },
          (c, x, y) => {
            // Map lowered, looking off to the side: which way now?
            person(c, x, y, 46, { arms: [[-1.4, 2.8], [1.4, 2.8]], turn: 0.45, look: PEOPLE.parka });
            c.rect(x, y - 20.5, 10, 4.5, 0, [252, 236, 180], 2.6);
          },
        ],
      },
    ],
  },
  {
    // Contact: a queue at the postbox that keeps moving. Each person shuffles up,
    // posts, and walks off; someone new joins the back.
    name: "post",
    width: 1344,
    height: 560,
    seed: 82,
    day: one(PAINTS.plaster ?? []),
    night: one(PAINTS.slate ?? [], NIGHT),
    points: {
      box: [[760, 360]],
      slots: [0, 1, 2, 3, 4].map((k) => [730 - k * 26, 362 + k * 3]),
      // People arrive from the far upper left and leave into the far right.
      enter: [[170, 252]],
      leave: [[800, 398], [1190, 440]],
    },
    // Ten people, seven poses each: painted at 2x rather than 3x to keep the page light.
    scale: 2,
    still(c) {
      const bx = 760;
      const by = 360;
      c.freeze();
      c.shadow(bx + 18, by + 3, 22, 4.5, 0.34);
      c.dab(bx, by - 2, bx, by - 50, 10.5, PAINT.box ?? [214, 36, 30], 3);
      c.dab(bx - 12, by - 52, bx + 12, by - 52, 4.2, PAINT.boxDark ?? [120, 18, 22], 3.4);
      c.dab(bx - 6, by - 38, bx + 6, by - 38, 1.1, [40, 10, 12], 2);
      c.dab(bx - 11, by - 3, bx + 11, by - 3, 2.2, PAINT.boxDark ?? [120, 18, 22], 2.8);
    },
    sprites: QUEUE.flatMap((look, k) => {
      const s = look?.child ? 29 : 42 - (k % 3);
      const u = s / 10;
      /** The letter sits in the hand: hands are measured from 7.1 tenths up. @param {Canvas} c @param {number} x @param {number} y @param {number} hx @param {number} hy */
      const letter = (c, x, y, hx, hy) => c.rect(x + hx * u + 1.4, y - 7.1 * u + hy * u - 0.6, 4.2, 2.8, -0.1, PAINT.paper ?? [250, 248, 240], 1.4);
      const box = { w: 58, h: 60, ax: 20, ay: 50 };
      /** One walking frame: legs apart one way, arms swinging the other. @param {number} side @param {boolean} holding */
      const walk = (side, holding) => (/** @type {Canvas} */ c, /** @type {number} */ x, /** @type {number} */ y) => {
        const arms = holding ? [[-1.1 - side * 0.9, 2.6], [1.9, 1.5]] : [[-1.3 - side * 0.9, 2.7], [1.3 + side * 0.9, 2.7]];
        person(c, x, y, s, { arms, look, stride: side * 1.6 });
        if (holding) letter(c, x, y, 1.9, 1.5);
      };
      return [
        {
          // Standing: waiting with the letter, posting it, done.
          name: `q${k}`,
          ...box,
          frames: [
            (/** @type {Canvas} */ c, /** @type {number} */ x, /** @type {number} */ y) => {
              person(c, x, y, s, { arms: [[-1.0, 2.7], [1.9, 1.5]], look });
              letter(c, x, y, 1.9, 1.5);
            },
            (/** @type {Canvas} */ c, /** @type {number} */ x, /** @type {number} */ y) => {
              person(c, x, y, s, { arms: [[3.6, -0.6], [-1.0, 2.7]], look });
              letter(c, x, y, 3.6, -0.6);
            },
            (/** @type {Canvas} */ c, /** @type {number} */ x, /** @type {number} */ y) => person(c, x, y, s, { arms: [[-1.3, 2.8], [1.3, 2.8]], look }),
          ],
        },
        // Walking: two steps with the letter, two without.
        { name: `q${k}w`, ...box, frames: [walk(1, true), walk(-1, true), walk(1, false), walk(-1, false)] },
      ];
    }),
  },
  {
    // An empty filter: someone keeps digging, a small crowd keeps watching, nothing comes up.
    name: "dig",
    width: 960,
    height: 360,
    seed: 17,
    day: one(PAINTS.clay ?? []),
    night: one(PAINTS.ember ?? [], NIGHT),
    points: {
      digger: [[470, 236]],
      watchers: [[508, 214], [536, 212], [612, 232]],
      clod: [[514, 226], [532, 196], [552, 200], [566, 219]],
    },
    still(c) {
      const hx = 520;
      const hy = 228;
      c.dent(hx, hy, 26, 9, 7);
      c.mound(hx + 52, hy - 3, 20, 9, 9);
      c.freeze();
      c.shadow(hx - 2, hy + 1, 19, 6, 0.55);
    },
    sprites: [
      {
        name: "digger",
        w: 56,
        h: 56,
        ax: 14,
        ay: 46,
        frames: [
          (c, x, y) => {
            person(c, x, y, 40, { arms: [[2.4, 0.4], [2.0, 2.2]], lean: 0.5, look: PEOPLE.overalls });
            c.dab(x + 8, y - 32, x + 24, y - 6, 1.1, PAINT.handle ?? [150, 100, 52], 1.6);
            c.dab(x + 23, y - 7, x + 28, y - 1, 3, PAINT.steel ?? [150, 156, 166], 1.8);
          },
        ],
      },
      { name: "clod", w: 12, h: 12, ax: 6, ay: 6, frames: [(c, x, y) => c.dab(x, y, x + 1, y, 2.4, (PAINTS.clay ?? [])[2] ?? [214, 124, 74], 2.2)] },
      ...[
        { look: PEOPLE.dress, arms: [[-1, 2.8], [1, 2.8]], lean: 0.6, s: 36 },
        { look: PEOPLE.kid, arms: [[-1.2, 2.6], [2.4, 0.6]], lean: -0.6, s: 26 },
        { look: PEOPLE.hoodie, arms: [[-1.4, 2.8], [1.4, 2.8]], lean: 0, s: 38 },
      ].map(({ look, arms, lean, s }, k) => ({
        name: `w${k}`,
        w: 46,
        h: 50,
        ax: 14,
        ay: 40,
        frames: [(/** @type {Canvas} */ c, /** @type {number} */ x, /** @type {number} */ y) => person(c, x, y, s, { arms, lean, look })],
      })),
    ],
  },
  {
    // /library: a lawn of readers turning pages, and one more walking across with a book.
    name: "readers",
    width: 1344,
    height: 560,
    seed: 31,
    day: one(PAINTS.lawn ?? []),
    night: one(PAINTS.moss ?? [], NIGHT),
    points: { pages: [], walk: [[-30, 330], [1380, 262]] },
    still(c, points) {
      c.freeze();
      const r = rng(5);
      /** @type {[number, number][]} */
      const placed = [];
      const near = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ d) => placed.some(([px, py]) => Math.abs(px - x) < d && Math.abs(py - y) < d * 0.55);
      for (const [ux, uy, ur] of [[300, 220, 22], [860, 300, 26], [1130, 150, 20]]) {
        umbrella(c, ux ?? 0, uy ?? 0, ur ?? 20, CROWD[Math.floor(r() * CROWD.length)] ?? PAINT.coat, PAINT.white);
        placed.push([ux ?? 0, uy ?? 0]);
      }
      /** @type {number[][]} */
      const pages = [];
      for (let k = 0, tries = 0; k < 28 && tries < 4000; tries++) {
        const x = 60 + r() * (c.width - 120);
        const y = 50 + r() * (c.height - 100);
        const edge = Math.min(x, c.width - x) / c.width + Math.min(y, c.height - y) / c.height;
        if (edge < 0.18 * r() + 0.08 || near(x, y, 60)) continue;
        placed.push([x, y]);
        const size = 26 + r() * 8;
        const book = reader(c, x, y, size, (r() - 0.5) * 1.6 + (r() < 0.2 ? Math.PI : 0), CROWD[k % CROWD.length] ?? PAINT.coat, CROWD[(k * 3 + 1) % CROWD.length] ?? PAINT.white);
        if (k % 3 === 0) pages.push(book.map((v) => Math.round(v * 100) / 100));
        k++;
      }
      points.pages = pages;
    },
    sprites: [
      { name: "page", w: 10, h: 10, ax: 5, ay: 5, frames: [(c, x, y) => c.rect(x, y, 2.4, 6, 0, PAINT.white ?? [250, 250, 248], 1.6)] },
      {
        name: "walker",
        w: 30,
        h: 32,
        ax: 10,
        ay: 25,
        frames: [1, -1].map((side) => (/** @type {Canvas} */ c, /** @type {number} */ x, /** @type {number} */ y) => {
          person(c, x, y, 20, { arms: [[-1.4, 2.7], [1.8, 1.3]], stride: side * 0.9, look: PEOPLE.tee, coat: PAINT.orange });
          c.rect(x + 4, y - 12, 2.4, 3.2, 0.2, PAINT.white ?? [250, 250, 248], 1.6);
        }),
      },
    ],
  },
];

/** @type {Scene[]} */
const SCENES = [
  // The ground study: one figure on each ground, to choose a lane before building more.
  ...[
    { name: "study-plaster", day: one(PAINTS.plaster ?? []) },
    { name: "study-crowd", day: one(PAINTS.plaster ?? []) },
    { name: "study-sea", day: { fields: [{ until: 0.45, paints: PAINTS.sea ?? [] }, { until: 1, paints: PAINTS.shallows ?? [] }], light: DAY } },
    { name: "study-pool", day: { fields: [{ until: 0.2, paints: PAINTS.coping ?? [] }, { until: 1, paints: PAINTS.pool ?? [] }], light: DAY } },
    { name: "study-salt", day: one(PAINTS.salt ?? []) },
    { name: "study-clay", day: one(PAINTS.clay ?? []) },
    { name: "study-field", day: { fields: [{ until: 0.42, paints: PAINTS.mustard ?? [] }, { until: 1, paints: PAINTS.teal ?? [] }], light: DAY } },
  ].map(({ name, day }, k) => /** @type {Scene} */ ({
    name,
    width: 640,
    height: 260,
    seed: 900 + k,
    day,
    figure(c) {
      c.freeze();
      const x = 400;
      const y = 170;
      if (name === "study-crowd") {
        // Far off: a line of walkers at a third of the usual size.
        const r = rng(3);
        for (let k = 0; k < 11; k++) {
          const wx = 120 + k * 38 + r() * 14;
          const wy = 120 + k * 9 + r() * 10;
          person(c, wx, wy, 11 + r() * 3, { arms: [[-1, 2.8], [1, 2.8]], coat: CROWD[k % CROWD.length] ?? PAINT.coat, hat: CROWD[(k + 2) % CROWD.length] });
        }
      } else if (name === "study-sea") {
        // A paddleboard under the figure.
        c.dab(x - 18, y + 1, x + 18, y + 1, 3, PAINT.hat, 1.6);
        person(c, x, y - 1, 34, { arms: [[2.2, 2.6], [2.8, 1.4]], coat: PAINT.coat });
      } else if (name === "study-pool") {
        // A red ring, and a swimmer's head and arms in it.
        c.dab(x, y - 4, x, y - 4, 8, PAINT.coat, 2);
        c.dab(x, y - 4, x, y - 4, 4, (PAINTS.pool ?? [])[0] ?? [150, 214, 230], 0.4);
        c.dab(x - 8, y - 9, x + 8, y - 9, 1.6, PAINT.skin, 1.8);
        c.dab(x, y - 6, x, y - 6, 3.2, PAINT.skin, 2);
        c.dab(x - 2, y - 8.5, x + 2, y - 8.5, 1.8, PAINT.hat, 2.2);
      } else {
        const coat = name === "study-clay" ? PAINT.blue : name === "study-field" ? PAINT.paper : name === "study-salt" ? PAINT.green : PAINT.coat;
        person(c, x, y, 34, { arms: [[-1.4, 2.8], [1.4, 2.8]], coat });
      }
    },
  })),
];

const { default: sharp } = await import("sharp");
mkdirSync(OUT, { recursive: true });
mkdirSync(PNG_DIR, { recursive: true });

/** @param {string} name @param {Buffer} data @param {number} w @param {number} h @param {boolean} alpha */
async function write(name, data, w, h, alpha) {
  const file = path.join(PNG_DIR, `${name}.png`);
  writeFileSync(file, png(data, w, h, alpha));
  const info = await sharp(file).webp(alpha ? { quality: 82, alphaQuality: 90, effort: 6 } : { quality: 72, effort: 6 }).toFile(path.join(OUT, `${name}.webp`));
  return info.size;
}

for (const scene of SCENES) {
  for (const [mood, ground] of /** @type {[string, Ground | undefined][]} */ ([["day", scene.day], ["night", scene.night]])) {
    if (!ground) continue;
    const c = new Canvas(scene.width, scene.height, scene.seed);
    c.plaster(ground.fields, -0.08);
    scene.figure(c);
    const size = await write(`${scene.name}-${mood}`, c.render(ground.light), scene.width, scene.height, false);
    console.log(`${scene.name}-${mood}: ${scene.width}x${scene.height}, ${(size / 1024).toFixed(1)} KB`);
  }
}

/** The page reads this: each living scene's size, its points and its sprites. */
const manifest = /** @type {Record<string, unknown>} */ ({});
for (const scene of LIVING) {
  let total = 0;
  for (const [mood, ground] of /** @type {[string, Ground][]} */ ([["day", scene.day], ["night", scene.night]])) {
    const c = new Canvas(scene.width, scene.height, scene.seed);
    c.plaster(ground.fields, -0.08);
    scene.still(c, scene.points);
    total += await write(`${scene.name}-${mood}`, c.render(ground.light), scene.width, scene.height, false);
    for (const sprite of scene.sprites) {
      // Painted at 3x (or the scene's own scale), so the browser scales it down and the figure stays sharp.
      const K = scene.scale ?? 3;
      const w = sprite.w * K;
      const h = sprite.h * K;
      const n = sprite.frames.length;
      const strip = Buffer.alloc(w * n * h * 4);
      sprite.frames.forEach((draw, f) => {
        const s = new Canvas(w, h, scene.seed);
        s.k = K;
        s.h.fill(0);
        s.freeze();
        draw(s, sprite.ax, sprite.ay);
        const rgba = s.render(ground.light, true);
        for (let y = 0; y < h; y++) rgba.copy(strip, (y * w * n + f * w) * 4, y * w * 4, (y + 1) * w * 4);
      });
      total += await write(`${scene.name}-${sprite.name}-${mood}`, strip, w * n, h, true);
    }
  }
  manifest[scene.name] = {
    width: scene.width,
    height: scene.height,
    points: scene.points,
    sprites: Object.fromEntries(scene.sprites.map(({ name, w, h, ax, ay, frames }) => [name, { w, h, ax, ay, frames: frames.length }])),
  };
  console.log(`${scene.name}: ground and ${scene.sprites.length} sprites, both moods, ${(total / 1024).toFixed(1)} KB`);
}
writeFileSync(path.join(process.cwd(), "src", "data", "plaster-manifest.json"), `${JSON.stringify(manifest, null, 1)}\n`);
