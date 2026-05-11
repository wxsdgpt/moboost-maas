#!/usr/bin/env bash
# One-shot: create DB, install backend deps, apply procrastinate schema,
# generate + apply initial migration, seed, and install frontend deps.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> 1. create database"
bash "$ROOT/scripts/create-db.sh"

echo "==> 2. backend virtualenv + deps"
cd "$ROOT/backend"
if [ ! -d .venv ]; then
  python -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/Scripts/activate
pip install -U pip wheel
pip install -e .[dev]

echo "==> 3. procrastinate schema"
procrastinate --app=app.tasks.app schema --apply || true

echo "==> 4. alembic migrations"
bash "$ROOT/scripts/migrate.sh"

echo "==> 5. seed"
python -m app.seed.run

echo "==> 6. frontend deps"
cd "$ROOT/frontend"
npm install

cat <<EOF

bootstrap complete.

Run in three terminals:
  bash scripts/dev-backend.sh     # API on :8000
  bash scripts/dev-worker.sh      # procrastinate worker
  bash scripts/dev-frontend.sh    # Next.js on :3000

Default admin: admin@example.com / admin
EOF
