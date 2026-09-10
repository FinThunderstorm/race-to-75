# Blood pressure in Ihmisarvo

**Goal:** Include manual blood pressure in the existing combined game score.

**Rules:** BP index = 100 × min(1, systolic/90, 120/systolic,
diastolic/60, 80/diastolic). The inclusive 90–120 / 60–80 mmHg plateau,
continuous proportional penalties and weaker-component combination are game
rules, not a validated health score or personal treatment target.
Upper bounds are informed by [Käypä hoito](https://www.kaypahoito.fi/hoi04010)
and lower bounds by [NHS](https://www.nhs.uk/conditions/low-blood-pressure-hypotension/).

Ihmisarvo = biceps index × BMI index × BP index / 10,000.
A missing BP reading prevents a score, consistent with other missing components.
Each UTC date with any reading uses that day's averages and previously observed
averages of the other components. Average systolic and diastolic before indexing.
Never backfill with future readings. Completed weeks average observed-day scores.
Retain full precision. Expose pressure values, index and original reading date.

## Steps

- [x] Add failing tests for plateau boundaries, high/low values, combined scaling,
  missing/future pressure, paired averaging, carry-forward and pressure-only days.
- [x] Extend score calculation and component metadata, keeping raw BP chart.
- [x] Explain formula/limits in both score and pressure details, add manual-entry
  link to Score, update empty states/profile text and existing test fixtures.
- [x] Verify unit/browser regressions, builds, lint and mobile layout. Update README.

## Verification

23 calculation regressions and 16 browser scenarios passed. The browser tests
cover the first manual pressure enabling Score, component values/dates, sample
and radiator views, mobile width, mode cycling and interpolation. Inspected the
mobile Score screenshot. Fixed adjacent measurement links overflowing at 390px
by grouping them in a wrapping flex container.

Frontend build, Biome, Markdown lint, Knip and diff whitespace checks passed.
Independent code review found no actionable defects. No further database change
is needed beyond the manual blood pressure migration.
