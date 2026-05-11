#!/usr/bin/env bash
# Create the ad_localization database in the local zip-install pg18.
# Idempotent: does nothing if the DB already exists.

set -euo pipefail

PGBIN="${PGBIN:-/c/Users/Haohan/pgsql/bin}"
PGUSER="${PGUSER:-postgres}"
PGPASSWORD_="${PGPASSWORD:-dev123}"
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
DB_NAME="${DB_NAME:-ad_localization}"

export PGPASSWORD="$PGPASSWORD_"

exists=$(
  "$PGBIN/psql.exe" -U "$PGUSER" -h "$PGHOST" -p "$PGPORT" -tAc \
    "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" postgres || true
)

if [[ "$exists" == "1" ]]; then
  echo "database '$DB_NAME' already exists — skipping create"
else
  echo "creating database '$DB_NAME' ..."
  "$PGBIN/createdb.exe" -U "$PGUSER" -h "$PGHOST" -p "$PGPORT" \
    -T template1 -E UTF8 "$DB_NAME"
  echo "done."
fi
