// VET-261 scroll probe (from VET-260, data-mat gone): frame times while /tools scrolls, and every layer
// repaint during the scroll (a repainting mat would show as a full-window
// 1280x800 paint on each frame).
// usage: node perf.mjs [route]
import { chromium } from "playwright";

const [route = "/tools"] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto(`http://localhost:4321${route}`, { waitUntil: "networkidle" });
await p.evaluate(() => {

  document.querySelector("astro-dev-toolbar")?.remove();
});
await p.waitForTimeout(500);
await b.startTracing(p, { categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "disabled-by-default-devtools.timeline.invalidationTracking"] });
const frames = await p.evaluate(async () => {
  const times = [];
  let last = performance.now();
  const end = last + 2000;
  const max = document.documentElement.scrollHeight - innerHeight;
  await new Promise((done) => {
    const tick = (t) => {
      times.push(t - last);
      last = t;
      scrollTo(0, (max * (t - (end - 2000))) / 2000);
      t < end ? requestAnimationFrame(tick) : done();
    };
    requestAnimationFrame(tick);
  });
  times.shift();
  times.sort((a, b) => a - b);
  return { frames: times.length, p50: times[times.length >> 1].toFixed(1), p95: times[Math.floor(times.length * 0.95)].toFixed(1), over20ms: times.filter((t) => t > 20).length };
});
// control: repaint the mat once on purpose, so a probe that sees nothing is
// proven able to see something
await p.evaluate(() => (document.querySelector(".mat").style.outline = "1px solid red"));
await p.waitForTimeout(300);
const trace = JSON.parse(await b.stopTracing()).traceEvents;
const ms = (name) => trace.filter((e) => e.name === name).reduce((sum, e) => sum + (e.dur ?? 0), 0) / 1000;
// every invalidation Chrome records names the node it came from; the mat's
// only one should be the control outline at the end
const inval = trace.filter((e) => /Invalidation/.test(e.name));
const matInval = inval.filter((e) => JSON.stringify(e.args).includes("mat")).length;
const perf = { paintMs: ms("Paint").toFixed(1), rasterMs: ms("RasterTask").toFixed(1), invalidations: inval.length, matInvalidations: matInval };
console.log(JSON.stringify({ route, ...frames, ...perf }));
await b.close();
