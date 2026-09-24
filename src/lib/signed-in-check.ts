/**
 * signed-in-check.ts — the one line every page runs to find out whether
 * Aayush is signed in, before anything else loads (`layouts/Base.astro`).
 *
 * Clerk's browser SDK writes `__client_uat` (and a `__client_uat_<suffix>`
 * copy) on this domain, not HttpOnly: the client's last sign-in time in
 * seconds, or "0" once it has no signed-in session. So a visitor who never
 * signed in has no such cookie, and the check is a regex over
 * `document.cookie` and nothing more. Only a non-zero value imports the
 * signed-in module (`lib/signed-in.ts`). The cookie can be stale (a session
 * that expired while no Clerk code ran) or forged; either way the module asks
 * Clerk and the server before it shows anything, and fails quietly.
 */

/** A non-zero `__client_uat`, suffixed or not. */
export const SIGNED_IN = /(?:^|;\s*)__client_uat(?:_[\w-]+)?=[1-9]/;

/** The inline script: `src` is `/signed-in.js` in a build, the source file under `astro dev`. */
export const signedInCheck = (src: string): string =>
  `${SIGNED_IN}.test(document.cookie)&&import(${JSON.stringify(src)}).catch(function(){});`;
