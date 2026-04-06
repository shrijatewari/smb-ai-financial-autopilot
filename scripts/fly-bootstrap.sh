#!/usr/bin/env bash
# One-shot Fly.io setup: app + Postgres + JWT secret + deploy.
# Prerequisite: run `flyctl auth login` once in your terminal (browser flow).
#
# Usage (from repo root):
#   ./scripts/fly-bootstrap.sh
#
# Optional:
#   DATABASE_URL=postgresql://... ./scripts/fly-bootstrap.sh   # skip Fly Postgres; use Neon/Supabase/etc.
#   FLY_ORG=personal ./scripts/fly-bootstrap.sh
set -euo pipefail

export PATH="${HOME}/.fly/bin:${PATH}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}/backend"

if ! command -v flyctl >/dev/null 2>&1; then
  echo "flyctl not found. Install: curl -L https://fly.io/install.sh | sh"
  echo "Then add to PATH: export PATH=\"\$HOME/.fly/bin:\$PATH\""
  exit 1
fi

if ! flyctl auth whoami >/dev/null 2>&1; then
  echo "Not logged in to Fly.io."
  echo "Run:  flyctl auth login"
  exit 1
fi

# Portable parse (macOS sed does not treat \s like GNU sed – avoid broken app names).
APP_NAME="$(awk -F '"' '/^app = / { print $2; exit }' fly.toml)"
if [[ -z "${APP_NAME}" || "${APP_NAME}" == *"="* ]]; then
  echo "Could not parse app name from fly.toml (expected: app = \"your-app-name\")."
  exit 1
fi
ORG="${FLY_ORG:-personal}"
PG_NAME="${FLY_PG_NAME:-${APP_NAME}-pg}"

echo "→ App name: ${APP_NAME}"
echo "→ Org: ${ORG}"

if ! flyctl apps list -q 2>/dev/null | grep -qxF "${APP_NAME}"; then
  echo "→ Creating app ${APP_NAME}..."
  flyctl apps create "${APP_NAME}" --org "${ORG}" --yes
else
  echo "→ App ${APP_NAME} already exists."
fi

if [[ -n "${DATABASE_URL:-}" ]]; then
  echo "→ Using DATABASE_URL from environment (skipping Fly Postgres)."
  flyctl secrets set "DATABASE_URL=${DATABASE_URL}" -a "${APP_NAME}" --stage
else
  if ! flyctl apps list -q 2>/dev/null | grep -qxF "${PG_NAME}"; then
    echo "→ Creating Postgres cluster ${PG_NAME} (region bom, this can take a few minutes)..."
    flyctl postgres create \
      --name "${PG_NAME}" \
      --org "${ORG}" \
      --region bom \
      --vm-size shared-cpu-1x \
      --volume-size 10 \
      --initial-cluster-size 1
  else
    echo "→ Postgres app ${PG_NAME} already exists."
  fi

  echo "→ Attaching ${PG_NAME} to ${APP_NAME} (sets DATABASE_URL)..."
  flyctl postgres attach "${PG_NAME}" -a "${APP_NAME}" -y || {
    echo "Attach failed (already attached?). Continuing if DATABASE_URL exists on the app."
  }
fi

JWT_SECRET="$(openssl rand -hex 32)"
echo "→ Setting JWT_SECRET_KEY..."
flyctl secrets set "JWT_SECRET_KEY=${JWT_SECRET}" -a "${APP_NAME}" --stage

echo "→ Deploying (build runs on Fly; release_command applies Prisma schema)..."
flyctl deploy --remote-only

echo ""
echo "Done."
echo "  API:  https://${APP_NAME}.fly.dev"
echo "  Docs: https://${APP_NAME}.fly.dev/docs"
echo ""
echo "Next: set your frontend build env (no trailing slash):"
echo "  VITE_API_URL=https://${APP_NAME}.fly.dev"
echo "  Then rebuild/redeploy Netlify or Vercel."
