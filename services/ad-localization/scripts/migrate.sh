#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../backend"

# First-time setup: generate the initial migration from the current model metadata
if [ -z "$(ls alembic/versions/*.py 2>/dev/null || true)" ]; then
  echo "no migrations found — creating initial migration"
  alembic revision --autogenerate -m "initial schema"
fi

alembic upgrade head
