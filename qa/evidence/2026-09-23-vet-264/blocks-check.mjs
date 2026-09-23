// VET-264: every post over 280 characters, how its text splits into blocks, and whether each keyline lands in one block.
import { library } from "../../../src/lib/library.ts";
import { postBlocks } from "../../../src/lib/post.ts";
const rows = [];
for (const e of library) {
  if (!e.post || e.post.article) continue;
  const blocks = postBlocks(e.post.text);
  const count = (k) => blocks.filter((b) => b.kind === k).length;
  if ([...e.post.text].length > 280) rows.push(`${e.slug} chars=${[...e.post.text].length} p=${count("p")} ol=${count("ol")} ul=${count("ul")} hl=${e.highlights.length}`);
  if (e.keyline) {
    const pieces = blocks.flatMap((b) => (b.kind === "p" ? [b.text] : b.items));
    if (!pieces.some((t) => t.includes(e.keyline))) rows.push(`KEYLINE MISS ${e.slug}`);
  }
}
console.log(rows.join("\n"));
