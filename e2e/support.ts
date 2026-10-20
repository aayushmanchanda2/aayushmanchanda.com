import { test } from '@e2e-dev/web';
import type { Browser } from '@e2e-dev/web';

/** The public and synthetic fixture tests share one runner report. */
export async function localOnly(baseUrl: string | undefined, browser: Browser, target: 'public' | 'fixture') {
  const expected = target === 'public' ? ':4329' : ':4330';
  test.skip(!baseUrl?.includes(expected), `${target} target only`);
  await browser.route('**/*', async (route) => {
    const url = new URL(route.request.url);
    if (url.hostname === '127.0.0.1' && [4329, 4330].includes(Number(url.port))) {
      await route.continue();
    } else {
      await route.abort();
    }
  });
}

export async function path(browser: Browser) {
  return new URL(await browser.url()).pathname;
}
