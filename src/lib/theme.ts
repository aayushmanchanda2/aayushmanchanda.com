/**
 * theme.ts — the three-state theme, in one module.
 *
 * The site has a light theme and a dark theme, and a reader gets three choices
 * about them: follow the OS (`system`), or pin one (`light`, `dark`). The state
 * lives in exactly one place at runtime, the `data-theme` attribute on `<html>`,
 * and it always carries one of the three words — never nothing. A stylesheet
 * reads it, `ThemeToggle.astro` writes it, and this file is what they agree on.
 *
 * No imports, no DOM: that is what lets `theme.test.mjs` exercise it under
 * `node --experimental-strip-types`, the same split `lib/search.ts` uses to stay
 * testable while `lib/palette.ts` keeps the DOM half.
 *
 * The one piece of DOM work that cannot live in a module is `PREPAINT`: it has
 * to run as a blocking inline script in the head, before the first paint, or a
 * reader who pinned dark gets a white flash on every navigation. It is a string
 * here rather than a script file for the same reason, and it is *built from the
 * tables below* rather than written out by hand, so the pre-paint pass and the
 * runtime pass cannot drift apart.
 */

export const THEMES = ["system", "light", "dark"] as const;

export type Theme = (typeof THEMES)[number];

/** The `<html>` attribute. `styles/global.css` reads the same string. */
export const ATTRIBUTE = "data-theme";

/** The localStorage key. Read by `PREPAINT` before anything else on the page. */
export const STORAGE_KEY = "theme";

export function isTheme(value: unknown): value is Theme {
  return (
    typeof value === "string" && (THEMES as readonly string[]).includes(value)
  );
}

/**
 * The cycle: system, light, dark, and back.
 *
 * System first, because it is the default and the state a reader should be able
 * to return to without clearing storage. Light before dark because light is the
 * `:root` base — the order walks the stylesheet.
 */
export function nextTheme(current: Theme): Theme {
  return THEMES[(THEMES.indexOf(current) + 1) % THEMES.length]!;
}

/**
 * The `media` attribute each `theme-color` meta needs, per chosen theme.
 *
 * Two metas ship in the head, one per scheme, and in `system` they carry the
 * `prefers-color-scheme` queries a browser resolves on its own — which is what
 * keeps the mobile status bar correct with scripting off. Pinning a theme has to
 * take that decision away from the OS, so the chosen scheme's meta becomes
 * `all` and the other becomes `not all`, a query that matches nothing.
 *
 * `not all` rather than removing the element: a meta that is still in the head
 * can be put back on the next press without re-creating it, and a reader
 * cycling through three states should not be mutating the head's shape.
 */
export const THEME_COLOR_MEDIA = {
  system: {
    light: "(prefers-color-scheme: light)",
    dark: "(prefers-color-scheme: dark)",
  },
  light: { light: "all", dark: "not all" },
  dark: { light: "not all", dark: "all" },
} as const;

/** `--bg` per scheme, as the `theme-color` metas carry it. */
export const THEME_COLORS = { light: "#FFFFFF", dark: "#09090B" } as const;

/**
 * The button's accessible name: what the theme is now, and what pressing does
 * next. Both halves, because a three-state control that only announces its
 * current state leaves a screen reader user guessing where the next press goes,
 * and `aria-pressed` cannot describe three states honestly.
 */
export function labelFor(theme: Theme): string {
  return `Theme: ${theme}. Switch to ${nextTheme(theme)}.`;
}

/** The tooltip. Shorter than the label: a pointer user can see the glyph. */
export function titleFor(theme: Theme): string {
  return `Theme: ${theme}`;
}

/** What the live region says after a press. */
export function statusFor(theme: Theme): string {
  return `${theme[0]!.toUpperCase()}${theme.slice(1)} theme`;
}

/**
 * The pre-paint pass, as source.
 *
 * Deliberately tiny and deliberately total: read storage, put a valid word on
 * `<html>`, point the two `theme-color` metas at the right queries. Anything
 * else waits for the module. Wrapped in try/catch because `localStorage` throws
 * outright in a partitioned or storage-blocked context, and a reader who has
 * cookies switched off should still get a page.
 *
 * The metas are queried, so this must be placed *after* them in the head. It is
 * still before `<body>`, which is all the no-flash guarantee needs.
 */
export const PREPAINT = `(function(){try{
var M=${JSON.stringify(THEME_COLOR_MEDIA)};
var t=localStorage.getItem(${JSON.stringify(STORAGE_KEY)});
if(!M[t])t="system";
document.documentElement.setAttribute(${JSON.stringify(ATTRIBUTE)},t);
for(var s in M[t]){
var m=document.querySelector('meta[name="theme-color"][data-scheme="'+s+'"]');
if(m)m.media=M[t][s];
}
}catch(e){}})();`;
