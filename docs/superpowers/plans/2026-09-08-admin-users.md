# Admin User Management Implementation Plan

> Execute inline with the executing-plans skill; request an independent code review before completion.

**Goal:** Implement the approved admin page, invitations, account editing, roles, and disablement.

**Architecture:** Fastify admin routes use transactional PostgreSQL queries and current database permissions. React uses RTK Query and the existing passkey enrollment screen. A nullable disable timestamp preserves accounts and their history.

**Tech Stack:** TypeScript, Fastify, PostgreSQL 18, React, RTK Query, Playwright.

## Tasks

- [x] Add `playwright/admin.spec.ts` with API and browser acceptance tests. Seed isolated accounts and use signed test sessions for API checks. Verify 401/403 before implementation; run `npm test -w playwright -- admin.spec.ts --workers=1` against an isolated database and app on port 7511.
- [x] Add `backend/migrations/0005_user_disablement.sql`. Add `backend/src/admin/queries.ts` for list, create, update, and reissue. Serialize writes with a users-table lock, check actor authorization inside transactions, reject duplicate emails, prevent self-disablement/demotion, and retain an enabled admin.
- [x] Add `backend/src/admin/index.ts` with validated requests, origin checks, no-store responses, and explicit 400/401/403/404/409 errors. Register routes in `backend/src/server.ts`.
- [x] Update `backend/src/auth/index.ts` and `queries.ts` to reject disabled accounts during session validation, enrollment, and login. Lock the user row before consuming enrollment tokens so concurrent disablement/reissue cannot admit a stale token.
- [x] Add `frontend/src/api/adminApi.ts`, `admin/Admin.tsx`, and focused form/card components. Register the API in `store.ts`, route in `App.tsx`, and admin links in `Home.tsx` and `Profile.tsx`. Invalidate current-user and race data after edits; clear sensitive caches on logout/lost permissions. Style responsive forms and cards in `styles.css`.
- [x] Run acceptance tests and inspect desktop/mobile screenshots. Verify invitations, editing, promotion/demotion, confirmation, disablement, validation, and expired/superseded token rejection.
- [x] Update `README.md` and the bootstrap refusal message. Run `npm test -w backend`, script tests, both builds, `npm run check`, `npm run md`, `npm run knip`, and the full Playwright suite. Request independent review while checking documentation and final diffs, then resolve findings.

## Test environment

Use a temporary PostgreSQL 18 cluster on port 55475 and database `race_admin_test`.
Use explicit test-only `DATABASE_URL`, `JWT_SECRET`, `COOKIE_SECRET`, and
`WEBAUTHN_ORIGIN=http://localhost:7511`; do not load the repository `.env`.
Stop temporary services after verification. Leave feature changes reviewable on
`codex/admin-user-management`.

## Verification results

- 36 Playwright tests passed, including desktop/mobile admin flows, Firefox,
  passkey enrollment, session permissions, concurrent role changes, and Withings.
- 8 backend unit tests and 5 bootstrap/environment script tests passed.
- Both production builds, Biome checks, Markdown lint, knip, and diff whitespace
  checks passed.
- Independent review findings were fixed and re-reviewed: preserve managed roles
  on legacy Withings reconnect, check unknown targets before duplicate emails,
  and exercise fresh enrollment links across disablement and re-enablement.
- Admin acceptance tests now run a local Fastify instance with independent auth
  rate limits and a dedicated worker for backend configuration/database lifetime.
  They build the frontend when needed in the container test workflow.
