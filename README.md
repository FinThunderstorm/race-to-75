# race-to-75

A simple app to track progress toward a shared goal: everyone reaching 75 kg.

The interface is in Finnish under the name **Kisa 75 kiloon**, with Finnish
number and date formatting. The combined score is **Ihmisarvo**, measured in
**kansalaispisteet** (`kp`).

## Goal

Keep everyone's weight on record over time and make the shared target —
75 kg per person — easy to follow and stay accountable to. The target is global:
75 kg for everyone.

## Status

Passkey enrollment/login, admin user management, a sample/live race dashboard,
Withings and Eufy Life weight imports, an IP-allowed radiator, and a Docker/Coolify
deployment setup are implemented. Paino, BMI, Hauis, Ihmisarvo and Verenpaine modes
are available.
Manual weight entry is still planned.

### Blood pressure

Select **Verenpaine** or open `/?mode=blood-pressure`. In **Asetukset →
Verenpainemittaukset**, enter your systolic (yläpaine) and diastolic (alapaine)
pressures in mmHg and the measurement date (UTC, default today). Backdating and
multiple readings per day are supported. Delete your own entries and add them
again to correct mistakes. Saving or deleting refreshes the shared history.

The three-month chart shows systolic pressure as a solid line and diastolic
pressure as a dashed line in each participant's color. Completed weeks average
all readings; the current week uses daily averages. Latest values show both
pressures and their measurement date in the readings table. Height and weight
are not required. The mode supports sample data, automatic rotation, and the
read-only shared display. The readings also contribute a blood pressure index
to Ihmisarvo.

Inputs accept whole numbers from 1–300 mmHg, with systolic greater than diastolic,
and valid dates no later than today (UTC). These are input bounds, not clinical
categories. Entries are visible to the existing group and IP-allowed display.

Existing databases need `0012_blood_pressure_measurement.sql`; apply it with
`npm run db:migrate` using the target `DATABASE_URL` before running the backend.

### Biceps circumference

Select **Hauis** or open `/?mode=biceps`. In **Asetukset → Hauismittaukset**,
record your own circumference in centimetres and the measurement date (UTC).
You can delete your own entries to correct mistakes. Multiple readings on one
day are averaged; completed weeks use weekly averages. Add your height in
**Asetukset → Kisaprofiili** to show the **biceps index: 100 × circumference / height**
(both in cm). For example, 34 cm at 170 cm and 38 cm at 190 cm both score 20.
The readings table also shows the current circumference in cm. The group and
shared display can view the index history. This mode has no shared target or
weight-loss badges.

Existing databases need migration `0009_biceps_measurement.sql` before running
the updated backend (`npm run db:migrate` with the target `DATABASE_URL`).

Migration `0010_biceps_history.sql` imports 20 historical biceps readings for
existing users matching Riku Honkanen, rotsi-janne/Jalai, Daria, tsu/Timo Suomela,
and Tomppa. Existing identical readings are skipped. Missing users are skipped
(including on a fresh database); ambiguous names abort the migration. This is
a one-time import, so users created afterward do not receive historical readings
automatically. Run it with the usual `npm run db:migrate -w backend` command.

## Features

The following describes the target feature set; see Status for what is available
and Getting started for the current local workflow.

### Accounts & roles

- Two roles: **admin** and **member**; multiple admins allowed.
- Admins provision users (email + display name), issue one-time passkey
  enrollment links, disable/re-enable users, and grant or revoke `admin` access.
  Permanent account removal is still planned.
- The first admin is created with the **bootstrap command**; after that,
  admins invite users and promote others from settings.
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

- Open `/` without a session from the address configured in
  `RADIATOR_ALLOWED_IP` to see the live group graph and standings, refreshing
  every 30 seconds. Server-Sent Events and live reaction events remain planned.
- IP access hides the profile/settings link, logout, and sample-data switch.
  A compact bottom-left footer keeps **Koko näyttö** available (Esc to exit).
  If the browser blocks fullscreen, the control explains how to use the browser's
  own full-screen option instead of disappearing.
  The graph expands vertically with the browser window, including tall
  displays; small screens and large participant lists can scroll as needed.
- Signed-in visitors keep the normal dashboard, including settings and logout,
  even at the allowed address. Open `/login` to sign in from the internal
  network; enrollment links also work normally. IP access never creates a user
  session or grants access to account, admin, or integration APIs.
- Set `RADIATOR_ALLOWED_IP` to one IPv4 or IPv6 address; leave it empty to disable
  anonymous access. IPv4-mapped IPv6 addresses are matched as well. No URL query
  parameter can grant IP access.
- A small bottom-right indicator shows **IP-osoite sallittu** or **IP-osoitetta
  ei sallittu** on
  every screen, including login and the signed-in dashboard. It checks the
  current network every 30 seconds independently of your session. A failed
  check shows **IP-tarkistus ei onnistu** until the next successful check.
- When using a reverse proxy, set `TRUST_PROXY` to a comma-separated list of
  trusted proxy IPs or CIDRs. Forwarded client addresses are ignored by default.
  Use the actual proxy address/subnet, and ensure that proxy sets or appends the
  real client address in `X-Forwarded-For`. Do not trust arbitrary clients.
  For Coolify, configure both variables in its environment and redeploy.
- Use the address the server sees: usually the office's **public egress IP**
  when opening the public deployment, or the client's private address over a
  direct internal connection. Allowing an office egress IP grants read-only
  weight-history access to everyone sharing that address.

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

Integrations have provider-specific connection and sync code and share the
`measurement` table. Users can connect both Withings and Eufy Life in **Asetukset**.
Withings uses OAuth and a webhook worker. Eufy Life uses a temporary sign-in,
profile selection, and polling inside the backend process.

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

Open the printed enrollment link on this computer, click **Luo pääsyavain**,
and follow your browser's prompt. Enrollment logs you in automatically; later,
use **Kirjaudu sisään pääsyavaimella**. Enrollment links are single-use and
expire after
24 hours by default. Use `localhost`, matching the example's passkey settings.

The bootstrap command refuses to run if any admin already exists. If you already
have an account, use its passkey. An existing admin can issue a new enrollment
link from **Käyttäjähallinta** in settings. If no admin can sign in, recovery still
requires database access.

#### Invite and manage other users

Click your signed-in name in the dashboard footer to open **Asetukset**
(direct URL: `/settings`). All users see their account details and Withings
connection controls. Admins also see **Käyttäjähallinta** on this page.
Enter an email and display name, select **Luo kutsu**, and copy the enrollment
link to
share privately with that person.
The app does not send email. Opening the link lets them create a passkey and
sign in as a member. Links are single-use and expire after 24 hours by default
(`ENROLLMENT_TOKEN_TTL_SECONDS`).

The user list lets admins edit details, promote members to admin, demote other
admins, and disable or re-enable accounts. **Uusi rekisteröitymislinkki** replaces
previous unused links while retaining existing passkeys. Admins cannot demote
or disable themselves; another enabled admin must make those changes.

Role changes apply to existing sessions immediately on the next API request;
open pages refresh access within 30 seconds. Demotion hides user management
while keeping personal settings available. Disabled accounts cannot sign in,
enroll, or use an existing session. Disabling invalidates unused enrollment links
and preserves readings, passkeys, and Withings imports. Re-enabling restores
passkey access and may restore an unexpired session. There is no permanent delete
action in this view. Old `/profile` and `/admin` links redirect to settings,
including any integration result messages.

For an existing deployment, run `npm run db:migrate` against its database before
starting the updated app. Migration `0005_user_disablement.sql` adds account
disablement support and leaves existing users enabled. In production, configure
`WEBAUTHN_ORIGIN` to the public HTTPS origin and `WEBAUTHN_RP_ID` to its hostname
so generated enrollment links and passkeys match the deployment.

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
to open **<http://localhost:7500/settings>**. Click **Yhdistä Withings**, log into
Withings, and approve access. The callback connects the signed-in app account,
imports your history, and returns to settings. No bootstrap email or connect
token is needed for this flow.

The profile shows connection status and any import errors. Use **Yhdistä
Withings uudelleen**
to import the history window again; existing readings are updated without duplicates.
**Katkaise Withings-yhteys** removes the app's stored connection and tokens, stopping
future imports while keeping previously imported readings. It does not revoke the
app's authorization in Withings; that can be removed from Withings separately.

### Connect Eufy Life

Open **<http://localhost:7500/settings>**, choose **Yhdistä Eufy Life**, sign in
with your Eufy Life account, and select your own profile. A user may connect both
Withings and Eufy Life; different users may select different profiles from the
same Eufy account. A profile cannot be connected to two race participants at once.

The initial import includes weight readings from **one calendar month before
connection**. The backend checks for new readings every 15 minutes; **Synkronoi
nyt**
runs an immediate check. Only data uploaded to Eufy Life can be imported. Older
imports can change the starting weight used for race progress. Repeated imports
update matching readings without duplicates within Eufy; the same weighing
imported through two different providers is not automatically merged.

The app never saves your Eufy email or password and never automatically signs
in again. It stores an encrypted access token, account ID, and selected profile.
Temporary profile-selection tokens expire after 10 minutes. When the access
token expires or is rejected, Asetukset prompts you to **Yhdistä Eufy Life uudelleen**.
Reconnecting the same profile preserves the original history boundary to recover
missed readings. Disconnecting removes the token and stops imports; existing
weight readings remain.

Eufy uses an unofficial cloud protocol, based on the
[Home Assistant integration](https://github.com/m4ary/eufylife-api-hacs) and
[Homey client](https://github.com/johnsonkw/homey-eufylife).
Compatibility, history availability, and token lifetime depend on Eufy's service.
No Eufy developer application or webhook configuration is required.

The polling worker runs inside the backend in both local development and Coolify;
there is no extra container to start. It claims work in PostgreSQL so multiple
backend instances do not import the same connection concurrently. Set
`EUFY_SYNC_ENABLED=false` to disable background polling for isolated tests.
Access tokens are encrypted with a key derived from `COOKIE_SECRET`; changing
that secret requires users to reconnect Eufy. Keep it stable across instances.

### 5. View live data and keep it current

Open **<http://localhost:7500/>** to view live data by default. Click **Ryhmän mittaukset**
in the header to open the sample preview (`?data=sample`), and click **Esimerkkimittaukset**
to switch back to live data.

Live mode requires login and reads every participant's recorded weight history
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
public webhook, use **Yhdistä Withings uudelleen** in your profile whenever you
want
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

### BMI view

Select **BMI** from **Kisanäkymä**, or open **<http://localhost:7500/?mode=bmi>**.
Paino (75 kg) remains the default mode; both modes use live data by default.
Add your height in centimetres under **Asetukset → Kisaprofiili**, then save.
Height accepts 50–300 cm with one decimal place; leave it blank and save to
remove it.

BMI is calculated as weight in kg divided by height in metres squared. The chart
and tooltips show a **BMI index** using the same rules for everyone:

- BMI 18.5–25: **100 points**.
- BMI below 18.5: **100 × BMI / 18.5**.
- BMI above 25: **100 × 25 / BMI**.

The reference line is at 100 points. Going below the plateau loses points; there
is no lowest-BMI winner. The readings table includes both the index and current
raw BMI. Changes compare indices calculated from consecutive daily averages;
completed-week indices are calculated from the average weight for that week.
BMI cannot distinguish fat from muscle; see
[CDC's explanation of BMI](https://www.cdc.gov/bmi/about/index.html).

Participants without height remain listed below the chart. Correcting height
recalculates all historical indices. Saving height makes indices visible to the
existing group
and IP-allowed shared display. The shared display supports `?mode=bmi` but cannot
edit profiles. Switching modes preserves participant colors and live/sample choice.

Apply database migration `0007_user_height.sql` through `npm run db:migrate` before
running this version against an existing database. Raw imported weights stay
in kg.

### Ihmisarvo (combined race score)

Select **Ihmisarvo** or open `/?mode=score`. The shared formula is:

```text
Ihmisarvo = hauisindeksi × BMI-indeksi × verenpaineindeksi / 10,000
Verenpaineindeksi = 100 × min(1, systolic/90, 120/systolic,
                               diastolic/60, 80/diastolic)
```

The blood pressure index gives 100 points when systolic is 90–120 mmHg and
diastolic is 60–80 mmHg, inclusive. Outside those ranges, each pressure loses
points proportionally to its nearest boundary. The lower component index wins:
a normal pressure does not cancel an out-of-range pressure. The upper boundaries
are informed by [Käypä hoito](https://www.kaypahoito.fi/hoi04010), and lower
boundaries by [NHS](https://www.nhs.uk/conditions/low-blood-pressure-hypotension/).
The inclusive plateau, ratios and combined score are game rules, not clinical
categories, a validated health index, or individual treatment targets.

For example, biceps index 20, BMI 25 and blood pressure 120/80 give 20 kp.
At 160/100, the blood pressure index is 75 and the same participant gets 15 kp.
At BMI 30 and blood pressure 160/100, the BMI index is 83.33… and the combined
score is 12.5 kp. Higher scores are better. The biceps formula adjusts for height
but does not correct sex differences. There are no personal targets, and the
combined score has no fixed maximum of 100.

Height, weight, biceps and blood pressure are all required. Missing components
never produce a partial score. Each UTC day with any measurement uses that day's
average and the latest preceding daily averages of the other measurements.
Systolic and diastolic are averaged before computing their index. History begins
only when all components are available; future readings never fill earlier dates.
Completed weeks average observed-day scores, while the current week shows them
daily. Calculations retain full precision; the display rounds to one decimal
using a Finnish decimal comma.

Expand **Näytä mittaukset** to see the formulas, all component indices, raw
values and their measurement dates. Old component readings can be carried forward;
their original dates remain visible. Ihmisarvo supports live and sample data, the
read-only radiator, automatic mode switching and returning from Asetukset.
Use **Lisää verenpainemittaus** in either Verenpaine or Ihmisarvo to record a
reading. Adding or deleting readings recalculates the score, including history.

This calculation uses the existing blood pressure data and needs no migration
beyond `0012_blood_pressure_measurement.sql` from the manual-entry feature.

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
RADIATOR_ALLOWED_IP=
TRUST_PROXY=
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

Signed-in users manage their Withings connection at `/settings`, accessible by
clicking their name in the dashboard footer. The token-based bootstrap flow
remains available for compatibility and requires the optional `WITHINGS_CONNECT_TOKEN`,
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
