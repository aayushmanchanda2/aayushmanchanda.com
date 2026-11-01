/**
 * The one JSON-LD node a /lab prototype carries: a `WebPage` with its name and
 * address, so `validate:schema` holds these pages to the same rule as the rest
 * without the gate learning an exemption. Prototype-only; delete with /lab.
 */
import { pageUrl, type JsonLd } from "../../lib/schema";

export function labJsonLd(path: string, name: string): JsonLd {
  const url = pageUrl(path);
  return { "@context": "https://schema.org", "@graph": [{ "@type": "WebPage", "@id": `${url}#webpage`, name, url }] };
}
