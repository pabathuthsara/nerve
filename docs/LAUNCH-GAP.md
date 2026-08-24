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
| M2 — progression & field | **Built.** All nine plan items: the three-minute format, the field end to end, the predicted-versus-actual chart, character memory, the §08 unlock rule with its once-ever moment, adaptive difficulty, the baseline and week-four re-test, share cards and the Sunday review. **Not closed:** §17's gate is twenty hand-scored transcripts and none are scored — the harness is built and ten are collected |
| M3 — the premium layer | **Half.** Arena visual system, skeletons, real analysers, reduced motion. No sound kit, haptics, PWA, score choreography |
| M4 — billing & safety | **Schema, plus the spend ceiling.** `subscriptions` and `safety_events` exist and are proven, and the five paid routes now sit behind `maySpend` with two kill switches and a per-plan daily cap (B9, cleared 24 Aug). Still no merchant of record, no age gate, no moderation, no distress path |
| M5 — private beta | Blocked by M4, and by having nothing instrumented to learn from |

Feature inventory (§10), counted honestly against the 69 MVP features:

| Group | Done | Partial | Missing |
|---|---|---|---|
| A · Training loop (12) | 8 | 2 | 2 |
| B · Progression (8) | 8 | 0 | 0 |
| C · The field (9) | 7 | 0 | 2 |
| D · Coaching content (7) | 0 | 0 | 7 |
| E · Insight & data (7) | 5 | 1 | 1 |
| F · Premium craft (12) | 5 | 2 | 5 |
| G · Account & billing (8) | 2 | 1 | 5 |
| H · Safety (6) | 0 | 0 | 6 |
| **Total** | **35** | **6** | **28** |

The shape of that table is the finding and M2 has not changed it, only sharpened
it. The product is real: the training loop, the field, progression, memory,
adaptive difficulty, the retention hooks and the artefacts that carry organic
distribution. What is still not built is everything that makes it a *business* —
billing, safety, legal, instrumentation. **Groups D, G and H are 2 done out of
21**, and that is where the remaining launch risk lives.

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

**Narrowed 24 Aug.** The *pipeline* half is now instrumented: every non-fatal
voice incident is counted in `lib/voice/incidents.ts` and stored on
`sessions.pipeline_incidents`. That was the acute case — a rep where she was cut
off on most replies, or where real user turns were deleted, is now
distinguishable after the fact from a rep the user simply played badly. The
product analytics and error reporting this entry is really about are still
unbuilt, so the estimate stands.

### B8 · The field track  ·  **cleared 23 Aug**  ·  `DB done` · `loop done` · `chart done`
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
**Built (chart, 23 Aug):** the predicted-versus-actual chart on `/field`, with
the gap shaded and a verdict line in the user's own numbers, plus the summary
figure on `/profile` — both from one function, so they cannot disagree. Axes are
drawn before there is anything to plot (§15). It does not flatter: when actual
comes in above predicted the fill turns amber and the copy says to ease back a
tier, because §09's own warning is that going too hard too early sensitises
rather than habituates. Milestones at 10 / 25 / 50 / 100 with hand-written copy
each, fired once ever out of `unlocks`. `npm run db:field` now runs 27 checks.

**Nothing outstanding.** This entry is closed; the milestone becomes a share card
in item 8 of `M2-PLAN.md`, which is an addition rather than a gap.

### B9 · No spend ceiling on the paid routes  ·  **cleared 24 Aug**
**Was:** every money route required a session, and `/api/voice/token` refused a
caller with no reps left — but nothing bounded SPEND. A signed-in user could
post transcripts to the grader in a loop; a leaked cookie could do it faster.
No account-level or project-level kill switch existed.

**Now:** one gate, `maySpend` (`lib/db/spend.ts`), on **five** routes — the
entry named two, and the sweep found `/api/voice/llm` and `/api/voice/tts`
(both proxy a standing vendor key behind nothing but `requireUser`) and
`/api/voice/token`, which had a rep quota but no kill switch and is the most
expensive endpoint in the product. A halt that does not stop a rep starting is
not a halt.

Three gates, answered in **one round trip** by `spend_allowance` — deliberate,
because `/api/voice/tts` sits on the critical path of every reply and three
sequential checks would be three hops on `ttsFirstByteMs`:

| Gate | Where it lives | Why there |
|---|---|---|
| Project kill switch | `NERVE_SPEND_HALT` in the environment | Stopping the bill has to be a dashboard toggle rather than a migration — and has to work when the database is the problem. Checked first, needs no database |
| Account kill switch | `entitlements.spend_halted_at` | Read-only to its owner, written by the service role (§14, rule 9). The tool for one runaway user rather than a runaway bill |
| Daily spend cap | The append-only ledger, in the user's own local day | 100c free / 300c pro / 600c elite — roughly 5× each plan's honest day at the ceiling rate. A backstop against a loop, not a second quota |
| Per-user rate limit | `rate_limits`, one bucket per route family | A runaway grader loop must not eat the budget the live rep needs to keep talking |

Order matters: the kill switch is checked before the cap and the cap before the
rate limit, so a halted account never has its allowance consumed — being
switched off must not also cost you the allowance you need when you are
switched back on. Asserted in `npm run db:spend`.

**Two decisions worth knowing.** The gate **fails open** on an unreachable
database: the alternative converts a database blip into a total product outage
and ends live reps mid-sentence, and the exposure is bounded by everything still
standing — the session check, the rep quota, and the project switch, which needs
no database at all. And every limit is several times the honest rate of a real
three-minute rep, because §05 says nothing may interrupt a live rep, so a limit
a real session can reach is a limit that will eventually cut somebody off
mid-sentence.

**Verified:** `npm run db:spend`, 27 checks — the limit trips at the limit and
not before, the window rolls clean, buckets are independent, the cap reads the
real ledger, a halt refuses without consuming the allowance, and none of
`rate_limits`, `spend_allowance` or `spend_halted_at` is readable, writable or
callable by the user it is about. Plus route-level tests in
`app/api/api-auth.test.ts` asserting each of the five refuses **before** the
paid call, because the failure mode is a handler forgetting to ask.

### B9a · Leaked-password protection is off  ·  ~5 minutes

Found by the Supabase security advisor while clearing B9, unrelated to it.
Supabase Auth can check new passwords against HaveIBeenPwned and refuse the
compromised ones; the setting is off.

It matters here because of D1: the build ships password sign-in alongside OTP
and Google, against a spec line that says no password fields anywhere. As long
as passwords exist, a beta user reusing a breached one is an account takeover
that reaches a payment-bearing profile.

A dashboard toggle, not a migration — Authentication → Policies. Left alone
rather than flipped, because it changes what real sign-ups are allowed to do
and that is an operator's call.

The advisor also reports `rate_limits` as "RLS enabled, no policy" at INFO.
That one is **correct and intended**: a rate limit a user can read is one they
can pace against, and one they can write is not a limit. Only the service role
touches it.

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

**Blocker total: roughly 14 working days**, down from 21 after the database
pass, 16 with B8 cleared and 15 with B9 — plus merchant-of-record review time,
which runs in parallel and can fail. **Eight of the ten blockers remain.**

> **B9 was the one to take next, and it is done (24 Aug).** The grader,
> the live scorer, both pipeline hops and the Realtime token now sit behind
> `maySpend`. With the money leak closed, **B1 (there is no public site) is the
> one to take next** — not because it is the biggest, but because it is the only
> thing standing between here and the merchant-of-record application, which is
> the sole item on this list with external lead time that can fail.

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
- **The grade calibration harness is built and unscored.** `npm run
  grade:calibrate` drives the deployed `/api/grade` and fails on drift beyond
  five points on any sub-score or the composite. Ten real transcripts are
  collected. **None are hand-scored**, and the suite refuses to report success
  below twenty — §17's gate on M2, and the one piece of it that is reading
  rather than building.
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
- ~~**The unlock rule differs.**~~ **Done 23 Aug.** The gate is §08's: two
  sessions scoring 70+ at the level below, uniformly two. Wins no longer gate
  anything, which closes the outcome-scoring problem D8a opened — the gate had
  been reading a win the grader could invent, so it was scoring outcome twice
  over.
- ~~**No adaptive difficulty.**~~ **Done 23 Aug.** `difficulty_offsets`,
  per-user and per-level, service-role write. Two reps at 75+ make her harder,
  two under 55 ease her back, clamped at ±6 start and ±0.25 gain in code *and*
  in CHECK constraints. The downward path returns nothing to display, by
  construction rather than by convention.
- **Ranks are dead.** `profiles.rank` defaults to `rookie` and nothing moves or
  displays it. The rank rail on the home screen (§11) is not built.
- ~~**No baseline rep and no week-four re-test.**~~ **Done 23 Aug.** Written
  once by the first graded rep, re-offered at day 28 in the user's own
  timezone, and compared sub-score by sub-score at `/progress/baseline`. Which
  rep counts as the re-test is derived rather than stored, and it is the first
  qualifying attempt rather than the best — a re-test you can re-roll is not a
  measurement.
- ~~**`unlocks` is written now, but only for milestones.**~~ **Done 23 Aug.**
  All three kinds write through one `recordUnlocks` / `announceUnlock` pair, and
  the scorecard fires `LevelUnlockedSheet` off the row rather than off the
  `useState(false)` that nothing set. The sheet's copy named Jules and Samara
  for every level including the ones they are not on; it is hand-written per
  tier now.
- ~~**Character memory is a table nobody writes to.**~~ **Done 23 Aug.** The
  grade now returns a `memoryLine`, `lib/grade/memory.ts` decides whether it is
  fit to store, and the live page injects it into the character contract. The
  filter is what makes the feature safe rather than a positioning risk: second
  person, affection and performance judgement are all rejected, so what she
  carries is the encounter and never how he did (§14). Reset is one tap on the
  brief screen, the persona sheet, or all of them at once from Settings.
- Sim levels gate field tiers, and the field persists. ~~Struck 23 Aug.~~

### Three faults found in live reps, 23 Aug — all fixed

Reported from actual use rather than from reading the code, and worth keeping
together because two of the three had the same root.

**Her replies were being cancelled and recorded anyway.** Routing her voice
through WebAudio hid it from the browser's echo canceller, so her own audio came
back in on the microphone, VAD committed it as a user turn, and the overlap
guard cancelled the reply that resulted. The transcript kept it regardless:
eight agent turns across five sessions had physically impossible durations —
`"Catching my breath between sets right now."` at **0.22s for seven words**,
0.03 sec/word against ~0.35 for real speech. The user heard nothing; the scorer
read it as a spoken turn. Fixed in `attachRemote` (element playback when there
is no room) and in the translator (audio, not text, opens a turn; a reply that
never reached the speakers is dropped and reported as `agent.unheard`). See
`AUDIO.md`.

**Two characters shared a voice and one had none.** Alex named no OpenAI voice
at all and fell silently through the timbre default onto `coral` — Maya's voice.
Robin and Nadia were both `marin`, so Level 1 and Level 7 sounded identical. All
eight are now cast explicitly and distinctly, and the conformance suite refuses
an unnamed or duplicated voice. Maya moved from `coral` to `cedar` on a reported
distortion; **that part is a hypothesis, not a measurement** — five characters
remain on the older voice set and would sound the same way if the voice is the
cause rather than the cancelled audio above.

**The result screen contradicted itself.** It showed `final_warmth` against
`ARM_THRESHOLD` — two numbers nothing had ever compared. A real rep finished at
71.25 against a bar of 65 and correctly said "She left": warmth was 63.68 at the
wind-down, and crossed 65 two and a half seconds later. The engine was right and
the screen read `71 / 65` with "You were close" under it. `sessions.decision_warmth`
now stores the reading the ending actually turned on, `resultReading` decides
which number explains the outcome, and the late-surge case has its own copy.
Older reps have no stored decision, but finishing above the bar and losing is
itself proof it was taken lower, so they read correctly too.

### Ten faults found in a pipeline teardown, 24 Aug — all fixed

Prompted by a rep against Erin where the user heard one word of hers all
session. Everything below was already emitting an event or storing a column; the
common thread is that **nothing on the screen a real user is on was listening**,
so all of it was invisible until somebody noticed by ear.

**She was cut off mid-word and the transcript covered it up.** `mayInterrupt`
enables server-side barge-in at level 5+, and the VAD threshold is deliberately
low (`0.4`) because our user is nervous and quiet — so a breath was enough to
truncate her. The translator only *dropped* a reply whose audio never opened;
200ms of audio satisfied that, so a reply the user heard one syllable of was
committed **in full** to the transcript, the warmth engine and `/api/grade`.
`lib/voice/truncate.ts` now clips the turn to what actually played at a word
boundary, `agent.truncated` reports it, and the adapter sends
`conversation.item.truncate` so *her own history* matches what was heard — which
is what stopped the "she started saying something and it became something else"
symptom. The ElevenLabs arm already did all of this; the two adapters now share
the string arithmetic.

**Short replies and callbacks were being deleted before she saw them.**
`echoOverlap` was a bare ratio with no minimum length, so a one-content-word
turn was decided by a single word: "Awesome." against a line containing
"awesome" scored 1.00 and was deleted — no transcript entry, no warmth event, no
reply, no trace. Speaking over her dropped the bar to 0.6, which is where levels
1–4 live, so "Four minutes?" answering "The board says four minutes" was deleted
too. That is a **callback**, the highest-paying move in `fast.ts` and a §07
metric. The rule now needs three content tokens and two shared before it may
fire, and `user.echo-rejected` reports every rejection.

**Character memory never reached the model.** Every other part of §08 worked —
the filter, the write, the brief-screen line, "start fresh". The live page read
the memory and attached it to the persona, then the browser sent the token route
a slug and nothing else and the contract was recompiled from the bare roster
record. The read now lives in the token route, derived from the authenticated
user rather than travelling through the client, which also keeps the "a client
that can post its own instructions can post its own character" rule intact.

**The product path had no telemetry at all.** `agent.overlap`,
`agent.double-turn`, `agent.unheard`, `agent.tool-leak` and the gate stall were
emitted and dropped; only fatal errors were handled. The M0 harness counted all
of them and the real screen counted none. `lib/voice/incidents.ts` counts them,
`sessions.pipeline_incidents` stores them, and `incidentsAreAlarming` flags a rep
whose transcript should not be trusted — which is the difference between a bad
grade caused by the user and one caused by the transport.

**§05 re-injection never ran in production.** `StabilityMeter` and
`compileReinforcement` were wired in the M0 harness only, so a character break in
a real rep was never detected and never repaired. Now wired in
`lib/data/rep.ts`. Its competing length rule ("usually 4–10 words, never over
15") is gone: the band owns length, and a reminder fired mid-break is the worst
possible moment to restart the round-6 argument.

**Turn-taking calibration was specified, had a column, and had no write path.**
`profiles.vad_offset_ms` was read on every live rep and written by nothing; the
onboarding mic step showed a level meter and a hard-coded "testing, one two
three" it never timed. Everyone ran at a flat 600ms — a confident speaker's
pause — which is why a hesitant user's sentence arrived as two turns drawing two
separate one-word answers. `lib/voice/calibration.ts` measures the real
inter-clause pause off the meter that was already running. `resolveSilenceMs`
also stopped flooring the offset at zero, so the negative half of the column's
range is reachable and a fluent speaker gets a faster turn.

**Steering was drilled into her.** It fired on every VAD speech start —
including noise and turns deleted milliseconds later — and the composed line is
deterministic within a band, so a rep accumulated fifteen near-identical copies
of the same stage direction. Repetition is how you make a model *more*
mechanical. `directiveIfChanged` sends it when it changes, with a heartbeat.

**Three correct rules composed into "What?".** The clarification instruction,
the continuity rule about repeating back what you heard, and the band's word cap.
Each right; together, one syllable. She now has to name the part she did not
catch.

**The turn assembler leaked across a cancelled response.** `sealAgentTurn`
returned early without resetting when a final transcript never arrived, and
`openAt` only assigns when the slot is null — so the next reply inherited the
abandoned start time and overwrote its text.

**And the cold bands were a word cap.** CLOSED was "one to four words". On
levels 5+ the meter never leaves it inside three minutes, so an entire rep was a
stranger who could not form a sentence. See `PERSONA.md` — difficulty is no
longer expressed as syllables.

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
| D2 | Free = 3 reps ≈ 9 min, then paywall; $19 / 60 min and $39 / 150 min | Free = 1 rep/day; $24 / 3 a day; $39 / 6 a day | Three inconsistencies at once: price, unit and generosity. The reps-per-day framing is better than minutes (§14 agrees) but the numbers need choosing. **Now costed** — see D2a |
| D3 | Bill per second, minutes framed as reps | Both: an append-only per-second ledger *and* a reps/day counter that actually gates | Fine as a design, but only one is enforced. If a rep can run 2 minutes, reps/day and minutes are interchangeable — say so once, in the spec |
| ~~D4~~ | Streaks run on asks made, never on asks accepted (§09) | ~~Streak counts days with a voice rep~~ | **Resolved 23 Aug.** A logged ask calls `recordTrainingDay`, so the field carries the day when the voice quota is gone (§14), and `npm run db:field` asserts a streak starting with no rep anywhere near it |
| D5 | Robin at a gallery opening; Alex at a bar, alone (§06) | Robin in a hotel lobby; Alex at a gallery opening | Alex was authored and tuned first and kept her room. Level 7 is `signalClarity: 20`, not the venue |
| D6 | Level 1 rep "sub-60-second first rep" (§19) | Three minutes, hard, for every dating rep | Three minutes is §14's own arithmetic ("3 reps ≈ 9 min") and is now product law (`PRODUCT.md`). Consider a shorter first-ever rep specifically |
| D7 | 34 routes, `/home` + `/train` + `/sessions` + `/progress` + `/library` | Four sections: Train, Roster, Field, Profile | Deliberate (`PRODUCT.md`). The spec's inventory should be restated against it so the two stop diverging silently |
| D8 | Unlock at two sessions scoring 70+ | Unlock on wins at the tier below | See §3. Worth fixing toward the spec: it scores process, ours scores outcome. **Sharper than it looked** — until 23 Aug the "win" itself was partly the grader's outcome, so the gate was scoring outcome twice over. That half is fixed (D8a); the rule is still wins rather than 70+ |
| D9 | "Volt is the ONLY accent"; Cool, Amber and Red are data or semantic, never branding (Arena) | Persona avatars carry a per-character hue on a constrained material ramp | **Decided 24 Aug — resolved in favour of the build, with a rule.** Characters have to be told apart at a glance on the roster, and shape alone was not enough — the argument was made when there were eight and holds with three, since the hue IS the warmth meter rather than decoration. The concession is bounded and enforced in code rather than in a style note: hues avoid the 60–115° band where Volt lives, no avatar colour comes within an RGB distance of 60 of Volt, Cool, Amber or Red, and chroma is floored at 0.34 and ceilinged at 0.86 so an avatar can never reach an accent's saturation. `lib/personas/visual.test.ts` holds all three. The Arena section of `CLAUDE.md` now records the carve-out |
| D10 | Eight characters, one per level, and level 8 unwinnable by construction (§06) | Three characters on rungs 1, 2 and 4; the other five retired; no unwinnable rung | **Decided 24 Aug — deliberate, and the one entry here that gives something up.** See D10a |

### D10a · Three characters instead of eight  ·  **decided 24 Aug**

§06 authors eight rungs and the roster shipped all eight. It now ships three:
Nadia on rung 1, Maya on rung 2, Robin on rung 4.

**The argument for.** A persona contract is the only part of this product that
cannot be verified at a desk. Schema, RLS, grading, the field loop and the rep
format all have harnesses; whether a character holds up over three minutes is
answerable only by running reps against her and reading the transcript. Eight
characters is eight of those surfaces. §17's calibration gate is twenty
hand-scored transcripts *in total* — across eight characters that is two or
three each, which is not evidence about any of them; across three it is about
seven each. The gate gets sharper without getting bigger.

**What moved, and what did not.** Difficulty is layer 1 and character is layer
2 (`PERSONA.md`), so moving them cost nothing in personality: Maya took the
authored rung-2 curve and Robin the rung-4 one, and both are otherwise
untouched. Robin's `signalClarity: 20` — the entire reason she is hard — is
layer 2 and never moved. The rungs are 1, 2 and 4 rather than 1, 2 and 3
because §12 takes the warmth digits off the screen from level 4, and the top
rung is exactly where a user should be reading a person rather than a meter.

**What this gives up, stated plainly.** Alex is retired, and with her goes the
only level that cannot be won by construction. §06 is right about why she
existed: a ladder where charm always eventually works teaches that persistence
is the answer, which is the single worst thing this product could teach. Three
things carry that lesson now instead of one character:

- Robin at rung 4 ends in a polite no in the overwhelming majority of reps.
  Eighteen turns of good play lands her at 59 against a 65 line. She is hard
  rather than sealed, which is a weaker version of the lesson, honestly stated.
- The field track, where the outcome is a real person's real no.
- §07's rule, unchanged and enforced in code: outcome is worth zero. A rep that
  ends in rejection can score 92.

**This is the entry to revisit first if the beta says the ladder is too kind.**
The cheapest fix is not re-authoring anybody: Alex is still in the repo, still
tuned, still exercising every clamp in the warmth engine through
`engine.test.ts`, and putting her back on the roster is an edit to
`PERSONAS` in `lib/personas/index.ts` plus a re-seed.

**Retired, not deleted.** The five are unpublished in the database rather than
removed. `sessions.persona_id` references that table and `sessions.persona_slug`
is denormalised beside it for exactly this case, so every rep anybody ever ran
against Priya, Jules, Erin, Sam or Alex stays a complete and readable record.
`npm run db:seed` performs the retirement, and only on a full seed.

**The knock-on nobody would have predicted: field tier 4 lost its gate — and
got a better one.** The field's four tiers were gated on sim level (T2 at 4, T3
at 6, T4 at 7), a near 1:1 mapping onto four sim tiers. Three sim rungs cannot
earn four field tiers. T2 and T3 are re-anchored onto the rungs that exist (2
and 4); **T4 is no longer a gym gate at all.**

**Resolved 24 Aug — T4 is earned in the field.** It opens on the top rung *plus*
five distinct days on which a tier-3 ask was actually made (`T4_ASK_DAYS` in
`lib/field/assignment.ts`). Days rather than asks, because habituation is
repetition spread over time and five asks in one brave afternoon is one
exposure. Asks made rather than accepted, because §09 is explicit that nothing
in the field is gated on the other person saying yes.

This is the better coupling, not merely the one that survived the roster change.
Gating the hardest real-world ask on gym performance always said that being good
at talking to a synthetic character earns the right to approach a person. It
does not; doing the smaller thing, repeatedly, does. The sim rung stays
necessary and is no longer sufficient.

Two properties worth knowing:

- **It fails shut.** `unlockedTier`'s history argument is optional and its
  absence gates T4 closed, so any caller that cannot see the field log is wrong
  in the safe direction. For an exposure ladder, too little is a slow week and
  too much is somebody quitting.
- **The moment fires on the day it is earned.** `syncLevel` runs after a graded
  rep, which is the wrong event for a tier earned by going outside — so
  `syncFieldTier` runs from the log path instead. Otherwise a user unlocks it on
  a Tuesday and is told on Thursday.

`npm run db:field` covers the counting: two asks in one day counting once, an
honest "did not ask" counting for nothing, the gate shut on day four and open on
day five, and the moment recorded exactly once.

**Five is a judgement call and is meant to be tuned** once the beta has numbers.
It is one named constant.

### D8a · The grade was inventing wins  ·  **fixed 23 Aug**

Found in a live Priya rep. `wonFromRep` opened with
`if (outcome === 'receptive') return true` before it looked at the meter, so a
rep that peaked at 60.16 — never armed, shown to the user as "She left" — was
rewritten as a win the moment the grade landed. Three places were affected:

| Where | Was | Now |
|---|---|---|
| `wonFromRep` | Outcome short-circuited the meter | Takes no outcome at all |
| `saveScore` | `won === true ? true : recompute(…, outcome)` — could hand out a win, never take one back | `session?.won ?? wonFromRep(…)`; the grade never revises either way |
| `fetchPersonas` | Selected `outcome`, never `won` — the roster's **locked state** came off the grade | `row.won ?? wonFromOutcome(row.outcome)` |

§07 says outcome is recorded and worth zero. It was worth a win, an unlock and a
contradiction with the screen the user had just been shown. Four regression
tests, all verified to fail against the pre-fix code. One real row corrected by
`npm run db:repair-wins`.

The same rep surfaced a second defect — an exit condition the user could trip by
asking for a number, ending the rep before the wind-down. Both are written up in
full in `M2-PLAN.md` item 0.

### D2a · What the three-minute rep actually costs

Measured 23 August, closing the cost debt the rep-format change left behind.
`npm run cost:model` is the arithmetic, sourced line by line to `docs/M0.md`.

Four priced `gpt-realtime-mini` runs landed at **$0.0192–$0.0293/min**, against
§18's assumed $0.05–0.08. A three-minute rep is therefore **$0.058–0.088**, not
§18's $0.21. And the specific fear §04 records — that realtime re-charging prior
audio context each turn makes a longer rep cost more than pro rata — does not
appear: 305.8s against 117.8s is +2.8% per minute. Removing blind scheduled
reinforcement is what bought that (M0, fourth finding).

At the dearest measured rate, and assuming every user burns the whole cap:

| | Price | Cap | Voice cost | Margin |
|---|---|---|---|---|
| §14 Training | $19 | 60 min | $1.76 | 91% |
| §14 Serious | $39 | 150 min | $4.39 | 89% |
| **Built** Pro | $24 | 3/day ≈ 270 min | $7.91 | 67% |
| **Built** Elite | $39 | 6/day ≈ 540 min | $15.82 | **59%** |

§14's own tiers are comfortable. **The build's are where the pressure is**, and
in two places the spec would not have chosen:

- **Elite at 59%** is the exact number §14 rejected 200 minutes for — "too thin
  once merchant-of-record fees and infrastructure come out". Take the MoR's ~7
  points off and it is ~52%. Six reps a day is a bigger promise than 150 minutes.
- **Free at one rep a day is recurring, not a trial.** §14 budgets $0.72 *once*
  before the paywall; an engaged free user on the built plan burns **$2.64 a
  month, indefinitely**. §18's ~4% break-even conversion was computed against the
  one-off figure and does not survive the change unexamined.

Neither is a launch blocker — both are cheaper than the spec feared in absolute
terms. Both are reasons to resolve D2 by choosing numbers deliberately rather
than letting the build's defaults stand. **Still owed:** the live ten-rep
measurement `M0.md` specifies, from the Colombo home connection at 7–9pm. This is
a projection from measured runs, not a measurement.

---

## 5. What is genuinely done

So the list above is read in proportion.

- **The voice loop**, against a real provider, behind an interface neither the
  app nor the UI can see through. Two adapters, one conformance suite.
- **The three-minute dating rep**: warmth 65 arms it silently, thirty seconds
  from the end she is told either to leave or to offer her number, her closing
  line is allowed to finish, and the whole thing is written down when it ends
  however it ends.
- **Three characters**, one per rung, hand-authored against §06's table — with
  five more authored, tuned and retired rather than deleted (D10a). The ladder
  tests as monotonically harder, and since the three-minute retune a test pins
  *which rungs a strong player can actually arm* at three different rep
  lengths, because monotonic dials turned out not to be enough to keep a rung
  meaning anything. Nothing on the roster is unwinnable by construction any
  more; the top rung is hard rather than sealed, which D10a argues out.
- **The field, end to end**: one challenge a day chosen deterministically,
  accepted with the prediction captured before they go, logged with what it
  actually cost, carrying the streak on a day with no voice rep, and the
  predicted-versus-actual chart §09 calls the thing that does the therapeutic
  work — including the case where it comes out worse than they feared. 27 checks
  in `npm run db:field`.
- **The warmth engine**: per-turn fast scoring, an evidence-triggered slow
  scorer, asymmetric decay, bands that own delivery, and a calibration harness
  for the live scorer.
- **Progression, end to end**: a level opens on two reps scoring 70+ (§08, not
  on wins), the unlock records a row and celebrates once, difficulty adapts in
  both directions and announces only one of them, and the first rep is a
  measurement the product re-offers at day 28 and compares side by side.
- **The things that bring somebody back**: character memory, the Sunday letter
  generated on the user's own Sunday rather than the server's, and five kinds
  of share card whose §14 guardrails are enforced in code rather than asked for
  in a comment.
- **The data spine**: twenty-one tables — every one §13 names — RLS on all of
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
| `/field` | **Done** — today's challenge, the predicted-vs-actual chart, counters, tier rail and history, all real |
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
| `profiles` | Done, extended with preferences, consent, the retention toggle and `ui_flags` for one-time beats |
| `personas` | Done, with presentation columns |
| `sessions` | Done, extended with the meter |
| `transcripts` | Done, with the per-turn warmth gutter |
| `scores` | Done |
| `persona_memory` | **Written** — one filtered line per user per character, cleared by its owner |
| `usage_ledger` | Done, append-only and trigger-protected |
| `entitlements` (not in §13) | Added — plan and quota, read-only to the user |
| `streaks` | **Added** — a rep or a logged ask, read-only to the user |
| `unlocks` | **Added and written** — when the celebration was shown; what is unlocked stays derived. Carries `milestone` since `m4_milestone_unlocks`; `level` and `tier` are not written yet |
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
