// Groups a report's touch failures by control: node agg.cjs <tag>-a11y.json
const r = require(require("path").resolve(process.argv[2]));
const agg = new Map();
for (const [w, by] of Object.entries(r.touch)) for (const [route, v] of Object.entries(by)) for (const f of v.fails) {
  const k = `${f.el} ${f.box} ${f.miss.join(" ")}`;
  const e = agg.get(k) ?? { n: 0, where: new Set(), text: f.text };
  e.n++; e.where.add(`${w}${route}`); agg.set(k, e);
}
for (const [k, e] of [...agg].sort((a, b) => b[1].n - a[1].n)) console.log(e.n, k, JSON.stringify(e.text), [...e.where].slice(0, 2).join(" "));
