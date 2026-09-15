# Configurable Ihmisarvo components

**Goal:** Administrators select which measurement components contribute to the group's score.

**Architecture:** Persist a singleton selection in PostgreSQL. Admin GET/PUT
`/api/admin/score-settings` uses `{ components: ['bmi', 'biceps', 'blood-pressure', 'dots'] }`.
Race and radiator responses include `scoreComponents` with the selected keys.
Default to all four; reject empty, duplicate, and unknown selections. Current rules
apply to historical scores. Only enabled components require readings and profile data.

**Tech stack:** Fastify, PostgreSQL, Zod, React, RTK Query, Playwright.

- [x] Backend: migration, protected settings routes, validation, race/radiator response, API tests.
- [x] Calculation: tests for subsets, missing disabled measurements/profile fields, observation dates,
      unchanged four-component default; average only enabled components.
- [x] UI: admin checkbox form with loading/error/retry states, persistence and invalidation;
      apply settings to live/radiator score, adapt score explanation and breakdown.
- [x] Verification: builds, lint, score regression tests, admin browser/API tests in isolated Docker DB.

Keep standalone metric views available. Sample mode retains all four example components.
At least one component must remain selected; deleting measurements is outside this change.
