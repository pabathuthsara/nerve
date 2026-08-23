# The persona schema

Four layers, because they answer four different questions and were previously
tangled into one flat record that argued with itself.

| Layer | Question | Changes with |
|---|---|---|
| `trajectory` | how warmth **moves** | the level |
| `personality` | **who** she is | the character |
| `gated` | what warmth **unlocks** | the character |
| `room` | **where** it happens | the scene |

One engine serves every character, level and track because only layer 1 changes
with difficulty and only layer 2 changes with who she is.

## The rule that makes it work

**There is no friendliness dial. Friendliness IS warmth.** A separate parameter
for it creates two systems arguing over the same behaviour, which is how round 6
produced a character who obeyed neither.

The same rule applies to reply length: the warmth band owns it, and nothing
else may mention it. `talkativeness` is the one personality dial about verbosity
and it is deliberately absent from the steering item, living in the character
contract instead where it describes disposition rather than word count.

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
[<band directive> <expression> <up to 2 personality clauses> <up to 2 unlocked gates>]
```

Appended as a conversation item, **never** written into the system prompt — the
character contract is the cached prefix and round 5 paid 2.9× for a response
after rewriting it mid-session. Capped at 340 characters and asserted at every
warmth for every character, because a directive that grows with the persona is
one that quietly doubles the cost of a long rep.

Locked behaviours are not mentioned at all. Telling a model what it may not do
invites it to think about doing it, and every word is charged on every later turn.

## Trajectories

|  | Nadia (L1) | Alex (L8) |
|---|---|---|
| start | 32 ± 6 | 5 ± 5 |
| gain | 1.1 | 0.4 |
| decay | 0.5 | 2.0 |
| decayPerTurn | 0.2 | 0.6 |
| maxGainPerTurn | 4 | 3 |
| sessionCeiling | 85 | 45 |
| hardCeiling | 100 | **45** |

**Alex is unwinnable by design.** ENGAGED begins at 60 and her hard ceiling is
45, so no sequence of user turns reaches the warm bands. That is the point of
level 8: being told no and exiting well is the skill, and a level where charm
eventually works would teach that persistence is the answer.

### The round-9 retune, applied

Config was still reading `start 15 / gain 0.6 / decayPerTurn 0.5`, which is why
five minutes of good play only reached 47 — every turn paid half a point back
before it was scored and the gain could not outrun it. Level 1 must be nearly
impossible to fail, and a meter that will not move for a user doing everything
right teaches the wrong lesson.

Measured after the retune, on a scripted good-player run:

| turns | warmth | band |
|---|---|---|
| 5 | 51 | OPEN |
| 10 | 66 | ENGAGED |
| 20 | 84 | INVESTED |

A flat player stays under 30. Alex tops out at 45 however long the rep runs.

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
