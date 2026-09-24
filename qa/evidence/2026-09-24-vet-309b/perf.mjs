/**
 * VET-309b perf probe (copy of VET-309's, plus FCP, the LCP element and the document's bytes). Run from the repo root against a static server of dist/:
 *   node qa/evidence/2026-09-24-vet-309/perf.mjs --base http://localhost:4409 --out before.json
 *
 * Per route at 390x844: Lighthouse mobile (simulated Slow 4G, 4x CPU; the cached
 * npx copy, nothing downloaded) for LCP, TBT, CLS and bytes, then a Playwright
 * pass (4x CPU via CDP, Slow 4G) that counts <img>, scrolls the page with a touch
 * gesture and records rAF frame times and the image bytes the scroll pulled.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { chromium } from "playwright";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
};
const base = arg("base", "http://localhost:4409");
const out = path.join(path.dirname(new URL(import.meta.url).pathname), arg("out", "perf.json"));
const routes = arg("routes", "/sites/,/sites/arc-from-the-browser-company/,/tools/").split(",");

const npx = path.join(os.homedir(), ".npm/_npx");
const lhDir = readdirSync(npx).map((d) => path.join(npx, d, "node_modules/lighthouse")).find((d) => existsSync(d) && JSON.parse(readFileSync(path.join(d, "package.json"), "utf8")).version.startsWith("13.5"));
const chromePath = chromium.executablePath();

function lighthouse(url, tries = 3) {
  try {
    return lighthouseOnce(url);
  } catch (error) {
    if (tries <= 1) throw error;
    return lighthouse(url, tries - 1); // Chrome launch is flaky under load
  }
}

function lighthouseOnce(url) {
  const file = path.join(os.tmpdir(), `lh-${Date.now()}.json`);
  execFileSync(process.execPath, [
    path.join(lhDir, "cli/index.js"), url, "--quiet", "--output=json", `--output-path=${file}`,
    "--only-categories=performance", "--form-factor=mobile",
    "--screenEmulation.mobile", "--screenEmulation.width=390", "--screenEmulation.height=844", "--screenEmulation.deviceScaleFactor=3",
    "--chrome-flags=--headless=new",
  ], { env: { ...process.env, CHROME_PATH: chromePath }, stdio: "ignore" });
  const lhr = JSON.parse(readFileSync(file, "utf8"));
  const a = lhr.audits;
  const items = a["network-requests"].details.items;
  const images = items.filter((r) => r.resourceType === "Image");
  return {
    score: Math.round(lhr.categories.performance.score * 100),
    lcpMs: Math.round(a["largest-contentful-paint"].numericValue),
    tbtMs: Math.round(a["total-blocking-time"].numericValue),
    cls: Number(a["cumulative-layout-shift"].numericValue.toFixed(3)),
    totalKB: Math.round(a["total-byte-weight"].numericValue / 1024),
    imageRequests: images.length,
    imageKB: Math.round(images.reduce((s, r) => s + r.transferSize, 0) / 1024),
    fcpMs: Math.round(a["first-contentful-paint"].numericValue),
    lcpElement: a["lcp-breakdown-insight"]?.details?.items?.find((i) => i.type === "node")?.snippet ?? null,
    documentKB: Math.round((items.find((r) => r.resourceType === "Document")?.transferSize ?? 0) / 1024),
  };
}

async function scroll(browser, url) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  let imageBytes = 0;
  const types = new Map();
  cdp.on("Network.responseReceived", (e) => types.set(e.requestId, e.type));
  cdp.on("Network.loadingFinished", (e) => { if (types.get(e.requestId) === "Image") imageBytes += e.encodedDataLength; });
  await page.goto(url, { waitUntil: "load", timeout: 180_000 });
  const html = await page.evaluate(() => ({
    htmlKB: Math.round(document.documentElement.outerHTML.length / 1024),
    img: document.images.length,
    eager: [...document.images].filter((i) => i.loading !== "lazy").length,
    high: [...document.images].filter((i) => i.getAttribute("fetchpriority") === "high").length,
    fullShotSrc: [...document.images].filter((i) => /^\/shots\/[^/]+\.webp$/.test(new URL(i.currentSrc || i.src).pathname)).length,
  }));
  const loadImageKB = Math.round(imageBytes / 1024);
  await page.evaluate(() => {
    window.__frames = [];
    let last = performance.now();
    const tick = (t) => { window.__frames.push(t - last); last = t; if (window.__run) requestAnimationFrame(tick); };
    window.__run = true;
    requestAnimationFrame(tick);
  });
  const distance = await page.evaluate(() => Math.min(document.documentElement.scrollHeight - innerHeight, 8000));
  await cdp.send("Input.synthesizeScrollGesture", { x: 195, y: 600, yDistance: -distance, speed: 1200, gestureSourceType: "touch", repeatCount: 1 });
  await page.waitForTimeout(500);
  const frames = await page.evaluate(() => { window.__run = false; return window.__frames.slice(1); });
  const total = frames.reduce((s, f) => s + f, 0);
  await context.close();
  return {
    ...html,
    loadImageKB,
    scrollImageKB: Math.round(imageBytes / 1024),
    scrollPx: distance,
    frames: frames.length,
    fps: Math.round((frames.length / total) * 1000),
    longFrames50: frames.filter((f) => f > 50).length,
    worstFrameMs: Math.round(Math.max(...frames)),
  };
}

const browser = await chromium.launch();
const result = { base, date: new Date().toISOString(), routes: {} };
for (const route of routes) {
  const url = base + route;
  // Median of three by LCP: this machine runs other agents, and one Lighthouse
  // run swings LCP by seconds.
  const runs = [lighthouse(url), lighthouse(url), lighthouse(url)].sort((a, b) => a.lcpMs - b.lcpMs);
  result.routes[route] = { lighthouse: { ...runs[1], tbtMsRuns: runs.map((r) => r.tbtMs), lcpMsRuns: runs.map((r) => r.lcpMs) }, scroll: await scroll(browser, url) };
  console.log(route, JSON.stringify(result.routes[route]));
}
await browser.close();
writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
