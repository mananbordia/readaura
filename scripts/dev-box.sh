#!/usr/bin/env bash
# Run the LOCAL dev frontend against the PRODUCTION club backend (the Oracle box),
# only to verify a just-deployed backend (see CLAUDE.md "Deploying to production").
#
# It pulls the box URL + proxy secret from Vercel ON DEMAND (never stored in the
# repo, always current — e.g. after a secret rotation) and runs the FE on :3001,
# a separate origin so its browser data (club JWT + IndexedDB) never mixes with
# your local-backend dev on :3000. Plain `npm run dev` stays fully local.
set -euo pipefail

cat <<'BANNER'

  ┌──────────────────────────────────────────────────────────────┐
  │  ⚠  LOCAL FRONTEND  →  PRODUCTION BACKEND (the Oracle box)      │
  │  Reads/writes LIVE data — use only to verify a deploy.         │
  │  Open http://localhost:3001  (separate origin from :3000)      │
  └──────────────────────────────────────────────────────────────┘

BANNER

# Pull prod env to a temp file outside the repo; remove it on exit.
ENVFILE="$(mktemp "${TMPDIR:-/tmp}/readaura-box-env.XXXXXX")"
trap 'rm -f "$ENVFILE"' EXIT INT TERM

echo "→ Pulling production env from Vercel…"
vercel env pull "$ENVFILE" --environment=production --yes >/dev/null

# Exported real env vars take precedence over .env.local in Next, so this points
# the FE at the box for this run only (without touching .env.local on disk).
set -a
# shellcheck source=/dev/null
. "$ENVFILE"
set +a

case "${CLUB_BACKEND_URL:-}" in
  ""|*localhost*|*127.0.0.1*)
    echo "✗ Pulled CLUB_BACKEND_URL is empty or localhost — aborting (expected the box)." >&2
    exit 1 ;;
esac

echo "→ Backend for this run: $CLUB_BACKEND_URL"
echo "→ Starting Next dev on http://localhost:3001 …"
echo
./node_modules/.bin/next dev -p 3001
