# Remove weight mode

**Goal:** Keep BMI, Hauis, Verenpaine and Ihmisarvo, with BMI as the default.
Weight history remains the source for BMI and combined scores.

**Approach:** Remove the Classic mode from the mode model, navigation and chart
rendering. Old or unknown mode parameters fall back to BMI. Remove the obsolete
weight/BMI layout placeholders and weight-only target/badge UI.

- [x] Add a regression test for the four-mode order and default/legacy URL parsing;
  run it before changing production code.
- [x] Update `raceModes.ts`, `Home.tsx`, `Settings.tsx`, `RaceChart.tsx` and
  `RaceReadings.tsx`; retain weight imports, settings and BMI/score formulas.
- [x] Update mode switching, empty-history and chart tests to use remaining modes.
  Verify automatic cycling, manual reset, settings return, animation, sample/live
  data and the read-only display.
- [x] Update README default-mode documentation. Run relevant calculation and
  browser tests, frontend build, Biome, Knip, Markdown and diff checks.


## Verification

- Regression tests failed on the old mode order/default before implementation.
- 27 calculation tests pass; 38 Chromium browser tests pass, covering default and
  legacy links, four-mode autoplay, manual countdown reset, settings return,
  animations, responsive charts and the read-only display.
- Frontend build, Biome, Knip, Markdown and diff checks pass.
- Firefox assertions were updated for BMI reference bands. Local verification
  could not run: the installed Firefox uses an incompatible Playwright protocol,
  and downloading the matching version timed out.
- Preserved the user's concurrent Resu-ranking title edits.


## Full CI test follow-up

The isolated Docker Compose workflow (`./run-tests.sh`) passes all 109 Playwright
scenarios, including Chromium, Firefox, database-backed API contracts, passkey
enrollment/login, settings navigation and all chart modes. Backend unit tests
also pass all 24 cases in the clean Linux backend build stage.

Updated the profile and radiator-auth exact response assertions to include
`bloodPressureMeasurements: []`. Updated admin/settings/radiator-auth navigation
assertions for BMI mode preservation, and completed the settings API mock for
blood pressure. Public response-shape assertions remain strict.
