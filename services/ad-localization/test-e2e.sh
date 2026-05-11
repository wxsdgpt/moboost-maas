#!/usr/bin/env bash
# ============================================================
# Ad-Localization — End-to-End Text Localization Test
# ============================================================
set -euo pipefail

BASE="http://localhost:8000"
ENV_FILE="$(dirname "$0")/.env"
SERVICE_TOKEN=$(grep '^ADLOC_SERVICE_TOKEN=' "$ENV_FILE" | cut -d= -f2)
USER_ID="e2e-test-user-001"

echo ""
echo "=============================="
echo "  E2E Localization Test"
echo "=============================="

# ── Step 0: Get JWT for seed admin ──────────────────────────
echo ""
echo "[0/7] Logging in as seed admin..."
LOGIN=$(curl -s -X POST "$BASE/v1/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@example.com","password":"admin"}')

JWT=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null || echo "")

if [ -z "$JWT" ]; then
    echo "  Login failed. Response:"
    echo "  $LOGIN" | python3 -m json.tool 2>/dev/null || echo "  $LOGIN"
    exit 1
fi
echo "  Got admin JWT token"

# Admin API helper
admin_api() {
    local method="$1" path="$2"
    shift 2
    curl -s -X "$method" "$BASE$path" \
        -H "Authorization: Bearer $JWT" \
        -H "Content-Type: application/json" \
        "$@"
}

# Service token API helper (simulates moboost proxy)
proxy_api() {
    local method="$1" path="$2"
    shift 2
    curl -s -X "$method" "$BASE$path" \
        -H "Authorization: Bearer $SERVICE_TOKEN" \
        -H "X-User-Id: $USER_ID" \
        -H "Content-Type: application/json" \
        "$@"
}

# ── Step 1: Create brand (admin) ────────────────────────────
echo ""
echo "[1/7] Creating test brand (as admin)..."
BRAND=$(admin_api POST /v1/brands -d '{
    "name":"E2E Test Brand",
    "slug":"e2e-test",
    "display_name_by_market":{},
    "restrictions":{"forbidden_words":[],"required_disclaimers":[],"age_gate_markets":[]},
    "voice":{"tone":"professional","style":"direct","guidelines":""}
}')

BRAND_ID=$(echo "$BRAND" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "")

if [ -z "$BRAND_ID" ]; then
    echo "  Create failed (may exist), listing brands..."
    BRANDS=$(admin_api GET /v1/brands)
    BRAND_ID=$(echo "$BRANDS" | python3 -c "import sys,json; b=json.load(sys.stdin); print(b[0]['id'] if b else '')" 2>/dev/null || echo "")
fi

if [ -z "$BRAND_ID" ]; then
    echo "  ERROR: Could not create or find a brand. Response:"
    echo "  $BRAND" | python3 -m json.tool 2>/dev/null || echo "  $BRAND"
    exit 1
fi
echo "  Brand ID: $BRAND_ID"

# ── Step 2: Create project (admin) ──────────────────────────
echo ""
echo "[2/7] Creating test project..."
PROJECT=$(admin_api POST /v1/projects -d "{
    \"brand_id\":\"$BRAND_ID\",
    \"name\":\"E2E Test Project\",
    \"description\":\"Automated localization test\"
}")
PROJECT_ID=$(echo "$PROJECT" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "")

if [ -z "$PROJECT_ID" ]; then
    echo "  Create failed, listing projects..."
    PROJECTS=$(admin_api GET "/v1/projects?brand_id=$BRAND_ID")
    PROJECT_ID=$(echo "$PROJECTS" | python3 -c "import sys,json; p=json.load(sys.stdin); print(p[0]['id'] if p else '')" 2>/dev/null || echo "")
fi

if [ -z "$PROJECT_ID" ]; then
    echo "  ERROR: Could not create or find a project. Response:"
    echo "  $PROJECT" | python3 -m json.tool 2>/dev/null || echo "  $PROJECT"
    exit 1
fi
echo "  Project ID: $PROJECT_ID"

# ── Step 3: Upload text asset (admin) ───────────────────────
echo ""
echo "[3/7] Uploading text asset..."

TMPFILE=$(mktemp /tmp/e2e_test_XXXXXX.txt)
cat > "$TMPFILE" << 'TEXTEOF'
Bet Big, Win Bigger!
Join Now — Get $500 Free Bonus
Play 200+ Premium Slots & Live Casino Games
18+ | Terms Apply | Play Responsibly
Licensed and Regulated | Secure Payments Guaranteed
TEXTEOF

ASSET=$(curl -s -X POST "$BASE/v1/assets/upload" \
    -H "Authorization: Bearer $JWT" \
    -F "file=@$TMPFILE;filename=promo_banner.txt" \
    -F "project_id=$PROJECT_ID" \
    -F "brand_id=$BRAND_ID" \
    -F "tags=e2e,test")

rm -f "$TMPFILE"

ASSET_ID=$(echo "$ASSET" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "")

if [ -z "$ASSET_ID" ]; then
    echo "  Upload failed. Response:"
    echo "  $ASSET" | python3 -m json.tool 2>/dev/null || echo "  $ASSET"
    exit 1
fi
echo "  Asset ID: $ASSET_ID"
echo "  Parse status: $(echo "$ASSET" | python3 -c "import sys,json; print(json.load(sys.stdin).get('parse_status','?'))" 2>/dev/null)"

# ── Step 4: Check markets ───────────────────────────────────
echo ""
echo "[4/7] Available markets:"
MARKETS=$(proxy_api GET /v1/markets)
echo "$MARKETS" | python3 -c "
import sys, json
data = json.load(sys.stdin)
markets = data.get('markets', data) if isinstance(data, dict) else data
for m in markets[:4]:
    print(f\"  - {m['code']}: {m['name']} ({m['language']})\")
if len(markets) > 4: print(f'  ... and {len(markets)-4} more')
" 2>/dev/null

# ── Step 5: Create localization job (admin) ─────────────────
echo ""
echo "[5/7] Creating localization job (→ BR, DE)..."
JOB=$(admin_api POST /v1/jobs -d "{
    \"source_asset_id\": \"$ASSET_ID\",
    \"targets\": [
        {\"market\": \"BR\"},
        {\"market\": \"DE\"}
    ]
}")

JOB_ID=$(echo "$JOB" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "")

if [ -z "$JOB_ID" ]; then
    echo "  Job creation failed. Response:"
    echo "  $JOB" | python3 -m json.tool 2>/dev/null || echo "  $JOB"
    exit 1
fi
echo "  Job ID: $JOB_ID"
echo "  Status: $(echo "$JOB" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','?'))" 2>/dev/null)"

# ── Step 6: Submit job ──────────────────────────────────────
echo ""
echo "[6/7] Submitting job for processing (inline in dev — may take 30-90s)..."
SUBMIT=$(curl -s -X POST "$BASE/v1/jobs/$JOB_ID/submit" \
    -H "Authorization: Bearer $JWT" \
    -H "Content-Type: application/json" \
    --max-time 180)
SUBMIT_STATUS=$(echo "$SUBMIT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status', d.get('detail','?')))" 2>/dev/null || echo "?")
echo "  Submit result: $SUBMIT_STATUS"

if echo "$SUBMIT" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if 'detail' in d else 1)" 2>/dev/null; then
    echo "  Full response:"
    echo "$SUBMIT" | python3 -m json.tool 2>/dev/null || echo "  $SUBMIT"
fi

# ── Step 7: Check job status ──────────────────────────────
echo ""
echo "[7/7] Checking job status..."

JOB_FINAL=$(admin_api GET "/v1/jobs/$JOB_ID")
echo "$JOB_FINAL" | python3 -c "
import sys, json
j = json.load(sys.stdin)
print(f\"  Status:  {j.get('status','?')}\")
print(f\"  Markets: {j.get('target_markets', [])}\")
err = j.get('error_message')
if err: print(f'  Error:   {err}')
" 2>/dev/null || echo "  $JOB_FINAL"

# Check for localized outputs
echo ""
echo "  Checking localized outputs..."
LOCALIZED=$(admin_api GET "/v1/jobs/$JOB_ID/localized" 2>/dev/null || echo "[]")
echo "$LOCALIZED" | python3 -c "
import sys, json
items = json.load(sys.stdin)
if not items:
    print('  No localized outputs yet (may still be processing)')
else:
    for item in items:
        print(f\"  - {item.get('target_market','?')}: {item.get('status','?')}\")
" 2>/dev/null || echo "  Could not parse localized outputs"

echo ""
echo "=============================="
echo "  E2E Test Complete"
echo "=============================="
echo ""
echo "Check uvicorn terminal for backend processing logs."
echo ""
