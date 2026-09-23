/**
 * me.ts — who may see /me (VET-274), decided on the server.
 *
 * Two checks, both required: Clerk says there is a session and its primary
 * email is ALLOWED_EMAIL, and then Convex checks the same email again on the
 * "convex" JWT before it returns a row (`convex/entries.ts › requireOwner`).
 * Values are read from `process.env` at request time, never inlined into the
 * build, so a local `npm run build` with none of them set still works and
 * /me says it is not configured.
 */
import { ConvexHttpClient } from "convex/browser";

import { api } from "../../convex/_generated/api.js";
import { isOwner } from "./private.ts";

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
  const token = await auth.getToken({ template: "convex" });
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
