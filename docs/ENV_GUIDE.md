# Moboost MAAS — Environment Setup Guide

> Step-by-step instructions for obtaining all required API keys and configuring your development environment.

## Quick Start

```bash
# 1. Copy the template
cp .env.example .env.local

# 2. Follow the sections below to fill in each key

# 3. Start the app
npm run dev                    # Frontend only
docker compose up -d           # Full stack with Docker
```

## Required Services (must have)

### 1. Clerk — Authentication

**What it does:** Handles user sign-up, sign-in, session management, and SSO.

**How to get keys:**
1. Go to [clerk.com](https://clerk.com) and create an account
2. Create a new application (choose "Next.js")
3. Go to **API Keys** in the sidebar
4. Copy:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — starts with `pk_test_`
   - `CLERK_SECRET_KEY` — starts with `sk_test_`

**Important settings:**
- Disable **Bot Protection** in Clerk dashboard (User & Authentication → Attack Protection) — otherwise sign-up may fail with "failed security validations"
- Enable Email/Password as a sign-in method

**Cost:** Free up to 10,000 monthly active users.

---

### 2. Supabase — Database & Storage

**What it does:** PostgreSQL database for all application data, plus file storage for creatives and localized assets.

**How to get keys:**
1. Go to [supabase.com](https://supabase.com) and create a project
2. Go to **Settings → API**
3. Copy:
   - `NEXT_PUBLIC_SUPABASE_URL` — your project URL (https://xxxxx.supabase.co)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public anon key (safe for client-side)
   - `SUPABASE_SERVICE_ROLE_KEY` — secret service role key (server-side only!)

**Storage bucket setup:**
1. Go to **Storage** in Supabase dashboard
2. Create a new bucket called `creatives`
3. Set the bucket to **Public** (for serving generated assets)

**Database tables:**
- Tables are managed by the frontend code (auto-created on first use)
- Backend tables are managed by Alembic migrations (see Backend section)

**Cost:** Free tier includes 500MB database, 1GB storage, 2GB bandwidth.

---

### 3. OpenRouter — AI Models

**What it does:** Unified gateway to 100+ AI models (GPT-4o, Claude, Gemini, etc.) via a single API.

**How to get keys:**
1. Go to [openrouter.ai](https://openrouter.ai) and create an account
2. Go to **Keys** → **Create Key**
3. Copy the key (starts with `sk-or-v1-`)
4. Add credits at **Credits** page ($5 is plenty for development)

**Model configuration:**
```env
IMAGE_MODEL=google/gemini-3-pro-image-preview    # For image generation
VIDEO_MODEL=google/veo-3.1                        # For video generation
EVAL_MODEL=anthropic/claude-sonnet-4-6            # For content evaluation
```

Browse available models at [openrouter.ai/models](https://openrouter.ai/models).

**Cost:** Pay-per-token. Most models cost $0.001-$0.01 per 1K tokens.

---

## Backend-Specific Setup

### 4. PostgreSQL — Backend Database

The ad-localization backend needs its own PostgreSQL database.

**Option A: Use Docker (recommended)**
```bash
docker compose up postgres -d
# Database URL: postgresql+psycopg://postgres:dev123@localhost:5432/ad_localization
```

**Option B: Use Supabase**
1. Create a second database or use the same Supabase project
2. Get the connection string from **Settings → Database → Connection string → URI**
3. Replace the protocol: `postgres://` → `postgresql+psycopg://`

**Option C: Local PostgreSQL**
```bash
# macOS
brew install postgresql@16 && brew services start postgresql@16
createdb ad_localization

# Ubuntu/Debian
sudo apt install postgresql-16
sudo -u postgres createdb ad_localization
```

Set in .env:
```env
ADLOC_DATABASE_URL=postgresql+psycopg://postgres:your-password@localhost:5432/ad_localization
```

**Run migrations:**
```bash
cd services/ad-localization/backend
alembic upgrade head
```

---

### 5. Admin Token Secret

Random secret used to sign admin API tokens.

**Generate:**
```bash
openssl rand -hex 32
```

Set as `ADMIN_TOKEN_SECRET` in .env.local.

---

### 6. Service Token (Frontend ↔ Backend)

Shared secret for the Next.js proxy to authenticate with the FastAPI backend.

**Generate:**
```bash
openssl rand -hex 32
```

Must be set in TWO places:
- Frontend: `ADLOC_SERVICE_TOKEN=your-token`
- Backend: `ADLOC_SERVICE_TOKEN=your-token` (same value)

---

## Optional Services

### Collaborator Webhook

For integrating with external systems (e.g., notifying a CMS when assets are created).

```env
COLLAB_WEBHOOK_URL=https://your-system.com/webhook
COLLAB_WEBHOOK_SECRET=your-hmac-secret
```

Webhook payloads are signed with HMAC-SHA256 in the `X-Moboost-Signature` header.

### Direct AI Provider Keys (Backend)

If you want to bypass OpenRouter for specific providers:

```env
ADLOC_ANTHROPIC_API_KEY=sk-ant-...     # https://console.anthropic.com
ADLOC_OPENAI_API_KEY=sk-...            # https://platform.openai.com
ADLOC_GOOGLE_API_KEY=...               # https://aistudio.google.com
```

### S3-Compatible Storage (Backend)

For production, replace local file storage with S3/R2:

```env
ADLOC_STORAGE_DRIVER=s3
ADLOC_S3_BUCKET=moboost-assets
ADLOC_S3_REGION=auto
ADLOC_S3_ACCESS_KEY=your-access-key
ADLOC_S3_SECRET_KEY=your-secret-key
ADLOC_S3_ENDPOINT_URL=https://your-account.r2.cloudflarestorage.com
```

---

## Environment Variable Summary

| Variable | Required | Where | Example |
|----------|----------|-------|---------|
| `OPENROUTER_API_KEY` | Yes | Frontend + Backend | `sk-or-v1-...` |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Frontend | `https://xxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Frontend | `eyJ...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Frontend (server) | `eyJ...` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | Frontend | `pk_test_...` |
| `CLERK_SECRET_KEY` | Yes | Frontend (server) | `sk_test_...` |
| `ADMIN_TOKEN_SECRET` | Yes | Frontend (server) | Random hex string |
| `ADLOC_SERVICE_TOKEN` | Yes | Both | Random hex string |
| `ADLOC_DATABASE_URL` | Yes | Backend | `postgresql+psycopg://...` |
| `ADLOC_OPENROUTER_API_KEY` | Recommended | Backend | Same as frontend key |
| `COLLAB_WEBHOOK_URL` | No | Frontend | HTTPS URL |
| `ADLOC_S3_*` | No (prod only) | Backend | S3/R2 credentials |

---

## Troubleshooting

**"Failed security validations" on sign-up**
→ Disable Bot Protection in Clerk dashboard.

**"Failed to fetch" on onboarding**
→ Check that `OPENROUTER_API_KEY` has credits. Add more at openrouter.ai/credits.

**Backend returns 502**
→ Check that `ADLOC_SERVICE_URL` points to a running backend. Start with `uvicorn app.main:app --reload`.

**"ModuleNotFoundError" in backend**
→ Run `pip install -e ".[dev]"` in the backend directory.
