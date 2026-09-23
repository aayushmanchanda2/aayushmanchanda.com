import assert from "node:assert/strict";
import test from "node:test";

import { rebroken } from "./rescrape-posts.mjs";

test("a re-scrape is taken only when it is the same words with more breaks", () => {
  const saved = "Hello there.\n\nSecond para is cut here. Third.";
  const scraped = "Hello there.\n\nSecond para is cut here.\n\nThird.";

  assert.equal(rebroken(saved, scraped), scraped);
  assert.equal(rebroken(scraped, scraped), null, "nothing new to take");
  assert.equal(rebroken(saved, "Hello there.\n\nAn edited post."), null, "different words keep the saved text");
});
