# Integration Playbook — Mo Boost Ads Translate → Parent Product

**Audience:** Another Claude Code session tasked with merging this project into a parent product and pushing the result to GitHub. You have **zero prior context**. Read this document top-to-bottom before any tool call.

**Status of this repo when you arrive:** GitHub repo `TanghaohanSC/ads-i18-engine`. Repo root contains `backend/`, `frontend/`, `scripts/`, `docs/`, `README.md`, `INTEGRATION.md` (this file). Phase 1 scaffolding only — not end-to-end runnable.

---

## 1. What this product is (in 30 seconds)

- **Name:** iGaming Ad Creative Localization System (internal: *Mo Boost Ads Translate*).
- **Does:** Takes a finished ad creative (PSD / image / video / text) and produces per-market localized outputs for **8 markets**: US, UK, PH, IN, BR, FR, DE, NG. Text-in→text-out, image-in→image-out, video-in→video-out. **Never generates new creative.**
- **Users:** Internal iGaming marketing + ad-ops teams. Not a public-facing product.
- **Stack:**
  - Backend: Python 3.12+, FastAPI ≥0.115, SQLAlchemy 2 async, Alembic, Pydantic v2, **procrastinate** (Postgres-backed queue — no Redis), psycopg3, boto3 for S3.
  - Frontend: Next.js 15 App Router, React 19, Tailwind 3.4, shadcn/ui, next-intl 3.25, TanStack Query 5, Zustand, react-hook-form + zod.
  - DB: PostgreSQL 18 (dev reuses zip-install at `C:\Users\Haohan\pgsql`, user `postgres` / `dev123`).
  - Storage: local FS in dev, S3 (boto3) in prod.
  - AI: OpenRouter-first (OpenAI-compatible gateway), optional direct Anthropic/OpenAI/Google; Veo 3.1 for video, Nano Banana (via multimodal LLM) for image edit. **No DeepL / Google Translate / OCR.**
- **Repo layout (at GitHub repo root):**
  ```
  ads-i18-engine/
  ├── backend/           FastAPI + SQLAlchemy + procrastinate
  ├── frontend/          Next.js 15
  ├── scripts/           bash dev helpers
  ├── docs/              ← 14 design docs — TREAT AS AUTHORITATIVE SPEC
  │   ├── CLAUDE.md      (24 hard constraints)
  │   ├── PROJECT.md
  │   ├── ARCHITECTURE.md
  │   ├── DATA_MODELS.md
  │   ├── LOCALIZABLE_UNITS.md
  │   ├── SUB_MARKETS.md + SUB_MARKET_INTEGRATION.md
  │   ├── COMPLIANCE_GOVERNANCE.md + COMPLIANCE_RULES.md
  │   ├── PROMPT_ASSEMBLY.md
  │   ├── BRAND_AND_GLOSSARY.md
  │   ├── MVP_SCOPE.md
  │   ├── UI_LANGUAGE_SPEC.md
  │   └── CLAUDE_CODE_GUIDE.md
  ├── README.md
  └── INTEGRATION.md     ← this file
  ```

## 2. Required reading — do not skip

Before any code action, read in this order:

1. `docs/CLAUDE.md` — **24 hard constraints**. Any merge that violates one of these is broken, even if tests pass.
2. `docs/PROJECT.md` — market list, user roles, product positioning.
3. `docs/SUB_MARKETS.md` + `docs/SUB_MARKET_INTEGRATION.md` — `LocalizationTarget(market, sub_market?)` is the atomic unit; US / NG / IN / UK handling diverge sharply. Do not flatten into market strings during the merge.
4. `docs/DATA_MODELS.md` — table/entity contracts.
5. `docs/ARCHITECTURE.md` — BUT note `README.md` declares a deliberate deviation: **procrastinate replaces Celery+Redis**. Honor the deviation.
6. `README.md` — what's actually built vs. still TODO.
7. `backend/pyproject.toml` and `frontend/package.json` — pinned versions.
8. `backend/app/config.py` — full env-var surface (reproduced in §9 below).

## 3. Step 0 — Align with the user before any action

Do not edit files or run git commands until the user answers all of the following. Use AskUserQuestion or chat:

1. **Target parent product** — repo path (local) and/or existing GitHub URL.
2. **Integration mode** — pick one (see §4 decision tree):
   - (A) Independent service + API client
   - (B) Monorepo subdirectory (copy code, drop history)
   - (C) `git subtree` merge (preserve history — but this repo has none yet, so equivalent to B until first commit)
   - (D) Git submodule (generally discouraged; only if explicitly requested)
3. **Target GitHub repo** — push into the parent's existing repo, or create a new standalone repo for this project first? (Required because this repo is not yet on GitHub at all.)
4. **Target branch** — never assume `main`. Ask for the integration branch name; if it must be new, ask for its base.
5. **Resource collisions with parent** — confirm:
   - Parent's Postgres DB name (ours defaults to `ad_localization`; rename if collision).
   - Parent's JWT secret / auth scheme — do not reuse our dev default `dev-secret-change-me`.
   - Parent's S3 bucket / prefix — namespace ours under `ad-localization/` to avoid stepping on siblings.
   - Parent's `next-intl` locale files — these do not auto-merge; see §6.
   - Env-var prefix — if parent already uses unscoped names like `DATABASE_URL`, rename ours to `ADLOC_DATABASE_URL`, `ADLOC_JWT_SECRET`, etc. Update `config.py` at the same time.
6. **Doc ownership** — can you rewrite `docs/CLAUDE.md` and `README.md` paths to reflect the new location, or leave originals intact and add a superseding `INTEGRATION_NOTES.md`?
7. **Secrets handling** — confirm which secret manager the parent uses (AWS Secrets Manager / Vault / 1Password / `.env` only). Never commit keys.
8. **User's commit authorship preference** — name/email for the initial commit(s) you will create.

**Do not proceed until all eight are answered.** Record answers in a scratch file (not committed) before editing.

## 4. Step 1 — Decide integration mode

```
            ┌───────────────────────────────────────────────┐
            │ Parent stack has Python 3.12+ AND             │
            │ Next.js 15+ App Router AND Postgres ≥14?      │
            └───────────────────────────────────────────────┘
                          │
              ┌───────────┴───────────┐
              NO                      YES
              │                       │
   ┌──────────▼──────────┐   ┌────────▼─────────────────────┐
   │ Mode A: Independent │   │ Parent wants ONE deployment  │
   │ Service + API Client│   │ artifact / single repo?      │
   └─────────────────────┘   └────────┬─────────────────────┘
                                      │
                          ┌───────────┴───────────┐
                          NO                      YES
                          │                       │
              ┌───────────▼───────┐    ┌──────────▼──────────────┐
              │ Mode A (still     │    │ History matters to the  │
              │ cleanest)         │    │ user? (this repo has    │
              └───────────────────┘    │ NONE yet — so usually   │
                                       │ no)                     │
                                       └──────────┬──────────────┘
                                                  │
                                      ┌───────────┴───────────┐
                                      NO                      YES
                                      │                       │
                          ┌───────────▼─────────┐  ┌──────────▼──────────┐
                          │ Mode B: Monorepo    │  │ Mode C: git subtree │
                          │ subdirectory (copy) │  │ (requires this repo │
                          │ — DEFAULT           │  │ be a git repo first)│
                          └─────────────────────┘  └─────────────────────┘
```

**Mode D (submodule):** skip unless user explicitly asks. Submodules add operational pain and this project is pre-MVP — it will churn.

## 5. Step 2 — Execute the chosen mode

### Mode A: Independent service + API client

1. Create a **new** standalone GitHub repo for this project (name: `ad-localization` or as user picks). Follow §7 "Git init + push" below, then return here.
2. In the parent repo, add a thin typed HTTP client:
   - For a TypeScript parent: generate types from the FastAPI OpenAPI schema (`http://localhost:8000/openapi.json`) via `openapi-typescript` or `@hey-api/openapi-ts`. Put the client at `<parent>/src/lib/ad-localization/` (or parent's convention).
   - For a Python parent: use `httpx` with Pydantic response models copied from `app/backend/app/schemas/`.
3. Parent's env: add `AD_LOCALIZATION_BASE_URL`, `AD_LOCALIZATION_API_TOKEN`. Do **not** share DB, JWT secret, or S3 credentials across services unless user confirms.
4. CORS: update `cors_origins` in `app/backend/app/config.py` (or new `ADLOC_CORS_ORIGINS` env var) to include the parent's origin.
5. Auth: mint service-to-service JWTs using a dedicated `service-account` role. Do not expose the ad-ops user login surface to the parent.
6. Document the boundary in `<parent>/docs/integrations/ad-localization.md` — include the list of 24 hard constraints that the parent must not try to bypass (e.g., parent MUST NOT call into this service to "generate" a creative; it can only ask to localize a submitted source asset).

### Mode B: Monorepo subdirectory (copy, no history)

1. Decide the target subdirectory in parent, e.g. `<parent>/packages/ad-localization/` (monorepo) or `<parent>/services/ad-localization/` (polyrepo-style). Confirm with user.
2. Clone this repo and copy its contents into the target:
   ```bash
   git clone https://github.com/TanghaohanSC/ads-i18-engine.git /tmp/ads-i18-engine
   mkdir -p <parent>/services/ad-localization
   cp -r /tmp/ads-i18-engine/{backend,frontend,scripts,docs,README.md,INTEGRATION.md} <parent>/services/ad-localization/
   ```
   **Exclude** on copy (if copying from a dev workspace instead of a fresh clone): `backend/.venv/`, `backend/__pycache__/`, `backend/.ruff_cache/`, `backend/*.egg-info/`, `frontend/node_modules/`, `frontend/.next/`, `backend/storage/` (runtime artifact).
3. Update paths in copied files:
   - `backend/app/config.py` — `env_file` list if parent keeps `.env` elsewhere.
   - `backend/alembic.ini` — `script_location` and `sqlalchemy.url` placeholders.
   - `README.md` — paths + quickstart reflect new location.
   - `docs/CLAUDE.md` is a spec doc, not runtime — leave content but add a header `> Integrated into <parent> on <date>. Original location preserved for reference.`
4. Merge frontend into parent Next.js, OR keep as a separate Next app:
   - **If parent already has a Next.js 15 app**: merge by moving routes under a segment `/ad-localization/...`, migrating `next-intl` messages (see §6), and registering shadcn components. Watch for Tailwind config collision — merge `app/frontend/tailwind.config.ts` content sections into the parent's.
   - **If parent has a different frontend framework or no frontend**: keep `app/frontend/` as a separate app at its current path; mount behind a reverse proxy in prod. Treat like Mode A for the web tier even though backend is merged.
5. Merge backend into parent:
   - **If parent is also FastAPI**: mount our router under a prefix. In parent `main.py`: `app.include_router(ad_localization_router, prefix="/api/v1/ad-localization")`. Rebase our router: open `app/backend/app/api/v1/router.py`, confirm no route collisions with parent.
   - **If parent is not FastAPI but runs Python**: run as a sub-process (uvicorn on a different port) or as a sibling ASGI app behind an ingress. Do NOT try to port FastAPI routes to another framework — the Pydantic v2 schemas and zod-aligned validation are load-bearing.
   - **If parent is not Python**: fall back to Mode A.
6. Procrastinate worker:
   - If parent already uses procrastinate: register our tasks into the parent's procrastinate app (`from app.tasks import app as adloc_tasks`).
   - If parent uses Celery/RQ/Arq: do NOT port. Either keep our worker as a separate process (simpler), or open a decision ticket with the user before re-writing task definitions. Procrastinate was a deliberate pick to avoid Redis; re-introducing Redis elsewhere is a choice that needs user sign-off.
7. Alembic migrations:
   - If parent has its own Alembic: merge by setting a **separate version table** (`version_table="alembic_version_adloc"` in `alembic.ini` `[alembic]` section and in `alembic/env.py`). Do NOT merge migration histories — that permanently entangles schemas.
   - If parent has no migrations yet: move `alembic/` + `alembic.ini` to parent root, keep the schema namespace prefix `adloc_` on all new tables if collision possible.
8. Delete the original directory only AFTER the user confirms the merge is good and the new location builds.

### Mode C: git subtree merge

This repo has **no git history yet**. So "subtree" is only meaningful after you run §7.1 to git-init it. If history matters:

1. Complete §7 to push this repo to its own GitHub remote first.
2. From parent:
   ```bash
   git remote add adloc <url-to-this-repo>
   git fetch adloc
   git subtree add --prefix=services/ad-localization adloc main --squash
   ```
   Use `--squash` unless user wants every scaffolding commit in parent history.
3. Keep the `adloc` remote for future `git subtree pull --prefix=services/ad-localization adloc main --squash`.

### Mode D: Submodule (only if explicitly requested)

1. Complete §7 first.
2. In parent: `git submodule add <url> services/ad-localization`. Commit the `.gitmodules` + submodule gitlink. Warn user: every parent dev must `git submodule update --init --recursive` on clone; CI needs `submodules: recursive` in checkout actions.

## 6. Step 3 — Shared concerns (apply to ALL modes)

### 6.1 Environment variables

Full surface (from `app/backend/app/config.py`). Rename with an `ADLOC_` prefix if parent has collisions:

| Var | Default | Notes |
|---|---|---|
| `APP_ENV` | `dev` | `dev` / `test` / `staging` / `prod` |
| `APP_NAME` | `ad-localization` | |
| `LOG_LEVEL` | `INFO` | |
| `DATABASE_URL` | `postgresql+psycopg://postgres:dev123@localhost:5432/ad_localization` | async URL; sync derived automatically |
| `DATABASE_URL_SYNC` | *(derived)* | override if the sync URL differs |
| `DB_ECHO` | `false` | |
| `JWT_SECRET` | `dev-secret-change-me` | **MUST override in any non-dev env** |
| `JWT_ALGORITHM` | `HS256` | |
| `JWT_ACCESS_TTL_MINUTES` | `60` | |
| `JWT_REFRESH_TTL_DAYS` | `14` | |
| `STORAGE_DRIVER` | `local` | `local` or `s3` |
| `STORAGE_LOCAL_ROOT` | `./storage` | gitignore in parent if using local |
| `S3_BUCKET` / `S3_REGION` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` / `S3_ENDPOINT_URL` | — | required when `STORAGE_DRIVER=s3` |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GOOGLE_API_KEY` / `GOOGLE_PROJECT_ID` | — | optional direct routes |
| `VERTEX_LOCATION` | `us-central1` | |
| `OPENROUTER_API_KEY` | — | preferred gateway |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | |
| `OPENROUTER_MODEL` / `OPENROUTER_VISION_MODEL` / `OPENROUTER_IMAGE_EDIT_MODEL` / `OPENROUTER_VIDEO_MODEL` | *(empty — user sets in Admin UI)* | don't hard-code |
| `OPENROUTER_TEXT_REVIEW_MODEL` / `OPENROUTER_IMAGE_REVIEW_MODEL` | — | second-opinion reviewers |
| `OPENROUTER_SITE_URL` | `http://localhost:3000` | |
| `OPENROUTER_APP_NAME` | `ad-localization` | |
| `CORS_ORIGINS` | `[http://localhost:3000, http://127.0.0.1:3000]` | add parent origin |

Write a parent-side `.env.example` covering all of these, and a `.env` that the user populates. Add `.env` to parent's `.gitignore`.

### 6.2 Postgres

- Dev DB name: `ad_localization`. In parent dev, pick a name that won't collide (`<parent>_adloc` or keep as-is in a separate DB).
- Schema isolation: use Postgres schema `ad_localization` if sharing a DB. Update `DATABASE_URL` with `?options=-csearch_path%3Dad_localization` and set `alembic/env.py`'s `target_metadata` to include a `schema` arg, OR prefix all table names with `adloc_`. Pick one and document it.
- Procrastinate creates its own tables; scope them with `schema="ad_localization"` in the procrastinate App config.

### 6.3 `next-intl` messages

- Our locale files live under `app/frontend/src/i18n/`. If merging into a parent Next app:
  - Namespace our keys under `adLocalization.*` to avoid colliding with parent keys.
  - Deep-merge messages during `getRequestConfig`, do not just replace.
  - Keep the 24-constraint wording (especially "compliance is advisory not blocking" / "localization not generation") intact — UI copy is legally reviewed.

### 6.4 Compliance rules & brand overrides

From `docs/COMPLIANCE_GOVERNANCE.md`: rules are **versioned** and `AssetConfirmation` snapshots the effective rule set. When integrating:
- Do NOT merge our `RuleSet` table into a parent-wide "rules" table without the user's explicit sign-off. Legal traceability depends on the rule-set schema.
- Brand overrides can tighten AND relax system defaults; ensure parent's role model distinguishes `SYSTEM_RULE_ADMIN` from `BRAND_ADMIN`. Do not collapse roles.

### 6.5 Hard constraints — re-read before you finish

Tattoo these in your context (from `docs/CLAUDE.md`):

1. Localization, not generation — no "prompt to create new creative" endpoints.
2. PSD-first, AI-backup.
3. Change minimization (bit-identical untouched regions, perceptual-hash verified).
4. UI English only; content in native languages.
5. Compliance is advisory, never blocking.
6. Two-layer rules (system defaults + brand overrides).
7. Mandatory ad-ops confirmation click, even with zero findings.
8. Compliance overlays deterministic (Pillow/FFmpeg), never AI.
9. Every AI call logged to `AIGenerationLog`.
10. Rules versioned; `AssetConfirmation` snapshots them.
11. Async-by-default for image/video jobs.
12. i18n wired from day one.
13. LLM-only for text (no DeepL / Google Translate).
14. No OCR — multimodal LLM for image text.
15. Veo 3.1 native audio for video dialogue.
16. User sees final output only; full trace server-side.
17. DE has time-window metadata (21:00–06:00), odds-display restriction, calm tone.
18. US + NG use `PER_STATE_OPERATING` handler; IN blocklist; UK-GB default, UK-NI opt-in.
19. `LocalizationTarget(market, sub_market?)` is atomic.

If the parent product asks for behaviour that violates any of these, stop and raise with the user. Do not silently accommodate.

## 7. Step 4 — Git init and push to GitHub

### 7.1 Initialize this repo (required — no `.git` exists today)

From `C:/Users/Haohan/Documents/mo boost ads translate/`:

```bash
cd "C:/Users/Haohan/Documents/mo boost ads translate"

# one-time
git init -b main
```

Create root `.gitignore` **before first commit**:

```
# python
**/__pycache__/
**/*.pyc
**/.venv/
**/.pytest_cache/
**/.ruff_cache/
**/.mypy_cache/
**/*.egg-info/

# node
**/node_modules/
**/.next/
**/.turbo/

# env / secrets
.env
.env.*
!.env.example

# storage (runtime)
app/backend/storage/

# os
.DS_Store
Thumbs.db
```

Then:

```bash
git add .gitignore
git commit -m "chore: initial .gitignore before adding tree"

git add .
git status          # review — confirm no .venv / node_modules / .env leaked
git commit -m "chore: import Mo Boost Ads Translate — Phase 1 scaffolding"
```

**Verification before push** — run all of:

```bash
git ls-files | grep -E "(\.venv|node_modules|\.env$|__pycache__)" && echo "LEAK" || echo "clean"
git ls-files | wc -l                     # expect hundreds, not tens of thousands
```

If `LEAK` prints, fix `.gitignore`, `git rm -r --cached <path>`, recommit. **Do not push until `clean`.**

### 7.2 Create GitHub remote

Ask the user which:
- (a) Create a new standalone repo (Mode A / C / D), or
- (b) Push directly into the parent's existing repo (Mode B).

**(a) New standalone repo:**
```bash
gh repo create <owner>/<repo-name> --private --source . --remote origin
# or, if gh not available, create repo manually in the GitHub UI, then:
git remote add origin git@github.com:<owner>/<repo-name>.git
```

**(b) Into parent:** skip this — do the parent repo's commit/push in its own working tree after Mode B copy.

### 7.3 Push

```bash
git push -u origin main
```

**Never** use `--force` on a first push to a new remote; if the remote rejects because it has an initial commit (README from `gh repo create` without `--source`), rebase:

```bash
git fetch origin
git rebase origin/main
git push -u origin main
```

If the user asks for a feature branch instead of `main`, create it before first push: `git checkout -b integrate/ad-localization && git push -u origin integrate/ad-localization`.

### 7.4 Confirm with the user before pushing

Even in auto mode, `git push` is a shared-state action. Show the user:
- remote URL
- branch name
- commit count and commit subjects
- file count

Wait for explicit confirmation. Do not push secrets (double-check `.env` and any file matching `*key*`, `*secret*`, `*token*`).

## 8. Step 5 — Verification checklist

Before reporting the merge complete, confirm:

- [ ] Parent repo's `pytest` (or equivalent) runs our tests: `test_health`, `test_prompt_assembly`, `test_rule_engine`, `test_seed_payload`, `test_strategy_resolver`. All pass.
- [ ] `alembic upgrade head` runs cleanly against the target DB.
- [ ] `uvicorn app.main:app --port <port>` serves `/docs` with all v1 routes present: `assets`, `auth`, `brands`, `compliance`, `exports`, `jobs`, `overrides`, `parsed`, `projects`, `prompts`, `reports`, `settings`, `sub_markets`, `users`.
- [ ] `procrastinate --app=app.tasks.app worker` starts without errors.
- [ ] Frontend `npm run build` (or `pnpm build`) succeeds. `npm run typecheck` passes.
- [ ] Seed script runs; default admin `admin@example.com` / `admin` can log in in dev (and was rotated in staging/prod).
- [ ] No hard-coded paths to `C:/Users/Haohan/Documents/mo boost ads translate/` remain in code or config. Grep for `Haohan`, `mo boost`, `ai localizaiton hub` (the latter is an adjacent unrelated project — it must not leak in).
- [ ] `docs/` spec files referenced or copied, not orphaned.
- [ ] Compliance rule snapshot tests green (if parent runs them).
- [ ] CI configured for Python 3.12 + Node 20+ + Postgres 14+.
- [ ] `.env.example` committed; real `.env` not committed.
- [ ] User reviewed the diff and signed off.

Only then run `git push`.

## 9. Rollback

If anything goes wrong post-push:

- **Mode A:** delete the standalone repo (`gh repo delete`) or archive it; remove the client from parent.
- **Mode B:** `git revert` the merge commit(s) in parent; do NOT `git reset --hard` on a pushed branch. If the branch isn't shared yet, `git reset --hard <pre-merge-sha>` then `git push --force-with-lease` — but confirm with user first; this overwrites history.
- **Mode C:** `git revert -m 1 <subtree-merge-sha>` in parent.
- **Mode D:** `git submodule deinit -f services/ad-localization && git rm -f services/ad-localization && rm -rf .git/modules/services/ad-localization && git commit`.

Never use `git push --force` on `main`/`master`. Never skip hooks (`--no-verify`) unless the user explicitly asks.

## 10. Things to refuse or escalate

Stop and ask the user if the integration requires any of:

- Removing `AIGenerationLog` or any other audit trail for "performance".
- Exposing a "generate new creative from brief" endpoint (violates Constraint #1).
- Making compliance findings blocking (violates Constraint #5).
- Merging our `RuleSet` / `AssetConfirmation` tables into a parent rules table.
- Swapping LLM for DeepL / Google Translate / OCR.
- Dropping the `LocalizationTarget` abstraction in favour of raw market strings.
- Force-pushing to a shared branch.
- Committing an `.env` or any credential.

Any of these means the design premise is shifting. Escalate to the user in plain language.

## 11. Appendix — quick facts

- **Python version:** 3.12+ (3.14 tested).
- **Node version:** 20+.
- **Postgres version:** 18 for dev (14+ acceptable; Alembic will tell you if a feature requires newer).
- **Test suite location:** `app/backend/tests/` (5 files today).
- **Procrastinate app:** `app.tasks.app`.
- **Default CORS:** `http://localhost:3000`, `http://127.0.0.1:3000`.
- **Adjacent project warning:** the user has a separate project at `C:\Users\Haohan\Documents\ai localizaiton hub\` (note the typo "localizaiton"). It is a different product (game UI/dialogue localization, TS + Hono + Vite) and must not be confused with this one. Do not pull code between the two.
- **Original repo tree root:** `C:\Users\Haohan\Documents\mo boost ads translate\` — after a successful merge, ask the user whether to archive or delete it.

---

**Final reminder:** the spec lives in `docs/`. The code lives in `backend/` and `frontend/`. The 24 constraints are binding. When in doubt, read, then ask, then act.
