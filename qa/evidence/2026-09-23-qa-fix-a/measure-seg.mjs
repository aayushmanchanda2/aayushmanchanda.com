import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto("http://localhost:4329/library/a-great-cold-email-can-change-your-life");
console.log(await p.evaluate(() => {
  const nav = [...document.querySelectorAll(".seg")].find((el) => el.checkVisibility());
  nav.style.width = "max-content";
  const natural = nav.getBoundingClientRect().width;
  nav.style.width = "";
  return { natural, inPane: nav.getBoundingClientRect().width, container: nav.parentElement.getBoundingClientRect().width };
}));
await b.close();
