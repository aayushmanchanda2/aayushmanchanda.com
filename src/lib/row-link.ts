/**
 * row-link.ts — a press anywhere on a `.dtable` row (/tools, /sites, the
 * verdict and category tables) opens that row's one link, `.row__link`
 * (VET-306).
 *
 * It replaced a stretched `::after` on the link: iPadOS WebKit does not make a
 * `<tr>` a containing block, so each overlay covered the whole table and the
 * last row took every tap. The link itself is still the tab stop and the only
 * thing a right click, a modifier click or a long press acts on.
 *
 * Capture phase, so the press reaches `detail-panel.ts` as a click on the link
 * (open that entry) and never as a click on the index's empty canvas (close).
 */
document.addEventListener(
  "click",
  (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target;
    if (!(target instanceof Element) || target.closest("a, button, input, select, textarea, summary, label")) return;
    const link = target.closest(".dtable tbody tr")?.querySelector<HTMLAnchorElement>(".row__link");
    // A drag that selected text in a cell is a selection, not a press.
    if (!link || !(getSelection()?.isCollapsed ?? true)) return;
    event.stopPropagation();
    event.preventDefault();
    link.click();
  },
  true,
);
