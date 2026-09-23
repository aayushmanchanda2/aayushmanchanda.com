#!/bin/sh
# Diff sample built pages against the before/ snapshot, cid and hashed-asset noise stripped.
B=qa/evidence/2026-09-22-qa-fix-2/before/dist
norm() { sed -E 's/ data-astro-cid-[a-z0-9]+(="[^"]*")?//g; s/astro-cid-[a-z0-9]+//g; s#/_astro/[A-Za-z0-9_.@-]+#/_astro/X#g' "$1" | tr '>' '\n' | sed 's/^[[:space:]]*//' | grep -v '^$'; }
for p in index.html tools/index.html tools/agent-browser/index.html library/60-new-creative-growth-ideas/index.html notes/index.html notes/building-this-site/index.html rss.xml; do
  echo "=== $p"
  norm "$B/$p" > $B/../a.txt; norm "dist/$p" > $B/../b.txt
  diff $B/../a.txt $B/../b.txt | head -${LINES:-40}
done
