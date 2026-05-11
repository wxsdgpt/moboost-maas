#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../backend"
exec procrastinate --app=app.tasks.app worker --concurrency=4
