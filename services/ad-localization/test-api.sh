#!/usr/bin/env bash
# ============================================================
# Ad-Localization API Quick Test
# ============================================================
set -euo pipefail

BASE="http://localhost:8000"
PASS=0
FAIL=0
ERRORS=""

# Read service token from .env
ENV_FILE="$(dirname "$0")/.env"
if [ -f "$ENV_FILE" ]; then
    TOKEN=$(grep '^ADLOC_SERVICE_TOKEN=' "$ENV_FILE" | cut -d= -f2)
else
    echo "WARNING: .env not found at $ENV_FILE, using empty token"
    TOKEN=""
fi

echo ""
echo "=============================="
echo "  API Endpoint Tests"
echo "  Base: $BASE"
echo "=============================="
echo ""

test_endpoint() {
    local method="$1"
    local path="$2"
    local desc="$3"
    local expected_code="${4:-200}"
    local body="${5:-}"

    local url="$BASE$path"
    local cmd="curl -s -o /tmp/api_response.json -w %{http_code} -X $method"
    cmd="$cmd -H 'Authorization: Bearer $TOKEN'"
    cmd="$cmd -H 'X-User-Id: test-user-001'"

    if [ -n "$body" ]; then
        cmd="$cmd -H 'Content-Type: application/json' -d '$body'"
    fi

    cmd="$cmd '$url'"

    local status
    status=$(eval "$cmd" 2>/dev/null) || status="000"

    if [ "$status" = "$expected_code" ]; then
        echo "  [PASS] $method $path ($status) — $desc"
        PASS=$((PASS + 1))
    else
        echo "  [FAIL] $method $path — expected $expected_code, got $status — $desc"
        if [ -f /tmp/api_response.json ]; then
            local resp
            resp=$(cat /tmp/api_response.json | head -c 200)
            echo "         Response: $resp"
        fi
        FAIL=$((FAIL + 1))
        ERRORS="$ERRORS\n  - $method $path ($status)"
    fi
}

# ── 1. Health ───────────────────────────────────────────────
echo "[1] Health"
test_endpoint GET "/health" "Health check"

# ── 2. Markets ──────────────────────────────────────────────
echo ""
echo "[2] Markets"
test_endpoint GET "/v1/markets" "List markets"

# ── 3. Sub-markets ──────────────────────────────────────────
echo ""
echo "[3] Sub-markets"
test_endpoint GET "/v1/sub-markets" "List sub-markets"

# ── 4. Brands ───────────────────────────────────────────────
echo ""
echo "[4] Brands"
test_endpoint GET "/v1/brands" "List brands"

# ── 5. Jobs ─────────────────────────────────────────────────
echo ""
echo "[5] Jobs"
test_endpoint GET "/v1/jobs" "List jobs"

# ── 6. Projects (requires brand_id) ────────────────────────
echo ""
echo "[6] Projects"
test_endpoint GET "/v1/projects" "Projects without brand_id → 422" "422"

# ── 7. Settings (admin only) ───────────────────────────────
echo ""
echo "[7] Settings (admin-only)"
test_endpoint GET "/v1/settings" "Settings requires admin → 403" "403"

# ── 8. Auth guard (no token) ───────────────────────────────
echo ""
echo "[8] Auth guard (no token)"
local_status=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$BASE/v1/jobs" 2>/dev/null) || local_status="000"
if [ "$local_status" = "401" ] || [ "$local_status" = "403" ]; then
    echo "  [PASS] GET /v1/jobs without token → $local_status (correctly rejected)"
    PASS=$((PASS + 1))
else
    echo "  [FAIL] GET /v1/jobs without token → $local_status (expected 401/403)"
    FAIL=$((FAIL + 1))
fi

# ── 9. Auth: create job (POST) ──────────────────────────────
echo ""
echo "[9] Create job (validation)"
test_endpoint POST "/v1/jobs" "POST job with empty body → 422" "422" "{}"

# ── Summary ─────────────────────────────────────────────────
echo ""
echo "=============================="
echo "  Results: $PASS passed, $FAIL failed"
echo "=============================="

if [ $FAIL -gt 0 ]; then
    echo -e "\nFailed endpoints:$ERRORS"
    echo ""
    exit 1
else
    echo ""
    echo "All endpoints OK!"
    echo ""
fi
