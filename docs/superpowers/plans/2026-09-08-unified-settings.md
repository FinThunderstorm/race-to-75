# Unified Settings

## Approved behavior

The requested revision combines profile and user management into `/settings`.
The signed-in name remains the sole settings link in the dashboard footer.
Every authenticated user sees their account details and Withings controls;
admins additionally see invitations and user management on the same page.
Demotion removes the admin section while keeping personal settings available.

Keep `/profile` and `/admin` as redirects that preserve query parameters and
fragments. Withings callbacks return directly to `/settings`. Existing API
authorization and account-management behavior remain in force.

## Implementation

- [x] Update browser tests for the single footer link, combined sections,
  member-only view, demotion, legacy redirects, and OAuth results; confirm failure.
- [x] Extract Withings controls and user management into sections composed by
  `Settings.tsx`; update routes, callback destinations, and responsive styling.
- [x] Update documentation, run checks/builds and affected integration tests,
  inspect desktop/mobile layouts, and review the final diff.

## Verification

38 browser/integration tests and 13 unit/script tests pass. Both production
builds, Biome, Markdown lint, knip, and diff checks pass. Desktop/mobile layouts
were inspected; independent review found no blockers. Legacy redirect tests
verify both query strings and fragments survive.
