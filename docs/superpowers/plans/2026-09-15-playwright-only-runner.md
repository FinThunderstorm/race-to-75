# Playwright-only test runner

**Goal:** Run every retained test through Playwright with one results summary.

**Approach:** Move the four Node-runner files into `playwright/*.spec.ts`, use
Playwright assertions and fixtures, and preserve all 14 existing cases. Keep real
subprocess execution and isolate the radiator backend pool in its own worker.

- [x] Move configuration, IP security, Eufy normalization and environment-script
  tests into Playwright; replace Node test hooks with guaranteed fixture cleanup.
- [x] Make root `npm test` invoke only Playwright; remove the backend runner and
  stale test discovery configuration. Keep `test:local` as a Playwright subset
  for the migrated cases that need no running services.
- [x] Update both READMEs with the unified runner and focused test command.
- [x] Verify the migrated 14 cases, lint/build checks, test discovery (121 total),
  and the complete isolated Docker suite.

No production behavior changes or commits are needed.

## Verification results

- `npm run test:local`: 14 migrated cases passed with Playwright.
- `./run-tests.sh`: 121 tests passed in one Playwright run (13.0 seconds).
- Playwright discovery lists 121 tests in 39 files.
- Biome, Markdown lint, Knip, backend/frontend builds and `git diff --check` passed.
- All migrated test names and assertion counts were preserved; no Node test-runner
  imports or commands remain in active code or documentation.
