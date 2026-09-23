#!/bin/sh
# Vercel's build command (vercel.json, VET-274).
#
# A production build with CONVEX_DEPLOY_KEY set pushes the Convex functions
# first and then builds the site, so the /me pages and the backend they call
# ship together. Every other build (previews, local, before the setup wizard
# has run) is a plain site build: a preview must never deploy a branch's
# functions onto the production backend.
set -eu
if [ "${VERCEL_ENV:-}" = "production" ] && [ -n "${CONVEX_DEPLOY_KEY:-}" ]; then
  exec npx convex deploy --cmd 'npm run build'
fi
exec npm run build
