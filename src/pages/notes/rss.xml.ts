import type { APIRoute } from "astro";

import { feedResponse } from "../../lib/feeds";

export const GET: APIRoute = () => feedResponse("/notes");
