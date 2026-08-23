# M2 — implementation plan

What is left of milestone two (§17), plus the four things decided in
conversation on 23 August: the rep format (three minutes, and the number
arriving at the end from her), character memory with a reset, the week-four
baseline re-test, and shareable cards.

**Roughly 13.5 working days**, of which items 0 and 1 are done — **10 left**.
The order below is dependency order, not size order. Every item ends in
something you can check.

---

## Decisions taken before the plan

| # | Decision | Consequence |
|---|---|---|
| 1 | The memory line lives on the brief screen with a one-tap **start fresh**. Full-screen beat only the first time a character ever remembers you | No decision to make before every rep. The moment before the mic opens stays a single action |
| 2 | Share cards may include **rep wins**, not only rejections | Highest reach, and the one place this plan carries real positioning risk. Guardrails in §8 |
| 3 | Cards leave as a PNG **and** an unguessable link | Links preview on social, which is most of the point. Revocable, no name or email on the image |
| 4 | The **week-four baseline re-test** is in scope | Adds ~1.5 days and touches onboarding. It is the strongest four-week hook in the spec and it is currently a column nothing writes |
| 5 | The unlock gate moves to the spec's rule — two reps scoring **70+** at a level | Gating on wins contradicts "outcome is never scored" (§07). Assumed unless overruled |
| 6 | A dating rep is **three minutes**, and the number arrives **at the end**, offered by her | Back to §14's own maths ("3 reps ≈ 9 min"). A good rep is no longer a short rep |
| 7 | **Hysteresis**: crossing 65 arms it, finishing at 55 or above keeps it | You can still lose it late, but not from one clumsy sentence at 2:50 |
| 8 | She **offers** in her own words; the card carries the digits | She never speaks digits, so nothing she says can contradict what is on screen |

**Memory is scene continuity, never affection.** Nadia remembering the blue
book is right; Nadia being pleased to see you is a companion app, which §01
rules out and §14 says gets a payment account declined. This is enforced in
code, not in a style note — see §3.

---

## The work, in order

### 0 · The rep format · 1 day · **shipped 23 Aug**

Numbered zero so nothing below renumbers, but it went first for a real reason:
the calibration harness (§6) needs twenty hand-scored transcripts, and a
transcript from a two-minute rep is the wrong shape to score a three-minute
one. The format changed first so that every transcript collected from here is a
candidate.

**What changed**

| | Before | Now |
|---|---|---|
| Length | 2:00 | **3:00**, with a closing grace |
| The number | Fired the instant warmth touched 65, mid-rep | Decided once, at the wind-down, delivered as the scene closes |
| Effect of winning | Ended the rep early | Nothing. The rep runs its full length either way |
| Who offers | Her, but forbidden from saying digits | Her, flirtily, in her own words — still no digits |

**The rule, precisely.** One threshold became two:

- `ARM_THRESHOLD = 65` — the first time warmth reaches it, the rep is *armed*.
  Nothing visible happens. No indicator, no sound, no change in the ring's
  behaviour. An "you've got it" signal would end the tension and the training
  in the same instant.
- `KEEP_THRESHOLD = 55` — armed **and** at or above this **at the wind-down**
  means she gives it. The measurement point is that instant rather than the
  literal last tick, and deliberately so: she is told what she is doing thirty
  seconds out, and the answer must not change underneath her once she has said
  it out loud.
- Never armed means never, whatever the last thirty seconds looked like.
- A rep that ends before the wind-down — he leaves, or she does — is judged on
  the same rule at that moment.

**The single decision point.** At T-30s one directive goes out, in one of two
shapes — the wrap-up and the number offer are the same moment now rather than
two competing instructions:

- *Armed and holding:* "You have enjoyed this and you want to hear from him
  again. Wind the conversation down, and before you go, offer him your number
  in your own words — warm, a little flirty, brief. Do not say any digits out
  loud."
- *Otherwise:* the existing wind-down. "You need to leave in about half a
  minute. Start winding down naturally. Do not announce a time."

**The closing grace.** The conversation stops at 3:00 and the visible timer
reads 0:00, but her closing turn gets up to twenty seconds to land — and if she
is not speaking and does not start within four, the scene ends there, because
twenty seconds of dead air is not a grace period. Cutting her off mid-sentence
would truncate the best moment in the product to save model time.

**Endings that are not the timer.**

| Ending | Armed and holding | Not armed |
|---|---|---|
| Timer runs out | She offers, card lands | She leaves |
| User ends early | She offers, card lands | She leaves |
| She exits (three dead ends, or she has to go) | Card lands with her goodbye — `character.exit` is a tool call we cannot pre-empt, so she may not say the line, and the card is the honest record of where the meter finished | She leaves |
| Boundary crossed | **Never.** No card, whatever the meter said | She leaves |

**Alex is unaffected.** Her hard ceiling is 45, she can never arm, and that is
the entire point of Level 8 (§06). No exception, no pity path.

**Files**

- `lib/data/rep-rules.ts` — `DATING_DURATION_MS` at 180_000, `WRAP_UP_MS` at
  30_000, `ARM_THRESHOLD` and `KEEP_THRESHOLD` replacing `WIN_THRESHOLD`, plus
  `CLOSING_GRACE_MS` and `CLOSING_IDLE_MS`. `shouldOfferNumber` is gone,
  replaced by `shouldArm()`, `givesNumber()` and `isClosingOver()`.
  `lib/data/rep-rules.test.ts` moved with it — 25 assertions.
- `lib/data/rep.ts` — arming sets a ref and does nothing else; the two
  directives merged into one decision in the tick; the closing phase replaced
  the `numberStage` machine and its fallback timer, about thirty lines lighter.
- `lib/data/progression.ts` — `wonFromRep` reads the pair off `peak_warmth`
  and `final_warmth`; `app/rep/actions.ts` passes both.
- The seven personas that carry "You have offered to swap numbers and said
  goodbye" keep it; it is now only ever reachable in the last thirty seconds.
- Copy: the brief `RuleBlock` ("Time 3:00"), the how-it-works sheet in both
  places it lives, the wrap cue (now reading `WRAP_UP_MS` rather than a
  hardcoded 30s, and gone once the clock reads zero), `PRODUCT.md`,
  `LAUNCH-GAP.md`, `INTEGRATION-GAPS.md`, `NERVE-FRONTEND-GUIDE.md`.

**Two knock-ons worth naming**

*Tuning.* A longer rep means more turns, more chances to gain, and an easier
65. The constants implicated are `gain`, `decayPerTurn` and `sessionCeiling` on
each trajectory, plus `outcomeWeights` if the receptive share drifts. Yours to
tune — but re-check the ladder after the change, because "monotonically harder"
is asserted by a test and a format change can quietly break it.

*Cost.* Fifty per cent more minutes per rep, and realtime pricing climbs with
context, so a three-minute rep costs more than 1.5× a two-minute one. At the
measured $0.065–0.12/min a Pro user at three reps a day is $18–32 a month
against a $24 price **at full usage**, which almost nobody reaches. §04 already
says to re-measure before launch; this is the change that makes it necessary
rather than prudent.

*Done when:* a rep runs the full three minutes whether or not it is going well;
arming produces no visible or audible change; a rep armed at 1:40 and finishing
at 58 still gets the number; one finishing at 51 does not; her closing line is
never cut off; and Alex still cannot arm.

**Shipped.** `ARM_THRESHOLD` / `KEEP_THRESHOLD` / `CLOSING_GRACE_MS` /
`CLOSING_IDLE_MS` in `lib/data/rep-rules.ts` with 25 assertions over them; the
arming path in `lib/data/rep.ts` is silent and the ending is one decision plus a
bounded closing phase; `wonFromRep` reads the pair off `peak_warmth` and
`final_warmth`; copy updated on the brief, the how-it-works sheet and the wrap
cue. **Still to do by hand:** re-tune the ladder for the longer rep, and
re-measure cost per rep against §04.

---

### 1 · The field, end to end · 2.5 days · **shipped 23 Aug**

The schema, the policies and 24 reviewed challenges were already in the
database; nothing in the app touched them. `/field` read
`lib/data/mock/field.ts` and "Did it" wrote a toast. That fixture is gone.

**Assignment.** One challenge a day, chosen for you, stable across a reload —
a challenge that changes when you refresh is a slot machine. Deterministic from
`(user_id, local day)`: filter to unlocked tiers, drop anything logged in the
last thirty days, prefer the current tier, then pick with a seeded index.

**Tier gate** (§09, engine levels from `profiles.current_level`):

| Tier | Opens at |
|---|---|
| T1 · in-app | Day one |
| T2 · low stakes | Sim level 4 |
| T3 · social | Sim level 6 |
| T4 · romantic | Sim level 7 |

**Server actions** in `app/field/actions.ts`:

- `assignToday()` — idempotent; returns the live assignment or creates one.
- `acceptChallenge(anxietyPre)` — captures the prediction **before** they go,
  which is the only moment it means anything. Sets `accepted_at`.
- `swapChallenge()` — retires the row as `swapped` and assigns another. The
  partial unique index already allows exactly this.
- `logAsk({ asked, outcome, anxietyPost, note })` — writes `field_logs`,
  resolves the assignment, and calls `recordTrainingDay` so the day counts
  even when the voice quota is gone (§14).

**Reads** in `lib/data/queries.ts`: `fetchFieldToday`, `fetchFieldLog`,
`fetchFieldStats` (asks made, rejections collected, tier progress). Delete
`lib/data/mock/field.ts` in the same commit — a fixture left beside a real
reader is a fixture somebody imports by accident.

**Screens**: `/field` today card, tier rail and history off real data; the
Train field card writes for real; the honesty sheet stays.

*Done when:* the assignment survives ten reloads, `anxiety_pre` cannot be set
after `accepted_at`, a logged ask advances the streak on a day with no rep, and
`npm run db:verify` still proves the log cannot be rewritten.

**Shipped.** `lib/field/assignment.ts` holds the tier gate and the seeded pick
(12 tests); `app/field/actions.ts` has `assignToday`, `acceptChallenge`,
`swapChallenge` and `logAsk`; `components/field/flow.tsx` is the shared state
machine, the 0–10 scale and the three sheets, used by both `/field` and the
Train card so they cannot drift; writes are optimistic and revert with a reason
(§02 rule 8); `useAsync` grew a `reload()` because these hooks fetch from the
browser and `router.refresh()` does not touch them. A new harness,
`npm run db:field`, proves the loop against the real database in 16 checks —
including that an ask made starts a streak with no voice rep anywhere near it.
**Not visually checked:** the browser extension was down, so the screens are
verified by types, lint, build and the harness rather than by eye.

---

### 2 · Predicted versus actual, and the counters · 1 day

The chart §09 calls the most screenshot-able thing in the app, and the one that
carries the therapeutic claim: predicted anxiety against actual discomfort,
over time, with the gap shaded. Actual is almost always lower, and watching
your own data prove it beats any amount of encouragement.

- The chart on `/field`, beside the log, and the summary figure on `/profile`.
- **Rejections collected** as the headline counter, never successes (§09).
  A rejection is an ask that came back `declined` — asks made drives the
  streak, rejections drive the number people quote.
- Milestones at 10 / 25 / 50 / 100, hand-written per milestone, each firing a
  share card (§8).
- Empty state before three logs: "Three more asks and this becomes a line" —
  axes already drawn, per §15.

*Done when:* the chart renders from real logs, the counter matches a hand
count, and the tenth logged ask fires the milestone sheet exactly once.

---

### 3 · Character memory, with a reset · 1 day

**Generation.** No extra model call: add `memoryLine` to the grade response
schema in `lib/grade/prompt.ts`. Grading already runs once per rep on the full
transcript, already costs a fraction of a cent, and one place that produces the
line is one place that can be audited.

**The rules, enforced in `lib/grade/memory.ts` rather than requested politely:**

- Fourteen words or fewer, one sentence.
- About the encounter or her situation. Never about how he did.
- No second person about the user's qualities, no affection, no anticipation.
  A regex reject list plus a length check; a line that fails is dropped, and a
  dropped line simply means she does not bring anything up.

Good: *"Still looking for the blue one. Sister's birthday is Thursday."*
Rejected: *"You were doing well until you asked about work."* (about him),
*"I've been hoping you'd come back."* (affection).

**Storage.** `persona_memory` upsert at grade time — the table has existed
since M1 with nothing writing to it.

**Injection.** `app/rep/[personaId]/live/page.tsx` reads the row and sets
`persona.memorySummary`; both persona compilers already inject it.

**Reset.** `forgetPersona(slug)` and `forgetAllMemory()` in
`app/profile/actions.ts`, surfaced in three places: the brief screen line, the
persona sheet, and Settings → Data. Copy states plainly that this clears the
line only — history, scores and your record survive.

**First-time beat.** The first time any character remembers you, a sheet
explains what just happened. Once, ever. Needs `profiles.ui_flags jsonb` (one
column, not one per beat).

*Done when:* the line shows on the brief, resetting it makes the next rep open
cold, and the filter's unit tests reject every example in the "rejected" list
above.

---

### 4 · Unlocks: the rule, the write, the moment · 1 day

Three faults in one place. The gate is wrong, nothing writes `unlocks`, and the
celebration is wired to a `useState(false)` that nothing sets.

- **Rule** — `syncLevel` moves to §08's: a level opens on **two reps scoring
  70+** at the level below, joining `scores` to `sessions` by persona level.
  Wins stop being the gate.
- **Write** — when a level or a field tier opens, insert into `unlocks`
  (service role, already policy-locked).
- **Moment** — the scorecard reads unannounced unlocks, fires
  `LevelUnlockedSheet`, and stamps `announced_at`. Fires once, ever, which is
  the whole reason that column exists.

*Done when:* two 70+ reps at level 1 open level 2 and write exactly one row, a
third does not write a second, and the sheet never appears twice.

---

### 5 · Adaptive difficulty, silent · 1.5 days

Two strong reps nudge the dials up within a level; two weak ones ease them
back. **The downward adjustment renders nothing** — no toast, no sheet, no
line in the scorecard, nothing in the transcript (§08, §12). Telling somebody
who is struggling that you made it easier is the fastest way to lose them.

- New table `difficulty_offsets (user_id, level, start_bonus, gain_bonus,
  updated_at)`, read-only to its owner, service-role write — same argument as
  the ladder position.
- After each graded rep: last two at that level both ≥ 75 → bump; both < 55 →
  ease. Clamped to ±6 on start and ±0.25 on gain so a run of bad nights cannot
  turn Level 6 into Level 2.
- Applied where the live page builds the persona config. The engine already
  reads its trajectory through a getter, which is the seam this hangs on — no
  engine change.
- The upward bump may be announced through the existing modal ("Maya's going
  to make you work today").

*Done when:* a test drives four synthetic reps and asserts the offset moves,
clamps, and — the important one — that the downward path emits no event of any
kind.

---

### 6 · The calibration harness · 2 days · **this is the M2 gate**

§17 does not let M2 close without it, and §19 lists scoring drift as a high
risk: models update, scores rot silently, and progression stops meaning
anything.

- Twenty golden transcripts, hand-scored on the composite and all six
  sub-scores, in `lib/grade/calibration/fixtures.ts`.
- A runner that puts each through the deployed `/api/grade` — over HTTP with
  `INTERNAL_API_SECRET`, exactly as the warmth harness does, so it measures the
  route rather than a re-implementation.
- Drift beyond five points on any dimension fails. `npm run grade:calibrate`,
  nightly on a schedule.
- **Start collecting now.** Most of the two days is hand-scoring, and it needs
  twenty real reps to score. Every rep run during items 1–5 is a candidate.

*Done when:* the suite is green across all twenty, and deliberately corrupting
one fixture's expected score turns it red.

---

### 7 · Baseline rep and the week-four re-test · 1.5 days

The retention hook the spec plants on day one and cashes on day 28, currently a
`baseline_score` column nothing writes.

- The first rep is framed as a measurement, not a test — the onboarding copy
  already says this; now it means something.
- After grading, write `baseline_score` and a new `baseline_session_id`.
- At day 28, Train offers the re-test: same character, same level, framed as
  the same measurement.
- The comparison screen shows both side by side, sub-score by sub-score. This
  is also a share card (§8).

*Done when:* the baseline is written exactly once, the offer appears on day 28
and not before, and the comparison renders from two real sessions.

---

### 8 · Share cards · 2 days

One component, five triggers. `next/og` renders a PNG in Arena styling — dark
ground, Barlow Condensed number, one hand-written line, no chrome.

| Kind | Trigger | Carries |
|---|---|---|
| `rejections` | Milestone at 10 / 25 / 50 / 100 | The count, and the predicted-vs-actual gap |
| `weekly` | Sunday review | The week's line and its numbers |
| `streak` | 7 / 14 / 30 / 60 days | Days trained |
| `baseline` | Week-four re-test | Then against now |
| `rep_win` | A rep where she gave her number | **See the guardrails below** |

**Delivery.** `share_cards (id, token, user_id, kind, payload jsonb,
created_at, revoked_at)`. The public page is a route handler that looks the
token up with the service role, so the table needs no anonymous policy and RLS
stays strict. Token is 32 hex characters. A "shared cards" list in Settings →
Data revokes any of them.

**The rep-win card, and its guardrails.** This is the one item in the plan that
carries positioning risk: §14 records that every merchant of record on our
shortlist bans dating products by name and that a human reviews what we
publish. The card ships, framed so that what a reviewer finds is training:

- It reads as a **level cleared**, with the process score present — *"Level 02
  cleared · 1:47 · composure 82"* — not as a trophy.
- **No phone number is ever rendered**, and no copy uses "her number".
- Character first name only. No portrait, no scene photograph.
- The template carries the product line, so the artefact says what the product
  is even when it is screenshotted out of context.
- Opt-in per card, revocable, and never generated automatically.

*Done when:* every kind renders, the token is unguessable, revoking kills the
page, no image contains an email or a display name, and the rep-win template
passes a read-through as a training product rather than a dating one.

---

### 9 · The Sunday review · 1 day

The fourth reason to come back, and the table is already there.

- Hourly cron; generate for users whose local clock has just passed Sunday
  06:00. Vercel crons run in UTC, and "Sunday morning" is the user's Sunday —
  the honest implementation is to check, not to assume.
- Stats plus hand-written templates, never a model: reps, wins, asks made,
  rejections collected, streak, composite trend. *"You were turned down seven
  times this week. You're still fine."*
- Stored, because it is a letter about that specific week and has to keep
  saying seven in October.
- Becomes a `weekly` share card.

*Done when:* a user in Colombo gets theirs on Sunday morning local, a second
run the same week writes nothing, and the copy reads as written rather than
assembled.

---

## Schema still needed

Small, and all through the Supabase MCP as before. The `m4_` prefix is
migration batch four — it has nothing to do with milestone M4, which is
billing and safety.

| Migration | Adds |
|---|---|
| `m4_ui_flags` | `profiles.ui_flags jsonb` — one column for one-time beats |
| `m4_baseline` | `profiles.baseline_session_id uuid` |
| `m4_difficulty` | `difficulty_offsets`, read-only to its owner |
| `m4_share_cards` | `share_cards` with token and revocation |

Everything else — the field, memory, unlocks, weekly reviews — is already in
place and proven by `npm run db:verify`.

---

## Order and dependencies

```
Day  1      The rep format (0)                          ✔ done
Days 2-4    Field end to end (1)                        ✔ done
Day  5      Predicted vs actual, counters, milestones (2)
Day  6      Character memory + reset (3)
Day  7      Unlocks: rule, write, moment (4)
Days 8-9    Baseline + week-four re-test (7)
Days 10-11  Adaptive difficulty (5)
Days 12-13  Share cards (8)
Day  14     Sunday review (9)

Alongside from day 2: collect and hand-score transcripts → harness (6)
```

The format goes first because every transcript collected after it is a
candidate for the harness, and every one collected before it is the wrong
length to score. The field goes next because two later items depend on it — the
counters feed the share cards, and the tier gate needs the unlock work to have
somewhere to point. The harness runs alongside everything else, because its
real cost is hand-scoring twenty transcripts and those come from the reps run
while building the rest.

---

## What closes M2

0. ✔ A rep is three minutes, she offers the number at the end when the meter
   earned it, and nothing about arming is visible while it happens.
1. `npm run grade:calibrate` green across all twenty transcripts — the §17 gate.
2. ◐ The field loop works end to end: assigned, accepted with a prediction,
   logged with an actual, and carrying the streak on a day with no rep. The
   chart is item 2.
3. Two 70+ reps open a level, write one unlock row, and celebrate once.
4. A character remembers you, and one tap makes her forget.
5. Difficulty moves both ways, and only one direction is ever visible.
6. The baseline exists on day one and is re-offered on day 28.

Items 2 and 8 also clear blocker **B8** in `LAUNCH-GAP.md`, which is the piece
of the beta that lets it answer its own question.
