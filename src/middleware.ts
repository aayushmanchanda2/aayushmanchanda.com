/**
 * Clerk runs under /me and nowhere else (VET-274), and only once its keys are
 * set. Every other request, including every prerendered page at build time,
 * passes straight through, so public pages carry no Clerk code or cookies.
 */
import { clerkMiddleware } from "@clerk/astro/server";
import { defineMiddleware } from "astro:middleware";

import { isMePath, meEnv } from "./lib/me";

const clerk = clerkMiddleware();

export const onRequest = defineMiddleware((context, next) =>
  !context.isPrerendered && isMePath(context.url.pathname) && meEnv() !== null ? clerk(context, next) : next(),
);
