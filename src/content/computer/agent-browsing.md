---
title: Give agents the accessibility tree
emoji: 🌳
summary: Firecrawl to read the web, agent-browser to click through it.
order: 4
---

Screenshots are expensive and vague. A tree is cheap and exact, and it's what a screen reader sees anyway.

1. **To get the content**, use Firecrawl: a page that blocks a plain fetch, a whole site as markdown, or one structured field. It's the only reliable way I've found to read a tweet from code.
2. **To log in, click or fill a form**, use agent-browser. It returns the page's accessibility tree with a reference on each element, so the agent clicks a named element instead of guessing at coordinates.

agent-browser's project says it uses about 82% fewer tokens than screenshot-based tools. That matches my use, and it's why I stopped reaching for screenshots.
