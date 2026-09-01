# Persona audit — why Tess feels robotic and Nadia does not

> ## ⚠️ The central claim in this document is wrong. Read §7 first.
>
> This audit argued that the shared band table is "Nadia's personality" and was
> overwriting any character authored against its grain. Everything measured in
> §3 is accurate and every seam it names is real. **The conclusion drawn from
> them was not.**
>
> On 2 September the person who has actually talked to both characters said
> Nadia is fun and Tess still read as an AI — after all of §5 had shipped.
> Nadia runs the shared table with none of the overrides Tess was given. So the
> table was not what flattened Tess; it is most of what makes Nadia good, and
> the overrides were the thing to remove.
>
> **Tess is now Nadia's contract in a launderette**, on the rung-1 curve, with
> every override deleted. §7 has the reversal, the measurement, and what
> survived. §3 is kept unedited because the seams it documents are genuine and
> two of them were real bugs — but do not act on §5 without reading §7.

**Short answer.** Tess's prose is not the problem. Every layer *around* her
prose is tuned to Nadia, and five of them silently overwrite what Tess's
contract says she is. Two of the five are roster-wide and one of those is bad
enough that every character on the ladder opens every rep being told, in so
many words, that she is not interested.

The live warmth engine is not short of soul. It computes three affect axes, a
posture, a repair window, breakthroughs, per-character temperament and scene
beats. Almost none of that reaches the character. Everything the engine knows
collapses, at the last inch, into one bracketed line whose only real variable
is a word cap between four and fifteen. **The soul is already being computed.
It has nowhere to go.**

Measured, not asserted: for a plausible median first-timer — polite, short
replies, no open questions, no callbacks — a fifteen-turn Tess rep produces
**one distinct steering line**. Not one per band. One, total.

---

## 1. How the character is actually assembled

Worth having in one place, because the defects below are all seams between
these and not faults inside any of them.

| Piece | Owner | What it decides |
|---|---|---|
| `contract` | hand-authored, in the persona file | who she is: history, mood, agenda, what earns and loses her warmth |
| `compileInstructions` | `lib/voice/openai/persona.ts` | appends a **derived** behaviour block — disposition, effort, distraction, clarity, patience — banded off layer 1 and layer 2 numbers |
| `composeSteering` | `lib/warmth/steering.ts` | the one bracketed line injected before each reply: band · posture · repair · want · personality · gates |
| `BANDS` | `lib/warmth/bands.ts` | how much she gives, expressed as a word cap and a question permission |
| `WarmthEngine` | `lib/warmth/engine.ts` | where the meter is, and everything that moves it |

Two house rules govern the seams, and both are already written down:

1. **Only one system may own reply length.** The band owns it. Round 6 had the
   contract and the band both specifying it, they disagreed, and the model
   produced a third answer nobody asked for.
2. **There is no friendliness dial. Friendliness is warmth.** A second
   parameter for it would be two systems arguing over one behaviour.

Both rules are correct. Every defect below is a case of the same failure they
were written to prevent, appearing somewhere nobody was looking for it.

---

## 2. What I think of the existing personas

**Nadia is genuinely good, and part of why is luck.** Her authored self is
quiet, flat, half-attentive, doesn't ask things, lets sentences trail off. The
band table's whole expressive range — four to fifteen words, no questions until
warmth 60 — *is that person*. She is the character the bands were tuned
against, so the bands read as her personality rather than as a constraint on
it. Nothing is fighting her. Every line of her contract survives to the model.

**Tess is the first character authored against that grain, and she is the one
that broke.** Her contract says warm, quick, a little too honest, laughs at her
own remarks, carries the conversation, delighted to be spoken to. The
surrounding machinery then tells her, on every turn, to say one sentence of
fourteen words, ask him nothing, and that she is comfortable but not
interested. The model splits the difference between two characters and you get
neither. That is exactly what "robotic" sounds like.

This is worth stating as a general principle rather than as a Tess bug:

> **The band table is a personality, and it is Nadia's.** Any character whose
> authored self differs from "quiet, clipped, doesn't ask things" is partially
> overwritten by it, in proportion to how far she differs.

Maya and Robin are affected less than Tess only because they are closer to
Nadia in temperament. Robin, whose lesson is reading whether a no is a no,
arguably *benefits* from the flatness. Tess is the maximum-distance case, which
is why she is the one that reads as broken.

**The roster's dials are also finer than the machinery that reads them.** Tess
and Nadia differ on five personality numbers — patience 90/80, distraction
8/15, talkativeness 66/56, humour 74/69, sharpness 12/20. Compiled, those five
differences produce **zero** difference in prose: every one lands in the same
three-way bucket. Their derived behaviour blocks are byte-identical except for
one line, and that line is wrong for Tess (§3.2). Somebody tuned five numbers
and the pipeline read none of them.

---

## 3. The defects, ranked

### 3.1 — Every character opens every rep being told she is not interested
**Roster-wide. This is the worst one.**

`openingAffect` deliberately starts comfort well above warmth: a stranger in a
public place is not hostile, she is unavailable. Correct, and well argued in
`affect.ts`. It computes `comfort = min(70, 45 + 0.4 × start)`.

`postureOf` then reads any comfort more than 15 above warmth as `at-ease`, and
`postureClause` emits:

> *"Comfortable, not interested. Easy and unhurried, and ask him nothing."*

`comfort − warmth = 45 − 0.6 × start`, which exceeds 15 for **every start below
50** — that is the whole shipped roster:

| | start | opening comfort | opening posture | clears at warmth |
|---|---|---|---|---|
| Tess | 48 | 64.2 | `at-ease` | 49.2 |
| Nadia | 32 | 57.8 | `at-ease` | 42.8 |
| Maya | 28 | 56.2 | `at-ease` | 41.2 |
| Robin | 20 | 53.0 | `at-ease` | 38.0 |

So every rep in the product opens with that clause, sitting directly after a
band directive that *already* forbids questions, and it is the highest-priority
optional clause in the line. A struggling user never clears it.

For Tess this is the exact inversion of her character. Her contract's premise
is that she is bored and interested; the clause says comfortable and not.

Two correct modules composing into a third instruction nobody wrote — the same
failure as round 6, one layer further out. **A posture is supposed to mean
"these axes have moved apart during play."** Right now it means "they were
authored apart", which is not news about anybody.

*Fix:* measure posture against the **opening spread**, not against zero.
`postureOf` should take the opening affect as a baseline so a posture fires
only on divergence the conversation actually produced. Alternative, cheaper and
blunter: suppress the posture clause for the first N turns. The first is
correct; the second is a patch.

*Blast radius:* all four personas, in the direction of removing a line none of
them should ever have had. Re-measure with the stability harness before and
after.

---

### 3.2 — Tess's compiled prompt contradicts her contract, in the section that comes after it
**Tess only, and structurally unfixable by tuning.**

`compileInstructions` derives a disposition line by banding `trajectory.start`:

```
start ≤ 33  → "You are guarded. Warmth has to be earned and you give it slowly."
start ≤ 66  → "You are neither pleased nor annoyed to be spoken to. Neutral, and it moves slowly."
start > 66  → "You are genuinely pleased to be spoken to and it shows immediately."
```

Tess opens at 48, so she gets the middle line. Her contract, printed a few
paragraphs above it, says:

> *"Somebody talking to you is the best thing that has happened this afternoon
> and you are not going to pretend otherwise."*

The derived line comes **after** the authored one, and later instructions win.
She is told she is delighted, then told she is neutral.

She also cannot be tuned out of it. The "genuinely pleased" line needs
`start > 66`; `roster.test.ts` requires `start + startJitter < ARM_THRESHOLD`
(65), because a character who opens above the arm line hands out a win nobody
earned. **There is no value of `start` that produces both a rung-1 difficulty
curve and a character who is pleased to be spoken to.**

The root cause is a category error: `trajectory.start` is a *difficulty* dial
being used as a proxy for *temperament*. How fast warmth accrues and how she
feels about being approached are different questions. Tess is the proof — she
is delighted to be talked to *and* gives little away at first, because she is
delighted and does not know him. Both are true and the schema cannot say so.

This does **not** need a friendliness dial, which the architecture rightly
bans. The character already states her disposition, in better words, in
`# Your mood right now`. The derived line is a lower-resolution copy of
something already present that can only ever agree or contradict.

*Fix, minimal (recommended first):* an optional `disposition?: string` on
`Persona` that replaces the derived line when present. Only Tess sets one.
Every other compiled prompt stays byte-identical.

*Fix, principled (later, measured):* delete the derived disposition line
entirely and let `# Your mood right now` own it — one place, hand-authored,
per the rule the codebase already follows for reply length. For Nadia, Maya and
Robin the derived line currently agrees with their prose, so this should be
close to a no-op; "should be" is why it needs the harness rather than a commit.

---

### 3.3 — Tess's talkativeness lands one point inside the wrong band
**Tess only. One number.**

`band()` cuts at `≤ 33 / ≤ 66 / > 66`. Tess's `talkativeness` is **66**, so she
gets the middle effort line:

> *"You meet them halfway. You answer what you are asked and occasionally add
> something, but you do not drive."*

Her own file says the opposite, in a comment on that very number:

> *"She carries it. Nadia will if she has to; Tess does by default, which is
> what keeps a first rep from dying in the first fifteen seconds."*

One point higher and she gets *"You carry the conversation by volunteering
something about yourself, your opinion, or what you are doing."* Which is what
was meant.

*Fix:* `talkativeness: 66 → 72`. Nothing else reads it — it is deliberately
kept out of the steering line so it cannot argue with the band.

---

### 3.4 — Two `want` clauses render as broken English on every turn
**Tess and Robin.**

`wantClauses` composes `You would rather be ${want}`. Rendered:

| | renders as | |
|---|---|---|
| Nadia | "You would rather be left alone with the shelf you are halfway through." | ✅ |
| Maya | "You would rather be back inside the notebook you were happy in before he arrived." | ✅ |
| **Tess** | "You would still rather be **these nineteen minutes to go faster than they are going**." | ❌ |
| **Robin** | "You would rather be **your car to arrive so that this evening can finally be over**." | ❌ |

Ungrammatical instruction text, injected on every single turn of every rep, on
the clause the file itself calls *"the reason she is a person rather than a
response"*. Half the roster.

*Fix:* reword the two strings so they complete "you would rather be ___" —
Tess: `doing literally anything but watching that drum go round`; Robin:
`in the car home with this evening already over`. Then add a roster test that
composes all three warmth variants and asserts the phrase fits the frame, so
the next authored `want` cannot reintroduce it.

---

### 3.5 — The two gates that carry personality are permanently crowded out
**Roster-wide, worst for Tess.**

`gateClauses` emits at most two, ranked by `unlocksAt` **descending** — newest
first. The four gates unlock in a fixed order, so above the highest threshold
the top two are always the same two:

| Tess, warmth | clauses emitted |
|---|---|
| 30–33 | "You may flirt." |
| 34–35 | "You may say something real about your life. You may flirt." |
| 36–37 | "You may use his name. You may say something real about your life." |
| **38 and above, forever** | **"You may start a topic. You may use his name."** |

`initiatesTopics` (38) and `usesYourName` (36) permanently outrank
`flirtiness` (30) and `personalDisclosure` (34). Tess opens at 48. **She is
never once told she may flirt or disclose anything about herself.**

That matters specifically for her, because `flirtiness.unlocksAt: 30` — below
her own `start`, so it is "available from the first turn" — is the single dial
her file identifies as the "more engaging" note, and `roster.test.ts` asserts
it as her defining difference from Nadia. It is tuned, tested, documented, and
dead on arrival. The two most mechanical permissions crowd out the two most
expressive ones on every turn of every rep.

*Fix:* rank by **when the gate was crossed in this rep**, not by its threshold.
That is what the comment already claims it does — *"the most recently unlocked
win: those are the ones the model has not been told about on many previous
turns"* — and it is not what the code does, because a static threshold order is
not a recency order. Failing that, reserve one of the two slots for
`flirtiness`/`personalDisclosure` and rotate.

---

### 3.6 — Tess's frame-break instruction puts her in a bookshop
**Tess only, plus a roster-wide instance in the live scorer.**

`sceneId(room)` returns `bed ?? reverbIr`. Tess's bed is `null` (ambient is off
roster-wide) and her `reverbIr` is `'bookshop'` — chosen honestly, as the
closest authored dead-room impulse response to a small tiled room. So her
**Absolute rules** section reads:

> *"react the way a stranger in a **bookshop** would react to someone saying
> something odd"*

while she is standing in a launderette. A room contradiction planted in the
section headed "Absolute rules", where the model is being told what is
inviolable about the frame.

Same class, one layer over: `buildSystemPrompt` in `lib/warmth/prompt.ts`
hardcodes *"a woman he has just started talking to in a second-hand bookshop"*
for **every** persona, and all eight few-shot examples are books, shelves and
Tana French. The live intimacy scorer judging a launderette conversation is
anchored entirely to Nadia's scene.

*Fix:* separate the room's **name** from its **impulse response** — the reverb
is an acoustic choice and must not also be the word for where she is standing.
Add an authored place word (`room.place`, or read it off `presentation.ts`,
which already has `settingShort: 'Launderette'`). For the scorer, parameterise
the one scene sentence and leave the anchors and few-shots alone; changing
those is a recalibration, not a fix.

---

### 3.7 — Warmth is expressed almost entirely as a word cap, and questions are locked behind the win
**Roster-wide. The structural one.**

The complete expressive range of the entire warmth mechanic:

| Band | Warmth | Directive |
|---|---|---|
| HOSTILE | < 0 | under six words, no questions |
| CLOSED | 0–19 | four to ten words, no questions |
| GUARDED | 20–39 | one sentence, twelve words, no questions |
| OPEN | 40–59 | one sentence, fourteen words, **no questions unless asked one first** |
| ENGAGED | 60–79 | under fifteen words, may ask |
| INVESTED | 80–100 | under fifteen words, may ask |

Two observations.

**First: no band, at any warmth, lets a character say more than about one
sentence.** The dynamic range of warming up, measured in words, is eleven. Real
warmth is not a longer sentence; it is a tangent, an unasked-for detail, a
small story, finishing your thought for you. None of those fit in fifteen
words, so none of them are reachable by any character on the ladder however
well the rep goes.

The bands file already makes exactly this argument — for the *cold* end:

> *"The fix is not to make her warmer. It is to stop expressing coldness as
> syllables."*

The same sentence is true at the warm end and the work was never done there.

**Second, and worse: she may not ask him anything until warmth 60.**
`ARM_THRESHOLD` is 65. So the character is permitted to be curious about the
user only after he has all but won. Simulated against the real engine:

```
TESS / competent user    52 → 60 by turn 4  → ENGAGED for most of the rep
TESS / struggling user   47 → 32 over 15 turns → OPEN, then GUARDED. Never asks anything.
TESS / median first-timer  48 → 46.5, OPEN throughout, ONE distinct steering line in 15 turns
```

Which produces the inversion this product can least afford:

> **The difficulty ladder is also, accidentally, a personality ladder. The
> worse you do, the less human she is.** And rung 1 exists for the people who
> do worst.

A nervous first-timer meets a stranger who, for three unbroken minutes, says
one flat sentence at a time and never once asks him a question. That is the
first impression the whole funnel rests on.

There is a matching asymmetry on the graded side. The deterministic 60% marks
*him* on 3–8 questions per three minutes and an open:closed ratio of 2:1 or
better, while the bands forbid questions from *her* for most of a rep. The
conversation the system produces by construction is an interview: he asks, she
answers in fourteen words. That shape is what "robotic" describes from the
user's chair, and no amount of persona prose fixes it.

*Fix:* give the warm bands a **shape** rather than a ceiling. Sketch:

```
OPEN      One or two sentences. Volunteer one small thing. At most one short
          question, and only if you actually want to know.
ENGAGED   Two sentences. Ask about him, tease him, swap names. You may go off
          on one small tangent of your own.
INVESTED  Two or three sentences. Tell him something small that happened to
          you, or bring back something he said. Open to a concrete plan.
```

Length still belongs to the band and to nothing else, so rule 1 holds. If the
roster needs per-character variety in rhythm, shift the cap by `talkativeness`
**inside `bands.ts`** — one function, one number, still exactly one owner.

*⚠️ This change has a tripwire.* `lib/metrics/stability.ts` flags a median
above **12 words across the last six agent turns** as a `verbosity` hit with
severity **`break`**, which counts against M0's *< 0.5 breaks per five-minute
session* gate. Raise the caps without touching that rule and the harness will
report a warmer, more human character as a broken one.

The rule should move in the same commit, and it should change in kind rather
than in threshold: it was authored when long turns were the *symptom* of
assistant register, and the banned-register list plus the craft rules now
detect that register directly. **The detector should assert that she obeyed the
direction she was given, not that she was short.** Failing that, it drops from
`break` to `drift`, which is what a length signal now is: a leading indicator,
not a frame break.

---

### 3.8 — The best moment in a rep is invisible to the character having it
**Roster-wide. Cheap to fix.**

The engine has a `breakthrough`: a slow judgement at intent ≥ 8 is allowed
past `maxGainPerTurn`, twice per session, because *"real liking is not a curve,
it is an instant"*. It moves the meter, it is stamped in telemetry, and
`composeSteering` never sees it. The user watches the number jump; she carries
on exactly as before.

`repairOpen` is surfaced and gets a clause. A breakthrough deserves the same
one-turn clause — *"That landed. Let it show."* — for the same reason: a moment
the other person does not visibly register did not happen.

---

### 3.9 — Nothing varies, within a band or between reps
**Roster-wide.**

`composeSteering` is deterministic in warmth, and `directiveIfChanged` sends
only on change plus a four-turn heartbeat — both correct for cost and both
correct against the drilling failure. The consequence is that a rep that stays
in one band carries **one instruction**, verbatim, from start to finish
(measured: fifteen turns, one line). And a *second* rep against the same
character at the same warmth is that same line again — which matters
specifically for Tess, because §08 re-offers the sign-up rep at day 28 as a
side-by-side measurement. The user meets the identical afternoon twice.

*Fix:* an authored `moods: string[]` on the persona, one rolled per session by
the same RNG that already rolls `startJitter`, injected into the contract as a
line under `# Your mood right now`. Four for Tess: she slept badly; she got the
good machine for once; she has somewhere to be at five; the dryer ate a sock
and she is telling anyone who will listen. Content authored in the repo and
seeded, never generated at runtime, so rule 8 holds. Zero effect on any
difficulty dial.

---

## 4. Is the scoring system the problem?

There are two, and only one of them is in the frame.

**The warmth engine (live).** This is what decides whether she feels alive, and
it is the problem — but not because it is crude. It is the opposite of crude:
three affect axes, postures, repair windows, breakthroughs, per-character
temperament weighting, a fast lexical layer with an anti-farming taper and a
slow judgement layer with an absolute intimacy scale. The failure is entirely
at the **output surface**. All of that resolves to one bracketed line, and the
only thing that reliably varies in it is a number of words. Fixing §3.1, §3.5,
§3.7 and §3.8 is not adding soul to the engine; it is opening a wider pipe for
soul the engine already has.

**The grade (post-rep, §07).** This does not touch her behaviour at all — it is
produced once, after the session, and she never sees it. **It should not be
changed to fix this**, and changing it carries costs nothing here would buy:
it is outcome-blind by design, its bands are auditable, and it carries the
progression ladder, so a rubric edit is a recalibration of everyone's history.

Its own real gaps are different ones, and both are already known: §17's twenty
hand-scored transcripts have never been done, so nobody actually knows whether
the rubric is calibrated; and the grader is persona-blind — the same six
dimensions mark a launderette and a hotel lobby, and per §3.6 the live scorer
literally believes every scene is a bookshop. Those are worth fixing. Neither
of them is why Tess feels robotic.

**One place the two do meet** is §3.7's asymmetry: the grade rewards him for
curiosity while the bands forbid it in her. That is coherent — he is the one
training — but it means the product's own scoring pressure pushes every rep
toward an interview. Widening the warm bands is what makes a *conversation*
reachable, and it is a persona fix that improves the graded shape without
touching the rubric.

---

## 5. What to change, in blast-radius order

> **SHIPPED 1 September — all nine defects, Tess only.**
>
> The brief was "fix Tess until she is enjoyable to talk to, and do not let it
> reach the others yet". That is wider than the Tier 0 table below as it was
> first written, because Tier 0 alone would have left her with the `at-ease`
> clause on every turn, no flirt or disclosure gate for the whole rep, and a
> fourteen-word cap she never escapes — better, and still not a person.
>
> So the roster-wide defects were fixed **behind per-character fields that
> default to today's behaviour**: `disposition`, `bandDirectives`,
> `postureMode`, `moods`, `room.place`, and a `punctuation` override on
> `contract()`. Absent means byte-identical, and `lib/personas/tess.test.ts`
> asserts that over the whole roster — shipped and retired — rather than
> promising it. Tess is the only persona carrying any of them.
>
> `npm run typecheck`, `npm run lint`, `npm test` (1082 passing) and
> `npm run build:check` are green. **`npm run db:seed` has not been run** and is
> owed: her `scene` and `contract` are seeded columns and the row is stale. It
> only affects listing copy — the registry is what a rep reads — but it should
> be re-run.
>
> **Then she was auditioned**, because reading a prompt cannot tell you whether
> a character is good company. See §6 — it changed six of her numbers and found
> two roster-wide regressions that reading had missed.

### Tier 0 — Tess only. Nothing else can move. Safe to ship together.

| | Change | File | |
|---|---|---|---|
| 3.3 | `talkativeness: 66 → 72` | `lib/personas/tess.ts` | ✅ |
| 3.4 | reword her `want` so it completes "you would rather be ___" | `lib/personas/tess.ts` | ✅ |
| 3.4 | same for Robin | `lib/personas/robin.ts` | ❌ **still owed** — out of scope under a Tess-only brief. His renders as "You would rather be your car to arrive so that this evening can finally be over" on every turn |
| 3.2 | optional `disposition?: string` on `Persona`; Tess sets one, nobody else does | `lib/voice/types.ts`, `lib/voice/openai/persona.ts`, `lib/personas/tess.ts` | ✅ |
| 3.6 | separate the room's name from its impulse response; Tess names a launderette | `lib/voice/types.ts`, `lib/personas/tess.ts` | ✅ `roomName()`, `RoomConfig.place` |

Every other compiled prompt stays byte-identical.

**Two more found by reading the assembled prompt end to end**, which is the
only method that has found anything in this file:

- Her `scene` string said "nineteen minutes left on **her** machine" — a
  third-person pronoun about herself, printed under a second-person heading in
  her own instructions. The only scene line on the roster with one. Now "the
  machine". ✅
- `SPEECH_RULES` ended "Commas and full stops only. **Short sentences.**" That
  is two rules under one heading: the em-dash line is a TTS artefact fix and is
  forever, and "short sentences" is Nadia's *rhythm* — the last place her
  cadence was still being imposed on everyone after the band table stopped
  doing it. On Tess it contradicted her own warm bands in the same prompt.
  Split into `PUNCTUATION_RULES`, overridable per character, and Tess is the
  only one who overrides it. ✅

Still visible in the assembled prompt and **not** fixed, because both are
roster-wide and pre-existing: `# Where you are` and `# How you speak` each
appear **twice**, once from the shared contract and once from the compiler.
Duplicated headings with different content invite a model to read the later one
as a correction of the earlier. Worth a Tier 1 pass.

### Tier 1 — roster-wide, but strictly corrective

Each of these can only move a character *toward* her own authored self. They
still need the stability harness, because "should be a no-op" is how round 6
happened.

| | Change | |
|---|---|---|
| 3.1 | posture measured against the opening spread, so `at-ease` stops firing on every rep at turn one | ⚠️ **built, Tess only.** `postureOf(state, { mode, opening })` and `PostureMode`. The engine reads `absolute` unless the persona opts in. Tess reads `relative`; the other three still open `at-ease`, and `tess.test.ts` asserts that they do — the test records the debt rather than hiding it |
| 3.5 | gates ranked by when they were crossed in this rep, not by threshold | ⚠️ **solved for Tess without touching the code.** The ranking is already recency-of-crossing; the fault was that with a fixed unlock ORDER the top two above the highest threshold are always the same two. Her thresholds were re-ordered so the cheap gates (`usesYourName` 28, `initiatesTopics` 30) unlock first and the expressive ones (`flirtiness` 32, `personalDisclosure` 34) last. Above 34 the two clauses she carries are now hers. The general fix — reserving a slot, or rotating — is still owed for anyone else who needs it |
| 3.8 | one-turn breakthrough clause in `composeSteering` | ❌ **still owed.** Cannot be scoped to one character without another flag, and it is genuinely roster-wide. The best moment in a rep is still invisible to the character having it |

### Tier 2 — roster-wide, and a genuine retune. Measure before and after.

| | Change | |
|---|---|---|
| 3.7 | warm bands get a shape instead of a ceiling; one small question allowed at OPEN | ⚠️ **built, Tess only**, as `BandDirectives` — a per-character band table. She overrides CLOSED, GUARDED, OPEN, ENGAGED and INVESTED, and deliberately not HOSTILE: a rung-1 character only reaches it when a boundary has been crossed and the shared line is right for that. The band still owns reply length; an override changes *which table she is read from*, not how many systems have an opinion |
| 3.7 | `verbosity` in `lib/metrics/stability.ts` moves in the same commit | ✅ `DEFAULT_VERBOSITY_MEDIAN` (12, unchanged for everyone) plus a per-meter `verbosityMedian`. A character with her own band table brings her own ceiling, so the harness cannot report the fix as the fault. The *right* rule still asserts she obeyed her direction rather than that she was short, and that is still owed |
| 3.7 | optionally, `talkativeness` shifts the band cap, computed in `bands.ts` alone | ❌ not done, and probably unnecessary now that a character can carry her own table |

The warning that Tier 2 must not ship with Tier 0 stands **for the roster**.
It does not apply to a change scoped to one character behind a default-off
field, which is what shipped: Nadia is untouched and remains the control.

### Tier 3 — new capability, once the above is measured

| | Change | |
|---|---|---|
| 3.9 | `moods: string[]`, one rolled per session off the existing RNG | ✅ Four authored for Tess, rolled at mint by `moodFor`, injected as `# Today, specifically`. Nothing a mood touches reaches a dial, and `tess.test.ts` asserts that same-warmth steering is identical across moods — a mood changes what she has to talk about, never what she gives |
| — | scene beats that *require* something of her, not only ambient ones | ✅ Hers went from two ambient to four, two of which act on her: her sister rings and she does not answer; somebody's abandoned sock starts to bother her. Authored at 0.22/0.4/0.54/0.68 — the authored bound is 0.7 even though `LAST_BEAT_FRACTION` is 0.75, and `roster.test.ts` caught a beat at 0.72 |
| — | parameterise the live scorer's scene sentence (§3.6) | ✅ `scorerPlaceFor` resolves the room from the registry — never from the request body, because the room steers the intimacy anchors and anything that steers scoring comes from the repo. Falls back to `DEFAULT_SCORER_PLACE`, so every character without a `place` gets a byte-identical prompt. **The eight few-shots are still books and are deliberately untouched**: rewriting them is a recalibration of the whole live scorer |

---

## 6. The audition — what running her actually changed

`npm run rep:audition -- <slug> <player> <reps>` (`scripts/rep-audition.ts`)
drives a whole rep without a microphone: the real `compileInstructions` as the
system prompt, the real `WarmthSession` moving warmth, `directiveIfChanged()`
injected exactly when the live session would inject it, scene beats on the rep
clock, and `StabilityMeter` over her turns. The player is a model given one of
three briefs — `struggling`, `median`, `competent`.

**It is not the voice model.** A rep runs `gpt-realtime-mini` speech-to-speech;
this runs the character on the chat model, because you cannot hold a scripted
conversation with the realtime API from a terminal. It tests the PROMPT, which
is what this document changed. It says nothing about how she sounds or how she
times a reply.

### The number that mattered was the control, not the gate

| | breaks / 5 min | median words |
|---|---|---|
| Tess, struggling ×3 | 1.34 | 20 |
| Tess, median ×3 | 1.79 | 21 |
| **Nadia, median ×3 — untouched control** | **1.79** | 14 |

**Nadia scores the same.** So the residual rate is a property of this harness —
text completions, a scripted player, no VAD, no response gate — and **comparing
it to M0's < 0.5 gate is invalid**, mine included. M0 measured the realtime
pipeline. The only valid reading here is Tess against Nadia in the same
conditions, and on that reading she is now no worse than the tuned character.
Nadia also trips `verbosity` in all three of her reps at the roster's ceiling of
12, which corroborates that this environment simply runs longer than the one the
gate was set in.

The ladder is also intact and correctly ordered: Tess arms 3/3 against a median
player and 0/3 against a struggling one; Nadia arms 1/3 against the same median
player. Rung 1 is easier than rung 2, and neither is free.

### Six numbers the audition changed, none of which reading would have found

1. **An uncountable cap is not a cap.** The first band table said "One or two
   sentences". She came back at a **median of 40.5 words** with a polished quip
   every turn. Putting a sentence count in front of a number licenses the
   overshoot too — "One or two sentences, twenty-two words at most" gave 30. The
   number has to lead and stand alone, which is how the shared table always did
   it. Median went 40.5 → 30 → 25 → 19 across three drafts.
2. **A stated cap comes back as roughly 1.2×.** Consistently, every band. So the
   number written is the number wanted minus a fifth. Her table is 12 / 12 / 16
   / 20 / 26, realising about 19 at OPEN — still half again Nadia's room.
3. **She drifts between reminders, in proportion to the room she is given.**
   16–20 words on turns the directive was sent; 26–30 on turns it was not. The
   cap and `steerHeartbeatTurns` are one setting in two places, so hers is 2
   against the roster's 4. This is the finding that took the median from 25 to
   19 on its own.
4. **A standing order to be funny produces a comedian.** `humour: 74` put "Tease
   him if he gives you an opening" on *every* turn and she wrote sixteen
   consecutive bon mots. 74 → 69 keeps the disposition (the compiler's threshold
   is 67) and drops the per-turn nag; teasing lives in her ENGAGED band, where it
   has been earned. Nadia sits at 69 and is the wittier of the two on the page.
5. **A beat arrives with no band beside it.** `rep.ts` sends `reinforce(beat)`
   alone, so on that turn the stage direction is the most recent thing she has
   read and nothing is capping her — a chattier draft of the sock beat produced
   a 54-word turn. Her beats are now terse. **The general fix is roster-wide and
   still owed:** a beat should travel with the directive.
6. **The harness's own ceiling was wrong.** A `verbosityMedian` of 26 fired on a
   perfectly obedient INVESTED rep, reporting her own band back at her as a
   frame break. It belongs above the *realised* output of her widest band, not
   above the cap — hence 32, and hence `Persona.verbosityMedian`.

### Two roster-wide regressions it surfaced

- **The consecutive-question rule is gone.** M0 records that the tuned contract
  said "no opening or **consecutive** tag questions". Only the opening half
  survived into `SPEECH_RULES` when the craft rules were extracted, so
  `question-every-turn` still breaks on the second one while nothing tells any
  character not to. Restored for Tess in both her contract and her warm bands —
  the same rule, worded identically, so there is no third answer to split
  towards. Placement is measurable: contract alone gave six breaks across three
  reps, band alone gave four, because the band is what she reads last.
  `tess.test.ts` asserts Nadia still lacks it, so restoring it roster-wide
  fails that test loudly rather than silently.
- **The §4e quota cannot prevent the break it exists to prevent.**
  `question-every-turn` fires on two consecutive; the quota suppresses at two in
  five and only lands on a turn the directive is re-sent. There is always at
  least a turn of lag and the break walks through it. Worse, the shared ENGAGED
  says "Ask about him" while the quota appends "Do not ask him anything this
  turn" — told both, she asks. Hers offers a question and never orders one.

### The harness has its own bias, and it was corrected mid-run

The first `median` player brief asked a question on nearly every turn, which is
neither realistic (§07 targets three to eight in a whole rep) nor neutral — she
reciprocated, and roughly half her question breaks were the fixture's. Tuning a
character against a broken fixture is how you get a character that is good at
the fixture. Fixing it took her median run from 2.68 to 1.34 before any change
to her at all.

### What is still not verified

She has not been spoken to. This tests the prompt, not the voice, and §17's gate
— twenty hand-scored transcripts — remains unrun. What can now be said is
narrower and true: **on the prompt, against the same harness, the sign-up
character behaves no worse than the tuned one, and reads like somebody with an
afternoon of her own.**

## 7. The reversal — Tess is Nadia in a launderette (2 September)

Everything in §5 shipped. Tess got her own band table, her own posture reading,
her own punctuation, a mood roll, a facts list, a shorter steering heartbeat and
her own verbosity ceiling. Each was argued from a measurement and the arithmetic
behind each was sound. §6 then auditioned her and tightened six of the numbers.

Then the person who has talked to both characters said: **Nadia is fun, Tess
still feels like an AI.**

That is decisive in a way no amount of reading is, and it points at exactly one
thing. Nadia runs the shared band table with **none** of those overrides. If she
is the fun one, the shared table is not what was flattening Tess — it is most of
what makes Nadia good, and the overrides were the problem rather than the fix.

### What the audit got right, and where it turned

The seams in §3 are real. Two were genuine bugs with broken output — the room
name and the ungrammatical `want` — and both are kept. The rest were a
*hypothesis*: that a character whose authored self differs from the band table
is being overwritten by it.

The hypothesis had an unexamined premise. It assumed Tess's authored self was
worth protecting. She was warm, quick, carried the conversation, delighted to be
spoken to — and read as an AI, because **that description is what a language
model does by default.** Nadia is flat, half-attentive, trails off, does not
rescue silences and will not tell you what she does for a living. Every one of
those is a constraint *against* the default, and the constraints are the
character. Widening Tess's bands did not free her to be herself; it freed her to
be the model.

An audit that reads a prompt can prove two instructions disagree. It cannot tell
you which of them was carrying the character.

### The port

Nadia's contract, section for section, in her order, with the props changed and
nothing else. The deviations are exhaustive: name, age, the room, what she is
doing in it, and the four rules that name the shop — working there, its stock,
browsing, retreating to the shelves. `lib/personas/tess.test.ts` asserts every
craft rule verbatim and asserts no bookshop noun survives.

The book ports better than it deserves to. Nadia leans on having something in
her hands and an opinion about it, and a woman with nineteen minutes and a
paperback is the same person as a woman killing forty minutes in a shop. Her job
ports exactly: scheduling for a removals firm is *something in logistics that
you find boring and do not bring up*.

**Layer 1 is the only thing still hers**, plus the two layer-2 dials that layer 1
implies — `patience` and `distraction` — which `roster.test.ts` pins against
Nadia's anyway. Sharpness, humour, talkativeness, expression and signalClarity
are now hers to the number, so the derived behaviour block is identical except
the one line banded off `trajectory.start`.

### Measured, same harness, same day

| | breaks / 5 min | median words | armed |
|---|---|---|---|
| Tess **before** the port (§6 final) | 1.79 | 21 | 3/3 |
| **Tess ported** | **2.68** | **15.5** | 3/3 |
| Nadia — control | 3.57 | 13 | 0/3 |

She now sits **between** her old self and Nadia and scores better than the
control on breaks, with the same break profile (verbosity, consecutive
questions). Her median is above Nadia's because she reaches INVESTED where Nadia
tops out at ENGAGED — that is the rung, working. The ladder is also correctly
ordered against a median player: rung 1 arms 3/3, rung 2 arms 0/3.

Nadia trips `verbosity` in all three of her own reps at the roster ceiling of
12, which is the third independent confirmation that this harness reads longer
than the realtime pipeline and that its absolute numbers cannot be compared to
M0's gate.

### What survives, and what is now dead

**Kept** — both are broken output, not opinions about who she is:

- `room.place`, because `sceneId` falls back to the impulse response and was
  putting her in a bookshop inside her own Absolute rules (§3.6)
- a `want` that completes the sentence `wantClauses` builds (§3.4), reworded to
  Nadia's shape: *left alone with the book you are halfway through*
- `scorerPlaceFor`, so the live intimacy scorer stops believing she is in a
  bookshop — that anchor drives `classifyOverreach`

**Deleted from Tess:** `disposition`, `bandDirectives`, `postureMode`, `moods`,
`steerHeartbeatTurns`, `verbosityMedian`, the punctuation override, the facts
list, the two extra scene beats, `humour: 69` restored from 74, `talkativeness`
back to Nadia's 56.

**The optional fields stay on the schema and nobody uses one.** They are the
right shape for a character who genuinely needs one, they all default to the
prior behaviour, and `tess.test.ts` now asserts that *every* persona leaves
*every* one of them undefined. That assertion is the point: it turns "we tried
this and it made her worse" into something a future session trips over rather
than rediscovers.

### The one thing to watch

In one audition rep she introduced herself three times — "I'm Tess, by the way",
then twice more — against a contract that explicitly forbids reintroducing
yourself. It did not recur across the other three reps and no `conversation-reset`
break fired in them, so it is not systematic. But `usesYourName` unlocks at 28
for her against Nadia's 41, so "You may use his name" is in her steering from
almost the first turn, and that is the most likely prompt for it. Worth watching;
not worth a change on one occurrence.


## 8. What not to do

- **Do not add a friendliness dial.** §3.2 is fixed by letting the authored
  mood own the disposition, not by adding a second system that argues with
  warmth. The existing rule is right.
- **Do not rewrite Nadia.** Her contract is the tested one and a refactor of a
  prompt is a retune of a character. She is the control.
- **Do not change the grading rubric to fix this.** §4.
- **Do not generate persona content at runtime.** The mood list in §3.9 is
  authored in the repo, reviewed in a pull request, and seeded (rule 8).
- **Do not fix "robotic" by making Tess warmer.** Her start is already the
  highest on the roster and 65 is a hard ceiling on it. The problem is not that
  she gives too little; it is that what she gives is shaped like somebody else.

---

## 9. Verification

Existing gates that must stay green:

```bash
npm run typecheck && npm run lint && npm test
npx vitest run lib/personas lib/warmth lib/voice
```

Additions worth having, all cheap:

- **A compiled-prompt snapshot per persona.** The only reason §3.2 and §3.6
  went unnoticed is that nobody reads the assembled string. Snapshot it.
- **A `want` composition test.** Render all three warmth variants for every
  persona and assert the phrase fits the frame (§3.4).
- **A posture test asserting no character opens in a posture** (§3.1).
- **A gate-coverage test** asserting `flirtiness` and `personalDisclosure`
  reach the line at some warmth the character actually occupies (§3.5).

And the one that is not code: **run reps.** Every defect above was found by
reading, and reading is what produced all four of them. The persona contracts
are the one part of this product that can only be finished by talking to it —
which is also §17's outstanding gate, and the reason it is outstanding.

Suggested minimum before calling Tess fixed: five reps against her, played as a
struggling first-timer rather than as somebody who knows the mechanic, with the
stability harness on. The struggling player is the case that is broken and the
case the rung exists for, and it is not the case anyone naturally plays when
testing their own product.

---

## 10. Open question for the roster

Tess is rung 1 *and* the sign-up rep — a difficulty rung and a first
impression. §06 argues she must be a real rung, and that argument is right:
§08 re-offers this rep at day 28 as a measurement, and a throwaway demo
character would have made that comparison measure the gap between two personas
rather than the user's improvement.

But the two jobs disagree on §3.7. As a rung, she should get less human as the
user plays worse — that is what a difficulty curve *is*. As a first impression,
the worst-playing user is exactly the one who most needs to meet somebody
alive. Right now the rung wins, silently, and the first impression pays.

Widening the warm bands narrows the gap without resolving it. The resolution,
if one is wanted, is to decide that **warmth governs what she gives, never
whether she is a person** — that the cold bands withhold curiosity,
volunteering and softening while never withholding personhood. That is the
principle the cold-band rewrite already reached for and stopped halfway
through. Finishing it is a product decision, not a tuning one, and it belongs
to whoever owns §06.
