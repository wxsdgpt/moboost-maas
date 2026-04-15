# Moboost MAAS — Change Checklist

Every time you modify the codebase, run through this checklist before considering the change complete.

## 1. Global Config Changes (next.config.js, middleware.ts, .env, tsconfig)

Before modifying any global configuration:

- [ ] List all external services the project depends on (Clerk, Supabase, OpenRouter, etc.)
- [ ] For CSP changes: verify every external domain is allowed in the correct directive (script-src, connect-src, frame-src, font-src, img-src)
- [ ] For middleware changes: verify auth flow still works for all route types (public, protected, admin)
- [ ] For env var changes: update .env.example with the new variable and a description

## 2. After Any Code Change

- [ ] Does this change affect something that loads in the browser? If yes, static analysis alone is insufficient — must verify in browser
- [ ] Does this change touch a shared module (layout.tsx, store.ts, middleware.ts)? If yes, check all pages that depend on it
- [ ] Does this change introduce new external domains (CDN, API, auth provider)? If yes, verify CSP allows them

## 3. React / Next.js Specific

- [ ] No `<style>{...}</style>` JSX with quoted strings inside (causes hydration mismatch). Use `dangerouslySetInnerHTML` for static CSS
- [ ] Server components don't use browser-only APIs (window, localStorage, document)
- [ ] New pages have corresponding error.tsx and loading.tsx where appropriate

## 4. When Encountering a Bug Report

- [ ] First action: identify root cause. Never suggest workarounds or bypasses
- [ ] Every user-facing feature must work end-to-end. Skipping a broken feature is not a solution
- [ ] After fixing: verify the fix doesn't introduce new issues in adjacent features

## 5. Test Suite

- [ ] Run the moboost-test skill after any significant change
- [ ] Pay attention to the COMPAT (Runtime Compatibility) category — it catches issues static analysis misses
- [ ] If tests pass but a feature is broken in browser, add a new test to prevent regression
