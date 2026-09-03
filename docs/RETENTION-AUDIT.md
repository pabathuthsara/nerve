# Retention audit — why the loop does not pull

**3 September 2026.** Prompted by one question from the build: *"it looks cool,
but a user might come, do this once, and never return."*

That instinct is correct, and the cause is not the design system. Arena is
doing exactly what it was specified to do. The problem is that **the core
action cannot be repeated, nothing calls the user back, and nothing pays out on
the same day it was earned** — and that a fourth thing, the one emotional beat
the product has, is currently spent on the one outcome §07 says is worth zero.

Findings are numbered `R#` and ordered by leverage. Mark them shipped in place
with what actually landed and what is still owed, the way `VISUAL-AUDIT.md`
does. Sizes are working time, not calendar time.

> **Shipped 3 September: R2 through R17, all sixteen.** §2's doctrine fix landed
> with R3 and is now written into `CLAUDE.md` beside the rule it qualifies.
>
> The two that are not code were both put on the same day. **R1 was decided —
> free stays at zero** — which means every mechanic below fires once for a free
> account and then waits for a purchase; that is the deliberate trade and it is
> written out under R1. **§5 was held open**, on the record, rather than allowed
> to drift.
>
> **The only outstanding thing on this document is two secrets**, and R6 says
> which.

---

## 1. The diagnosis

Four things make a habit product a habit. The build has roughly one of them.

**A repeatable core action.** `lib/site/plans.ts` sets `repsPerDay: 0` on free.
One sign-up rep against Tess, granted once per account by
`lib/data/allowance.ts`, and then the microphone closes permanently. That is
not a side effect — it is D11, decided deliberately on 31 August on the
argument that a free voice user costs ~$2.64 a month against a realtime model.
The argument is sound. The consequence is that every streak, rank, milestone
and tier in the codebase is scaffolding around an action a free user performs
exactly once, on day zero.

What free retains on instead is (a) text mode, which is capped below
`ARM_THRESHOLD` (65) so it "can never produce the number a voice rep exists to
earn", and (b) field challenges, which are offline homework requiring the
single highest activation energy in the product. An unwinnable version of the
game, plus courage homework. That is a filter, not a habit.

**A channel that recalls you.** `vercel.json` carries one cron: `purge-audio`.
`lib/email/` carries one message: the trial charge notice. There is no push, no
daily nudge, no streak-at-risk. The Sunday letter — called "the fourth reason
to come back" in `lib/data/weekly.ts` — is fully built, fully tested, and
**unscheduled**: the hourly expression was refused by Vercel's Hobby plan and
the cron was removed rather than made daily (`LAUNCH-GAP.md`, "the three ways
out", deferred rather than decided). A streak counter is a scoreboard for
people who already came back.

**A payout on the same day.** Every reward in the product runs on a multi-week
clock: rank needs `UNLOCK_REPS` (2) reps at `UNLOCK_SCORE` (70+) per tier, the
baseline re-test is day 28, the letter is weekly, the rejection milestones are
10 / 25 / 50 / 100 and offline. The one thing that happens today is the
scorecard — which is *a judgement*. High effort in (speak aloud, on a mic, to
someone who may reject you), payout out: a number that might be low, plus a
mission naming what you did wrong.

The only monotonic counters in the product are `streak` and
`rejectionsCollected`. `rejectionsCollected` is the best-designed idea in the
build — it cannot be lost at, and it reframes refusal as accumulation — and it
lives entirely in the offline half. **The in-app half has no equivalent.**

**A moment of release.** Read Arena's own rules: dark only, one accent, volt
once per screen or one of them is wrong, radius max 2px, hairlines never
shadows, no illustrations, no photographs, no drawn characters, marks are
Ink-2. Every rule is a rule about restraint. There is not one rule in the
system about reward, escalation or surprise, so the system has exactly one
emotional register and a first win renders in the same language as a lost rep.

Duolingo is not retentive because it is colourful. It is flat most of the time
and then detonates for two seconds. The missing thing is not colour, it is a
**second register the system is permitted to enter briefly and then leave.**

---

## 2. The doctrine fix that makes the rest legal

§07 says outcome is never scored. But the loudest visual state in the product
is keyed off `session.won` — the outcome. The design system currently
celebrates the one thing the product says does not count, and stays flat for
the thing it says does.

**Fire the big moment on a personal-best composite, not on a win.**

Three things follow, and the first one is the product's whole thesis finally
landing as a feeling rather than as a paragraph:

- It can fire **after a rejection**, which is what §07 has been claiming in
  words since the spec was written.
- It fires far more often than a win, so the loop gets a pulse.
- It is on-doctrine, so it is allowed to be as loud as the design needs.

Every finding below assumes this. Without it, R3 and R13 are a rule violation;
with it, they are the rule working.

---

## 3. Findings, in leverage order

### R1 · Free has no repeatable core action  ·  **decided 3 Sep: no change** · pricing decision, not code

`repsPerDay: 0`. See §1. This is D11 working as designed and the retention cost
was never priced in beside the compute cost.

The cheapest resolution that keeps D11's argument intact is **one voice rep a
week on free** rather than none: roughly $0.60 a month per free user against
$2.64 for the daily grant it replaced, and the weekly cadence pairs with the
Sunday letter instead of fighting it. A weekly rep is a habit; a single
lifetime rep is a demo.

Whatever is decided, decide it — every other finding here is an optimisation of
a loop that free users are currently not allowed to run.

> **Decided on 3 September: it stays at zero.** D11 stands as written on 31
> August, and this is a decision rather than a deferral — the weekly grant was
> put and declined.
>
> What that costs is exactly what §1 says it costs, and it is worth leaving
> stated rather than quietly closing the finding: every mechanic below is an
> optimisation of a loop a free account runs **once**, on day zero. R2's unlock
> sheet, R3's personal-best beat, R8's meter and R12's record against her all
> fire on the sign-up rep and then have nothing to act on again until somebody
> pays. They are not wasted — a paying account meets all of them from rep two
> onwards, and the sign-up rep is now a considerably better advertisement than
> it was — but nobody should read this list later and conclude the free loop
> was fixed. It was not; it was decided against.
>
> **What the decision made necessary.** If free is never going to run the loop,
> the one thing it must do is *ask* — and on 3 September it largely did not.
> Train's primary button read `Talk to Nadia in text` and a character's page
> read `Talk to her in text`, both routing straight there with the offer as a
> muted footnote underneath. That is the right shape for a paying account at
> the end of its day (F-14, and §14's rule that running out must never read as
> losing the account) and exactly the wrong one for an account whose reps never
> come back; the two states had been sharing one branch.
>
> They are separated now: a free account gets the ask with text as the second
> option, a paying one out for today still gets text with no ask at all, and
> the end of a text scene — the moment somebody has just met the ceiling of the
> free tier while enjoying it — offers the rep out loud. The surfaces are listed
> in `PAYMENTS-NEW-INTEGRATION.md` §5.2. **None of it is a gate**: the lock is
> still `mayOpenSession` and nothing else (rule 9).
>
> What is not negotiable if this is ever revisited: `repsPerDay` is not copy.
> It is the voice paywall itself (`CLAUDE.md` rule 9), enforced by `consumeRep`
> and `mayOpenSession`, mirrored in `entitlements.reps_per_day` on every
> existing row, and claimed in three places a merchant-of-record reviewer reads
> — `/pricing`, terms clause 07 and `PAYMENTS-NEW-INTEGRATION.md` §11. Moving
> it is a migration, a public-site copy change and a revision to the record Whop
> approved us against, in one commit.

### R2 · No new user can ever see an unlock  ·  **shipped 3 Sep** · ~half a day

`UNLOCK_RULES` in `lib/data/progression.ts` is `{1: null, 2: null, 3: {...}, 4:
{...}}` — levels 1 **and** 2 are open from the start. `LEVEL_COPY[1]` and
`LEVEL_COPY[2]` in `components/modals.tsx` both read "Open from the start" and
never fire. The first unlock a user can possibly reach is Level 03, gated
behind two graded reps at 70+ on Level 02.

So the product's answer to *"maybe I'll try level two to get that feeling"* is
that there is no feeling to get: Nadia was always there, and nothing was earned
by arriving at her.

**Lock Level 02 behind one qualifying rep against Tess.** Tess was authored to
be winnable by somebody who has not yet decided whether this product is for
them (`lib/personas/tess.ts`) — which makes her the right gate, not the wrong
one. The unlock sheet then fires on rep one to three, the user feels the
mechanic once, and the ladder becomes something with rungs instead of a list.

Note the interaction with `rankFor` in `lib/data/rank.ts`, which keys ranks off
tiers *cleared* rather than tiers *open*, specifically so that a tier being
open mints nothing. Gating tier 2 does not disturb that; it makes it truer.

**Shipped.** `UNLOCK_RULES[2] = { level: 1, reps: FIRST_UNLOCK_REPS }` — one
qualifying rep, not two, because the free grant is a single voice rep ever (§14)
and a two-rep gate is one the account standing at it cannot pay.
`LEVEL_COPY[2]` has real copy for the first time and now lives in
`lib/data/level-copy.ts`, read by both the unlock sheet and the roster (R9).
`recordUnlocks` already filtered on `UNLOCK_RULES[tier] !== null`, so the sheet
fires with no change to `syncLevel`. `rankFor` is untouched and asserted so.

**One thing the finding did not anticipate, found by looking at the real
account.** The gates name only the tier directly below, so once tier 2 was
gated an account with two qualifying reps at tier 2 and none at tier 1
satisfied tier 3 and failed tier 2 — the roster drew **Maya and Robin open with
Nadia locked between them**. `unlockedLevels` now closes the ladder
*downwards*: everything below the highest open tier is open. Downwards rather
than upwards, because §08 says a tier only ever opens and closing upwards would
take a character away from somebody who had already earned her.

### R3 · The win screen and the loss screen are the same screen  ·  **shipped 3 Sep** · ~2 hours

`ResultScreen` (`components/screens/session-screens.tsx:96`) emits
`result-page--win` and `result-page--loss`. **Neither class is styled.** Grep
`app/globals.css`: there is `.result-page`, `.result-page h1`, `.result-page >
p`, and nothing else. The two outcomes differ only by a dimmed orb, a volt
headline, and which figures are printed.

The highest-effort moment in the product resolves into a layout that does not
know what happened.

With R2's doctrine fix in place, `.result-page--best` gets the one-shot beat:
volt wash over the ground at low opacity, orb bloom, a hairline sweeping out
from centre, ~1.2s, settling back to sober. Reuse the kit's `land` cue
(`lib/audio/kit.ts`), which is the chord already authored for a number
landing. **Do not add a haptic** — `lib/haptics.ts` ships exactly three
patterns on the stated argument that "a product with six vibration patterns has
one vibration pattern that nobody can tell apart". Reuse `open` or use none.

`prefers-reduced-motion` finishes it on first paint, per §02.

**Shipped.** Three grounds — `--win` (a low volt wash), `--near` (amber, R4) and
`--loss` (a heavier vignette and an Ink headline) — plus `--best`, which is the
one-shot beat: a volt wash over the ground, an orb bloom and a hairline sweeping
out from centre, 1.2s, settling back to sober. `BestBeat` owns it, it is
`aria-hidden`, it reuses the kit's `land` chord, it adds **no haptic**, and the
reduced-motion block removes it outright.

`personalBest` is a composite strictly greater than every previously graded rep,
read from `useSessionHistory` with the current rep excluded by id — and from
`useScorecard` as well as the session row, so it lands when the grade does
rather than on the next visit. It requires a previous score to exist: a first
rep is a baseline, and spending the product's one loud moment on a tautology
would teach the user to ignore it.

**One thing that was not in the finding: the win headline is Ink now, not
volt.** Arena allows volt once per screen and this screen spends it on the
primary action, so the headline and the button were both wrong at once — and
§07 says outcome is worth zero, which makes painting *She gave you her number*
in the accent colour the design system scoring the result. That is the exact
substitution §2 moves the loud moment off.

### R4 · The near-miss has no screen of its own  ·  **shipped 3 Sep** · ~3 hours

`resultReading` (`lib/data/rep-rules.ts`) already computes `close` and
`lateSurge`, and the copy written for the late surge — *"you got there, just
after she had answered"* — is the most motivating sentence in the product. All
of it renders into the same layout as a total whiff.

When `close <= 8`, give it its own treatment: headline **"Four points"** rather
than "She left", amber rather than the loss ground, and **`Run it back` promoted
to primary and first** with `See breakdown` second. A near-miss is the single
most motivating state the product can produce and it is currently
indistinguishable from indifference.

**Shipped, and it went into `rep-rules.ts` rather than into the component.**
`resultReading` returns `close` and `nearMiss`, `NEAR_MISS_POINTS` is 8, and
both are tested with the rest of the format — this is a rule about what the
product says happened, and rule 3 of `CLAUDE.md` says those are pure functions
with tests. A **late surge is always a near-miss** however the arithmetic falls
(`close` is negative there) and gets its own headline, *Thirty seconds late*,
because "minus seven points" is not a sentence. `pointsShort` spells the number
— *Four points*, *One point* — which is the one place in the product a numeral
is deliberately written out, because this one is said rather than measured.

### R5 · The first rejection has no treatment at all  ·  **shipped 3 Sep** · ~2 hours

Statistically the most likely outcome of rep one, and the highest-churn moment
in the product. There is a `FirstWinSheet` and no counterpart.

One sheet, once ever, on the first loss: *"That's the rep. This one is supposed
to happen."* This is also the better home for `ScorecardExplainerSheet` —
§12 calls that sheet "load-bearing for retention" and it currently waits for a
scorecard the user may only reach after a win they may never get. A user who
learns that a clean rejection scores 92 **at the moment they were rejected** has
learned the product; one who learns it after a win has learned a footnote.

**Shipped.** `FirstLossSheet`, carrying the scorecard explainer's whole
argument. The two sheets share one stamp — `markScoringExplained` writes both
keys and either sheet's gate reads both — so nobody is told the product's
central rule twice in ninety seconds. It waits for the transcript before it
fires: *"this one is supposed to happen"* is the worst possible sentence to show
somebody whose microphone never worked, and that screen is a different one.

### R6 · Nothing recalls the user  ·  **shipped 3 Sep — needs two secrets set** · ~1 hour for the letter, ~half a day for the first email

The Sunday letter is built and unscheduled (§1). The GitHub Actions workaround
already reasoned through in `LAUNCH-GAP.md` — a workflow curling
`/api/cron/weekly-review` hourly with `CRON_SECRET` as a bearer token — is an
hour of work and it is the cheapest retention point on the board. It also
closes the pricing-page claim that currently promises the letter to free
accounts.

Then one email: streak-at-risk, or today's field challenge. Resend is already
wired for `lib/email/trial.ts`. This is the missing organ, and it is a larger
lever than anything visual in this document.

**Shipped, and dormant until somebody sets two secrets.**
`.github/workflows/cron.yml` runs hourly at seven past and curls both routes
with `CRON_SECRET` as a bearer token — the first of the three ways out
`LAUNCH-GAP.md` named, taken as written. The URL names `www` deliberately and
the workflow does not follow redirects, so the apex 308 fails loudly rather than
quietly succeeding against the wrong host (`CLAUDE.md` rule 13).

The email is `/api/cron/streak-nudge`, and the rules are pure functions in
`lib/data/nudge.ts`: 19:00 in the user's own clock, a one-hour window rather
than "at or after" (an open-ended condition fires again at 20:00, 21:00 and
midnight), a streak of at least two, never on a day a rep or an ask has already
claimed, and at most one per user per local day — stamped in `ui_flags` **before**
the send, because a missed nudge is recoverable and a duplicate is not. The copy
names today's field challenge as the cheapest thing that keeps a day, carries an
unsubscribe line, and is asserted never to threaten the streak or shame the
absence (§4).

**Still owed, and it is not code:** `CRON_SECRET` as a GitHub Actions secret
(the same value as the Vercel env var), and `RESEND_API_KEY` on Vercel. Without
the first, both routes answer 401; without the second, every send is a logged
no-op. Nothing goes out to anybody until both are set.

### R7 · The in-app half has no monotonic counter  ·  **shipped 3 Sep** · ~half a day

`rejectionsCollected` proves the mechanic works. Mint the in-app equivalent:
reps run, or minutes under pressure. Never resets, never goes down, shown on
Train beside the streak — and, critically, **printed on the loss screen**:
`Rep 7 · 19 minutes under pressure`. A number that went up because you showed
up, on the screen where you lost, is this product's entire argument in one line.

**Shipped.** Both: `LifetimeStats.totalMs` is summed alongside `totalReps`, and
`lib/data/counters.ts` owns the sentence with tests — including that it floors
at one minute rather than printing `0 minutes` after a fifty-second rep, because
a counter whose first increment is zero is not believed afterwards. It prints on
every result screen and sits on Train directly under the streak, which is the
whole point of the placement: one of those two resets and one of them never
has.

### R8 · The unlock requirement is a sentence, not a meter  ·  **shipped 3 Sep** · ~3 hours

`unlockRequirement` returns `Score 70+ in 2 reps at Level 02` — static copy,
identical before and after the rep that advanced it. Replace with a meter
(`1 of 2 reps at 70+ on Level 02`) and render it **on the result screen after
every rep**, so the user watches it move because of what they just did. A bar
that advanced is the reason somebody runs one more.

**Shipped.** `unlockProgress` / `unlockProgressLabel` / `nextUnlockProgress` in
`progression.ts`, tested, capped at the gate (four qualifying reps is not "4 of
2"). The result screen builds it from history **plus the rep just run**, so the
bar has already moved by the time it is first drawn; the roster draws the same
meter under a locked tier. Ink, never volt: the screen has already spent its one
accent on the headline or the action, and a meter is information.
`unlockRequirement` stays for the two places with no counts to hand, and it
pluralises now — it said `1 reps` the moment tier 2 got a gate.

### R9 · Locked characters are a chevron  ·  **shipped 3 Sep** · ~half a day

`LevelSection` in `components/screens/core-screens.tsx` collapses a fully
locked tier into a `locked-level` button: a padlock, a name, a requirement
string and a chevron. Curiosity is the pull, and it is being hidden.

Show the orb, the setting, the hook, and why she is harder. The bodies in
`LEVEL_COPY[3]` and `[4]` are the best persuasive writing in the codebase —
*"she is polite the whole way through and never says anything cutting, and that
is the hard part"* — and they are shown only **after** the unlock, at the exact
moment they have stopped being persuasive. Move that copy in front of the gate.

**Shipped.** `.locked-level` is gone. A locked tier renders as a tier: the mark,
the name, a LOCKED chip, the tier's own body copy, each character's orb, name,
setting and hook, and R8's meter under it. The copy moved to
`lib/data/level-copy.ts` and both readers — the unlock sheet and the roster —
take it from there, so a tier cannot argue one thing on the way up and another
on arrival. Nothing here is a spoiler: the hook and the setting are what the
brief opens with anyway, and knowing who is up there is the entire reason to
want her.

### R10 · A win mints nothing  ·  **shipped 3 Sep** · ~1.5 days

She never speaks digits (product law, §07/`rep-rules.ts`) — but a win can mint
an **object**. A card in Arena styling: her name, the setting, the date, the
duration, one line of what worked. It lands with the win and it goes to a shelf
on Profile.

This is the strongest "I want another" mechanic available, because it is a
collection rather than a badge shelf, it is diegetic, and **the roster is
finite** — four characters, four cards, and you can see the hole where Robin's
is not. §08's "rail rather than a badge shelf" objection does not apply: a rail
says where you are, a badge says you have one, and a collection with visible
gaps says what is missing.

Guardrail: it is a record of a rep, not a relationship. Name, level, time,
date, one line. Route it through `assertPublishable` (`lib/share/cards.ts`) like
every other published artefact, and it stays clear of §16's companion-app
framing — which §14 says is a payment account waiting to be closed.

**Shipped** as the contact shelf on `/profile`: four slots, one per roster
character, in ladder order, filled or empty. `lib/data/records.ts` assembles it
from history — derived, never stored, so it cannot be written by anybody
including its owner, which is §14's rule applied to the one artefact here
somebody would most want to fake. The record is the rep that **cleared** her
rather than the best one since: a shelf that swaps in a better rep every time
you beat yourself is a leaderboard against yourself, and the date on it stops
meaning anything.

The guard runs on every visible string and a refused line is **dropped while the
record stands** — the opposite direction from a share card, and deliberately: a
card that cannot be made is simply not made, while a record already earned must
not vanish because a model wrote an awkward sentence about it. The empty slot is
labelled `Level 03`, never `Level 03 cleared`, because a card contradicting
itself is the one thing a record cannot afford.

### R11 · The memory line is invisible where it would do work  ·  **shipped 3 Sep** · ~2 hours

`lib/grade/memory.ts` produces one line a character keeps about the encounter,
and it renders on her detail page and the brief. Put it on the **win screen**:
*"She'll remember: you told her about the boat."* It implies a next time, it is
already built and already guarded, and continuity is the cheapest return hook
in the product.

Separately: a sheet the first time a memory actually lands in a live rep. The
memory system is genuinely differentiated and currently only visible to someone
who goes looking for it.

**Shipped**, with one correction the finding did not have. The line is written
by the same action that writes the grade, so `usePersonaMemory` resolved before
it existed and would have handed back **whatever she remembered from last
time** — a continuity feature telling a lie. The result screen re-reads it when
the scorecard lands and only prints a line whose `lastSeenAt` is at or after
this rep's start.

The second half was already built: `MemoryLine` on the brief fires a
first-ever sheet off `PersonaMemory.firstEver`. Nothing was owed there.

### R12 · Personal bests are stored and barely surfaced  ·  **shipped 3 Sep** · ~2 hours

`PersonaProgress` carries `bestWarmth` and `bestTimeMs`. `bestTimeMs` renders
only once she has been won; the roster card shows `BEST WARMTH nn` as a record
string.

Two uses, both free:

- **Win screen:** `2:14 — 31 seconds faster than your best against her.`
- **Loss screen:** score against yourself, not the threshold. `41 — your best
  against her is 38` is a number that went up. `41 / 65` is a number that lost.
  Same data, opposite emotion. Keep the threshold; demote it.

**Shipped, and it does not read `PersonaProgress`.** That table has already been
updated with the rep being shown by the time the result screen opens, so "your
best against her" would have silently included the rep you are looking at. It is
computed from session history with the current rep excluded by id.

The threshold is kept and demoted into the sentence rather than deleted — it is
still what decided the rep. And a rep that beat the previous best says so, which
is the motivating half: a rep that lost is still allowed to be the best you have
managed against her.

### R13 · The design system has no second register  ·  **shipped 3 Sep** · rule amendment + ~3 hours

See §1. The fix is not a second accent — that would wreck the thing that makes
Arena look good. It is a bounded exception, written into `CLAUDE.md` beside the
rule it qualifies:

> Volt appears once per screen. **The exception is an earned moment** — a
> personal best, a rank, an unlock, a milestone — which may take the full frame
> in volt for under two seconds before returning to sober.

One component, one rule amendment, no palette change, no illustrations.

**Shipped, as written.** The amendment is in `CLAUDE.md` immediately under the
volt rule, and it names what may take the frame, for how long, and what removes
it. One component — `BestBeat` — one rule, no palette change, no illustration,
and it is keyed to a personal best rather than to `session.won`, which is what
makes it legal at all.

### R14 · The streak save is invisible  ·  **shipped 3 Sep** · ~2 hours

§14's rule that running out must never break the streak is implemented — a
field challenge keeps the day — and **nobody is ever told**. That is a streak
freeze that costs no consumable and no economy, and it is currently a silent
database behaviour.

Say it when it happens: *"Day 6 kept."* Say it before it happens, on Train,
after 20:00 local with nothing logged: *"Day 6. Nothing logged yet."* One line,
one button.

**Shipped, both halves.** `recordTrainingDay` returns whether **this** call
claimed the day, `logAsk` passes it back as `streakKept`, and the field flow
says `Day 6 kept.` in place of its generic toast — only when the ask is what
kept it, so somebody who trained at breakfast is told nothing. On Train,
`StreakAtRiskCard` appears after 20:00 in the browser's own clock when the day
is unclaimed and there is a streak to protect: one line, one button, and it
disappears the moment the day is claimed.

**A bug fell out of building it.** `streaks.current` is only rewritten when
somebody trains, so an account idle for a fortnight still held the number it
stopped on — Train showed a live six-day streak to somebody who had broken it
two weeks earlier, and the audit's own "the streak is silently zero" was true
only in the database. `currentStreak` in `lib/data/counters.ts` reads it as
broken when the last active day is older than yesterday. The row is left alone:
`longest` is history, and the write path is service-role for the reason §14
gives.

### R15 · There is no comeback screen  ·  **shipped 3 Sep** · ~3 hours

Return after seven or more days away and the product behaves as though nothing
happened, except the streak is silently zero. *"You're back. Your streak is
gone; the reps aren't"*, over the lifetime counters from R7. Almost nobody
builds this screen and it is the cheapest win-back there is — and it is the one
place a lost streak can be made to read as a fact rather than a punishment.

**Shipped** as `ComebackCard` on Train, off `UserState.lastTrainedOn` at seven
days or more, over R7's counters. It and the streak-at-risk card are mutually
exclusive by construction — somebody back after a fortnight does not also need
to be told tonight's streak is at risk; it is already gone, and saying so twice
is the guilt copy §4 rules out. No "we missed you", nothing that scores the
absence.

### R16 · `verdict` is smaller than the number it explains  ·  **shipped 3 Sep** · ~1 hour

`ScorecardScreen` derives `Sloppy / Solid / Sharp / Clean` from the composite.
It is the most human word on the screen and it renders as `display-md` beneath
a `composite` numeral. Invert them: the word is the hero, the 78 is the
footnote. A number is a measurement; a word is a verdict, and people come back
for verdicts.

**Shipped, and the word climbs.** It is derived from the counting value rather
than from the final composite, so `Sloppy → Solid → Sharp` resolves over the
same nine hundred milliseconds and lands in volt with the kit's `land` chord.
Volt moved from the numeral to the word, which keeps the accent count at one and
puts it on the thing people actually read.

### R17 · The loss screen makes you leave to find out what to change  ·  **shipped 3 Sep** · ~1 hour

`tryNext` and `missionFor(focus)` already exist on the scorecard. Surface one
sentence of it on the result screen. Nobody should leave a loss without knowing
what to do differently — that currently costs a click, taken at the lowest
motivation point in the entire loop.

Also: the loss screen's `Run it back` walks a free or spent account into a
refusal. `ScorecardScreen` already solved this by opening `PaywallSheet`
instead; the result screen did not get the same fix.

**Shipped.** `MissionNote` — the same one sentence Train, the brief and the live
rep carry — renders on every result screen that is not a win, from the scorecard
the screen is already waiting on. And `Run it back` opens `PaywallSheet` for a
voice-locked account rather than walking it into a refusal, which is the fix the
scorecard already had.

---

## 4. What must not be built

These are refusals, not omissions, and they should stay refusals.

- **Confetti, mascots, illustrated characters.** `VISUAL-AUDIT.md` §1 rules them
  out, and it is right: §14's merchant-of-record reviewer opens `/`, and the
  seriousness of the visual language is part of what makes the positioning
  survive that reading. Every finding above adds motion, weight and timing
  rather than pictures.
- **Leaderboards or any social ranking.** A shame dynamic, aimed at a user
  whose presenting problem is fear of judgement.
- **Loss streaks, guilt copy, or anything that punishes absence.** Duolingo's
  guilt mechanics work because the task is zero-stakes. This one already costs
  the user courage; charging them shame on top of it is how a training product
  becomes a thing people avoid.
- **A fourth haptic pattern.** `lib/haptics.ts` caps at three on a stated
  argument. Reuse or omit.
- **Anything that scores the outcome harder.** R3's doctrine fix moves the
  celebration *off* the win precisely so the rest of this list can exist.

---

## 5. The open strategic question

A gym is open-ended, daily, streak-shaped and subscription-forever. A program is
finite, has an ending, and produces a before and an after.

The architecture here is a gym: daily quota, streak, rank rail, roster. The
value proposition is a program: fix my approach anxiety. And the two most
compelling artefacts in the whole build are both program artefacts — the
**week-four baseline re-test** ("same character, same three minutes, the only
thing that has changed is you") and the **predicted-versus-actual anxiety gap**
on `/field`. Those are the two things that would make somebody tell a friend,
and one of them is on a side page behind several logged entries.

A gym has to invent a reason to come back tomorrow. **A program has one built
in: you are in the middle of it.** Nobody quits on day six of thirty.

Worth deciding rather than drifting: whether the first month is framed as *The
30-Day Run* — a visible finite path, the sign-up rep as day zero, the re-test as
day thirty, the anxiety gap as the headline proof, and the roster and rank as
what opens after. It also resolves a tension the current framing will hit
eventually, which is that a user who gets better in eight weeks and cancels is a
success for them and churn for the business. A program can sell the
transformation and then sell the next one. A gym has to pretend it is infinite.

This is not a ticket. It is the question the rest of the list is downstream of.

> **Reviewed 3 September and deliberately left unanswered.** Put alongside R1
> when the rest of this list shipped, and held open on purpose — so nobody
> reading this later mistakes silence for a decision the way the weekly cron was
> once "deferred rather than decided" and then simply forgotten.
>
> Nothing that shipped on 3 September forecloses it. The counters (R7), the
> comeback screen (R15) and the contact shelf (R10) all read the same way under
> either framing; the baseline re-test and the anxiety gap — §5's two strongest
> artefacts — were untouched. Whoever takes this takes it whole, and the first
> thing to write is what day 0 and day 30 actually are, and what the roster and
> the rank rail become on day 31.

---

## 6. Suggested order

> **All of it except R1 shipped on 3 September, in this order.** R1 was then put
> and decided — no change — and §5 was put and held open. **Nothing on this list
> is outstanding as work.** The two things still owed are not code: `CRON_SECRET`
> as a GitHub Actions secret and `RESEND_API_KEY` on Vercel, without which R6's
> letter and nudge are built and silent. See R6.

Cheap and structural first, because R1 and the §5 question are decisions rather
than tasks and should not block the rest.

1. **R2** — lock Level 02. The unlock mechanic starts existing.
2. **R3** — style the two result variants, with the §2 doctrine fix.
3. **R4** — the near-miss screen.
4. **R5** — the first-rejection sheet, and move the scorecard explainer onto it.
5. **R6** — schedule the letter; then the first email.
6. **R17**, **R12**, **R16** — an afternoon between them.
7. **R7**, **R8** — the counters that move.
8. **R10** — the contact shelf.
9. **R1** and §5 — decide, in that order.
