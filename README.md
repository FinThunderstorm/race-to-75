# race-to-75

A simple app to track progress toward a shared goal: everyone reaching 75 kg.

## Goal

Keep everyone's weight on record over time and make the shared target —
75 kg per person — easy to follow and stay accountable to. The target is global:
75 kg for everyone.

## Status

Passkey enrollment/login, a sample/live race dashboard, Withings history import,
and a Docker/Coolify deployment setup are implemented. Manual weight entry,
admin management, and the separate radiator are still planned.

## Features

The following describes the target feature set; see Status for what is available
and Getting started for the current local workflow.

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
- Three-month trend chart: one average per completed week, with daily averages
  for the current week. No timeframe filters.

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

### Radiator

An ambient, read-only big-screen display (office TV/monitor) of the group's
race to 75 — glanceable, no interaction, auto-updating.

- Shows the **group race to 75** (each participant's current weight, kg to go,
  % progress), the **leaderboard** with goal-reached badges, and **live
  reactions** (personal-low celebrations and "buu" moments) as they happen.
- Updates over **Server-Sent Events**, so standings re-rank and celebrations
  appear in real time as weights are logged or synced.
- Access is **authenticated OR IP-allowlisted**: logged-in users view it from
  anywhere, while unauthenticated requests are allowed only from an
  admin-managed IP allowlist (the office-TV case). Read-only either way.

## Architecture

TypeScript monorepo, cloud backend with shared data.

- **Frontend** — React single-page web app: manual weight entry, per-user
  progress toward 75 kg, comparison view, and connecting integrations.
- **Backend** — Node + Fastify REST API.
- **Database** — PostgreSQL.

### Code organization

Backend code is organized by feature and endpoint. Small features can stay in a
single file; split them only when the file has enough real responsibilities to
justify it. For larger feature directories, keep the entrypoint focused on the
workflow, put Zod schemas next to their related types in `types.ts`, and move
large SQL blocks into `queries.ts` when they start to dominate the feature
logic. Avoid file splits that add ceremony without making the behavior easier to
read.

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

### 1. Configure the local environment

Install Node.js at the version in `.nvmrc`, Docker Desktop, and tmux. Start
Docker Desktop before launching the app.

For a fresh checkout, copy the local example to `.env`:

```sh
cp .env.local.example .env
```

If you already have `.env`, merge any missing settings instead of overwriting it.
The loader reads **`.env`**, not `.env.local`. The local example sets the app
and passkeys to `http://localhost:7500`, uses the local PostgreSQL database, and
leaves Withings credentials empty. Withings is optional for the sample dashboard.
`.env.example` is a deployment reference with production host settings.

Local startup and each service pane load `.env`. File values override inherited
environment variables, including values from an existing tmux server. Values
are parsed as dotenv data, so spaces and dollar signs are not executed by a
shell. Blank JWT/cookie secrets use local development defaults. The real `.env`
is gitignored; keep credentials out of the example files.

### 2. Start the app

From the repository root:

```sh
./start-local-env.sh
```

The script selects the pinned Node version, installs dependencies, builds the
frontend, and starts three tmux panes: PostgreSQL, the frontend build watcher,
and the backend. The backend waits for PostgreSQL and applies migrations.
Open **<http://localhost:7500>**; Fastify serves both the UI and API on that port.
The script does not open a browser automatically.

To start without attaching to tmux:

```sh
./start-local-env.sh --detach
```

Attach later with `tmux attach -t race-to-75`. Detach with `Ctrl-b`, then `d`;
services keep running. Restart with `./start-local-env.sh` after changing `.env`.
Restarting replaces this app's tmux session and retains the database volume.

### 3. Create your admin and device passkey

Do this **before connecting Withings for the first time**. In another terminal
at the repo root, run:

```sh
node scripts/with-local-env.mjs npm run auth:bootstrap-admin -w backend -- \
  --email "you@example.com" \
  --name "Your Name" \
  --base-url "http://localhost:7500"
```

This email identifies your app account and does **not** have to match the email
you use to log into Withings.

Open the printed enrollment link on this computer, click **Create passkey**,
and follow your browser's prompt. Enrollment logs you in automatically; later,
use **Log in with passkey**. Enrollment links are single-use and expire after
24 hours by default. Use `localhost`, matching the example's passkey settings.

The bootstrap command refuses to run if any admin already exists. If you already
have an account, use its passkey. Reissuing enrollment links for
existing accounts currently requires database access; there is no admin UI yet.
Deleting an account also deletes its readings, connection, and passkeys.

### 4. Connect Withings and import your history

In your [Withings developer dashboard](https://developer.withings.com/dashboard/),
configure an application and register this exact OAuth redirect URL:

```text
http://localhost:7500/integrations/withings/callback
```

Fill `WITHINGS_CLIENT_ID` and `WITHINGS_CLIENT_SECRET` in `.env` with the values
from the developer application.

Keep `WITHINGS_REDIRECT_URI` set to the localhost callback above. Set
`WITHINGS_INITIAL_SYNC_DAYS` to the history window you want: the local example
uses **180 days**. Leave `WITHINGS_WEBHOOK_CALLBACK_URL` empty for a local import.

Restart `./start-local-env.sh`, log in, and click your name in the dashboard footer
to open **<http://localhost:7500/profile>**. Click **Connect Withings**, log into
Withings, and approve access. The callback connects the signed-in app account,
imports your history, and returns to your profile. No bootstrap email or connect
token is needed for this flow.

The profile shows connection status and any import errors. Use **Reconnect Withings**
to import the history window again; existing readings are updated without duplicates.
**Disconnect Withings** removes the app's stored connection and tokens, stopping
future imports while keeping previously imported readings. It does not revoke the
app's authorization in Withings; that can be removed from Withings separately.

### 5. View live data and keep it current

Open **<http://localhost:7500/?data=live>**, or click **Sample data** in the
header. Click **Live data** to return to the sample preview.

Live mode requires login and reads every participant's imported Withings history
through `/api/race`. It refreshes the database view every 30 seconds. Both live
and sample charts show the last three calendar months through today. Completed
weeks have one point averaging every weighing in that week; the current week
has at most one point per logged day, averaging that day's weighings. Weeks start
on Monday in UTC. Empty weeks/days have no point, and the first partial week
only includes readings within the displayed window.

Start weight, current weight, personal records, and qualifying-day streaks still
use the full history and daily averages, independent of chart grouping. Participants
without recent readings remain visible, and the table shows the latest reading date.

**The dashboard refresh does not fetch from Withings.** For local use without a
public webhook, use **Reconnect Withings** in your profile whenever you want
fresh data.

Automatic updates require a public webhook callback configured in the Withings
application and `WITHINGS_WEBHOOK_CALLBACK_URL`, plus a running webhook worker.
Local startup does not launch that worker. After reconnecting to subscribe to
notifications, process queued events once with:

```sh
npm run build -w backend
node scripts/with-local-env.mjs npm run cron:fetch-withings-measurement -w backend
```

The worker consumes received webhook events; it does not poll Withings for new
history. Coolify's `withings-worker` service repeats this command automatically.

### Local troubleshooting and checks

- **Withings connection is unavailable:** check the client ID/secret and redirect
  URI in `.env`, then restart the app.
- **Withings reports a redirect mismatch:** register the exact localhost callback
  above and use it in `WITHINGS_REDIRECT_URI`.
- **Passkey setup/login fails:** check `WEBAUTHN_RP_ID=localhost` and
  `WEBAUTHN_ORIGIN=http://localhost:7500`; use that address in your browser.
- **Live history is empty or stale:** confirm the connection callback reports a
  successful import, check the history window, and reconnect for new readings.
  Local and production databases are separate.

Other commands can load `.env` through the same wrapper, for example migrations:

```sh
node scripts/with-local-env.mjs npm run db:migrate
```

Run the local checks from the repo root (the lint script also needs shellcheck):

```sh
./deploy-scripts/01-lint.sh
npm run build -w backend
npm run build -w frontend
npm test -w backend
node --test scripts/with-local-env.test.mjs backend/scripts/bootstrap-admin.test.js
./run-tests.sh
```

The Playwright script uses an isolated Docker Compose stack and test database.

### Database migrations

Schema changes live in `backend/migrations` as ordered SQL files. Applied
migrations are tracked in `schema_migrations` with checksums, and the runner
uses a PostgreSQL advisory lock so concurrent deploys do not apply the same
migration twice.

The same command is used locally, in Playwright Docker tests, and in production:

```sh
npm run db:migrate -w backend
```

PostgreSQL major version is pinned in `.postgres-version` and used by local and
test Compose files.

### Coolify deployment

The backend image is published to GitHub Container Registry by
`.github/workflows/ci.yml` on every push to `master`, and can also be
published manually from GitHub Actions. For Coolify on Hetzner, use
`docker-compose.coolify.yml` as the Compose file.
It defines four services:

- `postgres` — PostgreSQL with persistent volume storage.
- `migrate` — a one-shot service that runs `npm run db:migrate`.
- `backend` — starts only after `migrate` completes successfully.
- `withings-worker` — polls queued Withings webhook events and imports weight
  measurements.

Set these Coolify environment variables:

```sh
DATABASE_URL=postgres://race_to_75:<password>@postgres:5432/race_to_75
POSTGRES_PASSWORD=<password>
POSTGRES_USER=race_to_75
POSTGRES_DB=race_to_75
POSTGRES_VERSION=18
APP_HOST=race-to-75.rigster.cv
IMAGE_TAG=latest
JWT_SECRET=<long-random-secret>
COOKIE_SECRET=<different-long-random-secret>
WITHINGS_CLIENT_ID=<withings-client-id>
WITHINGS_CLIENT_SECRET=<withings-client-secret>
WITHINGS_API_BASE_URL=https://wbsapi.withings.net
WITHINGS_AUTHORIZE_URL=https://account.withings.com/oauth2_user/authorize2
WITHINGS_REDIRECT_URI=https://race-to-75.rigster.cv/integrations/withings/callback
WITHINGS_WEBHOOK_CALLBACK_URL=https://race-to-75.rigster.cv/webhooks/withings
WITHINGS_CONNECT_TOKEN=<long-random-temporary-connect-token>
WITHINGS_BOOTSTRAP_EMAIL=you@example.com
WITHINGS_BOOTSTRAP_DISPLAY_NAME="Your Name"
WITHINGS_BOOTSTRAP_ROLE=admin
WITHINGS_INITIAL_SYNC_DAYS=3650
WITHINGS_WORKER_INTERVAL_SECONDS=60
```

The Compose file sets `pull_policy: always` for the app image so `IMAGE_TAG=latest`
is pulled on each deploy. Use a commit SHA instead of `latest` when you want
Coolify to deploy an exact image, for example `IMAGE_TAG=<commit-sha>`. If the
GHCR package is private, configure Coolify registry credentials for `ghcr.io`.

Signed-in users manage their Withings connection at `/profile`, accessible by
clicking their name in the dashboard footer. The token-based bootstrap flow remains
available for compatibility and requires the optional `WITHINGS_CONNECT_TOKEN`,
`WITHINGS_BOOTSTRAP_EMAIL`, and `WITHINGS_BOOTSTRAP_DISPLAY_NAME` settings.
Connect the bootstrap account by opening:

```txt
https://race-to-75.rigster.cv/integrations/withings/connect?token=<WITHINGS_CONNECT_TOKEN>
```

Configure the Withings app with this OAuth redirect URL:

```txt
https://race-to-75.rigster.cv/integrations/withings/callback
```

Add this Withings Body & Weight notification callback URL to the app's callback
URL allowlist:

```txt
https://race-to-75.rigster.cv/webhooks/withings
```

Do not add custom Compose networks in Coolify; services in the stack can reach
each other by service name.
