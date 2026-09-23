import { library } from "../../../src/lib/library.ts";
import { postBlocks } from "../../../src/lib/post.ts";
for (const slug of process.argv.slice(2)) {
  const e = library.find((x) => x.slug === slug);
  console.log("=====", slug);
  for (const b of postBlocks(e.post.text)) console.log(b.kind === "p" ? `P  ${b.text.slice(0, 110)}` : `${b.kind.toUpperCase()}(${b.start}) ${b.items.map((i) => i.slice(0, 60)).join(" | ")}`);
}
