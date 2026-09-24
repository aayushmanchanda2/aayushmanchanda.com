// Walks from Clerk's email input up to .gate and prints box + overflow + padding per ancestor.
import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
await p.goto(process.argv[2] ?? "https://aayushmanchanda.com/me/library", { waitUntil: "networkidle" });
await p.waitForSelector("input[name=identifier]", { timeout: 15000 });
console.log(await p.evaluate(() => {
  const out = [];
  for (let el = document.querySelector("input[name=identifier]"); el && !el.classList.contains("gate"); el = el.parentElement) {
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    out.push(`${el.tagName.toLowerCase()}.${[...el.classList].filter((c) => c.startsWith("cl-")).join(".")} x=${r.x.toFixed(1)} w=${r.width.toFixed(1)} ov=${s.overflow} pad=${s.padding} mar=${s.margin} bs=${s.boxShadow.slice(0, 60)} br=${s.borderRadius} border=${s.border.slice(0,40)}`);
  }
  const btn = document.querySelector(".cl-formButtonPrimary"); const bs = getComputedStyle(btn);
  out.push("BTN bg=" + bs.backgroundImage.slice(0, 120) + " | shadow=" + bs.boxShadow.slice(0, 120));
  out.push("BTN inner: " + btn.innerHTML.slice(0, 400));
  return out.join("\n");
}));
await b.close();
