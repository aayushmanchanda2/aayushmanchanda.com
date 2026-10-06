import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const port = 4331;
const base = `http://127.0.0.1:${port}`;
const fixturePort = 4332;
const fixtureBase = `http://127.0.0.1:${fixturePort}`;
const indexRoutes = ['/', '/library/', '/library/kind/article/', '/tools/', '/sites/', '/notes/', '/experiments/', '/about/', '/now/', '/contact/', '/privacy/', '/design/', '/404.html'];
const fixtureRoutes = ['entry', 'post', 'video', 'index', 'sign-in', 'unconfigured', 'not-found'].map((state) => `/me/fixture/${state}`);
const out = '.e2e/screenshots';
mkdirSync(out, { recursive: true });

// Run the exact DOM overflow scan maintained by the repo's verify-site skill.
const source = readFileSync('.claude/skills/verify-site/overflow.mjs', 'utf8');
const scanSource = source.slice(source.indexOf('function scan() {'), source.indexOf('\nconst browser = await chromium.launch();'));
if (!scanSource.startsWith('function scan() {')) throw new Error('verify-site overflow scanner moved');
const scan = /** @type {() => string[]} */ (new Function(`${scanSource}\nreturn scan();`));

for (const [address, number] of /** @type {Array<[string, number]>} */ ([[base, port], [fixtureBase, fixturePort]])) {
  const occupied = await fetch(address).then(() => true, () => false);
  if (occupied) throw new Error(`Port ${number} is already in use`);
}

const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', 'dist'], { stdio: 'ignore' });
const fixtureServer = spawn('node', ['node_modules/astro/bin/astro.mjs', 'dev', '--host', '127.0.0.1', '--port', String(fixturePort)], {
  stdio: 'ignore',
  env: { ...process.env, ASTRO_DEV_BACKGROUND: '0' }, // Suppress Astro's agent-detected background daemon.
});
let browser;
const report = [];
try {
  for (const [address, label] of [[base, 'static'], [fixtureBase, 'fixture']]) {
    let ready = false;
    for (let i = 0; i < 120; i++) {
      ready = await fetch(address).then((response) => response.ok, () => false);
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!ready) throw new Error(`Visual check ${label} server did not start`);
  }
  browser = await chromium.launch();

  // Resolve detail pages from their current index links: cron imports can change slugs.
  const discovery = await browser.newPage();
  /** @param {string} route @param {string} selector */
  async function linked(route, selector) {
    await discovery.goto(base + route, { waitUntil: 'load' });
    const href = await discovery.locator(selector).first().getAttribute('href');
    if (!href || new URL(href, base).origin !== base) throw new Error(`Missing local detail link: ${route} ${selector}`);
    return new URL(href, base).pathname;
  }
  const detailRoutes = [
    await linked('/library/', 'nav[data-pane] [data-rows] a[href]'),
    await linked('/tools/', 'a[data-panel-open]:visible'),
    await linked('/sites/', 'a[data-panel-open]:visible'),
    await linked('/notes/', 'section[aria-labelledby^="y"] a[href^="/notes/"]'),
    await linked('/notes/', 'section[aria-labelledby="how-i-work"] a[href^="/notes/"]'),
  ];
  await discovery.close();
  const routes = [...indexRoutes, ...detailRoutes.map((route) => new URL(route, base).pathname)];
  /** @param {import('playwright').Page} page @param {string} url */
  async function inspect(page, url) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await page.goto(url, { waitUntil: 'networkidle' });
        await page.evaluate(() => document.fonts.ready);
        const state = await page.evaluate(() => ({
          theme: document.documentElement.dataset.theme,
          bg: getComputedStyle(document.body).backgroundColor,
          // The nav panel normally animates; reduced motion must shorten that actual transition.
          navTransition: document.querySelector('[data-mnav-panel]') ? getComputedStyle(/** @type {Element} */ (document.querySelector('[data-mnav-panel]'))).transitionDuration : '',
        }));
        return { status: response?.status() ?? 0, state, findings: await page.evaluate(scan) };
      } catch (error) {
        // Astro dev can replace a fixture document once as it starts warming.
        if (attempt === 2 || !String(error).includes('Execution context was destroyed')) throw error;
      }
    }
    throw new Error(`Could not inspect ${url}`);
  }
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
      return [base, fixtureBase].includes(url.origin) ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    for (const route of [...routes, ...fixtureRoutes]) {
      const origin = route.startsWith('/me/') ? fixtureBase : base;
      const { status, state, findings } = await inspect(page, origin + route);
      // Subpixel glyph overhang can round to a 1–3px range beyond a text box
      // without increasing scrollWidth. Keep it in the report, but fail spills.
      const minorOverhang = findings.filter((issue) => {
        const match = /^text in .+ right (\d+) > its box (\d+)/.exec(issue);
        return match && Number(match[1]) - Number(match[2]) <= 3;
      });
      const overflow = findings.filter((issue) => !minorOverhang.includes(issue));
      const shot = `${route.replaceAll('/', '_') || 'home'}-${theme}-375-reduced.png`;
      await page.screenshot({ path: `${out}/${shot}`, animations: 'disabled' });
      const result = { route, origin, status, ...state, overflow, minorOverhang, screenshot: shot };
      report.push(result);
      const transitions = state.navTransition.split(',').map((duration) => {
        const seconds = parseFloat(duration);
        return duration.trim().endsWith('ms') ? seconds / 1000 : seconds;
      });
      const statusOK = route === '/me/fixture/not-found' ? [200, 404].includes(result.status) : result.status === 200;
      if (!statusOK || state.theme !== theme || !state.navTransition || transitions.some((seconds) => seconds > 0.001) || overflow.length) {
        throw new Error(`${route} ${theme}: HTTP ${result.status}, theme ${state.theme}, nav transition ${state.navTransition}, overflow ${overflow.slice(0, 3).join('; ')}`);
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
    await context.route('**/*', (route) => [base, fixtureBase].includes(new URL(route.request().url()).origin) ? route.continue() : route.abort());
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
  if (fixtureServer.exitCode === null) {
    fixtureServer.kill('SIGTERM');
    await new Promise((resolve) => fixtureServer.once('exit', resolve));
  }
}
console.log(`Visual checks passed: ${report.length} mobile looks, reduced motion on; screenshots in ${out}`);
