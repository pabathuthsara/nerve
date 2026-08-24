# What the product is, and what a user sees

Three tracks, one engine. This is the shape decision, written down so the next
five screens do not each invent their own answer.

## The tracks

| Track | Status | What a rep is | Win condition |
|---|---|---|---|
| **Dating** | Built. The product. | Three minutes against one of three characters | Her number, offered by her at the end when the meter earned it |
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

## The ladder

Three characters, one per rung, one rung per visible tier:

| Tier | Level | Character | Scene | Skill trained |
|---|---|---|---|---|
| 1 — Receptive | 1 | Nadia | Bookshop | Speaking out loud at all |
| 2 — Neutral | 2 | Maya | Coffee shop | Not running dry at ninety seconds |
| 3 — Ambiguous | 4 | Robin | Hotel lobby | Reading ambiguous interest correctly |

**Why three and not §06's eight.** Eight thin characters is worse than three
that hold up. The persona contracts are the one part of this product that can
only be fixed by running reps against them — schema, RLS, grading and the field
loop are all verifiable at a desk, and a character is not. Eight characters is
eight tuning surfaces, and §17's calibration gate is twenty transcripts in
total, which spread across eight is two or three each and proves nothing about
any of them. Concentrated on three it is roughly seven each. The other five are
retired rather than deleted: still authored, still in the repo, unpublished in
the database so every rep anybody ran against them stays readable. Filed as
drift in `LAUNCH-GAP.md` §4.

**The rungs are 1, 2 and 4 of the engine's eight, and the gap is deliberate.**
A level's difficulty curve IS the trajectory of the character who holds it, so
the three rungs above are three authored, tuned, tested curves rather than a
new scale nobody has run a rep against. Maya moved down from rung 3 to rung 2
and Robin down from rung 7 to rung 4, taking the curves already authored for
those rungs; both keep everything that makes them who they are, because
difficulty is layer 1 and character is layer 2 (`PERSONA.md`). Robin sits at 4
rather than 3 because §12 takes the warmth digits off the screen from level 4 —
the top rung is where the user should be reading a person instead of a meter,
which is precisely her skill.

Tier 1 and tier 2 are open from the start. **Tier 3 costs two reps scoring 70+
at tier 2** (§08) — the score, never the outcome. A clean rep that ended in
rejection can score 92 and advance you; a lucky one that got her number and
scored 54 does not. Unlocks are derived from the reps you have actually run,
not stored, so they cannot disagree with your own history.

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
3. **The questionnaire, four screens.** What are you training for → what is the
   hard part → how often do you do this for real → microphone check. Every
   answer is written to the profile as it is given, not batched at the end.
4. **Straight into a rep.** Nadia, level 1, framed as a measurement rather than
   a test. Level 1 is nearly impossible to fail on purpose: first-session
   drop-off is where apps in this category die.
5. **Result → scorecard.** The number or the exit line, then the breakdown.

Then, from that point on, four sections and nothing else:

| Section | What it is | Why it exists |
|---|---|---|
| **Train** | Today's rep, chosen for you. Plus today's field move and your last result. | The decision about who to face is the part people use to avoid the rep. One action, one screen. |
| **Roster** | The progression map: three characters, three tiers, locked ones showing what they cost. | The thing to come back for. Also the only place difficulty is ever discussed. |
| **Field** | One real-world move a day, hand-written, tiered. Plus rejections collected, the predicted-versus-actual chart, and the log. | The sim is practice; the field is the point. The chart is the one place a number is allowed to argue with the user, because it is their own. |

**The field's four tiers no longer ride on the sim ladder alone.** T1 is day
one, T2 opens on rung 2, T3 on rung 4 — and **T4 is earned in the field**: the
top rung plus five distinct days on which a tier-3 ask was actually made. Days
rather than asks, because five asks in one brave afternoon is one exposure and
habituation is repetition over time. Asks made rather than accepted, per §09.

Three sim rungs cannot earn four field tiers, and this is the better answer
rather than the one that fitted: gating the hardest real-world ask on gym
performance said that being good at talking to a synthetic character earns the
right to approach a person. Doing the smaller thing, repeatedly, is what earns
it.
| **Profile** | History, lifetime stats, the warmth chart, the field summary, shared cards, subscription, settings. | Everything numeric lives here so that Train can stay one action. |

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
