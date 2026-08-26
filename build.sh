#!/usr/bin/env bash
# Production build for Cal-ID.
#
# Mirrors the ordering used by the upstream Dockerfile rather than the bare
# `yarn build`, because the web build depends on two artifacts that turbo's
# build graph does not produce on its own:
#   - @calcom/embed-core must be built and copied into apps/web/public/embed
#     so the embed snippet is servable from this host.
#   - copy-app-store-static stages the app-store's static assets into public/.
#
# Re-run this after any `git pull`, and remember that NEXT_PUBLIC_* values are
# inlined at build time, so a domain change requires a full rebuild.
set -euo pipefail

cd /srv/meet.labattsimon.com

# The Next.js build of this monorepo peaks well above the default heap ceiling;
# upstream uses 6144 MiB for the same reason.
export NODE_OPTIONS="--max-old-space-size=6144"
export NODE_ENV=production

echo "==> [1/4] building @calcom/trpc"
yarn workspace @calcom/trpc run build

echo "==> [2/4] building @calcom/embed-core"
yarn workspace @calcom/embed-core run build

echo "==> [3/4] staging app-store static assets"
yarn workspace @calcom/web run copy-app-store-static

echo "==> [4/4] building @calcom/web"
yarn workspace @calcom/web run build

echo "==> build complete"
