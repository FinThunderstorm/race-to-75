# Profile and Admin Implementation Plan

**Goal:** Separate personal measurement entry from administration and move account navigation to the top right.

**Architecture:** Shared account navigation owns role-specific links and logout. Separate profile and admin pages use a shared layout. Route guards use the existing current-user query; legacy settings redirects preserve query and hash.

**Tech Stack:** React, React Router, Redux Toolkit Query, CSS, Playwright.

## Tasks

- [x] Update `playwright/settings.spec.ts` for profile routing and add role, layout,
  and access coverage in `playwright/account-navigation.spec.ts`. Run the new
  tests against the existing UI to confirm failures.
- [x] Add `frontend/src/account/AccountNavigation.tsx` and `AccountLayout.tsx`;
  extract existing logout behavior from `Home.tsx`, retaining cache cleanup.
- [x] Replace `Settings.tsx` with `Profile.tsx` and `Admin.tsx`. Group measurement,
  personal details, and connection sections; add section navigation and CSS.
- [x] Update `App.tsx` guards and redirects. Use profile URLs in Home and Eufy
  notices. Add guest navigation to `AuthLayout.tsx`.
- [x] Update existing UI route expectations and admin navigation workflows.
  Update README navigation instructions. Keep backend callback compatibility.
- [x] Run `npm run build -w frontend`, `npm run check`, and affected Playwright
  suites. Inspect desktop/mobile screenshots and review the final diff.

## Verification results

- New account tests failed against the original combined settings page.
- All 153 Playwright tests passed in the isolated Docker stack (`./run-tests.sh`).
- Frontend production build, Biome checks, markdown lint, Knip, and
  `git diff --check` passed. Biome reports an existing schema-version notice.
- Inspected profile and admin screenshots at desktop and 390px mobile widths.
