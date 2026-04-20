# Changelog

## v1.0.2 — Auth bypass for testing (2026-04-15)

Adds a global, env-driven **auth bypass mode** so QA can click through the full
product without needing valid Clerk sessions or admin credentials.

### How to enable

```bash
# .env.local
AUTH_BYPASS=1
NEXT_PUBLIC_AUTH_BYPASS=1
```

Restart the dev server. A red banner appears at the top of every page while the
flag is on:

> ⚠️ AUTH BYPASS ENABLED — all auth checks are disabled. v1.0.2 test build. Do not ship.

### What it does

- `src/middleware.ts` — returns early, skips Clerk auth check and the onboarding gate.
- `src/lib/adminAuth.ts` — `isAdminAuthenticated()` and `isAdminTokenValid()` auto-return `true`.
- `src/app/api/brief/execute/route.ts` — skips Clerk check; uses first user row for FK.
- `src/app/api/reports/[id]/route.ts` — skips Clerk check and the `user_id` ownership filter.
- `src/components/UserScopeGuard.tsx` — hydrates the in-memory store as a synthetic dev user.
- `src/components/AuthBypassBanner.tsx` — renders the red warning strip.

### What it does NOT do

- Does not bypass Clerk's **client-side** widgets. `<SignedIn>` / `<SignedOut>`
  will still reflect the real Clerk session, so UI chrome that depends on them
  (sign-out button in Settings, etc.) still requires a real sign-in to appear.
  Everything **server-side** is unlocked.
- Does not disable the collaborator API bearer-token check — that auth is
  separate and scoped to a different surface.

### Safety rails

- The flag is **off by default**. Only toggled via env vars.
- The banner is unconditional when the flag is on — impossible to miss in
  screenshots or screen-recordings.

---

## v1.0.1 — i18n foundation + report artifact regen

(Prior release.)
