import assert from "node:assert/strict";
import test from "node:test";

import { rebroken } from "./rescrape-posts.mjs";

test("a re-scrape is taken only when it is the same words with more breaks", () => {
  const saved = "Hello there.\n\nSecond para is cut here. Third.";
  const scraped = "Hello there.\n\nSecond para is cut here.\n\nThird.";

  assert.equal(rebroken(saved, scraped), scraped);
  assert.equal(rebroken(scraped, scraped), null, "nothing new to take");
  assert.equal(rebroken(saved, "Hello there.\n\nAn edited post."), null, "different words keep the saved text");
  // A tie: the same words and as many breaks, only in other places. Nothing
  // is gained, so the saved text stays.
  assert.equal(rebroken(saved, "Hello there. Second para is cut here.\n\nThird."), null, "an equal count of breaks is a tie, and a tie keeps the saved text");
  // VET-284: a list run together on one line comes back one item per line.
  assert.equal(rebroken("Into:\n\n•One •Two", "Into:\n\n•One\n•Two"), "Into:\n\n•One\n•Two");
});
