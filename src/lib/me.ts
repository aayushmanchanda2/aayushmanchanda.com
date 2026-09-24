/**
 * me.ts — who may see /me (VET-274), decided on the server.
 *
 * Two checks, both required. Here: the session's user, looked up by id through
 * Clerk's backend API, has ALLOWED_EMAIL as primary email; that needs no token
 * claim. Then Convex checks the email again on the token it is handed
 * (`convex/entries.ts › requireOwner`). Clerk's Convex integration puts only
 * `aud` in that token, so the session token needs an `email` claim added once
 * (the wizard's Clerk stage says where); until then Convex refuses, fail closed.
 * Values are read from `process.env` at request time, never inlined into the
 * build, so a local `npm run build` with none of them set still works and
 * /me says it is not configured.
 */
import { ConvexHttpClient } from "convex/browser";

import { api } from "../../convex/_generated/api.js";
import type { PrivateRow } from "./private.ts";
import { isOwner, paneRows, toEntries } from "./private.ts";

export interface MeEnv {
  convexUrl: string;
  allowed: string;
}

/** All four values, or null: /me renders "not configured" and Clerk never runs. */
export function meEnv(env: Record<string, string | undefined> = process.env): MeEnv | null {
  const { PUBLIC_CLERK_PUBLISHABLE_KEY: pk, CLERK_SECRET_KEY: sk, PUBLIC_CONVEX_URL: url, ALLOWED_EMAIL: allowed } = env;
  return pk && sk && url && allowed ? { convexUrl: url, allowed } : null;
}

/** Only /me and below. `/media` is not `/me`. */
export const isMePath = (pathname: string): boolean => /^\/me(?:\/|$)/.test(pathname);

export type Gate =
  | { state: "unconfigured" }
  | { state: "sign-in" }
  | { state: "forbidden" }
  | { state: "owner"; convex: ConvexHttpClient };

export async function gate(locals: App.Locals): Promise<Gate> {
  const env = meEnv();
  if (env === null) return { state: "unconfigured" };
  const auth = locals.auth();
  if (!auth.userId) return { state: "sign-in" };
  const user = await locals.currentUser();
  if (!isOwner(user?.primaryEmailAddress?.emailAddress, env.allowed)) return { state: "forbidden" };
  // The way convex/react-clerk asks: the session token once the Convex
  // integration has set its audience, else the legacy "convex" JWT template.
  const token = await (auth.sessionClaims?.aud === "convex" ? auth.getToken() : auth.getToken({ template: "convex" }));
  if (!token) return { state: "forbidden" };
  const convex = new ConvexHttpClient(env.convexUrl);
  convex.setAuth(token);
  return { state: "owner", convex };
}

export const privateApi = api.entries;

/** Headers every /me response carries, whatever it renders. */
export function privateHeaders(headers: Headers): void {
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Robots-Tag", "noindex, nofollow");
}

/**
 * `/me/api/rows` (VET-276): the private rows as `PaneRow`s, for the signed-in
 * module on public pages. The same gate as every /me page; anyone it does not
 * let through gets a bare 404, the answer a missing route gives.
 */
export async function rowsResponse(locals: App.Locals): Promise<Response> {
  const access = await gate(locals);
  const headers = new Headers();
  privateHeaders(headers);
  if (access.state !== "owner") return new Response(null, { status: 404, headers });
  const rows = toEntries((await access.convex.query(privateApi.list, {})) as PrivateRow[]);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(paneRows(rows)), { headers });
}
