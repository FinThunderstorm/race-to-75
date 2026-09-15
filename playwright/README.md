# Test suite

Run the complete suite with `./run-tests.sh`. It creates an isolated Docker stack,
builds the application, runs backend/process checks and Playwright, then removes
the stack. CI uses the same test command.

For checks that need no running server or database, use `npm run test:local`.
With a migrated test database and running backend, `npm test` runs everything
locally. Application journey fixtures need a PostgreSQL role with `CREATEDB`;
the Docker test role already has it.

## Where coverage belongs

| Kind | Responsibility |
| --- | --- |
| Application journeys | Persistence, enrollment, providers, score settings |
| API integration | Authorization, validation, concurrency, webhooks |
| Browser regression | Layout, animation, fullscreen, inputs, retries |
| Transformation units | Histories, score composition, DOTS, provider records |
| Process integration | Configuration parsing and environment propagation |

`history.spec.ts`, `score.spec.ts`, and `dots.spec.ts` are transformation tests
using the Playwright assertion runner; they do not launch a browser. Avoid adding
unit tests for simple wrappers, labels, URL construction, or implementation
constants already exercised through application behavior.

## Real application journeys

Use `app-fixtures.ts` for the built frontend, real backend routes and a migrated
database per worker. `signIn()` creates a real account and session. Enrollment
tests use real virtual passkeys instead. Every account created
outside `signIn()` must be removed in `finally`. Restore changed singleton
settings and provider configuration before the next test.

Only external providers are simulated in provider journeys. For retry behavior,
intercept the particular failing request and let successful requests reach the
real application. Do not implement a second database inside `page.route()`.

Bootstrap and webhook-worker specs have dedicated worker fixtures so their
whole-database operations cannot affect other scenarios. Eufy has a dedicated
worker to avoid sharing its application rate-limit budget with other journeys.
Do not statically import backend modules into fixture-based specs: the fixture
must select its database before the backend creates its module-level pool.

## Consolidation rules

- Give each behavior a primary test; remove duplicate happy paths after a real
  journey covers them.
- Keep distinct negative/security cases at the API boundary.
- Use explicit reference results for calculations, never values read from the
  production lookup table being checked.
- Check expected element counts before geometry comparisons.
- Share setup and use named steps, while keeping unrelated journeys independent.
