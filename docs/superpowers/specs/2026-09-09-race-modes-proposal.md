# Race modes proposal

Status: BMI implementation approved by the user on 2026-09-09. Other modes remain
proposals for discussion. BMI uses a reference line at 25; Classic remains default.

## Recommendation

Start with different views of the same group's readings: Classic (75 kg), BMI,
and Personal goal. Add Maintenance next. Introduce separately joined challenges
only when people need independent membership, start dates, or competition results.
The shared-view approach is a proposed assumption pending product feedback.

Keep Race to 75 as the application name and Classic as the initial default mode.
Live data remains the default data source in every mode.

## Candidate modes

| Mode | Display and goal | Participation benefit | Priority |
| --- | --- | --- | --- |
| Classic | Weight in kg; existing 75 kg goal | Preserves the original race | Keep |
| BMI | Weight divided by height squared; configurable reference target | Accounts for height differences | First release |
| Personal goal | Percentage of the journey from baseline to a chosen weight | Supports different targets and both gain and loss | Second release |
| Maintenance | Observed days inside a chosen weight band | Includes people already at their goal | Third release |
| Percentage change | Weight change as a percentage of baseline | Compares relative changes at different starting weights | Later view or capped challenge |
| Consistency | Weeks meeting a chosen weigh-in schedule | Participation without a weight-change objective | Later |
| Teams | Mean capped progress toward individual goals | Cooperative goals across mixed starting points | Later, after challenges |

Avoid an uncapped "most kilograms lost" competition: it favors larger starting
weights and has no defined stopping point. Body-fat percentage needs a separate
measurement model and a decision about comparability across devices. Waist-to-height
ratio is another possible future metric, but requires waist measurements that the
app does not currently store. Defer these additional measurement sources.

## BMI design

BMI = weightKg / (heightCm / 100)^2.

At 75 kg, someone 160 cm tall has BMI 29.3; someone 180 cm tall has BMI 23.1;
someone 195 cm tall has BMI 19.7. A common weight target therefore represents very
different weight-to-height ratios. Conversely, a BMI reference of 25 corresponds
to 64.0 kg, 81.0 kg, and approximately 95.1 kg at those heights.

These are arithmetic illustrations, not recommended individual target weights.
BMI is a screening measure and does not distinguish fat, muscle, and bone mass.
It does not establish an individual's health or make competition equally difficult.
See [CDC: About BMI](https://www.cdc.gov/bmi/about/index.html).

Proposed behavior:

- Users enter optional height in centimetres in Settings. Validate finite positive
  numbers in both API and database; explain units and require explicit save.
- BMI view plots the existing weight history converted using saved height. Label
  the line "BMI reference" rather than implying that a universal value is an
  individually prescribed goal. A reference of 25 is an option for discussion.
- A height correction recalculates the shared historical BMI view. If formal
  challenges are introduced, snapshot height at enrollment to keep results stable.
- Users without height appear in an "Add height to join this view" list. Never
  guess height or render a zero BMI. An all-missing state still offers mode switching.
- Use a neutral current-value and change display. Do not copy Classic's "personal
  low" or weight-gain setback badges into BMI mode. A lower BMI is not always better.
- Begin with a comparison view, without awarding a winner for the lowest BMI.
  A competitive BMI mode would require an agreed target/range and eligibility rule.
- This proposal assumes an adult group. Do not apply adult BMI categories to
  children; pediatric interpretation is different, as explained by
  [CDC's BMI FAQ](https://www.cdc.gov/bmi/faq/index.html).

Do not offer "percentage BMI lost" as a separate mode: with fixed height, it is
mathematically identical to percentage body weight lost.

## Personal goal and maintenance rules

For a personal goal, let B be baseline weight, T target weight, and W current weight:

progress = 100 × (W − B) / (T − B).

The same formula supports gain and loss. For example, 100 → 90 kg at 95 kg and
60 → 65 kg at 62.5 kg both show 50% progress. This compares completion of a chosen
goal, not equal effort: people select goals of different difficulty.

Display a common 0–100% progress chart, with current kg in details. Cap completion
credit at 100%, retain actual measurements, and show negative progress when moving
away from the baseline. If B = T, offer Maintenance instead of dividing by zero.
Do not grant additional points for overshooting a target.

Record an explicit goal start date. Use the mean of daily means in the seven UTC
days before that date as baseline, with at least three observed days. If data is
insufficient, show "Collecting baseline" and let the user start after enough data
exists. Store baseline value and window when the goal is activated; do not use the
earliest imported measurement or a moving three-month chart boundary. Imported
corrections require an explicit baseline reset. Changing a target starts a new
goal version rather than silently rewriting prior progress.

For Maintenance, choose a personal lower and upper weight bound. Score the share
of observed days whose daily mean falls within the inclusive band; also show
coverage, such as "18 of 21 observed days in range; 21 of 28 days recorded".
Missing days are unknown, never automatic success. More weigh-ins on the same day
must not earn more points. Defer ranking until minimum coverage rules are agreed.

Consistency measures recording frequency only, not health. Offer a weekly schedule
and count distinct days, so repeated weighing cannot improve the score. Teams can
later average capped individual progress, with explicit membership and eligibility
rules so team size does not determine the result.

## User experience

- Add a mode selector beside the dashboard title: Classic, BMI, Personal goal,
  followed by Maintenance when available.
- Keep metric mode separate from live/sample selection. Example links:
  `/?mode=bmi` and `/?mode=bmi&data=sample`. Preserve both parameters when toggling.
- Explicit URL mode wins; absent or unrecognized mode falls back to Classic in the
  first release. Add remembered preferences only if requested.
- Mode changes update title, axis, units, reference line, participant labels,
  tooltips, accessible description, and readings table together.
- Use the same participant colors in every mode. Assign colors before excluding
  participants who lack mode-specific profile data.
- Radiator displays can select a mode by URL and remain read-only. Profile and goal
  edits require login as the profile owner.
- Make clear that entering height enables BMI to be shown to the existing group
  and radiator audience. A future "progress only" privacy option must also filter
  the API response; hiding kg in the UI would not make the readings private.
- Use provider-neutral reading labels: the app now imports both Withings and Eufy.

## Implementation roadmap

### 1. Metric foundation and BMI

Scope: ship a working Classic/BMI selector, height settings, and complete BMI view.

- Add a nullable `height_cm` column with a new migration under `backend/migrations/`.
- Add an authenticated self-profile endpoint in `backend/src/profile/index.ts`,
  its query/validation code, and register it from `backend/src/server.ts`.
  Use the signed-in user ID; reject attempts to update another user's profile.
- Add `frontend/src/api/profileApi.ts` and
  `frontend/src/settings/RaceProfileSettings.tsx`, linked from `Settings.tsx`.
  Invalidate profile and race caches after an update.
- Extend `backend/src/race/index.ts` and `frontend/src/api/raceApi.ts` with optional
  height. Cover both authenticated race and radiator responses. Keep stored
  measurements in kg; BMI is a derived value, not another imported measurement.
- Extract mode metadata and transforms into `frontend/src/race/raceModes.ts`.
  Each mode declares its metric, formatting, reference, eligibility, and badge rules.
- Refactor `prepareRace.ts` to separate daily/weekly reading preparation from metric
  conversion. Preserve existing Classic aggregation. For a fixed height, BMI of
  average weight equals average BMI, so current buckets can be reused.
- Generalize bounds and `RaceChart.tsx` beyond its hard-coded 75, kg labels, upward
  setback badges, and personal-low logic. Calculate bounds from actual values and
  reference so meaningful values below the reference remain visible.
- Update `Home.tsx` for mode routing and `sampleRace.ts` with explicit sample heights,
  including a missing-height example.

Acceptance examples: 81 kg at 180 cm produces BMI 25; changing height updates chart
and table; missing height never breaks other users; live/sample switches retain
mode; Classic retains its existing appearance and calculations; user colors remain
constant when switching modes; profile writes fail without proper authentication;
BMI renders correctly on mobile, Firefox, and radiator layouts.

### 2. Personal goals

Add a versioned `participant_goal` model with owner, start date, target, baseline
window, and baseline value. Add self-service goal setup and progress transformation.
Keep independent challenge membership out of this release.

Acceptance examples: both loss and gain examples above produce 50%; equal baseline
and target offers Maintenance; insufficient baseline data shows a setup state;
progress does not change merely because the chart window rolls forward; overshoot
earns at most 100%; target edits preserve the old goal version.

### 3. Maintenance

Extend goal configuration with an inclusive band and a distinct scoring rule.
Show recorded-day coverage alongside achievement and handle stale readings explicitly.

Acceptance examples: both band boundaries count; missing days are unknown; multiple
readings count as one daily mean; a gap cannot masquerade as consecutive success.

### 4. Optional challenges and teams

Only after demand is confirmed, introduce `race` and `race_participant` entities:
mode, start/end dates, membership, enrollment snapshots, scoring policy, and archived
results. Freeze scoring inputs for a challenge; define late joining, corrections,
ties, and minimum data coverage before competitive rankings ship.

## Existing behavior requiring an explicit decision

The current "days" streak counts qualifying recorded days, even across calendar
gaps. Preserve Classic initially, but do not reuse that algorithm for a new mode
that promises consecutive days. Either label recorded days accurately or implement
calendar continuity and stale-data handling as a separately reviewed change.

The current API includes users without readings. Keep that visibility and add a
separate explanation for missing height, baseline, or goal rather than treating all
missing data as the same state.

## Decisions for discussion

1. Shared views first (recommended), or independently joined challenges immediately?
2. BMI as a comparison view first (recommended), or a competitive target/range from day one?
3. Keep Classic as default initially (recommended), or make BMI the group default
   after height setup?

No application code is changed by this proposal.
