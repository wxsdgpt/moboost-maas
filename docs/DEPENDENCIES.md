# Moboost MAAS — Dependency Reference

> Complete catalog of all dependencies, versions, purposes, and replaceability.
> Last updated: 2026-04-24

## Frontend (Next.js)

### Core Framework

| Package | Version | Purpose | Replaceable? |
|---------|---------|---------|-------------|
| `next` | 14.2.0 | App Router, SSR, API routes, middleware | No — core framework |
| `react` | 18.3.0 | UI rendering engine | No — required by Next.js |
| `react-dom` | 18.3.0 | DOM rendering | No — required by React |
| `typescript` | 5.x | Type safety, compile-time checks | No — project is fully typed |

### Authentication & Data

| Package | Version | Purpose | Replaceable? |
|---------|---------|---------|-------------|
| `@clerk/nextjs` | 6.12.0 | SSO, session management, user profiles, middleware auth | Yes → Auth.js, Supabase Auth, Lucia |
| `@supabase/supabase-js` | 2.45.0 | PostgreSQL client, storage buckets, realtime subscriptions | Yes → Prisma + any PG, Drizzle |
| `openai` | 4.50.0 | OpenRouter API client (OpenAI-compatible SDK) | Yes → any HTTP client, Vercel AI SDK |

### Content & Rendering

| Package | Version | Purpose | Replaceable? |
|---------|---------|---------|-------------|
| `react-markdown` | 9.0.0 | Render markdown in UI (brief results, reports) | Yes → `marked`, `MDX` |
| `remark` | 15.0.0 | Markdown processing pipeline | Yes → `unified` ecosystem |
| `remark-html` | 16.0.0 | Markdown to HTML conversion | Yes → `rehype` |
| `gray-matter` | 4.0.3 | Frontmatter parsing for markdown files | Yes → `front-matter` |

### Visual & 3D

| Package | Version | Purpose | Replaceable? |
|---------|---------|---------|-------------|
| `three` | 0.163.0 | 3D globe animation on login page | Yes → remove if login redesigned |
| `lucide-react` | 0.383.0 | Icon library (used across all pages) | Yes → `heroicons`, `phosphor` |

### Styling & Build

| Package | Version | Purpose | Replaceable? |
|---------|---------|---------|-------------|
| `tailwindcss` | 3.4.0 | Utility-first CSS framework | Yes → CSS Modules, Styled Components |
| `postcss` | 8.x | CSS processing pipeline | No — required by Tailwind |
| `autoprefixer` | 10.x | Vendor prefix automation | No — required by Tailwind |

### Testing & Quality

| Package | Version | Purpose | Replaceable? |
|---------|---------|---------|-------------|
| `playwright` | 1.59.1 | E2E browser testing, screenshot validation | Yes → Cypress, Puppeteer |
| `eslint` | 8.x | Code linting | No — standard tooling |
| `eslint-config-next` | 14.2.0 | Next.js-specific lint rules | No — paired with Next.js |

---

## Backend (Python — Ad Localization)

### Core Framework

| Package | Version | Purpose | Replaceable? |
|---------|---------|---------|-------------|
| `fastapi` | >=0.115 | Async API framework, OpenAPI docs, dependency injection | Yes → Django, Flask, Litestar |
| `uvicorn[standard]` | >=0.32 | ASGI server with hot-reload | Yes → Hypercorn, Daphne |
| `python-multipart` | >=0.0.17 | File upload parsing | No — required by FastAPI |
| `pydantic` | >=2.9 | Data validation, serialization, settings management | No — core to FastAPI |
| `pydantic-settings` | >=2.6 | Environment variable loading with type safety | Yes → python-dotenv (less typed) |

### Database & ORM

| Package | Version | Purpose | Replaceable? |
|---------|---------|---------|-------------|
| `sqlalchemy[asyncio]` | >=2.0.36 | Async ORM, query builder, model definitions | Yes → Tortoise ORM, SQLModel |
| `alembic` | >=1.14 | Database schema migrations | No — paired with SQLAlchemy |
| `psycopg[binary,pool]` | >=3.2 | PostgreSQL async driver with connection pooling | Yes → asyncpg (less featured) |

### Authentication & Security

| Package | Version | Purpose | Replaceable? |
|---------|---------|---------|-------------|
| `python-jose[cryptography]` | >=3.3 | JWT token creation and validation | Yes → PyJWT, authlib |
| `argon2-cffi` | >=23.1 | Password hashing (Argon2 algorithm) | Yes → bcrypt |
| `email-validator` | >=2.2 | Email format validation | Yes → any regex, validators lib |

### Task Queue

| Package | Version | Purpose | Replaceable? |
|---------|---------|---------|-------------|
| `procrastinate` | >=3.0 | PostgreSQL-backed async job queue (no Redis needed) | Yes → Celery+Redis, ARQ, Dramatiq |

### Storage & HTTP

| Package | Version | Purpose | Replaceable? |
|---------|---------|---------|-------------|
| `boto3` | >=1.35 | S3/R2 compatible object storage client | Yes → `aioboto3`, `minio-py` |
| `httpx` | >=0.27 | Async HTTP client for external API calls | Yes → `aiohttp`, `requests` |
| `tenacity` | >=9.0 | Retry logic with exponential backoff | Yes → custom retry, `backoff` |

### Logging & Serialization

| Package | Version | Purpose | Replaceable? |
|---------|---------|---------|-------------|
| `structlog` | >=24.4 | Structured JSON logging | Yes → `loguru`, stdlib logging |
| `orjson` | >=3.10 | Fast JSON serialization (10x faster than stdlib) | Yes → `ujson`, stdlib json |
| `python-dotenv` | >=1.0 | Load .env files | Yes → pydantic-settings handles this |

### AI Providers (Optional — Phase 2+)

| Package | Version | Purpose | Replaceable? |
|---------|---------|---------|-------------|
| `anthropic` | >=0.40 | Claude API client | Optional — can use OpenRouter instead |
| `openai` | >=1.54 | OpenAI/OpenRouter API client | Optional — can use httpx directly |
| `google-genai` | >=0.3 | Gemini API client | Optional — can use OpenRouter instead |
| `google-cloud-aiplatform` | >=1.72 | Vertex AI (enterprise Google AI) | Optional — enterprise only |

### Image/Video Processing (Optional — Phase 2+)

| Package | Version | Purpose | Replaceable? |
|---------|---------|---------|-------------|
| `Pillow` | >=10.4 | Image manipulation, text overlay, format conversion | No — standard for image work |
| `psd-tools` | >=1.10 | PSD file parsing (Photoshop layers) | No — only PSD parser available |
| `moviepy` | >=2.0 | Video editing, clip manipulation | Yes → `ffmpeg` directly |
| `ffmpeg-python` | >=0.2 | FFmpeg wrapper for video transcoding | Yes → subprocess ffmpeg |
| `imagehash` | >=4.3 | Perceptual image hashing for deduplication | Yes → custom hash |

### Dev & Testing

| Package | Version | Purpose | Replaceable? |
|---------|---------|---------|-------------|
| `pytest` | >=8.3 | Test framework | No — standard |
| `pytest-asyncio` | >=0.24 | Async test support for FastAPI | No — required for async tests |
| `pytest-cov` | >=5.0 | Code coverage reporting | Yes → `coverage.py` directly |
| `faker` | >=33.0 | Test data generation | Yes → `factory_boy`, manual fixtures |
| `ruff` | >=0.7 | Linting + formatting (replaces Black+Flake8+isort) | Yes → Black + Flake8 |
| `mypy` | >=1.12 | Static type checking | No — standard for typed Python |

---

## Cloud Services & APIs

| Service | Purpose | Cost Model | Replaceable? |
|---------|---------|-----------|-------------|
| **Supabase** | PostgreSQL, Auth (unused—we use Clerk), Storage buckets, Realtime | Free tier + usage | Yes → AWS RDS + S3, PlanetScale |
| **Clerk** | User auth, SSO, session management, org management | Free tier up to 10k MAU | Yes → Auth.js, Supabase Auth |
| **OpenRouter** | Multi-model LLM gateway (GPT-4o, Claude, Gemini, etc.) | Pay-per-token | Yes → direct provider APIs |
| **Cloudflare R2** | S3-compatible object storage (via Supabase or direct) | Free egress | Yes → AWS S3, MinIO |

---

## System Requirements

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 18+ (recommended 20 LTS) | Frontend runtime |
| Python | 3.12+ | Backend runtime |
| PostgreSQL | 15+ | Primary database |
| Docker | 24+ (optional) | Containerized development |
| Git | 2.x | Version control |

---

## Dependency Philosophy

**Minimize, don't maximize.** Every dependency is a maintenance burden. Before adding a new package, ask:

1. Can we do this with what we already have?
2. Is this a one-file utility we can vendor instead?
3. Does this package have active maintenance and a clear license?

**Key decisions and rationale:**

- **Procrastinate over Celery**: No Redis dependency. PostgreSQL is already in the stack, so using it for the job queue eliminates an entire infrastructure component.
- **OpenRouter over direct APIs**: One API key, one SDK, access to 100+ models. Avoids vendor lock-in to any single AI provider.
- **Clerk over Supabase Auth**: Better developer experience, built-in UI components, organization support. Worth the trade-off of an extra service.
- **structlog over loguru**: Better structured output for production log aggregation. JSON logs are parseable by any monitoring tool.
- **ruff over Black+Flake8+isort**: Single tool replaces three. 10-100x faster. Same output.
