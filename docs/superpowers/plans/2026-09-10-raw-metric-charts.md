# Raw metric charts with citizen points

**Goal:** Plot actual BMI, biceps cm and blood pressure mmHg, with their component
citizen points in parentheses. Keep the combined Ihmisarvo formula and final,
highlighted selector position unchanged.

**Design:** Raw values drive chart coordinates, bounds, changes and table columns.
Compute component points from the corresponding daily/weekly raw average, using
existing formulas. Show `30,0 BMI (83,3 kp)`, `40,0 cm (20,0 kp)` and paired pressure
`160,0 / 100,0 mmHg (75,0 kp)` in chart labels and tooltips. Classic stays kg and
Ihmisarvo stays combined kp. Existing missing-height eligibility stays unchanged.

Share BMI and blood-pressure interval constants between calculation and bands.
Draw faint full-width bands behind the chart: BMI 18.5–25, systolic 90–120 and
diastolic 60–80, with readable range labels and distinct pressure band colors.
Include whole intervals in chart bounds so even outlying data cannot hide them.
The bands denote game scoring plateaus, not new clinical categories.

## Steps

- [x] Add regression tests for raw values, component points, unchanged total score,
  and bounds including complete reference bands; update old index-view expectations.
- [x] Implement raw views and shared thresholds; update labels, tooltips, tables,
  titles and subtitles to match units and show parenthesized kp.
- [x] Add shaded labeled bands with raw coordinate bounds and mobile-safe labels.
- [x] Run calculations/browser regressions, build and lint; inspect desktop/mobile
  screenshots and review changes. Update README.

## Verification

24 calculation tests and 22 browser scenarios passed. Frontend build, Biome,
Markdown lint, Knip and whitespace checks passed. Inspected desktop/mobile
screenshots for raw values, parenthesized kp and visible full scoring bands.

Review found wrapped labels overlapping at fixed 48px spacing. Component row
heights are now measured, and chart/standings minimum heights stay aligned.
The regression covers six and ten participants at desktop sizes. In-progress
mode animation now continues when row measurement updates its target. Existing
animation and reduced-motion tests pass. Follow-up review verified eight-pixel
gaps at 1280×720 with ten participants and found no remaining actionable issues.
