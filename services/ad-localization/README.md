# iGaming Ad Creative Localization System

Localization tool for iGaming marketing teams: upload finished source creatives (PSD, image, video) and produce per-market localized outputs across 8 markets (US, UK, PH, IN, BR, FR, DE, NG).

**Not a creative generation tool.** Text in → text out; image in → image out; video in → video out. AI edits, it does not create.

See `docs/` for the full design docs. Start with `CLAUDE.md` and `PROJECT.md`.

## Architecture at a glance

- **Backend**: FastAPI (Python 3.12+), SQLAlchemy 2 async, Alembic, Pydantic v2
- **Task queue**: procrastinate (PostgreSQL-backed, no Redis needed)
- **Frontend**: Next.js 15 (App Router), Tailwind, shadcn/ui, next-intl, TanStack Query
- **Database**: PostgreSQL 18 (reuses the local zip-install at `C:\Users\Haohan\pgsql`)
- **Object storage**: local filesystem in dev, S3/MinIO in prod

Deviation from `ARCHITECTURE.md`: we use procrastinate instead of Celery+Redis to avoid a Redis dependency. Same async-job guarantees; swap later if scale demands.

## Quickstart (Windows, no Docker)

Prereqs:
- PostgreSQL 18 running on `localhost:5432` with user `postgres` / password `dev123` (already set up at `C:\Users\Haohan\pgsql`)
- Python 3.12+ (3.14 works)
- Node 20+

```bash
# 1. create database
bash scripts/create-db.sh

# 2. backend install + migrate + seed
cd backend
python -m venv .venv
source .venv/Scripts/activate    # Git Bash on Windows
pip install -e .[dev]
alembic upgrade head
python -m app.seed.run

# 3. run backend
uvicorn app.main:app --reload --port 8000

# 4. run procrastinate worker (separate shell)
procrastinate --app=app.tasks.app worker

# 5. run frontend (separate shell)
cd frontend
npm install
npm run dev
```

Visit `http://localhost:3000`. API docs at `http://localhost:8000/docs`.

Default admin account after seed: `admin@example.com` / `admin`.

## Repo layout

```
ads-i18-engine/
├── backend/            FastAPI + SQLAlchemy + procrastinate
│   ├── app/
│   │   ├── main.py         app factory, CORS, routers
│   │   ├── config.py       settings
│   │   ├── db.py           async engine, session
│   │   ├── deps.py         common FastAPI dependencies
│   │   ├── models/         SQLAlchemy ORM
│   │   ├── schemas/        Pydantic request/response
│   │   ├── api/v1/         HTTP endpoints
│   │   ├── services/       business logic
│   │   ├── security/       JWT, password, RBAC
│   │   ├── storage/        S3 + local FS driver
│   │   ├── tasks/          procrastinate jobs
│   │   └── seed/           seed data (markets, sub-markets, admin)
│   ├── alembic/            migrations
│   └── tests/
├── frontend/           Next.js 15 (App Router)
├── scripts/            dev shell helpers
├── docs/               design specs (CLAUDE.md, PROJECT.md, ARCHITECTURE.md, …)
├── README.md
└── INTEGRATION.md      playbook for merging this project into a parent product
```

## Development phases (from MVP_SCOPE.md)

- ✅ Phase 1: Scaffolding — in progress
- ⬜ Phase 2: Source Parsing + LU System
- ⬜ Phase 3: AI Integration + Prompt Assembly
- ⬜ Phase 4: Compliance + Confirmation Workflow
- ⬜ Phase 5: Export + Deploy

## House rules (must not violate)

From `docs/CLAUDE.md`:

1. Localization, not generation — AI edits, never creates from a brief.
2. PSD-first, AI-backup — deterministic layer replacement whenever layers exist.
3. Change minimization — untouched regions must be bit-identical to source.
4. UI English only; content and regulatory text in their native languages.
5. Compliance is advisory, not blocking — warnings, never hard stops.
6. Two-layer rules: system defaults + brand overrides (tighten **or** relax).
7. Mandatory ad-ops confirmation click even with zero findings.
8. Compliance overlays (RG logos, warnings, license numbers) are deterministic (Pillow/FFmpeg), never AI-generated.
9. Every AI call logged to `AIGenerationLog` with full prompt-assembly trace.
10. Rules are versioned; `AssetConfirmation` snapshots the effective rule set.
11. Async-by-default for image/video editing.
12. i18n wired from day one.
13. LLM-only for text (no DeepL / Google Translate).
14. No OCR — multimodal LLM for image text extraction.
15. Veo 3.1 native audio for dialogue replacement.
16. User sees final output only; full trace stored server-side.
17. Germany is special: time-window metadata, odds-display restriction, calm-audio tone.
18. US/NG use `PER_STATE_OPERATING` sub-market handler; IN uses blocklist; UK-GB default, UK-NI opt-in.
19. `LocalizationTarget(market, sub_market?)` is the atomic unit — never raw market strings.
