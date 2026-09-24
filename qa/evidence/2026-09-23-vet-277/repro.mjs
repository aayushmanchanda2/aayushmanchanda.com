// Repro: a real click on the block's Copy button on production.
import { chromium, webkit } from "playwright";
const url = process.argv[2] ?? "https://aayushmanchanda.com/library/jason-liu-codex-operating-system/";
for (const [name, type, perms] of [["chromium-noperm", chromium, []], ["chromium-perm", chromium, ["clipboard-read", "clipboard-write"]], ["webkit", webkit, []]]) {
  let b;
  try { b = await type.launch(); } catch (e) { console.log(name, "launch failed", e.message.split("\n")[0]); continue; }
  const ctx = await b.newContext({ permissions: perms });
  const p = await ctx.newPage();
  const errs = [];
  p.on("console", (m) => errs.push(m.text()));
  await p.goto(url, { waitUntil: "networkidle" });
  // Record the writeText rejection reason without changing behaviour.
  await p.evaluate(() => {
    const c = navigator.clipboard; if (!c) { window.__why = "no navigator.clipboard"; return; }
    const orig = c.writeText.bind(c);
    c.writeText = (t) => orig(t).catch((e) => { window.__why = e.name + ": " + e.message; throw e; });
  });
  await p.click("[data-copy]");
  await p.waitForTimeout(300);
  const label = await p.textContent("[data-copy-label]");
  console.log(name, "| label:", label, "| why:", await p.evaluate(() => window.__why ?? "resolved"), "| secure:", await p.evaluate(() => isSecureContext));
  await b.close();
}
