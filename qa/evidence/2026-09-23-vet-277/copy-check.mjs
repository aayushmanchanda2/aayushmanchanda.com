// Every copy button, clicked for real, with the clipboard permission denied (the
// production failure), then with execCommand failing too (the ⌘C fallback).
//   node qa/evidence/2026-09-23-vet-277/copy-check.mjs <base>
import { chromium } from "playwright";
const base = process.argv[2];
const b = await chromium.launch();
const rows = [];
async function run(route, selector, { execFails = false } = {}) {
  const ctx = await b.newContext(); // no clipboard-write permission: writeText rejects
  const p = await ctx.newPage();
  await p.goto(base + route, { waitUntil: "networkidle" });
  await p.evaluate((execFails) => {
    window.__copied = null;
    const orig = document.execCommand.bind(document);
    document.execCommand = (cmd) => {
      if (execFails) return false;
      const ok = orig(cmd);
      window.__copied = ok ? document.getSelection().toString() || document.activeElement?.value : null;
      return ok;
    };
    document.addEventListener("copy", (e) => { window.__copied = document.activeElement?.value ?? String(document.getSelection()); });
  }, execFails);
  if (selector.startsWith("details")) await p.click("details.found summary");
  const btn = p.locator(selector).first();
  const value = await btn.getAttribute("data-copy");
  await btn.click();
  await p.waitForTimeout(150);
  const out = await p.evaluate(() => ({
    label: document.activeElement?.closest("[data-copy-root]")?.querySelector("[data-copy-label]")?.textContent,
    status: [...document.querySelectorAll("[data-copy-status]")].map((s) => s.textContent).filter(Boolean)[0] ?? "",
    selection: String(document.getSelection()),
    copied: window.__copied,
    focusKept: document.activeElement?.hasAttribute("data-copy"),
  }));
  rows.push({ route, execFails, copiedMatches: out.copied === value, selectedMatches: execFails ? out.selection === value : "-", status: out.status, focusKept: out.focusKept });
  await ctx.close();
}
await run("/library/jason-liu-codex-operating-system/", "[data-block-prompt] ~ button[data-copy]");
await run("/library/jason-liu-codex-operating-system/", "[data-block-prompt] ~ button[data-copy]", { execFails: true });
await run("/me/fixture/entry", "[data-block-prompt] ~ button[data-copy]");
await run("/sites/otherkind/", ".swatches button[data-copy]");
await run("/sites/otherkind/", ".swatches button[data-copy]", { execFails: true });
await run("/sites/rauno-freiberg-note-4/", "details.found button[data-copy]");
await run("/sites/rauno-freiberg-note-4/", "details.found button.row[data-copy]", { execFails: true });
console.table(rows);
await b.close();
