// Prints every CSS rule that matches Clerk's input / button / cardBox and sets the props we fight over.
import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
await p.goto(process.argv[2] ?? "https://aayushmanchanda.com/me/library", { waitUntil: "networkidle" });
await p.waitForSelector("input[name=identifier]", { timeout: 15000 });
console.log(await p.evaluate(() => {
  const els = { input: document.querySelector("input[name=identifier]"), btn: document.querySelector(".cl-formButtonPrimary"), cardBox: document.querySelector(".cl-cardBox"), card: document.querySelector(".cl-card") };
  const out = [];
  for (const sheet of document.styleSheets) {
    let rules; try { rules = sheet.cssRules; } catch { continue; }
    for (const r of rules) {
      if (!r.selectorText) continue;
      for (const [k, el] of Object.entries(els)) {
        let m = false; try { m = el.matches(r.selectorText.replace(/::?(before|after)/g, "")) } catch {}
        if (m && /box-shadow|border|background|overflow|margin|padding/.test(r.style.cssText)) out.push(`${k} :: ${r.selectorText} { ${r.style.cssText.slice(0, 300)} }`);
      }
    }
  }
  out.push("clerk version: " + (window.Clerk?.version ?? "?"));
  return out.join("\n");
}));
await b.close();
