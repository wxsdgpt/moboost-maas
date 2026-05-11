# Backend Integration Handoff — Moboost MAAS ↔ Ad Localization Service

**Audience:** The developer (or their AI assistant) maintaining the `ads-i18-engine` FastAPI backend. This document tells you exactly what the parent product (Moboost MAAS) expects from your service so the two systems can talk to each other.

**Status:** The Moboost MAAS frontend has been built. Three localization pages, an API proxy layer, and a typed client are ready. Your backend is the missing piece.

---

## 1. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│  Moboost MAAS (Next.js 15)                                       │
│                                                                  │
│  Browser → /localization/*  (React pages)                        │
│         → /api/localization/v1/* (Next.js catch-all proxy)       │
│                    │                                             │
│                    │  HTTP (Authorization: Bearer <SERVICE_TOKEN>)│
│                    │  + X-User-Id: <clerk_user_id>               │
│                    ▼                                             │
│  ┌──────────────────────────────────┐                            │
│  │  Ad Localization Service         │                            │
│  │  FastAPI on port 8000            │                            │
│  │  /api/v1/*                       │                            │
│  └──────────────────────────────────┘                            │
│                    │                                             │
│                    ▼                                             │
│  ┌──────────────────────────────────┐                            │
│  │  Shared PostgreSQL (Supabase)    │                            │
│  │  Schema: ad_localization         │                            │
│  └──────────────────────────────────┘                            │
└──────────────────────────────────────────────────────────────────┘
```

The Moboost frontend **never** calls your FastAPI directly. All requests go through our Next.js proxy at `/api/localization/[...path]`, which:

1. Authenticates the user via Clerk (our auth system)
2. Forwards the request to `ADLOC_SERVICE_URL` (default: `http://localhost:8000`)
3. Attaches two headers:
   - `Authorization: Bearer <ADLOC_SERVICE_TOKEN>` — a shared secret for service-to-service auth
   - `X-User-Id: <clerk_user_id>` — the authenticated user's Clerk ID

---

## 2. What You Need to Build / Change

### 2.1 Service-to-Service Auth Middleware (CRITICAL — Priority 1)

Your current `deps.py` uses `get_current_user()` which decodes a JWT from your own auth system. The Moboost proxy sends a **service token** instead, not a user JWT.

**You need to add a new auth dependency** that:

1. Checks the `Authorization: Bearer <token>` header
2. Validates it against `ADLOC_SERVICE_TOKEN` env var (simple string comparison, not JWT)
3. Reads `X-User-Id` from the header to identify the calling user
4. Either finds or auto-creates a `User` record for that external ID

Here is a reference implementation:

```python
# app/deps.py — add this alongside your existing get_current_user

from fastapi import Header, HTTPException, status

async def get_service_user(
    authorization: str | None = Header(None),
    x_user_id: str | None = Header(None, alias="X-User-Id"),
    session: AsyncSession = Depends(get_session),
) -> User:
    """Auth dependency for service-to-service calls from Moboost MAAS."""
    expected_token = get_settings().service_token
    if not expected_token:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE,
                            detail="service token not configured")

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED,
                            detail="missing service bearer token")

    token = authorization.removeprefix("Bearer ").strip()
    if token != expected_token:
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            detail="invalid service token")

    if not x_user_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            detail="missing X-User-Id header")

    # Find or create user by external (Clerk) ID
    result = await session.execute(
        select(User).where(User.external_id == x_user_id)
    )
    user = result.scalar_one_or_none()

    if user is None:
        # Auto-provision: create a user record for this Clerk user
        user = User(
            id=uuid.uuid4(),
            external_id=x_user_id,
            email=f"{x_user_id}@moboost.internal",  # placeholder
            display_name="Moboost User",
            role="ad_ops",  # default role for Moboost users
            is_active=True,
        )
        session.add(user)
        await session.flush()

    return user
```

**Required model change:** Add `external_id: str | None` column to your `User` model (nullable, unique index). This maps Clerk user IDs to your internal users.

**Required config change:** Add to `config.py`:
```python
service_token: str = "dev-service-token-change-me"
```

**Usage:** Replace `Depends(get_current_user)` with `Depends(get_service_user)` on all endpoints that Moboost calls. You can keep `get_current_user` for your own standalone UI if needed, or create a unified dependency that tries service token first, then falls back to JWT.

### 2.2 API Endpoints the Frontend Expects (Priority 1)

Our frontend client (`src/lib/localization/client.ts`) calls these endpoints. Your existing routes are close but not identical. Here is the exact contract:

#### Jobs

| Method | Path | Request Body | Response | Your Existing Route | Gap |
|--------|------|-------------|----------|-------------------|-----|
| `GET` | `/api/v1/jobs` | — | `{ jobs: Job[] }` | ❌ Missing — you have no list-all endpoint | **Add endpoint** |
| `GET` | `/api/v1/jobs/{id}` | — | `{ job: Job }` | ✅ Exists | Wrap response in `{ job: ... }` |
| `POST` | `/api/v1/jobs` | `{ project_id, source_asset_id, target_markets: string[] }` | `{ job: Job }` | ✅ Exists (different shape) | Adapt payload shape (see below) |
| `GET` | `/api/v1/jobs/{id}/compliance` | — | `{ report: ComplianceItem[] }` | ❌ Missing | **Add endpoint** |

**Job object shape expected by frontend:**
```json
{
  "id": "uuid",
  "project_id": "uuid",
  "source_asset_id": "uuid",
  "target_markets": ["US", "UK", "DE"],
  "status": "pending | processing | completed | failed | cancelled",
  "progress": 0.0-1.0,
  "created_at": "ISO8601",
  "updated_at": "ISO8601"
}
```

**Create job payload adaptation:** Our frontend sends `target_markets: ["US", "UK"]` as a simple string array. Your existing `JobCreate` schema uses `targets: [{ market: "US", sub_market: null }]`. You have two options:
- (A) Add a simplified create endpoint that accepts `target_markets: string[]` and converts internally
- (B) We update our frontend client — but option A is easier and keeps the interface clean

#### Assets

| Method | Path | Request Body | Response | Your Existing Route | Gap |
|--------|------|-------------|----------|-------------------|-----|
| `GET` | `/api/v1/assets` | — | `{ assets: Asset[] }` | ❌ Check if list endpoint exists | **Add if missing** |
| `POST` | `/api/v1/assets` | `multipart/form-data` (file + metadata) | `{ asset: Asset }` | ✅ Likely exists | Verify response shape |
| `GET` | `/api/v1/assets/{id}/localized` | — | `{ output: LocalizedOutput }` | ❌ Missing | **Add endpoint** |
| `POST` | `/api/v1/assets/{id}/confirm` | — | `{ ok: true }` | ❌ Missing | **Add endpoint** |

**Asset object shape:**
```json
{
  "id": "uuid",
  "project_id": "uuid",
  "filename": "ad_banner_q4.psd",
  "mime_type": "image/vnd.adobe.photoshop",
  "size": 4521984,
  "metadata": {},
  "created_at": "ISO8601"
}
```

#### Markets

| Method | Path | Response | Gap |
|--------|------|----------|-----|
| `GET` | `/api/v1/markets` | `{ markets: Market[] }` | **Add endpoint** — return your 8 supported markets |

**Market object shape:**
```json
{
  "code": "US",
  "name": "United States",
  "language": "en",
  "region": "North America"
}
```

This is a static list. Simplest implementation:

```python
@router.get("/markets")
async def list_markets():
    return {"markets": [
        {"code": "US", "name": "United States", "language": "en", "region": "North America"},
        {"code": "UK", "name": "United Kingdom", "language": "en", "region": "Europe"},
        {"code": "PH", "name": "Philippines", "language": "fil", "region": "Asia Pacific"},
        {"code": "IN", "name": "India", "language": "hi", "region": "Asia Pacific"},
        {"code": "BR", "name": "Brazil", "language": "pt", "region": "South America"},
        {"code": "FR", "name": "France", "language": "fr", "region": "Europe"},
        {"code": "DE", "name": "Germany", "language": "de", "region": "Europe"},
        {"code": "NG", "name": "Nigeria", "language": "en", "region": "Africa"},
    ]}
```

#### Projects

| Method | Path | Response | Gap |
|--------|------|----------|-----|
| `GET` | `/api/v1/projects` | `{ projects: [{ id, name }] }` | ✅ Likely exists | Verify response shape |

### 2.3 Source URL Ingestion Endpoint (Priority 2)

When a user clicks "Localize" on an already-generated asset in Moboost, we have the asset's URL (image/video hosted on our storage). Your service needs an endpoint to accept a URL and create a SourceAsset from it:

```
POST /api/v1/assets/from-url
{
  "url": "https://storage.moboost.ai/assets/abc123.mp4",
  "filename": "ad_video_q4.mp4",
  "project_id": "uuid",
  "brand_id": "uuid"  // optional
}
→ { "asset": SourceAsset }
```

This endpoint should:
1. Download the file from the URL
2. Store it in your storage (local/S3)
3. Create a `SourceAsset` record
4. Return the asset object

If the URL is on the same S3 bucket (shared storage), you can do an S3 copy instead of download.

### 2.4 Response Wrapper Convention (Priority 1)

Our frontend expects all responses wrapped in a named key:

```json
// ✅ Expected
{ "jobs": [...] }
{ "job": {...} }
{ "assets": [...] }
{ "markets": [...] }

// ❌ Not expected
[...]        // raw array
{...}        // raw object without wrapper key
```

Your existing endpoints may return raw Pydantic models. Wrap them.

### 2.5 CORS Configuration (Priority 1)

Your `config.py` CORS origins must include the Moboost frontend origin:

```
ADLOC_CORS_ORIGINS=["http://localhost:3000","http://127.0.0.1:3000"]
```

In production, add the real Moboost domain.

---

## 3. Environment Variables

All variables now use `ADLOC_` prefix (we updated your `config.py`). Here is what you need in your `.env`:

```bash
# Core
ADLOC_APP_ENV=dev
ADLOC_LOG_LEVEL=INFO

# Database — shared PostgreSQL
ADLOC_DATABASE_URL=postgresql+psycopg://postgres:<password>@<host>:5432/ad_localization

# Service-to-service auth (MUST match ADLOC_SERVICE_TOKEN in Moboost .env)
ADLOC_SERVICE_TOKEN=<generate-a-long-random-string>

# Storage
ADLOC_STORAGE_DRIVER=local
ADLOC_STORAGE_LOCAL_ROOT=./storage

# AI providers (your own keys, independent from Moboost)
ADLOC_OPENROUTER_API_KEY=<your-key>
# ... other AI keys as needed

# CORS
ADLOC_CORS_ORIGINS=["http://localhost:3000"]
```

**On the Moboost side**, these env vars are set in the parent `.env`:

```bash
# In moboost-maas/.env
ADLOC_SERVICE_URL=http://localhost:8000
ADLOC_SERVICE_TOKEN=<same-long-random-string-as-above>
```

---

## 4. Database Setup

### Option A: Separate database (recommended for dev)

```bash
createdb ad_localization
cd services/ad-localization/backend
alembic upgrade head
python -m app.seed.run
```

### Option B: Shared database with schema isolation

If sharing the Moboost Supabase PostgreSQL:

1. Create a schema: `CREATE SCHEMA ad_localization;`
2. Update `DATABASE_URL` with schema: `?options=-csearch_path%3Dad_localization`
3. Set a separate Alembic version table in `alembic.ini`:
   ```
   [alembic]
   version_table = alembic_version_adloc
   ```

---

## 5. Running the Service

```bash
cd services/ad-localization/backend

# Setup
python -m venv .venv
source .venv/bin/activate  # or .venv/Scripts/activate on Windows
pip install -e .[dev]

# Database
alembic upgrade head
python -m app.seed.run

# Start API server
uvicorn app.main:app --reload --port 8000

# Start worker (separate terminal)
procrastinate --app=app.tasks.app worker
```

Verify: `curl http://localhost:8000/docs` should show the OpenAPI docs.

---

## 6. Testing the Integration

Once your service is running, test the proxy from the Moboost side:

```bash
# Should return 401 (no Clerk session from curl)
curl http://localhost:3000/api/localization/v1/markets

# Direct test (bypassing proxy, with service token)
curl -H "Authorization: Bearer <your-service-token>" \
     -H "X-User-Id: test-user-123" \
     http://localhost:8000/api/v1/markets
```

---

## 7. Checklist — What You Need to Deliver

### Must-have (blocks frontend from working):

- [ ] **Service token auth middleware** — `get_service_user()` in `deps.py` (see §2.1)
- [ ] **User.external_id column** — Alembic migration to add nullable unique `external_id` to users table
- [ ] **`service_token` config** — add to `Settings` in `config.py`
- [ ] **`GET /api/v1/jobs`** — list all jobs for the current user, return `{ jobs: [...] }`
- [ ] **`GET /api/v1/markets`** — static market list, return `{ markets: [...] }`
- [ ] **`GET /api/v1/jobs/{id}/compliance`** — compliance findings for a job, return `{ report: [...] }`
- [ ] **`GET /api/v1/assets/{id}/localized`** — localized output for an asset, return `{ output: {...} }`
- [ ] **`POST /api/v1/assets/{id}/confirm`** — confirm asset for distribution, return `{ ok: true }`
- [ ] **Response wrapping** — all endpoints return `{ key: data }` not raw data
- [ ] **Simplified job creation** — accept `target_markets: ["US", "UK"]` string array (or adapter endpoint)
- [ ] **CORS** — allow `http://localhost:3000`
- [ ] **ADLOC_ env prefix** — config.py already updated, verify your .env matches

### Nice-to-have (enables richer features):

- [ ] **`POST /api/v1/assets/from-url`** — ingest an asset by URL from Moboost storage
- [ ] **`GET /api/v1/jobs/{id}/matrix`** — already exists, frontend will use it for the strategy matrix
- [ ] **`PATCH /api/v1/jobs/{id}/matrix/cell`** — already exists, frontend will use it
- [ ] **`POST /api/v1/jobs/{id}/submit`** — already exists, frontend will use it
- [ ] **WebSocket or polling endpoint for job progress** — frontend currently uses mock progress

---

## 8. What We Have Already Built (Do Not Rebuild)

On the Moboost side, these are done:

| Component | Path | Description |
|-----------|------|-------------|
| API Proxy | `src/app/api/localization/[...path]/route.ts` | Catch-all proxy, Clerk auth → service token |
| TypeScript Client | `src/lib/localization/client.ts` | Typed functions for all API calls |
| Main Page | `src/app/localization/page.tsx` | Dashboard with job list, stats, market cards |
| New Job Page | `src/app/localization/new/page.tsx` | 4-step wizard: asset → markets → strategy → confirm |
| Job Detail Page | `src/app/localization/[jobId]/page.tsx` | Strategy matrix, progress, results, compliance tabs |
| Sidebar Nav | `src/components/Sidebar.tsx` | "Localization" item with Globe icon |
| Localize Buttons | Project workspace + Report artifacts | "Localize" button on every image/video asset |
| i18n | `src/lib/i18n/dict.ts` | Full EN + ZH translations for all localization UI |

**Do not create a separate frontend.** We already merged the UI into Moboost.

---

## 9. Contact Points

- **Proxy code:** `src/app/api/localization/[...path]/route.ts` — how Moboost calls you
- **Client types:** `src/lib/localization/client.ts` — the TypeScript types your JSON must match
- **Your backend copy:** `services/ad-localization/backend/` — your code lives here in the monorepo
- **Your docs:** `services/ad-localization/docs/` — all 14 design specs, unchanged

---

## 10. Constraints Reminder

These constraints from your `docs/CLAUDE.md` are still binding. We have not violated any of them in the frontend. Make sure your backend continues to enforce:

1. Localization, not generation — no "create from brief" endpoints
2. PSD-first, AI-backup
3. Change minimization — bit-identical untouched regions
4. UI English only; content in native languages
5. Compliance is advisory, not blocking
6. Two-layer rules (system + brand overrides)
7. Mandatory ad-ops confirmation click
8. Compliance overlays deterministic (Pillow/FFmpeg)
9. Every AI call logged to `AIGenerationLog`
10. Rules versioned; `AssetConfirmation` snapshots them

---

**Summary: you need to add ~6 endpoints, one auth middleware, one DB migration, and wrap your responses. Everything else is already built or already exists in your codebase. Start with §2.1 (auth) and §2.2 (endpoints) — those are the blockers.**
