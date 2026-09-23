/**
 * The palette's Actions rows (VET-267): theme, sound, copy this page's link.
 * A row names the current state (`actionText`, read at render time), and
 * `runAction` runs one in place and rewrites that row, so the palette can stay
 * open and show what changed. Theme presses the page's own toggle
 * (`ThemeToggle.astro`), so there is one theme code path.
 */

import type { Action } from "./search";
import { isTheme, nextTheme } from "./theme";
import { soundOn, toggleSound } from "./ui-sound";

/** An action row's title and subline. */
export function actionText(action: Action): [string, string] {
  if (action === "sound") return [`Sound: ${soundOn() ? "on" : "off"}`, "toggle"];
  if (action === "copy") return ["Copy link", location.pathname];
  const theme = document.documentElement.getAttribute("data-theme");
  const now = isTheme(theme) ? theme : "system";
  return [`Theme: ${now}`, `switch to ${nextTheme(now)}`];
}

/** Run `action`, rewrite `row` to match, and return what to announce. */
export async function runAction(row: HTMLElement, action: Action): Promise<string> {
  let done = "";
  if (action === "sound") toggleSound();
  if (action === "theme") document.querySelector<HTMLButtonElement>("[data-theme-toggle]")?.click();
  if (action === "copy") {
    done = await navigator.clipboard.writeText(location.href).then(
      () => "Link copied",
      () => "Couldn't copy the link",
    );
  }
  const [title, sub] = actionText(action);
  const titleNode = row.querySelector(".palette__row-title");
  const subNode = row.querySelector(".palette__row-sub");
  if (titleNode) titleNode.textContent = done || title;
  if (subNode) subNode.textContent = sub;
  return done || title;
}
