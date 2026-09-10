# Race indices implementation plan

**Goal:** Use the shared biceps-to-height index, a fixed BMI index and their combined
race score, without personal targets. The user authorized implementation.

**Architecture:** Calculate indices in the frontend from existing measurements.
Keep Classic unchanged; convert Biceps and BMI views to indices and add Score.
Store raw measurements as before. No database migration or blood-pressure work.

**Tech stack:** TypeScript, React, existing Playwright unit and browser tests.

## Rules

- Biceps index = `100 * circumferenceCm / heightCm`.
- BMI index = `100 * min(1, BMI / 18.5, 25 / BMI)` for positive finite BMI.
- Score = `bicepsIndex * bmiIndex / 100`. Higher is better; score is not capped
  at 100 or presented as a validated health index. No sex correction is applied.
- Missing/invalid height hides all derived values and offers the height setting.
- Score requires both weight and biceps history. Average each metric per UTC day;
  on each day with a measurement, use that day's average and the latest preceding
  average of the other metric. Never borrow future data or create unmeasured days.
- Show the component values and their dates so carried readings are identifiable.
- Score history averages these observed-day scores per completed week and shows
  individual observed-day scores in the current week. Existing BMI/Biceps grouping
  remains based on the average raw measurement in each bucket, then conversion.
- All calculations use unrounded values; display one decimal. Height corrections
  recalculate historical indices. Blood pressure remains deferred.

## Execution

- [ ] Update `playwright/race-modes.spec.ts` and `playwright/biceps-mode.spec.ts`;
  add `playwright/race-score.spec.ts`. Assert the agreed ratios, BMI plateau and
  both tails, no future backfill, daily averaging, missing inputs, latest component
  dates, and unchanged Classic behavior. Run these tests and confirm failures.
- [ ] Add `frontend/src/race/raceIndices.ts` for formulas and combined history;
  retain daily weights in `prepareRace.ts`; integrate all four modes in
  `raceModes.ts`. Run the calculation tests until they pass.
- [ ] Update `Home.tsx`, `RaceChart.tsx`, profile and biceps help text. Present
  mode-specific formulas, raw measurements and score constituents. Preserve
  mode URLs, sample/live toggles, animation, missing-height guidance and radiator.
- [ ] Update existing BMI/Biceps browser tests to the new values and add Score
  coverage for missing data, settings round trips, sample/live/radiator and mobile.
- [ ] Document formulas, averaging and limitations in `README.md`. Run Biome,
  markdownlint, knip, frontend/backend builds and the full isolated test suite.
- [ ] Review the final diff and inspect desktop/mobile screenshots. Report the
  formulas and actual verification results. Leave changes available for review.
