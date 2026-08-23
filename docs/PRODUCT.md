# What the product is, and what a user sees

Three tracks, one engine. This is the shape decision, written down so the next
five screens do not each invent their own answer.

## The tracks

| Track | Status | What a rep is | Win condition |
|---|---|---|---|
| **Dating** | Built. The product. | Three minutes against one of eight characters | Her number, offered by her at the end when the meter earned it |
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
- **Outcome is not the score.** A rep that ends with no number can still score
  92. The scorecard grades process — talk ratio, question rate, open/closed,
  filler control, longest monologue, response latency, plus the judgement layer
  — and the win is a story, not a grade (§07).

## The ladder

Eight characters, one per level (§06), two per visible tier:

| Tier | Level | Character | Scene | Skill trained |
|---|---|---|---|---|
| 1 — Receptive | 1 | Nadia | Bookshop | Speaking out loud at all |
| | 2 | Priya | Gym floor | Asking a second question |
| 2 — Neutral | 3 | Maya | Coffee shop | Not running dry at ninety seconds |
| | 4 | Jules | Bar, with a friend | Earning attention in twenty seconds |
| 3 — Resistant | 5 | Erin | Train platform | Opening with something worth answering |
| | 6 | Sam | House party | Warming up a guarded person |
| 4 — Hostile | 7 | Robin | Hotel lobby | Reading ambiguous interest correctly |
| | 8 | Alex | Gallery opening | Being told no, and exiting well |

Tiers 1 and 2 are open from the start. Tier 3 costs two wins at tier 2; tier 4
costs three at tier 3. Unlocks are derived from the reps you have actually won,
not stored, so they cannot disagree with your own history. Level 8 is
unwinnable by construction — Alex's ceiling is 45 and the number is at 65 —
because a level where charm always eventually works teaches that persistence is
the answer.

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
| **Roster** | The progression map: eight characters, four tiers, locked ones showing what they cost. | The thing to come back for. Also the only place difficulty is ever discussed. |
| **Field** | One real-world move a day, hand-written, tiered. | The sim is practice; the field is the point. |
| **Profile** | History, lifetime stats, the warmth chart, subscription, settings. | Everything numeric lives here so that Train can stay one action. |

**There is no dashboard, and Train is not one.** A wall of charts on the home
screen is a screen you can look at instead of training. The charts are one tap
away in Profile, where looking at them is a deliberate act.

The interview track swaps Train for its own home (role, job description, CV,
custom questions, interviewer) and keeps Roster and Profile. The switch lives
in the shell, and `profiles.active_track` remembers it.

## What is not on the roadmap for the MVP

- Coaching during a rep. Timer, ring, mission. Nothing else (§05).
- A visible warmth number above tier 3. The digits come off at level 4; the
  band stays. Reading a person is the skill.
- Model-generated field challenges. Hand-written and human-reviewed, worst
  realistic outcome a polite no (§09).
