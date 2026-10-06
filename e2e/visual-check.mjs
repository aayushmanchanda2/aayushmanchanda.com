import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const port = 4331;
const base = `http://127.0.0.1:${port}`;
const routes = ['/', '/library/', '/library/kind/article/', '/tools/', '/sites/', '/notes/', '/experiments/', '/about/', '/now/', '/contact/', '/privacy/', '/design/'];
const out = '.e2e/screenshots';
mkdirSync(out, { recursive: true });

// Run the exact DOM overflow scan maintained by the repo's verify-site skill.
const source = readFileSync('.claude/skills/verify-site/overflow.mjs', 'utf8');
const scanSource = source.slice(source.indexOf('function scan() {'), source.indexOf('\nconst browser = await chromium.launch();'));
if (!scanSource.startsWith('function scan() {')) throw new Error('verify-site overflow scanner moved');
const scan = /** @type {() => string[]} */ (new Function(`${scanSource}\nreturn scan();`));

try {
  const occupied = await fetch(base).then(() => true, () => false);
  if (occupied) throw new Error(`Port ${port} is already in use`);
} catch (error) {
  if (error instanceof Error && error.message.includes('already in use')) throw error;
}

const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', 'dist'], { stdio: 'ignore' });
let browser;
const report = [];
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    ready = await fetch(base).then((response) => response.ok, () => false);
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error('Visual check static server did not start');
  browser = await chromium.launch();
  for (const theme of /** @type {const} */ (['light', 'dark'])) {
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
      isMobile: true,
      hasTouch: true,
      colorScheme: theme,
      reducedMotion: 'reduce',
    });
    await context.addInitScript((value) => localStorage.setItem('theme', value), theme);
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      return url.origin === base ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    for (const route of routes) {
      const response = await page.goto(base + route, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const state = await page.evaluate(() => ({
        theme: document.documentElement.dataset.theme,
        motion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        bg: getComputedStyle(document.body).backgroundColor,
      }));
      const overflow = await page.evaluate(scan);
      const shot = `${route.replaceAll('/', '_') || 'home'}-${theme}-375-reduced.png`;
      await page.screenshot({ path: `${out}/${shot}`, animations: 'disabled' });
      const result = { route, status: response?.status(), ...state, overflow, screenshot: shot };
      report.push(result);
      if (result.status !== 200 || state.theme !== theme || !state.motion || overflow.length) {
        throw new Error(`${route} ${theme}: HTTP ${result.status}, theme ${state.theme}, motion ${state.motion}, overflow ${overflow.slice(0, 3).join('; ')}`);
      }
    }
    await context.close();
  }

  // The design contract also requires OS-following themes and pinned themes
  // that oppose the OS preference. These four routes exercise both CSS paths.
  const fourLooks = [
    { stored: 'system', os: 'light', expected: 'light' },
    { stored: 'system', os: 'dark', expected: 'dark' },
    { stored: 'light', os: 'dark', expected: 'light' },
    { stored: 'dark', os: 'light', expected: 'dark' },
  ];
  for (const look of fourLooks) {
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
      isMobile: true,
      hasTouch: true,
      colorScheme: /** @type {'light' | 'dark'} */ (look.os),
      reducedMotion: 'reduce',
    });
    if (look.stored !== 'system') await context.addInitScript((value) => localStorage.setItem('theme', value), look.stored);
    await context.route('**/*', (route) => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    const page = await context.newPage();
    for (const route of ['/', '/tools/', '/library/', '/sites/']) {
      const response = await page.goto(base + route, { waitUntil: 'load' });
      const state = await page.evaluate(() => ({
        theme: document.documentElement.dataset.theme,
        bg: getComputedStyle(document.body).backgroundColor,
      }));
      const shot = `${route.replaceAll('/', '_') || 'home'}-${look.stored}-on-${look.os}-375.png`;
      await page.screenshot({ path: `${out}/${shot}`, animations: 'disabled' });
      const result = { route, mode: `${look.stored}-on-${look.os}`, status: response?.status(), ...state, screenshot: shot };
      report.push(result);
      const expectedBg = look.expected === 'light' ? 'rgb(255, 255, 255)' : 'rgb(0, 0, 0)';
      if (response?.status() !== 200 || state.theme !== look.stored || state.bg !== expectedBg) {
        throw new Error(`${route} ${look.stored} on ${look.os}: HTTP ${result.status}, theme ${state.theme}, bg ${state.bg}`);
      }
    }
    await context.close();
  }
} finally {
  writeFileSync('.e2e/visual-report.json', JSON.stringify(report, null, 2) + '\n');
  await browser?.close();
  if (server.exitCode === null) {
    server.kill('SIGTERM');
    await new Promise((resolve) => server.once('exit', resolve));
  }
}
console.log(`Visual checks passed: ${report.length} mobile looks, reduced motion on; screenshots in ${out}`);
