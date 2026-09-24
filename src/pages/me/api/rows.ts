/** /me/api/rows (VET-276): the private rows for the signed-in module, behind the /me gate, never cached. */
import type { APIRoute } from "astro";

import { rowsResponse } from "../../../lib/me";

export const prerender = false;

export const GET: APIRoute = ({ locals }) => rowsResponse(locals);
