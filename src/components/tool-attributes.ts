import { assetFor } from "../lib/assets";
import { linkLabel } from "../lib/links";
import { previewAttributes } from "../lib/preview-card";
import { VERDICTS, categorySlug, tools, type Tool } from "../lib/tools";
import { rowAttributes } from "../lib/tools-table";

/**
 * The data attributes a /tools row (`ToolList.astro`) or grid tile
 * (`ToolGrid.astro`) carries: sort and filter keys (`lib/tools-table.ts`) and
 * the hover card's words (`lib/preview-card.ts`).
 */
export function toolAttributes(tool: Tool): Record<string, string> {
  const home = tool.url ?? tool.repo;
  return {
    ...rowAttributes(tool, {
      verdictRank: VERDICTS.indexOf(tool.verdict),
      categorySlug: categorySlug(tool.category),
      index: tools.indexOf(tool),
    }),
    ...previewAttributes({
      image: assetFor("previews", tool.slug),
      name: tool.name,
      domain: home === null ? "" : linkLabel(home),
      description: tool.description,
      note: tool.note,
    }),
  };
}
