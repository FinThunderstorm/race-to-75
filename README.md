# road-to-75

A simple app to track progress toward a shared goal: everyone reaching 75 kg.

## Goal

Keep everyone's weight on record over time and make the shared target —
75 kg per person — easy to follow and stay accountable to. The target is global:
75 kg for everyone.

## Status

Early planning. The concept and architecture are set; hosting is not yet decided.

## Features

### Accounts & roles

- Two roles: **admin** and **member**; multiple admins allowed.
- Admins provision users (email + display name), issue one-time passkey
  enrollment links, disable/remove users, and grant `admin` to others.
- The first admin is set **manually in the database** (bootstrap); after that,
  admins promote others from the admin UI.
- Members can log weight and view progress, the leaderboard, and manage their
  own passkeys and integrations.

### Weight logging

- Manual entry: weight (kg) + date, defaulting to today; back-dating allowed.
- Any granularity — multiple readings per day are allowed and stored with their
  full timestamp.
- Manual entries are editable and deletable.
- Integration entries are **not editable**; they are deletable only to purge bad
  synced data, and a deletion leaves a tombstone so the next sync does not
  resurrect the reading.

### Progress

- Start weight is the **first recorded measurement** (derived, not stored
  separately).
- Shows current weight (most recent daily average), kg lost since start, kg to
  go, and % of the way from start to 75 kg.
- All-time trend chart, one point per day (that day's average). No timeframe
  filters.

### Reactions

Light "juice" on logging, derived from existing measurements — no new data.

- Logging a **new personal low** (lowest daily average to date) triggers a
  celebration.
- Logging a weight **higher than your previous reading** triggers a playful
  "buu" — louder if it is a new personal high.

### Leaderboard

- Competitive ranking of all users toward the shared 75 kg goal.
- Users **above** 75 kg are ranked by how close they are (kg to go, ascending).
- Users **at or below** 75 kg form the winner group, sorted ahead of the rest
  and ordered by current streak length.
- **Goal status** requires holding a daily average ≤ 75 kg for **7 qualifying
  days**: unlogged days are skipped, a logged day above 75 kg resets the streak.
- A **"goal reached" badge** is shown once the 7-day streak is met. It is a live
  status and is lost if the user drifts back above 75 kg.

### Integrations

- Connect a weight service (Withings first) via OAuth, see connection status,
  and disconnect. Readings sync automatically into the weight history. See the
  Integrations architecture below for how providers and sync work.

## Architecture

TypeScript monorepo, cloud backend with shared data.

- **Frontend** — React single-page web app: manual weight entry, per-user
  progress toward 75 kg, comparison view, and connecting integrations.
- **Backend** — Node + Fastify REST API.
- **Database** — PostgreSQL.

### Data model

A user *is* a participant in the challenge — there is no separate participant
entity. One `measurement` table is the single source of truth for every weight
reading, whether entered manually or pulled from an integration.

- **users** — `id`, `email`, `display_name`, `role` (text; allowed values
  defined and validated in the app), `created_at`
- **credentials** — `id`, `user_id`, `credential_id`, `public_key`, `counter`,
  `transports`, `device_name`, `created_at` (a user may have several passkeys)
- **measurement** — `id`, `user_id`, `weight_kg`, `measured_at`, `source`
  (`manual` | `withings` | …), `external_id` — unique on `(source, external_id)`
  for idempotent dedup
- **integration_connection** — `id`, `user_id`, `provider`,
  `access_token`, `refresh_token`, `expires_at`, `status`

### Auth

Passkeys (WebAuthn) against a local user table — no passwords, and the passkey
itself is phishing-resistant and inherently multi-factor, so no separate MFA.

- **SimpleWebAuthn** (`@simplewebauthn/server` / `@simplewebauthn/browser`) for
  the registration and authentication ceremonies.
- The in-flight WebAuthn challenge is carried in a short-lived signed token
  (stateless).
- On success, `@fastify/jwt` issues a session JWT stored in an httpOnly, Secure,
  SameSite cookie. Tokens are short-lived; passkey re-login is one tap.
- `@fastify/auth` guards protected routes; `@fastify/rate-limit` protects the
  auth endpoints.
- Users are admin-created; each one self-enrolls a passkey via a one-time
  enrollment link. Account recovery is admin re-issuing that link; users are
  encouraged to register more than one passkey.

### Integrations

Each weight service is a pluggable adapter behind one `WeightProvider`
interface (`authorizeUrl`, `exchangeCode`, `refresh`, `fetchMeasurements`,
optional `verifyWebhook`). Adding a service means adding one adapter; nothing
else changes.

- Sync is webhook-driven where supported (Withings), with a scheduled poll as
  fallback. New readings are normalized to kg and upserted idempotently
  (dedup by `source` + `external_id`), so repeated webhooks or polls never
  duplicate data.
- **Withings** is the first adapter. Others (Fitbit, Garmin, Google Fit, Oura)
  slot in later.
- **Apple Health** is deferred: HealthKit data is on-device only with no
  server-side API, so it needs a future iOS companion app.

### Testing

- **Playwright** for app flows (manual entry, progress view, connect flow).
- **Unit tests** for adapter logic — normalization, dedup, token refresh.

## Getting started

To be added once the stack is scaffolded.
