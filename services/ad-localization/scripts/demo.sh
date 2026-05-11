#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../backend"
# Assumes bootstrap.sh has been run (venv + deps + migrate + seed).
# shellcheck disable=SC1091
[ -f .venv/Scripts/activate ] && source .venv/Scripts/activate
python -m scripts.demo_e2e
