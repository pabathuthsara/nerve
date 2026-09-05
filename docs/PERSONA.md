# The persona schema

Four layers, because they answer four different questions and were previously
tangled into one flat record that argued with itself.

| Layer | Question | Changes with |
|---|---|---|
| `trajectory` | how warmth **moves** | the level |
| `personality` | **who** she is | the character |
| `gated` | what warmth **unlocks** | the character |
| `room` | **where** it happens | the scene |
| `want` | what she is **after** | the character |
| `sceneBeats` | what the room **does to her** | the scene |

One engine serves every character, level and track because only layer 1 changes
with difficulty and only layer 2 changes with who she is.

## `want`, and why it is not gated

Every other field describes how she responds. None of them gave her anything she
was after on her own account, so outside the warm bands she was a pure
responder — she answered, forever, and never once steered. `initiatesTopics`
unlocks at warmth 70, which on levels 3 and up is not reachable inside a
three-minute rep, so for most of the roster that gate never opened at all.

A character who only ever answers is the most recognisable tell there is.

`want` is therefore **not** gated on warmth. Wanting something is not a reward
for good play, it is the baseline condition of being a person. What warmth
changes is the direction of it:

| Warmth | The clause |
|---|---|
| < 20 | it pulls her away from him, and she may say so |
| 20–59 | it is still there, and he is a reason to put it off |
| 60+ | she brings him into it |

## `sceneBeats`

Her availability used to change only in response to the user. Erin has a train
in four minutes and it never arrived; Jules's friend never came back. Two or
three authored beats per character now fire on the rep's own clock, as fractions
so the same beat lands proportionally in a three-minute rep and an eight-minute
one, and always clear of the wind-down — the closing direction owns the last
thirty seconds and two instructions arriving at once is an argument this
codebase has already had.

Nothing about a beat touches warmth. It is a fact about the room; how she takes
it is hers. That is also what makes it a training signal, because recovering
from an interruption you did not cause is most of what actually happens in a bar.

## The rule that makes it work

**There is no friendliness dial. Friendliness IS warmth.** A separate parameter
for it creates two systems arguing over the same behaviour, which is how round 6
produced a character who obeyed neither.

The same rule applies to reply length: the warmth band owns it, and nothing
else may mention it. `talkativeness` is the one personality dial about verbosity
and it is deliberately absent from the steering item, living in the character
contract instead where it describes disposition rather than word count.

**But coldness is not expressed as syllables.** CLOSED used to be "one to four
words" and GUARDED "three to eight". On levels 5 and up the meter never leaves
those bands inside three minutes, so an entire rep was a stranger who could not
form a sentence — and "What?" does not read as a distracted commuter, it reads
as a broken character. A cold band now withholds what coldness actually
withholds — curiosity, volunteering, softening, follow-ups — while leaving her
enough words to sound like a person who simply is not interested. The caps still
climb monotonically (6 → 10 → 12 → 14 → 15 → 15) and the warm bands are
untouched, because those were tuned against real reps and round 6 lives at that
end.

## The optional fields, and why nobody uses one

Added 1 September for Tess (`PERSONA-AUDIT.md`), and **every one of them is
unused as of 2 September**. They were built on the theory that the shared band
table was overwriting a character authored against its grain. It was not: Nadia
runs that table with no overrides and is the character people enjoy, so the
overrides were what made Tess read as an AI rather than what would have fixed
her. She is now Nadia's contract in a launderette and carries none of them.

They stay on the schema because they are the right shape for a character who
genuinely needs one, and because every one defaults to the behaviour that was
already there. `lib/personas/tess.test.ts` asserts that **every persona leaves
every one of them undefined** — that assertion is the point, so a future session
trips over the lesson rather than rediscovering it.

| Field | Overrides | Why a per-character field |
|---|---|---|
| `disposition` | the compiler's banded disposition line | `trajectory.start` is a DIFFICULTY dial and was being read as a temperament. There is no value of it that produces both a rung-1 curve and a character glad to be spoken to: "genuinely pleased" needs `start > 66`, and `start + jitter` must stay under `ARM_THRESHOLD` (65) |
| `bandDirectives` | the shared band table | The band table is a personality and it is Nadia's. It still owns reply length — this changes *which table she is read from*, not how many systems get an opinion |
| `postureMode` | `absolute` posture reading | `openingAffect` opens comfort 15+ above warmth for every start below 50, which is the whole roster, so `at-ease` fired on turn one of every rep. `relative` measures against the opening spread, so a posture can only mean "this moved" |
| `moods` | nothing; adds `# Today, specifically` | The steering line is deterministic in warmth, so a rep inside one band carries one instruction start to finish. A mood changes what she has to talk about and **never** what she gives |
| `room.place` | `sceneId(room)` in prose | The scene id is an audio lookup. With ambient beds off it returns the impulse response, which put Tess in a bookshop because that is whose reverb her launderette borrows |
| `steerHeartbeatTurns` | `STEER_HEARTBEAT_TURNS` (4) | Drift is proportional to the room the band gives her — measured, 16-20 words on a reminded turn and 26-30 on an unreminded one. A wider band without a shorter heartbeat is a wider band she ignores, so this and `bandDirectives` are one setting |
| `verbosityMedian` | `DEFAULT_VERBOSITY_MEDIAN` (12) | The M0 gate counts sustained length as a frame break. Set above the REALISED output of her widest band, not above the cap, or it reports her own band back at her |
| `contract(…, { punctuation })` | `PUNCTUATION_RULES` | The shared block is two rules under one heading. The em-dash line is a TTS artefact fix and is forever; "short sentences" is a rhythm, and it was the last place Nadia's cadence reached the whole roster |

**None of these is a friendliness dial and none may become one.** The rule above
stands. `disposition` is a hand-authored sentence replacing a worse machine-
generated one about the same thing; it does not move warmth, and the character
who has one still opens below the arm line like everybody else.

## Personality is arithmetic, not adjectives

Layer 2 described eight characters in detail and then moved none of them: the
engine read `trajectory` and nothing else, `scoreFast` took a level. So all
eight were **moved by identical arithmetic** — a joke landed on Nadia (humour
60) for exactly what it was worth on Alex (humour 30).

`lib/warmth/temperament.ts` is the seam. Four multipliers, derived from dials
that were already authored:

| Multiplier | From | What it decides |
|---|---|---|
| `penalty` | `patience` | what a misstep costs. Nadia charges 0.7×, Alex 1.25× |
| `genericGain` | `distraction` | what an *unspecific* good turn earns — a distracted character has to actually be reached |
| `liking` | `humour` | how fast she warms to **him** rather than to the conversation |
| `comfort` | `patience` | how quickly she settles |

Deliberately narrow. Every multiplier stays inside a band where a well-played
rep still clears the same rungs — this makes the ladder *feel* different at each
step, it does not re-tune it. `engine.test.ts` checks the rungs still separate at
12, 15 and 18 turns with the real personalities attached.

`penalty` is also where the nervousness question is settled. A short reply costs
−3 and a streak another −4, and our user is nervous by definition — short replies
are the symptom the product exists to treat. A flat penalty made every character
coldest exactly when the user was struggling most. Whether she softens or hardens
is now a property of her, which is what `patience` always claimed to be.

## Three axes

Warmth on its own can only say "more open" or "less open". A stranger runs at
least three semi-independent states, and the interesting part is that they
**conflict**:

| Axis | Question | Moves |
|---|---|---|
| `warmth` | do I want to keep talking to you | the headline number; every threshold, band and stored column reads it |
| `comfort` | do I feel at ease | falls hard on anything that misjudges the distance, recovers slower than interest |
| `liking` | do I like **you**, rather than the subject | slowest and least volatile; moved mostly by being picked up on |

Interested but not at ease is the intense stranger. At ease but bored is the nice
person you have nothing to say to. Likes him but guarded is half of everyone.
None of those is reachable with one number.

They reach her as a **posture**, never as numbers — the same rule warmth has
always followed — and the posture clause is silent when the three agree, which
is most turns. An overreach is charged mostly to comfort rather than to interest:
somebody who misjudges the distance does not make you less curious about them,
they make you less at ease, and splitting those is what lets a rep recover from
one clumsy line without pretending it did not happen.

## The sharpness curve

```
effectiveSharpness = sharpness + sharpnessLowWarmthBoost * max(0, (30 - warmth) / 30)
```

A stranger who is already cold is sharper than a neutral one. The boost fades
linearly to zero at warmth 30 and contributes nothing above it, so a warm
character is never retrospectively made cutting. Nadia's base 20 reaches 35 at
warmth 0 — sharper, but never *cutting*; that is a different character.

## Steering

One bracketed line, composed from all four layers and injected before every
reply:

```
[<band directive> <posture, if the axes disagree> <repair, if open>
 <want> <up to 2 personality clauses> <up to 2 unlocked gates>]
```

Appended as a conversation item, **never** written into the system prompt — the
character contract is the cached prefix and round 5 paid 2.9× for a response
after rewriting it mid-session.

**Assembled against a budget rather than truncated**, in the priority order
above: the band always survives, and anything that does not fit whole is
dropped. That is a quality rule before it is a cost one — the worst line the
composer could produce before `assemble` existed was 595 characters of stacked
imperatives, and eight simultaneous directions are obeyed about as well as none.
The ceiling is 420 characters, asserted across every character × every warmth ×
every posture × the repair flag.

**Sent when it changes, not on every turn.** It used to fire on every VAD speech
start — including noise bursts and turns deleted milliseconds later as echo —
and the composed line is deterministic within a band, so a rep accumulated
fifteen near-identical copies of the same stage direction. Repeating an
instruction fifteen times is how you make a model *more* mechanical, not less:
she flattened out as the conversation went on, which is the opposite of warming
up. `directiveIfChanged` sends it on a change, with a heartbeat every four turns
so she cannot drift far from it. Total context spent on steering went down even
though the line got longer.

Locked behaviours are not mentioned at all. Telling a model what it may not do
invites it to think about doing it, and every word is charged on every later turn.

## Casting

`voice.timbre` is what the character *is*; `voice.ids.openai` is the voice she
is actually rendered in. Nothing compared them until 4 September, and for as
long as Maya has stood at rung 3 she has been a woman rendered in a man's voice.

| | Tess (L1) | Nadia (L2) | Maya (L3) | Robin (L4) |
|---|---|---|---|---|
| voice | `sage` | `marin` | `coral` | `alloy` |
| pace | 1.02 | 1.0 | 1.0 | 0.98 |
| generation | legacy | **current** | legacy | legacy |

**OpenAI ships exactly two current-generation voices and only one is a woman.**
`marin` and `cedar` arrived with `gpt-realtime` and are the two the vendor
recommends; the other eight are the older set, restated in that generation but
not rebuilt. Nadia holds `marin`. There is no second one to give anybody else,
which is the whole reason the roster does not simply move to the best voices —
*there is one*, and it is taken.

That scarcity is what produced the bug. Maya was moved off `coral` to `cedar`
because `coral` was reported as distorted and `cedar` was new, and the note
recorded only its novelty. `cedar` is the male half of the pair. The distortion
was really the cancelled-audio fault fixed in the same change (`AUDIO.md`), so
the reason to leave `coral` had already evaporated. She is back on it.

Two invariants now hold this, both in `conformance.test.ts`:

- **Every character is cast explicitly, and never twice.** Falling through
  `VOICE_BY_TIMBRE` is a failure, not a default — Alex once landed on Maya's
  voice that way, and Robin and Nadia were once both `marin`.
- **No `feminine` character is cast on a masculine voice.** The list is `ash`,
  `ballad`, `cedar`, `echo`, `verse` — deliberately only the unambiguous ones,
  by ear, since OpenAI publishes descriptions and not genders. `alloy` is left
  out as genuinely androgynous rather than quietly reclassified to keep Robin
  green, which means **Robin's casting is an open question and not a passing
  one**: she is `timbre: 'feminine'` on the most neutral voice in the set.

The first test could not have caught the second bug. `cedar` was named
explicitly and was unique, so the casting was deliberate — and wrong.

## Trajectories

### The shipped ladder

Four characters since 31 August, on engine rungs 1 to 4 — **contiguous for the
first time**, so no rung falls back to a neighbour's curve any more. It was
three (1, 2 and 4) from 24 August. The reasoning is in `PRODUCT.md`; the
decision and what it costs are D10a in `LAUNCH-GAP.md`, and Tess's own reason
for existing is `PAYMENTS-NEW-INTEGRATION.md` §4.

|  | Tess (L1) | Nadia (L2) | Maya (L3) | Robin (L4) |
|---|---|---|---|---|
| start | 48 ± 6 | 32 ± 6 | 28 ± 6 | 20 ± 6 |
| gain | 1.8 | 1.1 | 1.0 | 0.8 |
| decay | 0.3 | 0.5 | 0.7 | 1.1 |
| decayPerTurn | 0.1 | 0.2 | 0.25 | 0.35 |
| maxGainPerTurn | 4.5 | 3.5 | 3.2 | 2.7 |
| sessionCeiling | 85 | 85 | 82 | 78 |
| hardCeiling | 100 | 100 | 100 | 95 |

**Nobody carried a curve with them.** Maya and Robin took the curves already
authored for their rungs when the roster shrank in August, and Nadia and Maya
each moved down one when Tess took the bottom — and in both cases the numbers in
their files never changed. That is the four-layer schema doing its job: a rung
is a difficulty curve, a character is everything else, and `lib/warmth/levels.ts`
builds the level→trajectory map off the roster rather than keeping a parallel
table, so renumbering the characters renumbers the curves. Robin is still the
character whose `signalClarity` is 20 — reading her is exactly as hard as it was
at rung 7.

`maxGainPerTurn` is the dial that makes Tess legible rather than merely
generous. The cap clips every strong turn for most of a rep, so a high `gain`
under Nadia's 3.5 cap would have been generosity the user could not see moving.

Good play against each, at twelve seconds a turn, arming at 65:

| turns | Tess | Nadia | Maya | Robin |
|---|---|---|---|---|
| 12 | 85.0 | 67.4 | 61.4 | 48.1 |
| **15** — the three-minute rep | **85.0** | **72.6** | **67.0** | **53.9** |
| 18 | 85.0 | 76.8 | 71.6 | 58.9 |
| 24 | 85.0 | 83.2 | 78.6 | 67.0 |

Tess is at her session ceiling from about turn 10, which is the point: she arms
on **turn four**, under a minute into a three-minute rep, so a first-timer who
manages four real sentences has won before the rep is a third done.

**Easy is not automatic, and that is the line this character is balanced on.**
The same fifteen turns of *flat* play — "Yeah, a lot of stuff." every time —
leave her at 46.5, below both the 65 that arms a rep and the 55 that keeps it.
So a rep where nothing was said does not produce a number, on the easiest rung
on the ladder, and the meter is what tells the user the difference. Both halves
are asserted in `engine.test.ts` rather than left as an intention.

The top rung is **hard and not sealed**: Robin cannot be armed by a merely
competent rep, and sustained perfect play does eventually reach her. Asserted
in `engine.test.ts`.

### The retired extreme

Alex is no longer on the roster. She is still authored, still tuned, and still
what exercises every clamp in the engine — `engine.test.ts` drives her
directly, and a test asserts her curve never leaks back onto a rung a user can
be routed to.

|  | Nadia (L1) | Alex (retired, L8) |
|---|---|---|
| start | 32 ± 6 | 5 ± 5 |
| gain | 1.1 | 0.4 |
| decay | 0.5 | 2.0 |
| decayPerTurn | 0.2 | 0.6 |
| maxGainPerTurn | 3.5 | 2.4 |
| sessionCeiling | 85 | 45 |
| hardCeiling | 100 | **45** |

**Alex is unwinnable by design.** ENGAGED begins at 60 and her hard ceiling is
45, so no sequence of user turns reaches the warm bands. That was the point of
level 8: being told no and exiting well is the skill, and a level where charm
eventually works would teach that persistence is the answer. **The shipped
roster no longer contains that level**, which is the real cost of the shorter
roster and is argued out in `LAUNCH-GAP.md` D10a.

### The round-9 retune, applied

Config was still reading `start 15 / gain 0.6 / decayPerTurn 0.5`, which is why
five minutes of good play only reached 47 — every turn paid half a point back
before it was scored and the gain could not outrun it. Level 1 must be nearly
impossible to fail, and a meter that will not move for a user doing everything
right teaches the wrong lesson.

Measured on a scripted good-player run, at twelve seconds a turn — so fifteen
turns is the three-minute rep:

| turns | warmth | band |
|---|---|---|
| 5 | 48.5 | OPEN |
| 10 | 64.2 | ENGAGED |
| **15** | **75.2** | **ENGAGED** |
| 20 | 82.6 | INVESTED |

A flat player stays under 30. Alex tops out at 45 however long the rep runs.

`maxGainPerTurn` came down across the whole roster when the rep went from two
minutes to three — it is the one trajectory dial that is a function of rep
length rather than of who she is. See `PRODUCT.md` for why, and
`lib/warmth/engine.test.ts` for the assertion that keeps it honest.

## What the format owns, and the persona does not

Exit conditions are authored per character; the number is not. A character may
decide she is leaving — her friend arrived, three dead ends, a crossed boundary
— and that is who she is. Whether she gives her number is the rep format, and it
belongs to `rep-rules.ts` and the wind-down directive.

Seven characters used to blur that line with an exit condition reading "You have
offered to swap numbers and said goodbye". It looked like a character trait and
behaved like a format rule with a hole in it: a user could ask at any point, get
a polite yes, and trip the exit — ending the rep before the only window in which
the number can legitimately be given. The condition is gone, and the replacement
is compiled into every dating contract rather than authored into any of them.

The test is worth keeping: **if the user can trigger it, it is not a character
trait.**

## The fifth thing, which is deliberately not a layer

`memorySummary` is one optional line on the persona, injected by
`compileInstructions` under a `# You have met before` heading — so both
compilers carry it and neither had to be taught how. It is not a layer because
it does not describe her: it is a fact about one user's history with her, it is
per-user where all four layers are global, and it is written by the grader
rather than authored in the repo.

Which makes it the one place a persona can be handed text nobody reviewed, and
therefore the one place with a filter in front of it. `lib/grade/memory.ts`
rejects second person, affection and anticipation, and judgement about how he
did, and drops anything that fails. **Scene continuity, never affection**:
remembering the blue book is a character, being pleased to see you is a
companion app, and §14 records that every merchant of record on the shortlist
bans those by name.

A persona carrying no memory is told nothing at all — the heading only appears
when there is a line under it, because "you have met before" followed by silence
invents a history she does not have.

## Track-neutral naming

The engine variable is always `warmth`. Only the label changes: **Warmth**
(dating), **Impression** (interview), **Engagement** (language). Renaming the
variable per track would mean three engines; renaming the label means one engine
and a lookup. The UI reads the label, the engine reads the variable.

## A bug this refactor surfaced

`bandFor` selected on `value >= min && value <= max` against integer bounds and
fell back to `'OPEN'` when nothing matched. Warmth is continuous, so **every
fractional value in a seam missed all six bands**: 19.5, 39.5, 59.5, 79.5 and
−0.5 all came back OPEN, and −0.5 is as cold as the meter goes.

That was not a display problem. `bandDirective` reads it, so a character at 19.5
— CLOSED, "one to four words" — was handed the OPEN directive: one sentence,
twelve words, volunteer something. It is a strong candidate for the round-6
symptom where she gave 16.5 median words against a contract asking for four to
ten.

Bands are now half-open intervals selected on `min` alone, scanning downward,
which covers the range with no gaps by construction and cannot fall through.
