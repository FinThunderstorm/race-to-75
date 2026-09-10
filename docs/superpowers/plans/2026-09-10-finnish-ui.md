# Finnish interface implementation plan

**Goal:** Translate the complete application interface into Finnish. Rename Score
to Ihmisarvo, measured in kansalaispisteet, without changing calculations.

**Scope:** Dashboard, chart, tables, authentication, settings, administration,
integration pages, errors, accessibility labels, document language and title.
Keep API routes, field names and stored enum values unchanged. Use Finnish number
and date formatting, preserving UTC date grouping and input/API formats.

- [x] Translate dashboard and chart; show Ihmisarvo in kansalaispisteet (`kp`).
- [x] Translate authentication and administration, including known backend errors.
- [x] Translate settings and integration pages, including stored sync errors.
- [x] Update existing browser assertions and user documentation for Finnish copy.
- [x] Audit all visible strings; verify builds, lint, backend and browser tests.
- [x] Inspect mobile and desktop screenshots, including the longer Finnish labels.

Verification: 91 Playwright/browser and integration tests and 24 backend tests
passed. Frontend and backend production builds, Biome, markdownlint and Knip
passed. Inspected mobile and desktop Ihmisarvo screenshots and mobile settings.
