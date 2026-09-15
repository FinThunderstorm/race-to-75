# Test suite rewrite

**Goal:** Replace duplicate and self-confirming tests with real application journeys,
while keeping focused coverage of complex transformations and security boundaries.

**Approved design:** The user approved the preceding test review and consolidation
proposal. Browser journeys use the real application and an isolated database;
provider journeys fake only the external provider. Unit coverage remains for history
aggregation, score composition, DOTS, and provider data normalization. API security,
browser geometry/interaction, and process integration cases remain focused.

## Implementation

- [x] Add a shared application fixture with migrated, isolated databases, real
  routes, built frontend, deterministic test accounts, and guaranteed cleanup.
- [x] Replace mocked measurement/profile CRUD journeys with real persistence,
  reload, chart, and deletion checks; retain focused input/retry browser cases.
- [x] Exercise saved score settings through the real UI, API, database and radiator.
- [x] Exercise Withings/Eufy connections through real app routes with only provider
  responses simulated; verify corrections, deduplication, reconnect and disconnect.
- [x] Consolidate enrollment journeys and move token rejection coverage to routes;
  replace URL helper checks with a bootstrap CLI integration journey.
- [x] Consolidate transformation tests by responsibility, remove trivial mode,
  palette and duplicated route tests, use independent DOTS reference fixtures.
- [x] Consolidate repeated chart smoke cases, reduce weekday/viewport combinations,
  and require nonempty geometry before checking overlap.
- [x] Wire all retained backend, process and Playwright tests into the normal runner.
- [x] Run lint, appropriate builds and the complete isolated Docker suite; review
  coverage against removed tests and repair any regressions in the rewritten suite.

## Verification

Use `npm run check`, `npm run build -w backend`, `npm run build -w frontend`, and
`./run-tests.sh`. New regression assertions should also reject representative bad
results (constant thresholds, duplicated imports, missing labels) where practical.
Production behavior is outside this rewrite's scope.

## Results

- Complete isolated Docker run passed: 107 Playwright tests, 11 backend tests,
  and 3 process tests (121 total, down from 184).
- Biome, Markdown lint, backend build, frontend build, and `git diff --check` passed.
- The independent DOTS reference test was checked against an in-memory mutation:
  changing the male Intermediate threshold from 300 to 310 causes it to fail.
- Independent review found no remaining material test correctness issues.
- Production behavior was unchanged.
