# What the product is, and what a user sees

Three tracks, one engine. This is the shape decision, written down so the next
five screens do not each invent their own answer.

## The tracks

| Track | Status | What a rep is | Win condition |
|---|---|---|---|
| **Dating** | Built. The product. | Three minutes against one of four characters | Her number, offered by her at the end when the meter earned it |
| **Interview** | Screens built, engine shared, characters unwritten (M4) | Eight minutes against an interviewer you configure | A callback, decided by the grade rather than in the room |
| **English** | Later. Not started. | — | — |

One warmth engine, one scoring system, one transcript shape across all three.
Only the label changes: `TRACK_LABELS` maps warmth → *Warmth* / *Impression* /
*Engagement*, and the engine never learns which track it is in. That is why
adding the interview track is characters and a setup flow, not a second engine.

## The dating rep, exactly

- **Three minutes.** Hard. `DATING_DURATION_MS`, enforced in the session hook
  and asserted in `lib/data/rep-rules.test.ts`. The rep runs its full length
  whether it is going well or badly — winning early does not end it, because a
  good rep should not be a short rep.
- **The goal is her number.** Not "a good conversation" — a number, or she
  leaves. The brief screen says so before the rep starts.
- **The number is decided at the wind-down and offered by her.** Warmth 65 arms
  the rep, silently — no indicator, no sound, nothing. Thirty seconds from the
  end she is told one of two things: wind down and leave, or wind down and
  offer him your number. Which one depends on whether she was ever armed and is
  still at 55 or above. Ten points of hysteresis, because interest does not
  work like a switch.
- **Her closing line is allowed to finish.** The clock reads 0:00 and the
  conversation is over; she gets up to twenty seconds to land the last
  sentence. Cutting off the best moment in the product to save model time would
  be a strange trade.
- **She never speaks digits.** The number on the card is ours, so what is said
  and what is shown cannot contradict each other.
- **The result screen shows the reading the decision was made on**, which is not
  where the meter finished. Warmth can keep climbing through the last thirty
  seconds of a rep she has already been told to leave — that is the commitment
  rule working — so a screen showing the final number against the threshold
  reads as a win that was refused. `resultReading` in `lib/data/rep-rules.ts`
  picks the honest one and names the late-surge case.
- **Outcome is not the score.** A rep that ends with no number can still score
  92. The scorecard grades process — talk ratio, question rate, open/closed,
  filler control, longest monologue, response latency, plus the judgement layer
  — and the win is a story, not a grade (§07).

## Text mode is the same character without the microphone

`/text/[personaId]`. The same compiled contract, the same steering vocabulary,
the same one line she carries between reps — typed.

- **No microphone, no clock, no meter, no score, and no quota.** It is the
  on-ramp for somebody who is not ready to speak out loud yet, and it is what is
  still open when the day's voice reps are gone. When they are, `/train`'s
  primary action becomes this rather than a dead OUT OF REPS.
- **It can never produce a number.** Warmth in text follows the character's own
  authored trajectory and is capped below `ARM_THRESHOLD`
  (`lib/text/warmth.ts`), so she cannot be armed and there is no win to take.
  The offer is the voice rep's payoff, and a payoff farmable in a mode with no
  cost is a payoff worth nothing.
- **It does not judge what was said.** Neither warmth pass runs: the model one
  costs money in a mode that promises not to, and the local one reads pause
  length, filler rate and hesitation off timings a typed message does not have.
  Text tracks only that the conversation is continuing, which is the one thing
  it can honestly observe.
- **She remembers, and start fresh is two promises, not one.** The memory line
  is shown at the top. Start fresh clears the conversation, and offers
  separately to clear what she remembers — restarting a chat that went badly is
  not the same as asking her to forget the bookshop.

## Voice is sold by the account, not by the day

**Free grants no voice reps.** It keeps every part of the product whose marginal
cost is approximately zero — the field challenges, the log, the
predicted-versus-actual chart, text mode against the same characters, the
streak, the history, the transcripts and the Sunday letter — and it does not
include a microphone. Pro is three voice reps a day at $19; Elite is six at $49.

**The one exception is the sign-up rep: one voice rep, once per account.** It
runs during onboarding, against Tess, who is authored to be won. Nobody should
be asked to decide about a voice product they have never heard, and a written
description of what she sounds like would be advertising our own prose.

This replaces the day-one grant of three reps, which shipped on 25 August. That
decision was right about the arc — fail, adjust, succeed cannot happen inside
one attempt — and wrong about who pays for it: free was also one rep a day
forever, so day one's three was the loud half of a recurring cost of about
$2.64 a month for a user who never paid. The arc is what Pro is *for* now. The
reasoning in full is `PAYMENTS-NEW-INTEGRATION.md`; the drift entry is **D11**
in `LAUNCH-GAP.md`.

The grant is held on `entitlements.onboarding_rep_used_at`, which has no user
write path, so abandoning and resuming onboarding cannot mint a second one. It
is additive and spent last, so refunding a rep that recorded no speech gives it
back — a free account's only voice rep must not be lost to a muted microphone.

**Running out still never breaks the streak** (§14). A field challenge keeps the
day, on every plan, which is the difference between a paywall and a churn event.
A paid plan starts with a seven-day free trial; the card is authorised at the
start and charged at the end, the date is on screen the whole time, and
cancelling is a button rather than an email.

## The ladder

Four characters, one per rung, one rung per visible tier:

| Tier | Level | Character | Scene | Skill trained |
|---|---|---|---|---|
| 1 — Open | 1 | Tess | Launderette | Saying the first thing at all |
| 2 — Receptive | 2 | Nadia | Bookshop | Speaking out loud without help |
| 3 — Neutral | 3 | Maya | Coffee shop | Not running dry at ninety seconds |
| 4 — Ambiguous | 4 | Robin | Hotel lobby | Reading ambiguous interest correctly |

**Why four and not §06's eight.** Eight thin characters is worse than four that
hold up. The persona contracts are the one part of this product that can only be
fixed by running reps against them — schema, RLS, grading and the field loop are
all verifiable at a desk, and a character is not. Eight characters is eight
tuning surfaces, and §17's calibration gate is twenty transcripts in total,
which spread across eight is two or three each and proves nothing about any of
them. Concentrated on four it is about five each. The other five are retired
rather than deleted: still authored, still in the repo, unpublished in the
database so every rep anybody ran against them stays readable. Filed as drift in
`LAUNCH-GAP.md` §4.

**The ladder is contiguous, and only became so on 31 August.** A level's
difficulty curve IS the trajectory of the character who holds it, so a rung with
nobody on it falls back to its nearest neighbour's curve rather than to an
interpolation nobody designed — and the roster was 1, 2, 4 with nothing at 3.
Tess was authored for the sign-up rep, took rung 1, and closed the gap: Nadia
moved to 2 and Maya back to 3, which is the rung she was originally authored at.
Nobody's numbers changed. `lib/warmth/levels.ts` builds the level→trajectory map
off the roster rather than keeping a parallel table, so renumbering the
characters renumbered the curves and nothing else, because difficulty is layer 1
and character is layer 2 (`PERSONA.md`). Robin stays at 4 because §12 takes the
warmth digits off the screen from level 4 — the top rung is where the user
should be reading a person instead of a meter, which is precisely her skill, and
that rule now lands on exactly the character it was written for.

Tier 1 and tier 2 are open from the start. **Tier 3 costs two reps scoring 70+
at tier 2, and tier 4 two at tier 3** (§08) — the score, never the outcome. A
clean rep that ended in rejection can score 92 and advance you; a lucky one that
got her number and scored 54 does not. Unlocks are derived from the reps you
have actually run, not stored, so they cannot disagree with your own history.
Robin's gate is unchanged by the renumber: it was two qualifying reps against
Maya before and it is two qualifying reps against Maya now.

**Tier 1 is winnable by design, and still has to be won.** Tess arms four turns
into a three-minute rep for somebody who says four real sentences. Fifteen turns
of flat, dead-end replies leave her at 46.5 — under the 65 that arms a rep and
under the 55 that keeps it — so a rep in which nothing was said produces no
number even at the bottom of the ladder. If those two ever collapse into one,
the win teaches nothing and the user knows it.

**The top rung is hard, not sealed.** Robin's ceiling is 95 and the number is
at 65, and eighteen turns of good play lands her at 59 — a merely competent rep
never arms her, and sustained perfect play eventually does. That is the
difference between a rung and a wall, and it is why she took the rung-4 curve
rather than keeping rung 7's `hardCeiling: 88`, which no three-minute rep could
move at all. **What the roster no longer contains is a level that cannot be won
by construction.** Alex's ceiling was 45 against a 65 line, and §06 is right
that a ladder where charm always eventually works teaches persistence is the
answer — so the lesson now has to be carried by Robin ending in a polite no
most of the time, and by the field track, rather than by a character who is
sealed. She is still authored and still tested; she is not shipped.

**She cannot be talked into it early, and being asked never ends the rep.**
The number is decided once, at the wind-down, and nothing before that moment can
produce one — not a direct request, not a warm meter. Asking at 2:17 gets a
deflection and the conversation carries on. This is enforced in the compiled
contract rather than in the persona files, because it is the format and not a
character trait. It had to be: seven characters used to carry an exit condition
that fired when they had "offered to swap numbers", so a user could end their
own rep early simply by asking, and be told "She left" by a character who had
just said yes.

**A rung has to cost something, and rep length is what sets the price.** The
per-turn gain cap is the dial that decides how much ground a long run of good
turns can bank, and it is a function of how long the rep is rather than of who
she is. When the rep went from two minutes to three it was left alone, and five
extra turns lifted every rung by the same ten points — enough to move the fixed
65 line from just above Level 1 to below Level 3, so one performance suddenly
cleared three rungs instead of one. The per-level dials were monotonic
throughout; that is not sufficient. **Change the rep length and re-check which
rungs a strong player can arm**, which `lib/warmth/engine.test.ts` now asserts
at three different turn counts.

## What a user sees, in order

1. **Landing** — what this is, and the one honest sentence about it.
2. **Sign up** — email + password, or Google.
3. **The questionnaire, five screens.** What are you training for → what is the
   hard part → how often do you do this for real → what should she call you →
   microphone check. Every answer is written to the profile as it is given, not
   batched at the end, and the guard resumes at the first unanswered step.

   **Every one of them is spent.** The hard part decides the first character,
   the first field challenge and the technique card on the brief before any rep
   is graded (`lib/data/focus.ts`). The name is what §08's `usesYourName` dial
   opens onto — she learns it the ordinary way, when he says it or when they
   have met before. The name step is skippable; the skip is recorded so it is
   never asked twice.
4. **Straight into a rep** — or into text, from the same screen. Tess, level 1,
   framed as a measurement rather than a test. Level 1 is nearly impossible to
   fail on purpose: first-session drop-off is where apps in this category die.
   This is the one free voice rep the product gives away, and it is a real rep
   at a real rung — which is what keeps the §08 week-four re-test comparing like
   with like rather than measuring the gap between two characters.
5. **Result → scorecard.** The number or the exit line, then the breakdown.

Then, from that point on, five sections and nothing else:

| Section | What it is | Why it exists |
|---|---|---|
| **Train** | Today's rep, chosen for you. Plus today's field move and your last result. | The decision about who to face is the part people use to avoid the rep. One action, one screen. |
| **Roster** | The progression map: four characters, four tiers, locked ones showing what they cost. | The thing to come back for. Also the only place difficulty is ever discussed. |
| **Field** | One real-world move a day, hand-written, tiered. Plus rejections collected, the predicted-versus-actual chart, and the log. | The sim is practice; the field is the point. The chart is the one place a number is allowed to argue with the user, because it is their own. |
| **Library** | Fourteen hand-written cards, grouped by the sub-score each one moves — one card, one section — with next/previous, a read mark, and "Run a rep on this" at the bottom of every one. | Where the scorecard's advice goes, and where it comes back from. Nobody opens this wanting "an opener" — they open it having just scored 42 on signal reading, which is why it is filed by score and not by kind. Read the technique, immediately try it, against the character that card is actually for. |

**The field's four tiers no longer ride on the sim ladder alone.** T1 is day
one, T2 opens on rung 2, T3 on rung 4 — and **T4 is earned in the field**: the
top rung plus five distinct days on which a tier-3 ask was actually made. Days
rather than asks, because five asks in one brave afternoon is one exposure and
habituation is repetition over time. Asks made rather than accepted, per §09.

Gym rungs cannot earn the last field tier, and this is the better answer
rather than the one that fitted: gating the hardest real-world ask on gym
performance said that being good at talking to a synthetic character earns the
right to approach a person. Doing the smaller thing, repeatedly, is what earns
it.
| **Profile** | History, lifetime stats, the warmth chart, the field summary, shared cards, subscription, settings — and the door to `/progress`. | Everything numeric lives here so that Train can stay one action. |

**The rank rail is the slow number.** Four ranks — Rookie, Regular, Contender,
Closer — on Train, above the day's counters. The level moves when you unlock a
character; the rank moves when you have proven you can hold one, and the last
of them is earned *at* the top rung rather than above it, because there is
nothing above Robin to unlock. §08 asks for a rail rather than a badge shelf, so
every rank is drawn including the ones not reached, and the next one names its
price.

**`/progress` is one tap from Profile and nowhere else.** The composure trend,
the six sub-score lines, the filler and talk-ratio history, and the Sunday
letters. Under three graded reps it says what unlocks it rather than drawing a
trend through two points (§15).

**There is no dashboard, and Train is not one.** A wall of charts on the home
screen is a screen you can look at instead of training. The charts are one tap
away in Profile, where looking at them is a deliberate act.

The interview track swaps Train for its own home (role, job description, CV,
custom questions, interviewer) and keeps Roster and Profile. The switch lives
in the shell, and `profiles.active_track` remembers it.

## The things that bring somebody back

Four, deliberately, so that none of them has to carry it alone:

| | What it is | When |
|---|---|---|
| **The streak** | A rep or a logged ask. The field carries the day when voice minutes are gone (§14) | Daily |
| **Character memory** | One line she still has in mind, cleared with one tap | Next rep |
| **The Sunday letter** | Stats plus hand-written sentences, on *your* Sunday morning | Weekly |
| **Then and now** | Your first rep against your latest, sub-score by sub-score | Day 28 |

The last is the one planted furthest ahead: the first session is framed as a
measurement rather than a test, which makes it valuable on day one and worth
coming back for four weeks later.

**Difficulty adapts underneath all of it, and says so in one direction only.**
Two strong reps make her harder and you may be told; two weak ones ease her back
and you are never told, by anything, ever (§08, §12).

## What is not on the roadmap for the MVP

- Coaching during a rep. Timer, fluid persona, mission. Nothing else (§05).
- A visible warmth number on the top tier. The digits come off at level 4,
  which is where Robin stands; the band stays. Reading a person is the skill.
- Model-generated field challenges. Hand-written and human-reviewed, worst
  realistic outcome a polite no (§09).
