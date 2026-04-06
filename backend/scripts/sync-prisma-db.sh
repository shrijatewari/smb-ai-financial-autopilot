#!/usr/bin/env bash
# Apply prisma/schema.prisma to the database in DATABASE_URL (backend/.env).
# Uses the venv Prisma CLI (same as prisma-client-py) – no global `prisma` required.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# Prisma spawns `prisma-client-py` as a subprocess; it lives in .venv/bin and must be on PATH.
export PATH="${ROOT}/.venv/bin:${PATH}"
PRISMA="${ROOT}/.venv/bin/prisma"
SCHEMA="${ROOT}/prisma/schema.prisma"
if [[ ! -x "$PRISMA" ]]; then
  echo "Missing ${PRISMA}. Create venv and install prisma:  python -m venv .venv && .venv/bin/pip install prisma" >&2
  exit 1
fi
if [[ ! -f "$ROOT/.env" ]]; then
  echo "Missing backend/.env – copy .env.example and set DATABASE_URL" >&2
  exit 1
fi
echo "→ db push (schema: prisma/schema.prisma)"
"$PRISMA" db push --schema "$SCHEMA"
echo "→ generate client"
"$PRISMA" generate --schema "$SCHEMA"
echo "Done."
