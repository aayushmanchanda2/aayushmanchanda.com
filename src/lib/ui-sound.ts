/**
 * The UI tick: a 24ms burst of seeded noise, shaped and filtered at play time,
 * after builtbydesigners.com. No audio files and no dependency.
 *
 * Nothing runs on load. The AudioContext is made on the first press that
 * should make a sound, because a context made earlier starts suspended and
 * costs a thread for a reader who never clicks. Muted means never made at all.
 *
 * Presses are mouse and pen `pointerdown` (so the tick lands on the press, not
 * the release) plus keyboard activation, which arrives as a `click` with
 * `detail === 0`. Touch is left silent, as on the original.
 */
import { reducedMotion } from "./motion.ts";
import { readStored, store } from "./storage.ts";

export const STORAGE_KEY = "ui-sound";
export const THROTTLE_MS = 35;
export const TARGET =
  "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary";

const LENGTH_S = 0.024;

/** The tick's samples: LCG noise under a fast attack, a decay, and a late "thock". */
export function noiseSamples(sampleRate: number): Float32Array {
  const out = new Float32Array(Math.ceil(sampleRate * LENGTH_S));
  let seed = 1;
  for (let i = 0; i < out.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const t = i / sampleRate;
    const envelope =
      Math.min(t / 45e-5, 1) * Math.exp(-t * 255) +
      (t > 0.0045 ? 0.24 * Math.exp(-(t - 0.0045) * 420) : 0);
    out[i] = ((seed / 2 ** 32) * 2 - 1) * envelope;
  }
  return out;
}

export const shouldPlay = (now: number, last: number): boolean => now - last >= THROTTLE_MS;

/** The pressable element a press landed in, or null. */
export function soundTarget(node: EventTarget | null): Element | null {
  const hit = (node as Element | null)?.closest?.(TARGET) ?? null;
  return hit && hit.getAttribute("aria-disabled") !== "true" ? hit : null;
}

/** A stored choice wins; with none, reduced motion means off. */
export const initialOn = (stored: string | null, reducedMotion: boolean): boolean =>
  stored === "on" || stored === "off" ? stored === "on" : !reducedMotion;

/**
 * `data-sound` on `<html>` before the first paint, the theme's pattern
 * (`lib/theme.ts › PREPAINT`): `SoundToggle.astro` swaps its glyph off it, so a
 * muted reader never sees the "on" icon for a frame. Built from `initialOn`
 * itself, so the pre-paint pass and the runtime cannot disagree.
 */
export const PREPAINT = `(function(){var s=null;try{s=localStorage.getItem(${JSON.stringify(STORAGE_KEY)})}catch(e){}
document.documentElement.setAttribute("data-sound",(${initialOn})(s,matchMedia("(prefers-reduced-motion: reduce)").matches)?"on":"off");})();`;

/* --- runtime ------------------------------------------------------------- */

let ctx: AudioContext | undefined;
let buffer: AudioBuffer | undefined;
let last = -Infinity;
// Held in memory too, so a reader with storage blocked still gets a working
// toggle for the length of the page.
let chosen: boolean | undefined;

export function soundOn(): boolean {
  if (chosen !== undefined) return chosen;
  return initialOn(readStored(STORAGE_KEY), reducedMotion());
}

/** Play one tick if a context exists. `rate` below 1 is lower and longer. */
export function tick({ rate = 1 } = {}): void {
  if (!ctx || !soundOn()) return;
  const now = performance.now();
  if (!shouldPlay(now, last)) return;
  last = now;
  if (ctx.state === "suspended") void ctx.resume();

  if (!buffer) {
    const samples = noiseSamples(ctx.sampleRate);
    buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
    buffer.getChannelData(0).set(samples);
  }

  const filter = (type: BiquadFilterType, frequency: number, q: number, gain = 0) => {
    const node = ctx!.createBiquadFilter();
    node.type = type;
    node.frequency.value = frequency;
    node.Q.value = q;
    node.gain.value = gain;
    return node;
  };

  const at = ctx.currentTime;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = rate;
  const level = ctx.createGain();
  level.gain.setValueAtTime(0.018, at);
  level.gain.exponentialRampToValueAtTime(0.0001, at + LENGTH_S);

  source
    .connect(filter("highpass", 720, 0.5))
    .connect(filter("peaking", 2350, 0.85, 3.5))
    .connect(filter("lowpass", 7200, 0.45))
    .connect(level)
    .connect(ctx.destination);
  source.start(at);
}

/** Only called from inside a press, the one place a context may start. */
function play(rate = 1): void {
  if (!soundOn()) return;
  ctx ??= new AudioContext({ latencyHint: "interactive" });
  tick({ rate });
}

function sync(): void {
  const on = soundOn();
  document.documentElement.setAttribute("data-sound", on ? "on" : "off");
  for (const button of document.querySelectorAll<HTMLElement>("[data-sound-toggle]")) {
    button.setAttribute("aria-pressed", String(on));
    button.title = on ? "Sound on" : "Sound off";
  }
}

export function toggleSound(): void {
  chosen = !soundOn();
  store(STORAGE_KEY, chosen ? "on" : "off");
  sync();
  play(); // turning it on answers with the sound it just turned on
}

export function initSound(): void {
  const press = (event: Event) => {
    if (soundTarget(event.target)) play();
  };
  // Capture, so a handler that stops propagation cannot swallow the tick.
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (event.button === 0 && event.pointerType !== "touch") press(event);
    },
    { capture: true, passive: true },
  );
  document.addEventListener(
    "click",
    (event) => {
      if (event.detail === 0) press(event);
    },
    true,
  );
  document.addEventListener("click", (event) => {
    if ((event.target as Element | null)?.closest?.("[data-sound-toggle]")) toggleSound();
  });
  sync();
}
