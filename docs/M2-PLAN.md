# M2 — implementation plan

> **Superseded as "what to do next" by [`M3-PLAN.md`](M3-PLAN.md) on 24 August.**
> All nine items below shipped. What this doc could not say — because it was
> written before the gates were audited — is that building them does not close
> M2: §17 gates the milestone on twenty hand-scored transcripts, and M0 never
> passed its own gate either. Both live in `M3-PLAN.md` now. This page stays as
> the record of what M2 was and what actually landed.

What is left of milestone two (§17), plus the four things decided in
conversation on 23 August: the rep format (three minutes, and the number
arriving at the end from her), character memory with a reset, the week-four
baseline re-test, and shareable cards.

**All nine items are built.** What is left of M2 is not code: twenty
transcripts have to be read and hand-scored before the calibration gate (§17)
can go green, and ten of them are already collected and waiting.

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
- ~~The seven personas that carry "You have offered to swap numbers and said
  goodbye" keep it; it is now only ever reachable in the last thirty seconds.~~
  **Wrong, and corrected 23 Aug — see the fix note at the end of this item.**
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

**Two defects found in a live rep, 23 Aug, and fixed.** A real Priya rep: the
user asked for her number at 2:17, she said *"Sure, we can swap numbers if you
want"*, and the screen said **She left**. Both halves of that were bugs.

*The exit condition was reachable at any moment.* Seven personas carried "You
have offered to swap numbers and said goodbye", and the note above claimed it
was "only ever reachable in the last thirty seconds". It was reachable whenever
the **user** asked, because it is a condition on HER behaviour and her behaviour
is free-form. She answered a direct question politely at 2:17 — thirteen seconds
before the wind-down would have fired, so she had never been told what to do
about numbers — that tripped her own exit, and the rep ended 38 seconds early
with the meter at 60.16. The last thirty seconds, the only window in which the
number can legitimately be given, never happened.

The condition is now gone from all seven; the rep ends on the timer, which is
what "the rep runs its full length either way" meant. Removing it stops the
scene ending, so a second rule stops her agreeing in the first place: a
`# If they ask for your number` block compiled into every dating contract by
`compileInstructions`. It lives there rather than in eight persona files
because it is the rep format and not a character trait — which also means
Nadia's and Alex's hand-tuned prose did not have to be reopened for it. It
yields explicitly to the bracketed direction, so it cannot argue with the
wind-down.

*The grade was inventing wins.* `wonFromRep` opened with
`if (outcome === 'receptive') return true`, before the meter was consulted at
all. So the rep above — shown to the user as "She left", correctly — was
rewritten as a **win** the moment the grade landed, because the conversation had
gone pleasantly. The stored record contradicted the screen, and the invented win
counted toward the next unlock. `saveScore`'s guard only protected the opposite
direction (`won === true ? true : recompute`), so a grader could hand out a win
but not take one away.

`wonFromRep` no longer accepts an outcome at all — the bug is now
unrepresentable — and `saveScore` falls back to it only when there is no stored
answer (`session?.won ?? …`). A third instance of the same class was found while
fixing it: `fetchPersonas` selected `outcome` and never `won`, so the roster's
**locked state** was computed from the grade alone. That is the one place this
gated content.

Four regression tests, each verified to fail against the pre-fix code:
two in `lib/data/progression.test.ts` (new) and two in the conformance suite.
One row on the real account was already wrong; `npm run db:repair-wins` corrected
it and is idempotent. It deliberately only undoes the unambiguous half — a peak
below `ARM_THRESHOLD` can never have been armed, whereas a final below
`KEEP_THRESHOLD` may be a legitimate win whose closing line drifted, because
`won` is decided from the warmth at the wind-down and no column stores that.

*Done when:* a rep runs the full three minutes whether or not it is going well;
arming produces no visible or audible change; a rep armed at 1:40 and finishing
at 58 still gets the number; one finishing at 51 does not; her closing line is
never cut off; and Alex still cannot arm.

**Shipped.** `ARM_THRESHOLD` / `KEEP_THRESHOLD` / `CLOSING_GRACE_MS` /
`CLOSING_IDLE_MS` in `lib/data/rep-rules.ts` with 25 assertions over them; the
arming path in `lib/data/rep.ts` is silent and the ending is one decision plus a
bounded closing phase; `wonFromRep` reads the pair off `peak_warmth` and
`final_warmth`; copy updated on the brief, the how-it-works sheet and the wrap
cue.

**The ladder retune — done.** The two knock-ons above were both worked and both
are closed.

The dial that moved was not one of the four the note predicted. `maxGainPerTurn`
clips every strong turn below warmth ~48 at Level 1, so most of a rep is
cap-limited and the total a good run can bank is `cap × turns`: five more turns
was worth a flat **+10.5 on every rung at once**. The ladder stayed monotonic in
`start`, `gain`, `decay` and `decayPerTurn` throughout — what broke is that the
fixed 65 line moved from just above Level 1 to below Level 3, so a strong player
armed **three rungs where they used to arm one**. The dials were still ordered;
clearing a rung had stopped meaning anything.

The cap is a function of rep length, not of who she is, so only the cap moved —
4 / 4 / 4 / 4 / 3.5 / 3.5 / 3 / 3 became **3.5 / 3.2 / 2.9 / 2.7 / 2.6 / 2.5 /
2.4 / 2.4**. It is the right lever twice over: it binds only on strong play, so
a decent, an average and a flat player are all numerically untouched by the
change. A strong player now arms Nadia and Priya and nothing above them — one
more rung than the two-minute format, which is honest, since three minutes of
good conversation should get further than two.

Asserted in `lib/warmth/engine.test.ts`: `maxGainPerTurn` joined the monotonic
ladder check, and `separates the rungs at the 65 line` pins the armed set at 12,
15 and 18 turns so the ladder is not fitted to one turn count. Personas
reseeded.

**Cost — measured, and the fear was the wrong way round.** §18 assumed
$0.05–0.08/min and $0.21 a rep. M0 priced four real `gpt-realtime-mini` runs at
**$0.0192–$0.0293/min**, so a three-minute rep is **$0.058–0.088** — a third of
the budgeted figure. Context growth is not compounding either: 305.8s against
117.8s is +2.8% per minute, because removing blind scheduled reinforcement
turned the within-session cost curve from +46.5% to −7.4% (M0, fourth finding).
The note above worried that a Pro user at three reps a day would cost $18–32 a
month against $24; at the measured rate it is **$7.91**.

`npm run cost:model` is the arithmetic, sourced line by line to `docs/M0.md`,
and `lib/voice/rates.ts` no longer claims to be an unmeasured estimate — its
$0.065 is now documented as a deliberately conservative *ceiling* for the one
case that uses it, a rep whose provider reported no usage at all. **Still owed:**
the live ten-rep run M0.md specifies, from the Colombo home connection at 7–9pm.
That is a measurement nobody can do at a desk, and this projection exists to
give it something to be checked against. One real finding fell out of it and is
recorded in `LAUNCH-GAP.md` D2: at the app's own pricing, Elite at $39 for six
reps a day is 59% margin at full usage — the exact number §14 rejected 200
minutes for.

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

### 2 · Predicted versus actual, and the counters · 1 day · **shipped 23 Aug**

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

**Shipped.** `lib/field/anxiety.ts` builds the series and writes the verdict
line; `lib/field/milestones.ts` holds the four thresholds and their hand-written
copy; 13 tests over both. The chart is `components/field/anxiety-chart.tsx` on
`/field` beside the log, and the same `anxietySeries` feeds the summary figure on
`/profile`, so the line and the number cannot disagree. Rejections collected was
already the headline counter but the card read as though its label belonged to
asks made — the big number now sits directly under its own label with asks made
below the rule, and a "15 more to 25" line under it.

**Announce-once** reuses `unlocks` (`m4_milestone_unlocks` extends the `kind`
check) rather than `profiles.ui_flags`. `unlocks` already answers exactly the
question a milestone asks — *when did we first tell them* — and it is
service-role write, so a user cannot re-fire or suppress their own. `ui_flags`
is still owed for item 3's first-time beat. The moment fires from the row and not
from the response, so closing the tab on the tenth ask means it lands next time
instead of being lost.

Two things the chart does that are worth not undoing. It **never flatters**: when
actual comes in above predicted the fill turns amber and the copy says to ease
back a tier, because §09's own warning is that going too hard too early
sensitises rather than habituates, and a chart that only curves the flattering
way is one nobody should believe. And the axes are drawn before there is anything
to plot (§15), counting down honestly — "Three more asks and this becomes a
line".

`npm run db:field` grew from 16 checks to 27, covering the hand count (ten
rejections out of twelve rows, eleven asks), the series, and the milestone firing
once — including that logging it twice leaves one row and that the eleventh
rejection fires nothing.

**Verified by eye**, which item 1 could not be: the chart, both empty and with
data, the counter card, the profile figure, and the milestone sheet firing on a
real tenth ask and not returning after a reload. **Found and fixed in the
browser:** `anxietySeries` trusted the caller's order, and `fetchFieldLog` sorts
on `logged_at`, which ties for rows written in the same instant — the chart came
back newest-first and read as a fear that was *climbing*. It now sorts on the day
itself, with a test for it.

**Still owed:** the milestone is a sheet, not yet a share card — that is item 8,
which is where §09's "each firing a share card" lands.

---

### 3 · Character memory, with a reset · 1 day · **shipped 23 Aug** · **reached the model 24 Aug**

> **It did not work until 24 Aug, and everything except one hop was correct.**
> The grade produced the line, the filter refused anything about him, the write
> landed under the user's own context, the brief screen showed it, and "start
> fresh" deleted it. The live page then read it back, attached it to the persona
> handed to the browser — and the browser sent the token route `persona.slug`
> and nothing else, so the contract was recompiled from the bare roster record.
> `compileInstructions`' "You have met before" block was never once reached in
> production. The read now lives in `app/api/voice/token/route.ts`, derived from
> the authenticated user rather than travelling through the client, which is
> also the only version that keeps the "a client that can post its own
> instructions can post its own character" rule intact. Both adapters compile
> from a persona id, so this was the same gap on both arms.

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

**Shipped.** `memoryLine` rides on the grade response — no extra model call, so
one place produces the line and one place can audit it. `lib/grade/memory.ts`
is that audit: 15 tests, and it rejects both of the "rejected" examples above
plus the categories they belong to.

**The filter is biased hard towards dropping**, and that is the design rather
than a limitation. A false positive costs one memory, which is what happens
between strangers most of the time anyway. A false negative puts affection in a
character's mouth and moves the product into the category §14 says every
merchant of record declines. Three reject lists, in order: **second person** in
any form (the bluntest rule and the one that catches both named examples —
`\b` sits between the `u` and the apostrophe, so it catches "you'd" without
listing it), **affection and anticipation** (which hides in "hoping", "next
time", "again soon" far more often than in obvious words), and **performance
judgement** — §07 keeps outcome out of the score, and this keeps the grade out
of her mouth.

**One deviation from the rule as written above.** It says "fourteen words or
fewer, one sentence"; the good example directly under it is two sentences.
`MAX_MEMORY_SENTENCES` is 2, because the example is the more specific statement
of intent and the word cap already does the real work. Noted in the code.

`persona_memory` is written in the **user's own context**, not the service role:
unlike plan, quota and the ladder position, nobody would pay to change what
Nadia remembers, the table already grants its owner all four verbs, and the
reset needs the delete. **A dropped line leaves the previous one standing** —
one forgettable rep should not erase the blue book.

Injection is one line on the live page. Both compilers read `memorySummary`
through the shared `compileInstructions`, so the OpenAI arm — the live one —
and the pipeline arm cannot disagree; asserted in the conformance suite, along
with the case that matters more: a character with **no** memory is never told
"you have met before".

Reset in all three places the plan asks for — the brief line, the persona sheet,
Settings → Data. The first two are one tap and optimistic; Settings is
confirmed, because clearing one line is a small correction and clearing all of
them is not recoverable by running a single rep. Every piece of copy states
that it clears the line only.

The first-time beat fires off `profiles.ui_flags` (`m4_ui_flags`), stamped with
a timestamp rather than `true` so it answers "when" later, and stamped when the
sheet is dismissed so an explainer that flashed past during a navigation is not
burned. `markUiFlag` is idempotent, so a failed stamp costs one repeat.

Whether it fires is **derived from the fetch, never seeded into state** — worth
naming because the first version got it wrong. `useState(() => memory?.firstEver)`
latches on mount, and this component mounts before its own fetch resolves, so
the beat would have been dead. It passed in the browser only because that fetch
won a race it is not guaranteed to win, which is exactly the kind of bug a
screenshot cannot be trusted to catch.

`npm run db:rep` grew 9 checks covering the write, the read the live page makes,
replacement rather than accumulation, the reset, and — the one worth having —
that forgetting takes the line and leaves the rep, the score and the ladder
alone, which is exactly what the copy beside the control promises.

**Verified by eye:** the line and the beat on the brief, the beat not returning
after a reload, Start fresh clearing the row, the persona sheet, and Settings →
Data. **Owed by hand:** nobody has yet seen a memory line the *model* wrote —
every line tested was hand-supplied, because generating one costs a real rep
against a live microphone. The filter is what makes that safe to defer, but the
prompt's hit rate is unmeasured, and it is worth reading the first few that
land.

---

### 4 · Unlocks: the rule, the write, the moment · 1 day · **shipped 23 Aug**

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

**Shipped.** All three faults were real and all three are closed.

*The rule.* `UNLOCK_RULES` counts qualifying SCORES rather than wins, at
`UNLOCK_SCORE = 70` and `UNLOCK_REPS = 2` — uniformly two, per §08, where tier
4 used to want three. `qualifyingByLevel` is shared by `syncLevel` and
`fetchPersonas` so the stored ladder position and the roster's locked state are
computed by one piece of arithmetic; they read different tables under different
credentials, and two implementations of one rule is exactly how they come to
disagree. **The shape of `unlockedLevels` did not change, only its meaning** —
typecheck stayed green through the rule change, which is why both callers were
rewritten rather than trusted.

This retires the second half of the outcome-scoring bug found the same day: the
gate was reading `sessions.won`, which the grader could invent outright, so it
was scoring outcome twice over. `LAUNCH-GAP` D8 and D8a are both closed.

*The write.* `lib/db/milestones.ts` became `lib/db/unlocks.ts` and generalised —
one `recordUnlocks` / `announceUnlock` pair now serves levels, field tiers and
rejection milestones, because "fires exactly once, ever" is the part that is
easy to get subtly wrong and one implementation of it is enough. Roster tiers 1
and 2 are never recorded: telling somebody they have unlocked what they were
given is worse than saying nothing.

*The moment.* The scorecard reads the oldest unannounced unlock and fires
`LevelUnlockedSheet`, stamping `announced_at` on dismissal. The sheet's copy was
hardcoded to "Jules and Samara" for every level including the ones they are not
on; it is now hand-written per tier and handles field tiers as well as roster
ones.

**One thing worth knowing:** a fresh account reaches engine level 4 the moment
its first rep is graded, because UI tiers 1 and 2 are free — so §09's Tier 2
field challenges open on rep one and the sheet fires for them. That is correct
per §09 and slightly odd as product; `db:rep` asserts it deliberately rather
than by accident.

---

### 5 · Adaptive difficulty, silent · 1.5 days · **shipped 23 Aug**

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

**Shipped.** `difficulty_offsets` is read-only to its owner and service-role
write — the strongest case for that rule in the product, since turning your own
difficulty down is precisely what would make every score after it meaningless.
The clamps are enforced by CHECK constraints as well as in code: a bug writing
-40 to `start_bonus` would turn Level 6 into Level 2 permanently *and silently*,
and silence is exactly what §12 requires of the downward path.

**The sign is the thing that was easy to get wrong, and I got it wrong first.**
"Bump" means bump the DIFFICULTY up, which is a *lower* start and gain — a
harder character opens colder and warms slower. The first version added on a
bump, which would have quietly rewarded struggling and punished improving, and
because the downward path is silent nobody would ever have been told. It is
named in the code now and asserted in both directions.

*The silence* is structural rather than requested. `nextDifficulty` returns
`announce`, and it is false for every ease by construction — the downward path
is never handed anything to display, so a caller cannot leak it by reading the
wrong field. A test walks the offset all the way to its clamp and checks
`announce` at every step.

Applied where the live page builds the config, which is the seam the engine's
trajectory getter exists for — no engine change. Ceilings are deliberately
untouched: an offset that could lift `hardCeiling` would hand Alex to anybody
with two good nights, which is the exact lesson Level 8 refuses to teach.

---

### 6 · The calibration harness · 2 days · **built 23 Aug — the gate is open, the scoring is owed**

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

**Built, and honest about what is left.** The runner, the drift check, the
fixture structure and the collector all exist; `npm run grade:calibrate` drives
the **deployed** `/api/grade` over HTTP with `INTERNAL_API_SECRET`, exactly as
the warmth harness drives the live scorer, so it measures the route rather than
a re-implementation of it.

**It refuses to report success it has not earned.** Empty fixtures fail. Fewer
than twenty hand-scored fail. `MAX_DRIFT` is 5 on every sub-score *and* on the
composite — the composite is 60/40 and can drift while all six hold, and missing
it would let the number the user actually sees rot unobserved.

`npm run grade:collect` has already pulled **ten real transcripts** from reps run
under the three-minute format, across four characters. They live in
`transcripts.ts`, generated and never hand-edited; the expectations live in
`fixtures.ts` keyed by id, so re-collecting can never clobber scoring work.

**Owed, and not code:** read the ten, hand-score all six sub-scores and the
composite on each, run ten more reps and collect those. §07's own acceptance
criterion — that corrupting a fixture turns the suite red — is asserted at a
desk in `calibration.test.ts`. The last test in that file is written to be
*deleted* rather than updated on the day the twentieth is scored.

---

### 7 · Baseline rep and the week-four re-test · 1.5 days · **shipped 23 Aug**

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

**Shipped.** `profiles.baseline_session_id` joins the score to the whole
scorecard, which is what the side-by-side needs; the score stays denormalised
beside it so deleting the first rep under §16.7 costs the comparison rather than
the number. The write is filtered on `baseline_session_id is null`, so it lands
exactly once however the timing falls — a baseline that moves is not a baseline.

Which rep counts as the re-test is **derived, not stored**: the first graded rep
against the baseline character on or after day 28. First rather than best,
deliberately — a re-test you can re-roll until the number flatters you is not a
measurement.

`/progress/baseline` shows both, sub-score by sub-score, matched by key so
reordering the six can never compare curiosity against composure. The verdict
copy has a branch for going *down* and uses it; a measurement with copy for only
one direction is one nobody should believe.

---

### 8 · Share cards · 2 days · **shipped 23 Aug**

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

**Shipped, guardrails first.** This is the one item in the plan carrying real
positioning risk, so §14's rules are **code, not a style note**:
`assertPublishable` refuses anything matching a phone number, "her number",
dating-product vocabulary, an email address, or relationship framing — checked
on every visible field, not just the line, because a headline is as public as
anything else. A card that fails does not get made. Throwing is right here and
wrong nearly everywhere else in this codebase: the failure mode is a public
artefact, and not publishing is always recoverable.

The rep-win card reads as **Level 02 cleared** with the composite as the hero
figure and a process sub-score beside it. Verified by rendering it: no number,
no "her number", first name only, product line attached, one volt accent.

`share_cards` has one owner-read policy and **no anonymous policy at all** — the
public route resolves the token with the service role, so the table is never
enumerable. 128-bit token, `^[0-9a-f]{32}$` enforced by the column. Revocation
is a timestamp rather than a delete, so a revoked card stops resolving while
staying visible in Settings → Data as revoked. Unknown and malformed tokens both
404.

All five triggers are wired — rejections on the milestone sheet, weekly on the
Sunday card, streak on the profile at 7+ days, baseline on the comparison, and
rep_win on a won scorecard. **Every one is opt-in and none fires automatically**
(§08): the moment happens on its own, the artefact only exists if somebody asks.

---

### 9 · The Sunday review · 1 day · **shipped 23 Aug**

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

**Shipped.** An **hourly** cron, not a weekly one, and that is the whole point:
Vercel crons run in UTC and "Sunday morning" is the user's Sunday. Sunday 19:00
UTC is already Monday half past midnight in Colombo, so a job trusting the
server's weekday would post a Sunday letter into somebody's Monday. The job asks
each profile's own timezone; a test pins both the hour case and the day case.

Idempotent by `(user_id, week_start)`, so the twenty-odd runs inside one user's
Sunday write once and skip the rest. Stored rather than recomputed, because it
is a letter about one specific week and has to keep saying seven in October.

The copy is assembled from hand-written sentences chosen by what actually
happened — never a model, which would be writing "turned down seven times"
without knowing whether it was seven. It reports a fall as readily as a rise, it
declines to invent a trend from one week, and a test asserts it never
congratulates a yes.

---

## Schema still needed

Small, and all through the Supabase MCP as before. The `m4_` prefix is
migration batch four — it has nothing to do with milestone M4, which is
billing and safety.

| Migration | Adds |
|---|---|
| ~~`m4_milestone_unlocks`~~ | **Applied 23 Aug.** `unlocks.kind` accepts `'milestone'`, so a rejection milestone fires once out of the same table and the same `announced_at` the level unlock uses |
| ~~`m4_ui_flags`~~ | **Applied 23 Aug.** `profiles.ui_flags jsonb` — one column for one-time beats, `{flag: iso-timestamp}`. User-writable on purpose: a beat is a note about what has been *displayed*, so the worst a user can do is see an explainer twice. The rejection milestones deliberately do not use it — they record something *earned*, which belongs in `unlocks` |
| ~~`m4_baseline`~~ | **Applied 23 Aug.** `profiles.baseline_session_id uuid`, `on delete set null` so deleting your first rep costs the comparison and not your profile |
| ~~`m4_difficulty`~~ | **Applied 23 Aug.** `difficulty_offsets`, read-only to its owner, with the clamps as CHECK constraints so a bug cannot silently turn Level 6 into Level 2 |
| ~~`m4_share_cards`~~ | **Applied 23 Aug.** `share_cards`, one owner-read policy and **no anonymous policy** — the public page resolves the token with the service role |

Everything else — the field, memory, unlocks, weekly reviews — is already in
place and proven by `npm run db:verify`.

---

## Order and dependencies

```
Day  1      The rep format (0)                          ✔ done
Days 2-4    Field end to end (1)                        ✔ done
Day  5      Predicted vs actual, counters, milestones (2)  ✔ done
Day  6      Character memory + reset (3)                 ✔ done
Day  7      Unlocks: rule, write, moment (4)             ✔ done
Days 8-9    Baseline + week-four re-test (7)             ✔ done
Days 10-11  Adaptive difficulty (5)                      ✔ done
Days 12-13  Share cards (8)                              ✔ done
Day  14     Sunday review (9)                            ✔ done

Alongside: the harness (6) is built and the collector has pulled ten
transcripts. Hand-scoring twenty is the one thing left, and it is not code.
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
1. ◐ `npm run grade:calibrate` green across all twenty transcripts — the §17
   gate, and **the only thing still open**. The harness is built and refuses to
   report success it has not earned; ten transcripts are collected and none are
   scored yet. This is reading, not building.
2. ✔ The field loop works end to end: assigned, accepted with a prediction,
   logged with an actual, carrying the streak on a day with no rep, and the
   predicted-versus-actual chart drawn from it with milestones at 10 / 25 / 50 /
   100 firing once each.
3. ✔ Two 70+ reps open a level, write one unlock row, and celebrate once.
4. ✔ A character remembers you, and one tap makes her forget.
5. ✔ Difficulty moves both ways, and only one direction is ever visible.
6. ✔ The baseline exists on day one and is re-offered on day 28.

Items 2 and 8 also clear blocker **B8** in `LAUNCH-GAP.md`, which is the piece
of the beta that lets it answer its own question.

---

## Ready for M3?

Every M2 item is built and the schema M2 needed is applied. What M3 inherits:

- **A closed training loop.** Rep → grade → memory → unlock → adaptive
  difficulty → baseline comparison, with the field loop and the Sunday review
  wrapped around it.
- **Nineteen tables, RLS proven from a second account**, and three harnesses
  (`db:verify`, `db:rep`, `db:field`) that cover the lifecycle without a
  microphone.
- **The M2 gate half-open.** §17 does not let M2 close until twenty transcripts
  are hand-scored. The harness cannot be made green by writing more code, and
  it is deliberately built to refuse to pretend otherwise.

What M3 is (§17) — sound kit, haptics, PWA, score choreography — touches none of
the above. The blockers in `LAUNCH-GAP.md` are the harder question, and **B9
(no spend ceiling on `/api/grade` and `/api/warmth/score`) is the one that
should go before any more feature work**: everything added in M2 leans on an
unrated grader endpoint.
