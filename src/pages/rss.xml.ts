import type { APIRoute } from "astro";

import { feedResponse } from "../lib/feeds";

/** Every section's feed in one, newest 50. */
export const GET: APIRoute = () => feedResponse();
