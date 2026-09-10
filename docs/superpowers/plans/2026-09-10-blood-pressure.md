# Manual blood pressure mode

**Goal:** Add Verenpaine with manual paired readings and group history.

**Design:** Store systolic and diastolic integer mmHg readings with a UTC date
in `blood_pressure_measurement`. Reuse active-owner authentication, own-reading
listing/deletion, race/radiator access, cache invalidation and history aggregation.
Settings provides both pressures and a date defaulting to today. Reject future
or invalid dates, unknown fields, values outside 1–300 mmHg and systolic values
no greater than diastolic. These are storage bounds, not clinical categories.
Multiple readings per day are allowed. Corrections use deletion and re-entry.

**View:** Add `mode=blood-pressure` to navigation, sample data, automatic rotation
and settings return links. Display both raw pressure histories in participant
colors: solid systolic and dashed diastolic, with paired latest values and a
readings table. Use existing three-month daily/weekly aggregation. Height and
weight are not required. The scoring follow-up is described in
`2026-09-10-blood-pressure-score.md`; no treatment guidance is added.

## Steps

- [x] Test validation, active ownership, sharing and deletion before implementation.
- [x] Add migration 0012, manual API, and shared race/radiator data.
- [x] Test independent histories and paired daily/weekly averaging; add mode,
  sample data, dual chart series, paired tooltips and readings table.
- [x] Add settings form, list, failure/retry states and cache invalidation.
- [x] Run API and browser scenarios, regression tests, builds and lint; inspect
  mobile screenshots and review the diff.

## Verification

- 24 backend unit tests and 53 targeted Playwright regressions passed.
- Four blood-pressure tests passed again after extending invalid-input and
  failed-delete retry coverage.
- Backend/frontend builds, Biome, Markdown lint, Knip and diff whitespace checks
  passed. Biome reports an existing schema-version informational notice.
- API tests used a disposable PostgreSQL 18 database on port 55432. Browser tests
  used the installed Chromium executable with a temporary config and a local
  backend on port 7512. Desktop and mobile screenshots were inspected.
- Independent code review found no actionable bugs. Migration 0012 still needs
  to run against deployment databases before the updated backend starts.
