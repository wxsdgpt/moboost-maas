#!/usr/bin/env bash
# ============================================================
# Ad-Localization Backend — Local Setup Script
# ============================================================
# Run this from: moboost-maas/services/ad-localization/
#
# Prerequisites:
#   - Python 3.12+
#   - PostgreSQL 14+ running locally
#   - pip / venv
#
# Usage:
#   chmod +x setup-local.sh
#   ./setup-local.sh
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
ENV_FILE="$SCRIPT_DIR/.env"

# ── Prefer python3.12 if available ──────────────────────────
if command -v python3.12 &> /dev/null; then
    PYTHON=python3.12
elif command -v python3 &> /dev/null; then
    PYTHON=python3
else
    echo "ERROR: python3 not found. Install Python 3.12+ first."
    exit 1
fi

echo ""
echo "=============================="
echo "  Ad-Localization Local Setup"
echo "=============================="
echo ""

# ── Step 1: Check prerequisites ──────────────────────────────
echo "[1/7] Checking prerequisites..."

PY_VERSION=$($PYTHON -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
echo "  Python: $PY_VERSION (using $PYTHON)"

if ! command -v psql &> /dev/null; then
    echo "ERROR: psql not found. Install PostgreSQL first."
    echo "  macOS:   brew install postgresql@16 && brew services start postgresql@16"
    echo "  Ubuntu:  sudo apt install postgresql postgresql-client"
    echo "  Windows: https://www.postgresql.org/download/windows/"
    exit 1
fi

PG_VERSION=$(psql --version | sed -E 's/.*([0-9]+\.[0-9]+).*/\1/')
echo "  PostgreSQL: $PG_VERSION"

# ── Step 2: Create .env file ─────────────────────────────────
echo ""
echo "[2/7] Setting up environment..."

if [ ! -f "$ENV_FILE" ]; then
    # Generate a random service token
    SERVICE_TOKEN=$($PYTHON -c "import secrets; print(secrets.token_urlsafe(32))")

    cat > "$ENV_FILE" << ENVEOF
# ── Core ──
ADLOC_APP_ENV=dev
ADLOC_APP_NAME=ad-localization
ADLOC_LOG_LEVEL=INFO

# ── Database ──
ADLOC_DATABASE_URL=postgresql+psycopg://$(whoami)@localhost:5432/ad_localization

# ── Auth ──
ADLOC_JWT_SECRET=$($PYTHON -c "import secrets; print(secrets.token_urlsafe(32))")
ADLOC_SERVICE_TOKEN=$SERVICE_TOKEN

# ── Storage ──
ADLOC_STORAGE_DRIVER=local
ADLOC_STORAGE_LOCAL_ROOT=./storage

# ── CORS (allow Next.js dev server) ──
ADLOC_CORS_ORIGINS=["http://localhost:3000","http://127.0.0.1:3000"]

# ── AI Providers (fill in when ready) ──
# ADLOC_OPENROUTER_API_KEY=
# ADLOC_ANTHROPIC_API_KEY=
# ADLOC_OPENAI_API_KEY=
ENVEOF

    echo "  Created .env with auto-generated secrets"
    echo ""
    echo "  !! IMPORTANT: Copy this service token to your moboost-maas .env:"
    echo "  ADLOC_SERVICE_TOKEN=$SERVICE_TOKEN"
    echo "  ADLOC_SERVICE_URL=http://localhost:8000"
    echo ""
else
    echo "  .env already exists, skipping"
fi

# ── Step 3: Create database ──────────────────────────────────
echo "[3/7] Creating database..."

# Try to create DB (ignore error if already exists)
createdb ad_localization 2>/dev/null && echo "  Created database: ad_localization" || echo "  Database ad_localization already exists"

# ── Step 4: Python virtual environment ───────────────────────
echo ""
echo "[4/7] Setting up Python virtual environment..."

cd "$BACKEND_DIR"

if [ ! -d ".venv" ]; then
    $PYTHON -m venv .venv
    echo "  Created .venv"
else
    echo "  .venv already exists"
fi

source .venv/bin/activate
echo "  Activated venv: $(python --version)"

# ── Step 5: Install dependencies ─────────────────────────────
echo ""
echo "[5/7] Installing Python dependencies..."

pip install --upgrade pip -q
pip install -e ".[dev]" -q
echo "  Dependencies installed"

# ── Step 6: Run migrations ───────────────────────────────────
echo ""
echo "[6/7] Running Alembic migrations..."

alembic upgrade head
echo "  Migrations complete"

# ── Step 7: Seed data ────────────────────────────────────────
echo ""
echo "[7/7] Seeding initial data..."

python -m app.seed.run 2>/dev/null && echo "  Seed data loaded" || echo "  Seed script skipped (may not be needed)"

# ── Done ─────────────────────────────────────────────────────
echo ""
echo "=============================="
echo "  Setup Complete!"
echo "=============================="
echo ""
echo "To start the backend:"
echo "  cd $BACKEND_DIR"
echo "  source .venv/bin/activate"
echo "  uvicorn app.main:app --reload --port 8000"
echo ""
echo "API docs will be at: http://localhost:8000/docs"
echo ""
echo "Remember to add to your moboost-maas root .env:"
echo "  ADLOC_SERVICE_URL=http://localhost:8000"
echo "  ADLOC_SERVICE_TOKEN=<token from .env above>"
echo ""
