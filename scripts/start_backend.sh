#!/usr/bin/env bash
# Run from repo root or any directory: installs deps and starts FastAPI on :8000
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend"
if [[ ! -d .venv ]]; then
  python3 -m venv .venv
fi
./.venv/bin/pip install -q -r requirements.txt
export PATH="$ROOT/backend/.venv/bin:$PATH"
export PRISMA_CACHE_DIR="${PRISMA_CACHE_DIR:-$ROOT/backend/.prisma-cache}"
prisma generate
exec ./.venv/bin/uvicorn app:app --reload --host 0.0.0.0 --port 8000
