# Launch gap

The built app measured against `NERVE-SPEC.md`, and what is missing that would
stop an MVP going out. Model tuning is deliberately excluded — that work is
known and owned.

**Method.** Every claim below was checked in the code, not recalled. Where the
answer is "partly", the entry says which part. Where the spec and the build
disagree on purpose, it is filed as drift rather than as a gap, because those
need a decision rather than a ticket.

**Date** 23 August 2026 · **Against** spec v1.0 (21 Aug 2026)

> **Updated after the M3 database pass.** Every table §13 names now exists, with
> RLS proven from a second account, and the two content libraries are authored
> and seeded. Entries below carry a `DB done` marker where the schema half has
> landed and only the app half is left; the sizes have been cut to match.

---

## 1. Where the build actually is

| Milestone (§17) | State |
|---|---|
| M0 — the spike | **Passed.** 178–339ms median model response, RTT stable from Colombo, character stability measured over five minutes. Both adapters exist behind one interface; the blind A/B has not been run |
| M1 — the loop | **Done.** Auth, eight-table schema with RLS, brief → live → scorecard → transcript, deterministic + judgement scoring |
| M2 — progression & field | **Half.** Eight personas, unlock ladder, quota, streaks. The field has its schema and its 24 reviewed challenges; nothing reads them yet |
| M3 — the premium layer | **Half.** Arena visual system, skeletons, real analysers, reduced motion. No sound kit, haptics, PWA, score choreography |
| M4 — billing & safety | **Schema only.** `subscriptions` and `safety_events` exist and are proven; no merchant of record, no age gate, no moderation, no distress path |
| M5 — private beta | Blocked by M4, and by having nothing instrumented to learn from |

Feature inventory (§10), counted honestly against the 69 MVP features:

| Group | Done | Partial | Missing |
|---|---|---|---|
| A · Training loop (12) | 8 | 2 | 2 |
| B · Progression (8) | 3 | 2 | 3 |
| C · The field (9) | 0 | 1 | 8 |
| D · Coaching content (7) | 0 | 0 | 7 |
| E · Insight & data (7) | 2 | 1 | 4 |
| F · Premium craft (12) | 5 | 2 | 5 |
| G · Account & billing (8) | 2 | 1 | 5 |
| H · Safety (6) | 0 | 0 | 6 |
| **Total** | **20** | **9** | **40** |

The shape of that table is the finding: the training loop is real and the two
things wrapped around it — the field, and everything that makes it a business
rather than a demo — are not.

---

## 2. Blockers — cannot launch without these

Ordered by what stops what. Sizes are working days for one person who knows
this codebase.

### B1 · There is no public site  ·  ~3 days
**Spec:** §11 lists six public routes — landing with a live demo rep,
`/how-it-works`, `/pricing`, and three legal pages.
**Built:** `/` redirects straight to `/login`. `/how-it-works` and `/pricing`
render the 404 screen.
**Why it blocks:** two independent reasons. Nobody can find out what this is
without an account, so there is no acquisition surface at all. And §14 is
explicit that a human at the merchant of record reviews the site during
onboarding — "if the landing page leads with getting her number, we are
declined by every provider on this list". Right now there is no landing page to
review, which is its own kind of decline.

### B2 · No billing exists  ·  ~4 days + review lead time  ·  `DB done`
**Spec:** §14, and §10 G.
**Built (database):** `entitlements` with plan, quota and renewal date, plus
`subscriptions` — the mirror of the merchant of record, with deliberately
abstract provider identifiers so that being declined by one provider costs a
migration rather than a rewrite (§14). Both read-only to the user; a user
cannot write themselves a subscription, and that is asserted.
**Still missing:** the merchant-of-record account itself, checkout, the portal
handoff, the webhook that writes the mirror, plan switching, and the six money
overlays in §12. Plans are still granted from a terminal by `npm run db:plan`.
**Why it blocks:** no revenue, obviously — but the real risk is lead time.
§17 says apply at the *start* of M4 because approval takes days and can fail,
and it can only be applied for once B1 exists.

### B3 · The safety layer  ·  ~3 days  ·  `DB done`
**Spec:** §16, and §10 H — six MVP features.
**Built (database):** `safety_events` with the five kinds, `profiles.date_of_birth`
and `age_confirmed_at` for the gate, and `profiles.keep_recordings` for the
retention toggle. A user can file a report and read what was recorded about
them; a user cannot forge a moderation event, which is asserted from a second
account.
**Still missing (app):** the moderation call itself on both streams, the age
gate at sign-up, the in-frame decline and the second-strike end, distress
detection, and the report control on the session screen.
**Missing, specifically:**
- Age gate at sign-up (18+, §16.4). The category attracts teenagers.
- Moderation on both streams (§16.3). This is not prudishness — every MoR in
  §14 bans adult content outright, so an unmoderated voice product is a
  payment account waiting to be closed.
- Content-boundary intervention: in-frame decline, then the rep ends.
- Distress detection and a resource sheet that diagnoses nothing.
- Report-a-problem on every session.
**Why it blocks:** B2 depends on it, and the first user who steers a rep
somewhere ugly has no path that ends well.

### B4 · The legal pages are placeholders  ·  ~1 day (plus a lawyer's eye)
**Built:** `/terms` and `/privacy` render three short sections each, and the
privacy page currently says *"Production retention is not enabled by this
frontend preview"* — text written for a mock that is now shipping real audio to
real storage. `/legal/safety` (the not-therapy statement, §16.2) does not exist.
**Why it blocks:** we record people's voices. A privacy policy that describes a
product we no longer are is worse than none, and the MoR reviewer reads it.

### B5 · Email cannot carry a beta  ·  ~0.5 days
**Built:** Supabase's built-in sender, which has a hard low hourly limit and
puts its own domain on the envelope. `DATA.md` already records this: *"It will
not carry a private beta. Wire a real sender before M5, not during it."*
**Missing:** custom SMTP (Resend or Postmark), a sending domain with SPF/DKIM,
and the Magic Link template edit that finally enables the six-digit code path.
**Why it blocks:** twenty users signing up in one evening means most of them
never get the email, and the failure looks like a broken product rather than a
rate limit.

### B6 · Delete and export  ·  ~1 day  ·  `DB done`
**Spec:** §16.7 — recordings are the user's: per-session delete, bulk delete,
full export, hard purge on account deletion.
**Built (database):** `export_my_data()` returns everything we hold about the
caller — profile, entitlement, streak, sessions, transcripts, scores, field
logs, unlocks, ledger and safety events — running as the caller, so RLS decides
what it can see. Proven from a second account: B's export contains none of A's
rows.
**Still missing (app):** the download button wired to the RPC, a bulk-delete
control, and account deletion, which needs the admin API plus a storage sweep
and therefore cannot be a SQL function.
**Why it blocks:** it is the one promise in §16 that a user can check on day
one, and "email support to delete your account" is not the promise.

### B7 · Nothing is instrumented  ·  ~1 day
**Spec:** §04 — PostHog for funnels and week-4 cohorts, Sentry for errors with
replay off on the live route.
**Built:** neither package is installed.
**Why it blocks:** M5's gate is *week-4 retention above 25% among users who did
three or more reps*. That number cannot be computed from what is currently
recorded, and the beta's entire purpose is to produce it. It also means a
crashed rep in Colombo at 9pm on a Friday is invisible.

### B8 · The field track  ·  ~1 day left  ·  `DB done` · `loop done`
**Spec:** §09 — four tiers, daily assignment, predicted anxiety before, actual
discomfort after, and the predicted-vs-actual chart that "does the therapeutic
work".
**Built (app, 23 Aug):** the loop is real. One challenge a day, chosen
deterministically from the user and the local day so a refresh cannot reroll
it; tier-gated off the sim level; accepted with the prediction captured before
they go; logged with what it actually felt like; and an ask made carries the
streak on a day with no rep. Optimistic writes throughout. The fixture is
deleted.
**Why it blocks:** three separate loads. It is the measurement instrument for
the top risk in §19 — whether any of this transfers to real life — and without
it the beta cannot answer the question it exists to ask. It is the free loop
that keeps the streak alive when voice minutes are gone (§14), which is what
stops the paywall being a churn event. And the rejection log is the
organic-distribution engine §18 calls a survival requirement.
**Built (database):** `field_challenges` with **24 hand-written, reviewed
challenges** across the four tiers, each carrying its own safety note at T3 and
T4; `field_assignments` with the predicted anxiety captured at accept and one
live challenge a day; `field_logs` with both anxiety numbers, the ask flag and
no UPDATE policy for anyone; and `streaks`, moved out of `entitlements` and now
counting a rep **or** a logged ask, which is what §14 means when it says
running out of minutes must never break the streak.
**Still missing:** the predicted-versus-actual chart and the milestone copy at
10 / 25 / 50 / 100 — item 2 of `M2-PLAN.md`, about a day. Everything else in
this entry has landed.

### B9 · No spend ceiling on the paid routes  ·  ~1 day
**Built:** every money route requires a session, and `/api/voice/token` now
refuses a caller with no reps left.
**Built (database):** `spend_today_cents()` — what today has already cost on
this account, in the caller's own local day, straight off the append-only
ledger.
**Missing:** `/api/grade` and `/api/warmth/score` still have no per-user rate
limit and do not yet read that number before spending more. A signed-in user can post transcripts to the grader in
a loop; a leaked cookie can do it faster. There is also no account-level or
project-level kill switch when the bill runs away.
**Why it blocks:** §18's margins assume nobody is trying. Twenty beta users and
one bug is how a $250 inference budget becomes $2,500.

### B10 · The mic primer is built and never shown  ·  ~0.5 days
**Spec:** §12 — explain why we need the microphone *before* the OS dialog
fires, because "skipping this step is the single biggest cause of permanent
permission denial", plus browser-specific recovery when it is refused.
**Built:** `MicPermissionSheet` exists in `components/modals.tsx` and is
imported by nothing. The live screen goes straight to `getUserMedia`, and a
refusal surfaces as the generic mic-lost modal with no recovery instructions.
**Why it blocks:** it does not block the build, it blocks the funnel. A user
who denies the permission on their first rep is, on most browsers, permanently
denied — and this is the cheapest item on this entire list.

**Blocker total: roughly 16 working days**, down from 21 after the database
pass — plus merchant-of-record review time, which runs in parallel and can
fail.

---

## 2b. What the database pass added

Applied through the Supabase MCP, one migration per change, each committed to
`supabase/migrations/`:

| Migration | What it adds |
|---|---|
| `m3_safety_and_consent` | `safety_events`; date of birth, age confirmation and the recordings toggle on `profiles` |
| `m3_field` | `field_challenges`, `field_assignments`, `field_logs` and their policies |
| `m3_streaks` | `streaks`, backfilled out of `entitlements`, counting reps and asks alike |
| `m3_unlocks` | `unlocks` — when the celebration was shown |
| `m3_library` | `techniques`, one table for cards, openers, ladders, recoveries and exits |
| `m3_subscriptions` | `subscriptions`, the merchant-of-record mirror |
| `m3_weekly_reviews` | `weekly_reviews` |
| `m3_interview` | `interview_setups` and the private `cv` bucket |
| `m3_account_data` | `export_my_data()` and `spend_today_cents()` |
| `m3_index_foreign_keys` | The four covering indexes the linter asked for |

And, seeded from the repo by `npm run db:content`: 24 field challenges and 14
library cards.

Two things a database pass cannot do, both flagged by the Supabase advisors and
both one click in the dashboard: **leaked-password protection is off** (turn it
on — we ship password auth), and the "unused index" notices on the new tables
are expected until something queries them.

---

## 3. Product-promise gaps

Launch is possible with these outstanding. The product is thinner than the spec
until they land, and each one is somewhere the spec says the thinness will be
felt.

### Scoring (§07)
- **Six of eight deterministic metrics are scored.** `specific_plan_offered`
  and `clean_exit` are computed and stored but carry no band and no points —
  which means the two metrics most directly about *the close* and *the exit*
  contribute nothing to the number.
- **No calibration harness for the grade.** §07 asks for twenty hand-scored
  golden transcripts re-run nightly with a five-point drift alert. What exists
  (`lib/warmth/calibration/`) is a harness for the *live* warmth scorer — a
  different model doing a different job. Without the grade harness, scores rot
  silently as models update, which §19 lists as a high risk.
- **The scorecard reads in the wrong order.** §07: "always names one thing that
  went well before it names anything that didn't". Today the composite leads,
  the metrics follow, and `wentWell` sits inside the judgement row two thirds
  of the way down — and is hidden entirely from free users.
- **The six sub-scores are chips, not the display.** §07's example is six named
  rows; ours renders them as small labels inside one audit row.
- **No staged reveal.** §02 rule 6 wants the composite counting up over 900ms
  with sub-scores staggering at 60ms. It renders instantly.
- **No technique links.** The weakest two are stored and one hand-written line
  is shown; there is no library to link to.

### Progression (§08)
- **The unlock rule differs.** Spec: level N+1 opens at two sessions scoring
  70+ on level N. Built: a tier opens on wins at the tier below. Ours gates on
  outcome, which the spec is careful to make never the thing that counts.
- **No adaptive difficulty.** The dials are per-persona constants. Nothing
  bumps them after two strong reps or eases them after two weak ones, so the
  "never announce a downward adjustment" rule protects a feature that does not
  exist yet.
- **Ranks are dead.** `profiles.rank` defaults to `rookie` and nothing moves or
  displays it. The rank rail on the home screen (§11) is not built.
- **No baseline rep and no week-four re-test.** `profiles.baseline_score`
  exists and is never written. This is the retention hook §08 plants on day one
  and cashes on day 28 — the single cheapest retention mechanism in the spec.
- **`unlocks` now records when a celebration was shown**, so the level-unlocked
  moment can fire once instead of never — but nothing writes it yet, and the
  scorecard's trigger is still hardcoded to false.
- **Character memory is a table nobody writes to.** The compiler already
  injects `memorySummary` when a persona carries one; nothing generates it
  after a rep. "You again. Did you ever read that book?" is one write away and
  is disproportionately what makes a character feel real.
- **Sim levels do not gate field tiers**, because the field does not persist.

### The session, as an experience (§02, §12)
- No armed countdown (3·2·1 with tick and haptic), so a rep starts by silently
  becoming live.
- No character-left moment. An exit at 40 seconds is meant to be a full-bleed
  designed beat; it currently ends like any other rep.
- No reconnection handling behind the modal: `ConnectionLostModal` renders, but
  there is no ICE-drop retry, no paused timer, no "saved up to 2:14".
- No session audio replay. Recordings upload to a private bucket, the 30-day
  purge works, and there is no player anywhere in the product.
- No sound kit and no haptics. Grep finds no `vibrate` call and no sound assets.
- No PWA manifest or offline shell.
- No keyboard paths — `Space` to arm and `Esc` to end are unimplemented.
- No first-scorecard explainer. §12 calls it "load-bearing for retention",
  because it is where the user learns that outcome is not scored.
- Seven built overlays are imported by nothing: the mic primer, the mic test
  sheet, the sign-out sheet, the chickened-out sheet, the field-done sheet, the
  delete-account modal and the persona-detail sheet — the last two because the
  screens grew their own inline versions instead. `LevelUnlockedSheet` does
  render, but its trigger is a `useState(false)` nothing sets, so a level
  unlock is currently silent.
- **Room tone is off on purpose.** §02 rule 2 calls the ambient bed the highest
  ratio of perceived value to effort in the product; the procedural version was
  hurting intelligibility and is switched off pending recorded beds
  (`AUDIO.md`). Until those land, this rule is unmet.

### Content (§10 D, E)
- **The technique library exists in the database and nowhere else.** The table
  is seeded with 14 hand-written cards — six techniques, one per sub-score;
  five opener sets by setting; the facts→opinions→feelings ladder; a recovery
  card; an exit card. What is missing is the `/library` route, the technique of
  the session tied to the weakest sub-score, and the link from the scorecard.
- **The insight surface is one chart.** `/progress`, six sub-score trend lines,
  filler and talk-ratio history, and the Sunday weekly review are all missing;
  the profile chart is warmth and score over the last twenty reps.

### The interview track
Screens exist and are fixture-driven. There are no interviewer characters, no
CV storage bucket, no role/JD/question persistence, and no interview-specific
metrics. This is M4-and-after by the spec's own ordering and is not a launch
blocker — but the nav currently offers a door that opens onto nothing, which
should either be finished or hidden before strangers see it.

---

## 4. Spec drift — decide, then make one of them true

These are not bugs. They are places where the build and the spec disagree and
somebody has to say which is right.

| # | Spec says | Build does | Note |
|---|---|---|---|
| D1 | "No password fields anywhere" (§04, §11) | Password sign-up and sign-in, alongside OTP and Google | The frontend brief asked for passwords. Either the spec line goes, or the screens do |
| D2 | Free = 3 reps ≈ 9 min, then paywall; $19 / 60 min and $39 / 150 min | Free = 1 rep/day; $24 / 3 a day; $39 / 6 a day | Three inconsistencies at once: price, unit and generosity. The reps-per-day framing is better than minutes (§14 agrees) but the numbers need choosing |
| D3 | Bill per second, minutes framed as reps | Both: an append-only per-second ledger *and* a reps/day counter that actually gates | Fine as a design, but only one is enforced. If a rep can run 2 minutes, reps/day and minutes are interchangeable — say so once, in the spec |
| D4 | Streaks run on asks made, never on asks accepted (§09) | Streak counts days with a voice rep | Ours will break on the days the field loop is supposed to carry. Revisit when the field lands |
| D5 | Robin at a gallery opening; Alex at a bar, alone (§06) | Robin in a hotel lobby; Alex at a gallery opening | Alex was authored and tuned first and kept her room. Level 7 is `signalClarity: 20`, not the venue |
| D6 | Level 1 rep "sub-60-second first rep" (§19) | Three minutes, hard, for every dating rep | Three minutes is §14's own arithmetic ("3 reps ≈ 9 min") and is now product law (`PRODUCT.md`). Consider a shorter first-ever rep specifically |
| D7 | 34 routes, `/home` + `/train` + `/sessions` + `/progress` + `/library` | Four sections: Train, Roster, Field, Profile | Deliberate (`PRODUCT.md`). The spec's inventory should be restated against it so the two stop diverging silently |
| D8 | Unlock at two sessions scoring 70+ | Unlock on wins at the tier below | See §3. Worth fixing toward the spec: it scores process, ours scores outcome |

---

## 5. What is genuinely done

So the list above is read in proportion.

- **The voice loop**, against a real provider, behind an interface neither the
  app nor the UI can see through. Two adapters, one conformance suite.
- **The three-minute dating rep**: warmth 65 arms it silently, thirty seconds
  from the end she is told either to leave or to offer her number, her closing
  line is allowed to finish, and the whole thing is written down when it ends
  however it ends.
- **Eight characters**, one per level, hand-authored against §06's table, with
  a ladder that tests as monotonically harder and only unwinnable at Level 8.
- **The warmth engine**: per-turn fast scoring, an evidence-triggered slow
  scorer, asymmetric decay, bands that own delivery, and a calibration harness
  for the live scorer.
- **The data spine**: eighteen tables — every one §13 names — RLS on all of
  them, verified from a second account by 51 checks, plus an append-only ledger
  that cannot be rewritten by anyone including us and a field log that cannot
  be rewritten even by the person who wrote it.
- **Two content libraries authored and seeded**: 24 field challenges across
  four tiers, each reviewed and stamped, and 14 library cards covering the six
  sub-scores, five settings, the ladder, recovery and the exit.
- **Auth** end to end: password, OTP, Google, reset, and a route guard that
  reads the session and the profile with no development bypass.
- **Metering**: quota checked where money is committed, spent on connect,
  resumable across a reload, and never writable by the user.
- **Scoring**: 60% deterministic over six banded metrics, 40% judgement, an
  audit line that sums to the composite, and the whole lifecycle covered by
  `npm run db:rep`.

---

## 6. Suggested order

Nothing here is sequenced by size. It is sequenced by what unblocks what.

**Phase 1 — make it lawful and legible (≈ 8 days).** The public site, the real
legal pages, the age gate, moderation on both streams, custom SMTP, the mic
primer, Sentry and PostHog, and rate limits on the grader. At the end of this
the merchant-of-record application can go in — and it should, on the first day
it can, because it is the only item with external lead time.

**Phase 2 — close the loop (≈ 8 days).** The field: challenges table with
hand-written content, the log with both anxiety ratings, the predicted-vs-actual
chart, streaks moved onto asks, sim-level gating. Then character memory, the
baseline rep and the week-four re-test. This is the phase that makes the beta
able to answer its own question.

**Phase 3 — money (≈ 4 days, gated on the MoR answer).** Checkout, portal, the
webhook that writes the subscriptions mirror, the six paywall overlays, and
metering reconciled to the cent against the provider dashboard.

**Phase 4 — the promise (≈ 8 days).** Scorecard reveal and ordering, the two
unscored metrics, the grade calibration harness, the technique library, the
progress screens, the sound kit, haptics, countdown, replay, PWA, keyboard.

**Then M5.** Twenty users, five calls a week, and the only number that decides
anything.

---

## 7. Appendix — conformance tables

### Routes (§11)

| Spec route | State |
|---|---|
| `/` landing | **Missing** — redirects to `/login` |
| `/how-it-works` | **Missing** |
| `/pricing` | **Missing** (plan comparison exists inside the app) |
| `/legal/terms` | Partial — `/terms`, placeholder copy |
| `/legal/privacy` | Partial — `/privacy`, placeholder copy |
| `/legal/safety` | **Missing** |
| `/auth/sign-in` · `/auth/sign-up` · `/auth/verify` · `/auth/callback` | Done as `/login`, `/signup`, `/verify-email`, `/auth/callback`, plus `/forgot-password` and `/reset-password` |
| `/start/goal` · `/start/mic` · `/start/brief` · `/start/rep` | Done as `/onboarding/*` → first rep |
| `/start/baseline` self-assessment | **Missing** |
| `/start/result` baseline shown | **Missing** |
| `/home` | Done as `/train` |
| `/train` roster | Done as `/roster` |
| `/train/[persona]` | Done as `/roster/[persona]` |
| `/session/[id]/brief` · `/live` · `/score` · `/transcript` | Done as `/rep/[persona]/brief`, `/live`, `/session/[id]/scorecard`, `/transcript` |
| `/sessions` | Done as `/profile/history` |
| `/field` | Fixture |
| `/field/browse` · `/field/[id]` · `/field/log` · `/field/log/new` | **Missing** |
| `/progress` · `/progress/week/[id]` | **Missing** |
| `/library` · `/library/[slug]` · `/library/openers` | **Missing** |
| `/settings` · `/settings/session` | Done as `/profile/settings` |
| `/settings/billing` | Partial — `/profile/subscription`, no portal |
| `/settings/usage` | **Missing** |
| `/settings/privacy` | **Missing** (retention toggle, bulk delete, export) |
| `/settings/danger` | Partial — modal exists, action disabled |

### Tables (§13)

| Table | State |
|---|---|
| `profiles` | Done, extended with preferences, consent and the retention toggle |
| `personas` | Done, with presentation columns |
| `sessions` | Done, extended with the meter |
| `transcripts` | Done, with the per-turn warmth gutter |
| `scores` | Done |
| `persona_memory` | Exists, **never written** |
| `usage_ledger` | Done, append-only and trigger-protected |
| `entitlements` (not in §13) | Added — plan and quota, read-only to the user |
| `streaks` | **Added** — a rep or a logged ask, read-only to the user |
| `unlocks` | **Added** — when the celebration was shown; what is unlocked stays derived |
| `techniques` | **Added and seeded** — 14 cards |
| `field_challenges` | **Added and seeded** — 24 reviewed challenges across four tiers |
| `field_assignments` (not in §13) | **Added** — one live challenge a day, anxiety captured at accept |
| `field_logs` | **Added** — both anxiety numbers, and no UPDATE policy for anybody |
| `subscriptions` | **Added** — MoR mirror with abstract provider ids; nothing writes it yet |
| `weekly_reviews` | **Added** — nothing generates one yet |
| `safety_events` | **Added** — five kinds; users may file reports and read their own |
| `interview_setups` (not in §13) | **Added**, with a private `cv` bucket, ready for M4 |

Functions: `export_my_data()` and `spend_today_cents()`, both `security
invoker`, both revoked from `anon`.

### Premium craft rules (§02)

| # | Rule | State |
|---|---|---|
| 1 | No spinners, skeletons everywhere | **Held** |
| 2 | Ambient room tone under every session | **Off** — procedural version disabled for intelligibility; recorded beds pending |
| 3 | Real waveform from AnalyserNode | **Held** — both streams, real amplitude |
| 4 | Sound design as a system | **Missing** |
| 5 | Haptics on mobile | **Missing** |
| 6 | Staged score reveal | **Missing** |
| 7 | Tabular numerals everywhere | **Held** |
| 8 | Optimistic writes | **Partial** — writes land and report, but the UI waits |
| 9 | Full keyboard operation | **Partial** — focusable, but no Space/Esc |
| 10 | `prefers-reduced-motion` respected | **Held** |
| 11 | Never blame the user in an error | **Partial** — hand-written where it matters; `app/error.tsx` still prints a raw message |
| 12 | Copy is written, not generated | **Held** |
