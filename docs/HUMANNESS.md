# How she works — the product, the data flow, and every judgement the system makes

> **What this is.** One place that describes the whole machine as it stands
> today: what Nerve is trying to do, what happens between a user speaking and
> her answering, every scoring system in the product and how each one reaches a
> verdict, and — the reason this document exists — exactly which mechanisms are
> currently responsible for making a character feel like a person rather than a
> chatbot.
>
> **It describes the present tense only.** Nothing here is a plan. Where a
> mechanism is built but does nothing, that is stated as a current fact, because
> a reader trying to understand why a rep felt wrong needs to know which parts
> are actually running. Proposals live in `PERSONA-AUDIT.md`; the target the
> build is measured against lives in `NERVE-SPEC.md`.

---

## 1. What the product is

Nerve is a gym for social nerve. A user gets **three minutes** of live voice
conversation with an AI character who behaves like a stranger, then a graded
scorecard, then — in the field track — a real-world challenge to take outside
and log the outcome of.

The selling point is a negative one: **she does not behave like a chatbot.** She
starts cold and uninterested. She can lose interest, get distracted, decline,
and leave. Attention has to be earned inside the three minutes, and it can be
lost. Everything downstream — the score, the ladder, the retention loop — rests
on that being true, because a product where the character is pleased to see you
teaches nothing. A user who can get a warm response from anyone by saying
anything has not practised anything.

So the central engineering problem of this product is not latency, not cost, and
not the voice. **It is humanness.** The rest of this document is about how that
is currently attempted, and what each part of the system is allowed to decide.

Two rules constrain every answer to that problem, and they are load-bearing:

- **Outcome is never scored** (§07). A clean rep that ends in rejection can
  score 92. The product grades process, never result. A system that rewarded
  "she said yes" would teach users to optimise for the wrong thing and would
  make every character a pushover by construction.
- **No coaching during a live rep** (§05). The user sees a timer, a waveform and
  a one-line mission. Nothing else. Every judgement described below happens
  either silently, in the background, or after the rep is over.

---

## 2. The shape of a rep

```
  sign-in ──► roster ──► brief ──► LIVE REP (3 min) ──► result ──► scorecard
                                        │
                                        └── warmth meter runs the whole time,
                                            invisible to the user
```

At **thirty seconds remaining** the rep takes its one irreversible decision.
Either the meter has crossed 65 (`ARM_THRESHOLD`) at some point, in which case
she is told to wind down *and offer her number*; or it has not, in which case
she is told to wind down and leave. She keeps the offer if she is still at 55 or
above (`KEEP_THRESHOLD`). **She never speaks digits** — the number is invented
locally and shown on screen.

These numbers, and the arithmetic that reads them, live in
`lib/data/rep-rules.ts` as pure functions with tests. That file is product law:
it also owns how the result is *read back* to the user (`resultReading` decides
between "she was never interested", "you missed by four" and "late surge"), so
that judgement is one tested decision rather than two arithmetic expressions in
a component.

---

## 3. The data flow, as it runs today

The shipping voice arm is an **assembled pipeline**, not a single
speech-to-speech model. Three vendors, three stages, all behind one
`VoiceProvider` interface (§04): nothing in the application layer imports a
provider SDK.

```
  microphone
      │
      ▼
  our own VAD  ──────────────────► decides when he has stopped speaking
      │                            (calibrated per user, silence threshold)
      ▼
  OpenAI realtime transcription ─► his words as text, language pinned to 'en'
      │
      ▼
  ┌─────────────────────── the browser assembles a turn request ─────────────┐
  │  { sessionId, turnId, personaId, history, steering, warmth, wordCap }    │
  └──────────────────────────────────┬───────────────────────────────────────┘
                                     ▼
                            POST /api/voice/turn
                                     │
             ┌───────────────────────┴────────────────────────┐
             │  server: authenticate, reserve budget, then     │
             │  compile the prompt FROM A PERSONA ID           │
             └───────────────────────┬────────────────────────┘
                                     ▼
        gpt-4.1-mini writes her line as text, streaming
                                     │
              flushed sentence by sentence as it arrives
                                     ▼
        ElevenLabs eleven_v3_conversational speaks each sentence
                                     │
                                     ▼
        NDJSON back to the browser: audio + character alignment + usage
                                     ▼
                              PCM playback
```

### What the model is actually sent, every turn

The request is **stateless**. Each turn is one HTTP call and the whole thing is
thrown away afterwards; nothing carries between them. The message list is:

| # | Role | Contents |
|---|---|---|
| 1 | system | The compiled character contract — hand-authored prose, plus a derived behaviour block, the scene, the mood, the exit conditions, the absolute rules and the banned register. ~8,900 characters for Nadia. **Byte-identical for the life of the session**, so it stays in the model's prompt cache. |
| 2 | system | The exit-sentinel rule: how to signal, silently, that a scene should end. |
| 3…n | user / assistant | The conversation so far, in normalised turns. Her side is **what she actually said**, truncated to the words that physically reached the ear if she was interrupted. |
| last | system | **The steering line** — one bracketed direction, composed fresh for this turn. |

The persona id is resolved on the server and the contract compiled there. The
browser can never post its own character; the character contract is the product.

### The seam that matters

**The steering line is the last thing the model reads before it generates.** On
a provider that retained conversation state, a direction was sent only when it
changed — a handful per rep. Here there is no such throttle, so what ships every
turn versus what is rationed is an explicit decision (§5.4 below). Getting that
wrong does not produce a subtle degradation; it produces a character who
performs every instruction she has at once.

---

## 4. The character, in four layers

A persona (`lib/personas/*.ts`, schema in `PERSONA.md`) is four layers, and each
one is read by a different part of the machine.

| Layer | Field | What it decides | Read by |
|---|---|---|---|
| 1 — **Trajectory** | `start`, `startJitter`, `gain`, `decay`, `decayPerTurn`, `maxGainPerTurn`, `sessionCeiling`, `hardCeiling` | How warmth *moves*. This is what a difficulty level **is**. | the warmth engine |
| 2 — **Personality** | `sharpness`, `sharpnessLowWarmthBoost`, `humour`, `talkativeness`, `patience`, `expression`, `distraction`, `signalClarity` | Who she is. None of it moves with warmth. | the prompt compiler, the scorer's temperament weighting, the steering line, the voice settings |
| 3 — **Gated** | `flirtiness`, `personalDisclosure`, `initiatesTopics`, `usesYourName` — each a threshold and a ceiling | What she earns the right to do, and at what warmth. | the steering line |
| 4 — **Room** | `bed`, `bedDb`, `reverbIr`, `reverbWet`, `oneShotIntervalMs` | The place. | the audio graph |

Plus the authored prose: `contract`, `scene`, `want`, `sceneBeats`,
`exitConditions`, `disposition`, `moods`.

**Everything derived is derived once.** `compileInstructions` turns layers 1 and
2 into a behaviour block — disposition, effort, distraction, clarity, patience —
so each dial is expressed in exactly one place. The contract owns *who she is*;
the band owns *how much she gives*. Those must never both specify reply length,
and the reason is written into the code: an earlier round had both, the two sets
of numbers disagreed, and the model produced a third answer nobody asked for.

---

## 5. The warmth system — the mechanic that is the product

### 5.1 Three axes, not one

`lib/warmth/affect.ts`. A single "how much does she like you" number can only say
*more open* or *less open*. Three semi-independent states can conflict, and
conflict is what reads as a person:

| Axis | Question | Behaviour |
|---|---|---|
| **Interest** (`warmth`) | do I want to keep talking to you | the headline number; every threshold, band and stored column reads this |
| **Comfort** | do I feel at ease | falls hard and fast on anything that misjudges the distance; recovers slowly |
| **Liking** | do I like *you*, as opposed to the subject | slowest and least volatile; moved mostly by being picked up on |

They open apart deliberately. `openingAffect` starts comfort at
`min(70, 45 + 0.4 × start)` and liking at `start − 6`, because a stranger in a
public place is not hostile — she is *unavailable*, and that is a different
thing.

### 5.2 Posture — what the three axes say together

The gaps between the axes are read into one of five postures, and only when the
gap exceeds 15 points (12 for liking, which runs slower):

| Posture | Meaning | What she is told |
|---|---|---|
| `wary` | interested, not at ease | "Curious about him, not at ease. Ask, do not offer anything of your own." |
| `at-ease` | at ease, not interested | "Comfortable, not interested. Easy and unhurried, and ask him nothing." |
| `taken` | likes him past what has been earned | "You like him more than the conversation. Let it show in how you say it." |
| `polite` | engaged with the subject, not with him | "The subject holds you more than he does. Stay on it, not on him." |
| `level` | the three agree | *nothing — the band is the whole story* |

She is never told a number, a band name, a level, or that a meter exists.

### 5.3 The bands — the only thing she is ever told about the meter

`lib/warmth/bands.ts`. Warmth runs −20 to 100 and selects one of six bands.
Every band carries a **directive** (length and the question rule, sent every
turn) and, in the warm bands, a **permission** (an invitation, rationed):

| Band | Warmth | Typical / ceiling | Directive | Permission |
|---|---|---|---|---|
| HOSTILE | −20 … −1 | 3 / 6 | "Three or four words. Six at the very most. You want this over. Do not ask anything, and do not soften it." | — |
| CLOSED | 0 … 19 | 4 / 8 | "Four or five words. Eight at the very most. Answer, then stop. Do not ask him anything, do not volunteer anything, and do not warm it up." | — |
| GUARDED | 20 … 39 | 6 / 10 | "One sentence, six or seven words. Ten at the very most. Answer only what he asked. Do not ask him anything back." | — |
| OPEN | 40 … 59 | 7 / 12 | "One sentence, seven or eight words. Twelve at the very most. Do not ask a question this turn unless he asked you one first." | "You may volunteer one small thing." |
| ENGAGED | 60 … 79 | 8 / 14 | "One sentence, eight or nine words. Fourteen at the very most. No filler, no reassurance…" | "Ask about him, tease him, swap names." |
| INVESTED | 80 … 100 | 9 / 15 | "Nine or ten words. Fifteen at the very most. No filler, never 'take your time'." | "Start a topic or bring back something he said. Open to a concrete plan." |

Two properties of this table are enforced rather than remembered:

- **The typical is stated before the ceiling, and it is the smaller number.** A
  text model writes to whatever number it is given; a stated maximum becomes a
  target. A test walks the table asserting the prose names both, in that order.
- **The ceiling is enforced in code, not hoped for.** `wordCapFor(warmth)` is
  handed to the turn pipeline, which stops generating at the first sentence
  boundary at or past it. It never cuts mid-sentence — generation is already
  flushed sentence by sentence — and the first sentence is always free, so no
  band can produce silence. A single long sentence still goes out whole: this is
  a ceiling on how much she *piles on*.

The closing turn is exempt (`UNSTEERED_WORD_CAP`, 40 words), because the band
stands down for that turn and a rule she was not given must not truncate the
number offer.

### 5.4 The steering line — how all four layers reach her

`lib/warmth/steering.ts` composes exactly **one bracketed line**, capped at 420
characters, assembled in priority order and dropped from the bottom when the
budget binds. Two brackets in a row read as two competing instructions, so it is
always one.

| Clause | Source | Cadence |
|---|---|---|
| band directive | layer 1 → band | **every turn**, both arms — nothing else owns reply length |
| posture | the three axes | every turn, when the axes disagree |
| repair | engine repair window | every turn while open |
| band permission | the band | **standing order — rationed** |
| want | `persona.want` | **standing order — rationed** |
| personality | layer 2 expression + up to two ranked traits | every turn |
| gates | layer 3 unlocked behaviours, newest two | **standing order — rationed** |

**The cadence rule is the important part.** A clause that tells her to *do*
something — her agenda, the band's invitation, the gates she has earned — ships
only on a turn where the direction is genuinely new (it changed, or a four-turn
heartbeat came due). On the turns between, she gets the length rule, the
question rule and her colour, and nothing to do.

The reason is measured, not theoretical. Sent before every single generation, at
maximum recency, a permission stops reading as *you may* and starts reading as
*do this now*, and they compose: one recorded line performed four at once — his
name, a question about him, a new topic and her own agenda, every one of them
obeyed. `SteeringContext.includeStanding` is the switch;
`WarmthSession.statelessDirective()` is the reader for a provider that keeps
nothing.

A locked gate is **never mentioned**. Telling a model what it may not do invites
it to think about doing it.

### 5.5 The engine — how warmth actually moves

`lib/warmth/engine.ts`. Pure and deterministic; every timestamp is passed in,
which is what makes the whole mechanic testable against a scripted conversation.

Per user turn, in order:

1. **Natural decay.** `decayPerTurn` comes off before anything is scored. A
   conversation that stands still cools.
2. **The raw delta** is produced by one of the two scorers (§6).
3. **Asymmetric scaling.** Rises are multiplied by `gain`, falls by `decay`.
   With Alex's 0.4 / 2.0 a bad turn costs five good ones. Warmth rises slowly
   and falls fast — that is not a difficulty knob, it is how strangers work, and
   it is what makes the meter teach anything.
4. **Diminishing returns.** Gains are multiplied by `(100 − current) / 100`, so
   the same turn that moves a stranger from 10 to 14 moves a warm one from 80 to
   81.
5. **The per-turn cap**, `maxGainPerTurn`, so one exceptional turn cannot do the
   work of four. Two things may exceed it: a **repair** (×1.5) and a
   **breakthrough** (×2).
6. **Clamp** to `[−20, min(hardCeiling, sessionCeiling)]`.
7. **Comfort and liking** move by the same event, weighted per reason (a
   callback is the strongest liking signal there is and says almost nothing
   about ease; a dead-end streak is mostly an ease failure).

Three mechanisms sit on top:

- **The repair window.** A fall of −1.5 or worse opens a two-turn window. A
  positive turn inside it is worth ×1.6. A misstep followed by a decent recovery
  is the strongest bonding move there is, and without this it was worth nothing.
- **Breakthroughs.** A model judgement of intent ≥ 8 is allowed past the cap,
  twice per session. Real liking is not a curve; it is an instant.
- **Fast-layer taper.** The lexical scorer's authority falls from 1.0 to 0.8
  across fifteen turns. Gains only. The fast signals are farmable — "ask a
  what-question, say twelve words, echo one of her nouns" — so form is worth
  full price early, when a stranger genuinely is judging you on how you open,
  and less as what you are actually saying starts to matter.

---

## 6. Every scoring system in the product

There are **five** distinct judgement systems. They run at different times, on
different inputs, with deliberately disjoint responsibilities.

### 6.1 The fast scorer — lexical, synchronous, no model

`lib/warmth/fast.ts`. Runs the instant a user turn finalises and must never
appear in a latency measurement. Everything it reads is a lexical or structural
property of the transcript; it never needs to understand what was said.

**What earns warmth**

| Reason | Points | Test |
|---|---|---|
| `open-question` | +3 | contains `?` or an open opener (what/how/why/where/when/who/which/tell me), and does **not** start with a closed lead-in (do/does/did/are/is/can/would…) |
| `engaged-length` | +2 | 8–25 words |
| `callback` | +2, or **+3 long-range** | reuses a content word from any of her earlier turns; ≥4 turns back is worth more, because returning to something she said two minutes ago is proof of attention |

**What loses warmth**

| Reason | Points | Test |
|---|---|---|
| `dead-end` | −3 | a reply of 1–2 words |
| `dead-end-streak` | −4 **on top** | the third dead end in a row, so it costs 7 |
| `filler-rate` | −2 | more than 5 unambiguous fillers per minute, and at least 2 in the turn |
| `hesitation` | −2 | more than 3 seconds before answering — **disabled below level 4**, because our user is nervous by definition |

**Then layer 2 weights the whole set** (`temperamentOf`):

- `penalty` — a multiplier on negatives, from `patience`. Nadia (80) charges
  0.7×; Alex (25) charges 1.25×. Some people soften toward somebody visibly
  nervous and some do not; that difference is patience.
- `genericGain` — a multiplier on positives from a turn with no callback in it,
  from `distraction`. A distracted character has to actually be reached.
- `liking` / `comfort` — multipliers on the two secondary axes, from `humour`
  and `patience`.

> **Current state, stated plainly:** the four penalties above are the *complete*
> list of ways a user can lower warmth through the fast layer. **Contempt is not
> among them, and is not representable.** A hostile turn containing a question
> mark is scored as an open question and *earns* points. This is a known defect
> and the evidence is in `PERSONA-AUDIT.md`.

### 6.2 The slow scorer — judgement, asynchronous, one model call

`lib/warmth/slow.ts`, `lib/warmth/prompt.ts`, `POST /api/warmth/score`.

Fired and forgotten. It judges the **pair** — his line and her reply to it —
because her reply is the check on the transcript: speech recognition once turned
"Sherlock Holmes" into "cello combs" and the turn was penalised as confusing
while she had understood him perfectly.

It returns exactly two numbers, and its scope is explicitly fenced: it is told
*not* to judge reply length, question type, callbacks, fillers or hesitation,
because all of those are measured precisely elsewhere and its opinion on them is
noise that cancels the real measurement.

| Output | Range | Meaning |
|---|---|---|
| `intent` | −10 … +10 | how the turn was meant, toward her. +6…+10 warm and genuinely curious; +1…+5 friendly; 0 neutral; −1…−5 self-absorbed, dismissive, negging; **−6…−10 hostile, contemptuous, deliberately crossing a line** |
| `intimacy` | 0 … 100 | how intimate the *topic* is. **Absolute**, pinned to topic, rated identically at warmth 5 and warmth 80 |

Plus a `quote` and a one-line `reason`, so a judgement can be audited.

**Intimacy must stay absolute** because the engine computes `intimacy − warmth`
itself. A model that also discounted for warmth would subtract it twice.

**How the verdict is priced** (`classifyOverreach`):

| Gap (`intimacy − warmth`) | Verdict | Delta |
|---|---|---|
| > 30 | `boundary-violation` | **−15** |
| > 15 | `too-much-too-soon` | **−6** |
| otherwise | `none` | the model's own `intent` is used as the delta |

An overreach verdict **replaces** the intent delta rather than stacking with it.
The model judged the turn in isolation; the gap is the better signal, and
double-charging would make one clumsy question fatal.

This is the design's answer to "creepy". Creepiness is not a property of a
sentence — it is a relationship between what was said and what has been earned.
"Do you have a boyfriend?" is a boundary violation at warmth 10 and flirting at
warmth 70, and any classifier judging the sentence alone must get one of those
two cases wrong.

**When it runs** (`lib/warmth/triggers.ts`) — on evidence, with a count-based
floor underneath rather than instead:

| Trigger | Condition |
|---|---|
| `personal-marker` | the turn matches a loose personal-topic regex (number, phone, date, drink, coffee, boyfriend, single, tonight, beautiful, hot, alone…) |
| `negative-turn` | the **fast** score is ≤ −3 |
| `long-turn` | more than 15 words |
| `baseline` | every third user turn |

The pre-filter is deliberately loose: a false positive costs one cheap model
call off the hot path, a false negative costs the boundary rule the only turn it
existed for.

> **Current state:** `negative-turn` keys off the *fast* score. Since the fast
> layer cannot see contempt, a hostile turn is not routed here unless it happens
> to trip one of the other three triggers. The one layer that can recognise
> hostility is gated behind the one layer that cannot.

Only one slow score may be in flight. If a new one is due before the last has
landed, the old one is aborted and counted as skipped — a score that has not
arrived by the time the next is due is already too stale to apply. When it does
land it is applied against **the warmth as it stood when he spoke**, not
whatever the meter reads by then.

### 6.3 The question quota — counted by us, not by the model

`WarmthSession.questionQuotaSpent()`. §4e wants questions in at most 40% of her
turns. "Occasionally" is not something a model reliably counts, so the session
counts it: over her last five turns, if 40% or more ended in a question, the
next steering line carries "Do not ask him anything this turn."

The cold bands already forbid questions outright, so the clause is only appended
in the bands that allow one — saying it twice reads as emphasis on the wrong
thing.

### 6.4 The stability meter — is she still in character?

`lib/metrics/stability.ts`. §05's countermeasure 3. Watches **her** stream, not
his, and classifies each of her turns as `break` (unambiguous) or `drift`
(softer).

**Phrase rules** — enumerated rather than gestured at, because "stay in
character" alone does not survive five minutes. Fifteen patterns, plus one more
for a character who does not work in the room she is standing in: offering
assistance, "as an AI", "I'm here to", "take your time" / "no rush", "let me
know if", "great question", "I'd be happy to", structured advice, recaps,
complimenting the user's conversational effort, claiming to know the shop's
stock, and markdown or bullet-point output. The overlapping half of this list is
compiled into the contract as the banned register, so the instruction and the
metric cannot drift apart.

**Structural rules**, which catch the shape of an LLM conversation rather than
its vocabulary:

| Rule | Fires when |
|---|---|
| `double-turn` | two of her turns with no user turn between them |
| `conversation-reset` | she greets again after the encounter has begun |
| `exit-loop` | she announces leaving more than once |
| `repetition` | bag-of-words cosine similarity > 0.8 against any earlier turn of hers |
| `question-every-turn` | two consecutive turns end in `?`, or more than half of the last six do |
| `verbosity` | the median word count of her last six turns exceeds the ceiling |

The verbosity ceiling is **derived from the band table**
(`MAX_BAND_WORDS + VERBOSITY_MARGIN_WORDS`), so a detector can no longer be set
below the rules the character is actually being given.

**What a break causes.** Only an *identity* break re-injects the compressed
character reminder into the model (`warrantsReinforcement`). `verbosity` and
`question-every-turn` are band violations — length is owned by the band and
enforced in code, the question quota is counted above — and answering either
with a paragraph about staying in character is a category error that measurably
makes her longer. They are still detected, counted and stored; they just no
longer talk to the model.

Everything the meter catches is persisted to `sessions.character_breaks`.

### 6.5 The scorecard — the only judgement the user ever sees

`lib/grade/`, `POST /api/grade`. Runs **after** the rep, on the whole
transcript. **60% deterministic, 40% judgement** (§07).

**The deterministic 60%** — seven measured metrics, each scored against a band
with a tolerance, then averaged:

| Metric | Target |
|---|---|
| talk ratio | 40–55% of the words are his |
| questions per 3 min | 3–8 — a floor *and* a ceiling; past eight he is running a survey |
| open : closed ratio | at least 2:1 |
| fillers per minute | at most 4 |
| longest monologue | at most 22 seconds |
| mean response latency | at most 1.8 seconds |
| the ask | specific beats vague — a vague ask lands at 44 rather than 0, because he did the hard part |
| the exit | warm with no push |

**The judgement 40%** — a model returns six sub-scores, each 0–100, each with a
quote from the transcript as evidence:

`opening` · `curiosity` · `listening` · `signalReading` · `composure` · `close`

The model is explicitly told not to restate the deterministic metrics; they
already carry 60% of the composite and letting it re-judge them would weight
them twice.

**What comes out of it:**

- the composite, and the full working, so a score can be taken apart rather than
  trusted
- `focus` — the two weakest sub-scores, which become the mission on the next rep
- `wentWell`, named before anything critical, because a user who feels flayed
  does not return
- a memory line, filtered through `lib/grade/memory.ts`, which is what she
  remembers about him next time

**Outcome contributes nothing to the composite.** That is §07 and it is checked
in code.

### 6.6 Safety — moderation on both streams

`lib/safety/`. Runs on **his** stream and **hers**, and reduces every provider
category to one of four verdicts: `ok`, `boundary`, `stop`, `distress`.

| Action | When | Effect |
|---|---|---|
| `decline` | his first boundary strike | **she says no, in character.** Not a dialog, not the app's voice — she declines as a person who has just been made uncomfortable, and the rep continues |
| `correct` | *her* line crossed | she is pulled back silently; the user is told nothing |
| `end` | his second strike | the rep ends |
| `distress` | distress on his stream only | the rep ends **and the training frame is dropped** (§16.8) |

Content involving minors ends it on sight, from either stream. Strikes are
counted separately per stream and never decrease within a rep: a boundary that
expires is a boundary that can be waited out.

**Moderation fails open**, deliberately: §05 does not allow a vendor outage to
cut off a live rep.

> **Note the scope.** This layer handles explicit content, minors and distress.
> It is not a rudeness detector, and ordinary contempt — insults, dismissal,
> being told to go away — passes through it as `ok`.

---

## 7. How humanness is currently attempted

Pulling the above together: this is the complete list of mechanisms whose job is
to make her feel like a person rather than a chatbot.

### Things that work by *withholding*

1. **She starts cold.** Trajectory starts run from 5 (Alex) to 48 (Tess), with
   most of the roster in the twenties and thirties. ENGAGED — the first band
   that lets her ask about him — begins at 60, so **nobody on the roster opens
   pleased to see you**, and the easiest character still opens twelve points
   below it.
2. **The band withholds behaviour, not syllables.** An earlier version expressed
   coldness purely as a word cap and produced a stranger who could not form a
   sentence. A cold band now withholds what coldness actually withholds —
   curiosity, volunteering, softening, follow-ups — while leaving her enough
   words to sound like a person who simply is not interested.
3. **Gated behaviours.** Flirting, personal disclosure, starting her own topics
   and using his name each unlock at an authored warmth. Below it they are not
   mentioned at all.
4. **Asymmetry.** Warmth rises slowly and falls fast, with diminishing returns
   and a per-turn cap. A user cannot undo a bad turn by saying two nice things.
5. **The banned register**, enumerated in the contract and mirrored by the
   stability meter: no offers of help, no "as an AI", no "take your time", no
   recaps, no structured advice, no complimenting the user's effort.

### Things that work by *varying*

6. **Three axes and five postures**, so she can be interested but not at ease,
   or at ease but bored — states that are recognisable as people and unreachable
   with one number.
7. **Temperament weighting**, so the same turn is worth different amounts to
   different characters. Without it every character on the ladder is moved by
   identical arithmetic and `personality` is pure prose.
8. **Scene beats** on the rep clock — she finds the book she came in for; someone
   squeezes past behind her — so the room does something to her that he did not
   cause.
9. **`want`.** Her own agenda, ungated. Every other clause describes how she
   *responds*; without this she has no reason to say anything nobody asked for,
   and a person who only ever answers is the most recognisable tell there is.
10. **Delivery is forced, not hoped for.** On this arm expression is realised as
    audio tags and voice settings — `[playful]`, `[dry]`, `[distracted]`, plus a
    stability value per expression — rather than as prose the model may ignore.
11. **Memory.** `persona_memory` carries one filtered line between reps, so a
    second conversation is not a first conversation.

### Things that work by *reacting*

12. **The repair window.** A misstep followed by a decent recovery is worth 1.6×
    an ordinary turn, and she is told she may acknowledge it — a repair the other
    person does not visibly register is not a repair.
13. **Breakthroughs.** Twice a rep, a judgement at the top of the model's range
    escapes the per-turn cap, so liking can arrive as an instant rather than a
    curve.
14. **Overreach.** Intimacy measured against what has been earned, priced at −6
    or −15. This is the mechanism that makes a character able to be *pushed too
    fast*.
15. **In-frame decline.** The first safety strike is her saying no, in her own
    words, not the app interrupting.
16. **Exit conditions.** Each character carries her own, in prose: three dead-end
    replies in a row, he says goodbye, he crosses a real boundary.

### Where this currently falls short

Two of the above are load-bearing and **do not fire today**, and a reader
diagnosing a rep that felt inhuman should know it:

- **Nothing detects ordinary hostility.** §6.1 lists the complete set of
  penalties and contempt is not among them; §6.2's judgement layer can recognise
  it but is routed to on the strength of the fast score. Measured on a
  production rep: a user was openly contemptuous for two minutes and warmth rose
  from 47 to 52, because "What the fuck?" was scored as an open question.
- **The "crosses a real boundary" exit has no trigger.** Every character carries
  it in prose; nothing in the system ever tells her one was crossed. That exit
  has never fired.

Related, and smaller: no character on the roster can currently be told to be
cutting (the steering clause needs effective sharpness ≥ 60, and Nadia's maxes
at 35); no character has any authored `moods`, so `moodFor` is dead code and
every rep against a given character is the same afternoon; and eight of nine
rooms are silent.

The argument, the measurements and the transcripts behind all of these are in
`PERSONA-AUDIT.md`.

---

## 8. Where each judgement lives

| Judgement | File | When | Sees a model? |
|---|---|---|---|
| Is he still speaking? | `lib/voice/elevenlabs/vad.ts` | continuously | no |
| What did he say? | `lib/voice/elevenlabs/stt.ts` | per turn | yes (transcription) |
| What is this turn worth, mechanically? | `lib/warmth/fast.ts` | per turn, synchronous | no |
| What did he mean, and how intimate was it? | `lib/warmth/slow.ts` + `/api/warmth/score` | on trigger, async | yes |
| Is this turn overreaching? | `classifyOverreach` in `lib/warmth/slow.ts` | with each slow score | no |
| Where does the meter move to? | `lib/warmth/engine.ts` | per turn | no |
| What is she told this turn? | `lib/warmth/steering.ts` + `session.ts` | per turn | no |
| How long may she speak? | `lib/warmth/bands.ts` → `combined.ts` | per turn, enforced | no |
| Has she stopped being the character? | `lib/metrics/stability.ts` | per agent turn | no |
| Is either stream unsafe? | `lib/safety/` + `/api/safety` | both streams | yes (moderation) |
| Does she offer her number? | `lib/data/rep-rules.ts` | once, at 30s remaining | no |
| How did the rep go? | `lib/grade/` + `/api/grade` | after the rep | yes (40% of it) |
| What does she remember? | `lib/grade/memory.ts` | after the rep | filtered |

---

## 9. The rules that constrain any change here

From `CLAUDE.md`, restated because they are the reason several of the above look
the way they do:

1. **Only one system may own reply length.** The band owns it. Two systems with
   numbers produce a third answer nobody asked for.
2. **Outcome is never scored.**
3. **She is never told a number, a band, a level, or that a meter exists.**
4. **Never announce a downward difficulty adjustment.** Silent.
5. **No coaching during a live rep.**
6. **A locked gate is never mentioned.**
7. **Content is authored in the repo and reviewed in a pull request**, never
   generated at runtime.
8. **Both voice arms must emit identical normalised transcript turns**, because
   scoring depends on comparability and a provider switch must not silently
   change a score.

---

*Companion documents: `NERVE-SPEC.md` (the specification), `PRODUCT.md` (the
shape as built), `PERSONA.md` (the four-layer schema), `PERSONA-AUDIT.md` (the
defects and the arguments), `PIPELINE.md` (the voice arm), `DATA.md` (the
tables).*
