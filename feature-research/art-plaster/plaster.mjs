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
    this.paint(cx, cy, r + 2, (x, y) => {
      const d = Math.hypot(x - cx, y - cy);
      const k = Math.floor(((Math.atan2(y - cy, x - cx) + Math.PI) / (Math.PI * 2)) * panels);
      const dome = Math.sqrt(Math.max(0, 1 - (d / (r + 0.5)) ** 2));
      return [Math.min(1, Math.max(0, r - d + 0.5)), colours[k % colours.length] ?? [240, 240, 240], relief * dome];
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
   * Light the height field and return 8-bit RGB.
   * @param {Light} light
   */
  render(light) {
    const { width: W, height: H, h } = this;
    const az = light.azimuth;
    const el = light.elevation;
    const L = [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)];
    const lx = L[0] ?? 0;
    const ly = L[1] ?? 0;
    const lz = L[2] ?? 1;
    const slope = 0.8; // how steep a unit of paint height reads
    const blur = boxBlur(h, W, H, 6);
    const out = Buffer.alloc(W * H * 3);
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
        for (let s = 1; s < 48; s += s < 10 ? 1 : 2) {
          const above = at(Math.round(x + stepX * s), Math.round(y + stepY * s)) - (h0 + rise * s);
          if (above > 0) {
            lit = Math.min(lit, 1 - Math.min(1, above / 3));
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
        const crevice = 1 - Math.min(0.22, Math.max(0, ((blur[i] ?? 0) - h0) * 0.06));
        const painted = 1 - (this.shade[i] ?? 0);
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

/** @param {Buffer} rgb @param {number} W @param {number} H */
function png(rgb, W, H) {
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
  header[9] = 2; // truecolour
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0;
    rgb.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
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

/**
 * A person standing, about `s` pixels tall, feet at (x, y). `pose` moves the
 * arms; everything else is shared so the three scenes are one hand.
 * @param {Canvas} c @param {number} x @param {number} y @param {number} s
 * @param {{ arms: number[][], lean?: number, coat?: RGB, hat?: RGB }} pose arms as [hand x, hand y] from the shoulder, in figure units
 */
function person(c, x, y, s, pose) {
  const u = s / 10; // one figure unit
  const lean = (pose.lean ?? 0) * u;
  c.shadow(x + 3.2 * u, y + 0.5 * u, 4.2 * u, 0.9 * u, 0.32);
  // Legs
  c.dab(x - 0.7 * u, y - 0.2 * u, x - 0.4 * u + lean * 0.2, y - 4.2 * u, 0.62 * u, PAINT.trousers);
  c.dab(x + 0.7 * u, y - 0.2 * u, x + 0.4 * u + lean * 0.2, y - 4.2 * u, 0.62 * u, PAINT.trousers);
  // Coat
  const coat = pose.coat ?? PAINT.coat;
  c.dab(x + lean * 0.5, y - 4.4 * u, x + lean, y - 7.4 * u, 1.35 * u, coat, 2.2);
  const sx = x + lean;
  const sy = y - 7.1 * u;
  for (const [hx, hy] of pose.arms) {
    c.dab(sx + Math.sign(hx ?? 0) * 0.9 * u, sy, sx + (hx ?? 0) * u, sy + (hy ?? 0) * u, 0.5 * u, coat, 1.8);
    c.dab(sx + (hx ?? 0) * u, sy + (hy ?? 0) * u, sx + (hx ?? 0) * u, sy + (hy ?? 0) * u, 0.45 * u, PAINT.skin, 1.8);
  }
  // Head and hat
  c.dab(sx, y - 8.7 * u, sx, y - 8.7 * u, 0.95 * u, PAINT.skin, 2);
  c.dab(sx - 0.45 * u, y - 9.55 * u, sx + 0.45 * u, y - 9.55 * u, 0.5 * u, pose.hat ?? PAINT.hat, 2.2);
}

/**
 * Someone lying on their front on a towel, reading, seen from above. `s` is the
 * towel's length; `angle` turns the whole towel.
 * @param {Canvas} c @param {number} x @param {number} y @param {number} s @param {number} angle @param {RGB} towel @param {RGB} top
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
  c.rect(...at(-4.6, 0), 0.9 * u, 2.2 * u, angle, PAINT.white, 1.4);
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

/** @type {Scene[]} */
const SCENES = [
  {
    // 404: footprints come in from the left edge and stop at one figure with a
    // map held open. Nothing ahead of him but plaster.
    name: "lost",
    width: 1344,
    height: 560,
    seed: 404,
    day: one(PAINTS.plaster ?? []),
    night: one(PAINTS.slate ?? [], NIGHT),
    figure(c) {
      const fx = 930;
      const fy = 330;
      const r = rng(7);
      for (let k = 0, x = -10; x < fx - 22; k++, x += 19 + r() * 3) {
        const t = x / fx;
        const y = 410 - 80 * t + 14 * Math.sin(t * 5.2) + (k % 2 ? 6 : -6);
        c.dent(x, y, 5.2, 2.8, 2.6, -0.2);
      }
      c.freeze();
      person(c, fx, fy, 46, { arms: [[-2.6, 1.6], [2.6, 1.6]] });
      // The map: a pale sheet across both hands.
      c.dab(fx - 11, fy - 25, fx + 11, fy - 25, 3.2, PAINT.map, 2.4);
      c.dab(fx, fy - 28, fx, fy - 22, 0.55, PAINT.fold, 2.6);
    },
  },
  {
    // Contact: a queue at a pillar box on the drift, the front one posting.
    name: "post",
    width: 1344,
    height: 560,
    seed: 82,
    day: one(PAINTS.plaster ?? []),
    night: one(PAINTS.slate ?? [], NIGHT),
    figure(c) {
      const bx = 760;
      const by = 360;
      c.freeze();
      c.shadow(bx + 18, by + 3, 22, 4.5, 0.34);
      c.dab(bx, by - 2, bx, by - 50, 10.5, PAINT.box, 3);
      c.dab(bx - 12, by - 52, bx + 12, by - 52, 4.2, PAINT.boxDark, 3.4);
      c.dab(bx - 6, by - 38, bx + 6, by - 38, 1.1, [40, 10, 12], 2);
      c.dab(bx - 11, by - 3, bx + 11, by - 3, 2.2, PAINT.boxDark, 2.8);
      // A queue of five, each with a letter; the front one is posting.
      const r = rng(12);
      for (let k = 4; k >= 1; k--) {
        const x = bx - 30 - k * 26 - r() * 6;
        const y = by + 2 + k * 3;
        person(c, x, y, 42 - k, { arms: [[-0.8, 2.6], [1.8, 1.4]], coat: CROWD[k] ?? PAINT.coat, hat: CROWD[(k + 3) % CROWD.length] });
        c.dab(x + 1.8 * 4.2 - 1, y - 24, x + 1.8 * 4.2 + 3, y - 24, 1.7, PAINT.paper, 1.6);
      }
      person(c, bx - 30, by + 2, 42, { arms: [[3.6, -0.6], [1.2, 2.4]], coat: PAINT.blue });
      // The letter, at the slot.
      c.dab(bx - 13, by - 38, bx - 7, by - 38, 2.2, PAINT.paper, 1.6);
    },
  },
  {
    // An empty filter: a neat hole dug in clay, nothing in it, and a small crowd looking anyway.
    name: "dig",
    width: 960,
    height: 360,
    seed: 17,
    day: one(PAINTS.clay ?? []),
    night: one(PAINTS.ember ?? [], NIGHT),
    figure(c) {
      const hx = 520;
      const hy = 228;
      c.dent(hx, hy, 26, 9, 7);
      c.mound(hx + 52, hy - 3, 20, 9, 9);
      c.freeze();
      // The hole's floor reads dark.
      c.shadow(hx - 2, hy + 1, 19, 6, 0.55);
      person(c, hx - 50, hy + 8, 40, { arms: [[2.4, 0.4], [2.0, 2.2]], lean: 0.5, coat: PAINT.blue });
      // Three onlookers lean over the far side of the hole.
      person(c, hx - 12, hy - 14, 34, { arms: [[-1, 2.8], [1, 2.8]], lean: 0.6, coat: PAINT.pink, hat: PAINT.white });
      person(c, hx + 16, hy - 16, 33, { arms: [[-1.2, 2.6], [2.4, 0.6]], lean: -0.6, coat: PAINT.hat, hat: PAINT.coat });
      person(c, hx + 92, hy + 4, 36, { arms: [[-1.4, 2.8], [1.4, 2.8]], coat: PAINT.teal });
      // The shovel: handle from the hands down to a blade at the hole's rim.
      c.dab(hx - 42, hy - 24, hx - 26, hy + 2, 1.1, PAINT.handle, 1.6);
      c.dab(hx - 27, hy + 1, hx - 22, hy + 7, 3, PAINT.steel, 1.8);
    },
  },
  {
    // /library: a lawn of people reading, scattered at their own small scale,
    // with umbrellas as the objects. Twenty-eight readers, each about 15px long on a desktop.
    name: "readers",
    width: 1344,
    height: 560,
    seed: 31,
    day: one(PAINTS.lawn ?? []),
    night: one(PAINTS.moss ?? [], NIGHT),
    figure(c) {
      c.freeze();
      const r = rng(5);
      /** @type {[number, number][]} */
      const placed = [];
      const near = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ d) => placed.some(([px, py]) => Math.abs(px - x) < d && Math.abs(py - y) < d * 0.55);
      for (const [ux, uy, ur] of [[300, 220, 22], [860, 300, 26], [1130, 150, 20]]) {
        umbrella(c, ux ?? 0, uy ?? 0, ur ?? 20, CROWD[Math.floor(r() * CROWD.length)] ?? PAINT.coat, PAINT.white);
        placed.push([ux ?? 0, uy ?? 0]);
      }
      for (let k = 0, tries = 0; k < 28 && tries < 4000; tries++) {
        const x = 60 + r() * (c.width - 120);
        const y = 50 + r() * (c.height - 100);
        // Fewer people toward the edges, where the fade would eat them.
        const edge = Math.min(x, c.width - x) / c.width + Math.min(y, c.height - y) / c.height;
        if (edge < 0.18 * r() + 0.08 || near(x, y, 60)) continue;
        placed.push([x, y]);
        const size = 26 + r() * 8;
        reader(c, x, y, size, (r() - 0.5) * 1.6 + (r() < 0.2 ? Math.PI : 0), CROWD[k % CROWD.length] ?? PAINT.coat, CROWD[(k * 3 + 1) % CROWD.length] ?? PAINT.white);
        k++;
      }
    },
  },
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

for (const scene of SCENES) {
  for (const [mood, ground] of /** @type {[string, Ground | undefined][]} */ ([["day", scene.day], ["night", scene.night]])) {
    if (!ground) continue;
    const c = new Canvas(scene.width, scene.height, scene.seed);
    c.plaster(ground.fields, -0.08);
    scene.figure(c);
    const rgb = c.render(ground.light);
    const file = path.join(PNG_DIR, `${scene.name}-${mood}.png`);
    writeFileSync(file, png(rgb, scene.width, scene.height));
    const webp = path.join(OUT, `${scene.name}-${mood}.webp`);
    const info = await sharp(file).webp({ quality: 72, effort: 6 }).toFile(webp);
    console.log(`${scene.name}-${mood}: ${scene.width}x${scene.height}, ${(info.size / 1024).toFixed(1)} KB webp`);
  }
}
