# Humanness — the diagnosis and the plan

> **What this is.** A proposal document, written against `HUMANNESS.md` as it
> stands. It argues that the reason a rep feels like a chatbot is not the
> character model — which is close to right — but the last 400 milliseconds of
> the pipeline, where everything the character model knows is thrown away.
>
> It is ordered by impact per unit of cost. Nothing in Part 1–5 requires a new
> vendor, and three of the six largest wins are free.

> ## Status — items 1 to 4 shipped, 6 September 2026
>
> | # | Change | State |
> |---|---|---|
> | 1 | Stop sentence-splitting; buffer the full turn | **shipped** |
> | 2 | `responseDelayFor` — latency as a channel | **shipped** |
> | 3 | Contempt pre-filter + suppress positives | **shipped** |
> | 4 | Moods and room tone | **shipped** |
> | 5–10 | Text-to-Dialogue socket, disfluency, Smart Turn v3, interruption, boundary exit, backchannels | not started |
>
> ## The plan was reordered on 6 September, and it was wrong about what mattered
>
> Reading a real transcript back changed the diagnosis. This document is almost
> entirely about **delivery** — prosody, timing, disfluency — and the loudest
> defect in that rep is a **policy** failure that none of it touches:
>
> > him "Mhm." → her "I like airports too, even if it's silly."
> > him "음." → her "You ever read a thriller that takes place in airports?"
> > him "Mm-mm-mm." → her "Airports just feel like a good place for stories."
>
> Three consecutive non-responses, answered with self-disclosure, a question and
> more self-disclosure, at warmth 41. **The warmth engine models how much she
> likes him; nothing modelled who is doing the work**, and here the two came
> apart completely. That is the assistant instinct leaking through the
> character: when the user gives a model nothing, the model works harder,
> because that is what a base model is for. She sounds like an AI because she is
> **helpful**, not because her prosody resets.
>
> So four cheap pure-function changes went in ahead of items 5–10, all of them
> in `lib/warmth/`:
>
> | Change | What it does |
> |---|---|
> | Mirror cap | `min(bandCap, ceil(hisWords × 1.3))`. "Mhm" buys two words, not nine |
> | Question gate | Only when he offered something, never turn one, never after a dead end |
> | Volunteer gate | Unprompted disclosure waits for OPEN. Below it the band already answers and stops |
> | Delta rebalance | Dead end −3 → −6, streak −4 → −8 and starting on the second. Applied ratio 2.6:1 → 1.43:1 |
>
> #### The same evening, the correction — every floor above was ENGAGED
>
> Read back against a real rep hours later, those gates turned out to be **a
> second warmth system on top of the band table, set twenty points higher than
> it**, winning every argument silently. A seventeen-turn rep against Nadia —
> the second-easiest character on the roster, played competently — peaked at
> 56, so for the whole three minutes she asked nothing, volunteered nothing, and
> had all four of her authored gates (40 and 45) dropped unread. Tess, whose
> four all open below 35, could never have fired one at all. With nothing
> permitted to fill the words she filled them by restating his own sentence back
> at him: "true crime, mostly" → "Yeah, something like true crime, mostly."
>
> That is this section's own defect with the sign flipped — **one module
> deciding something another module already owned.** The floors are now OPEN,
> the gates read their own `unlocksAt`, and two clauses were deleted outright:
> "Answer what he asked and stop", which the band directive already said in its
> own words at every warmth it could fire at, and "You have nothing to say
> back", which could only ever land on a turn she was about to speak on.
>
> Four more went with it, all the same shape:
>
> | Change | What it does |
> |---|---|
> | The opening turn is never a dead end | "Hey there." cost −6 and tripped the silence gate, so the product answered the first sentence a nervous user ever spoke with nothing |
> | A question is never mirrored | Five words bought a seven-word ceiling. A question is short by construction and is a request for an answer |
> | A real turn is floored at the band's typical | "I am hungry" is not "Mhm", and one two-word floor served both |
> | `relative` posture is the default | `PERSONA-AUDIT.md` §3.1, opt-in since it was written and opted into by nobody. Its clauses stopped speaking about questions too, so the band is again the only thing that does |
>
> And the harness could not have caught any of it: `rep:audition` read the band
> cap rather than `session.replyWordCap` and never touched `staysSilent`, so the
> two rules added that morning were the two it could not see. It goes through
> `bindVoiceSteering`'s three members now, in that order.
>
> `HUMANNESS.md` §7.1 is the write-up, and `reciprocity.test.ts` pins both reps —
> they pull in opposite directions on purpose, which is what a gate is.
>
> Plus the null turn the gates imply — she may say nothing — and the STT model,
> which was mis-transcribing accented English into Korean script and then
> **scoring it**: one garbled "음." earned +2.44 from the slow scorer.
>
> `HUMANNESS.md` §7.1 is the record of what landed.
>
> What landed is recorded at the end of each part below, under **What shipped**.
> Two things are owed by hand and neither is code:
>
> - **`npm run db:seed`.** `dials.room` is mirrored into the `personas` table and
>   every character's room moved. The rep path reads the registry, so nothing is
>   broken today, but the table is stale until it is reseeded. `moods` is not
>   seeded and does not need to be — it is registry-only, like `want` and
>   `sceneBeats`.
> - **`npm run rep:audition`.** Buffering the turn changes what the vendor
>   receives, and the timing layer changes when it is heard. Neither is
>   measurable at a desk. It spends money, so it is run by hand.
>
> **The number to watch after deploy** is `requestToFirstAudioMs` in the turn
> metadata. Buffering moves synthesis behind `llmCompleteMs` and should cost
> 150–250ms on a nine-word turn; §3 is deliberately spending that in every band
> but the two warmest, so the perceived change should be near zero at low warmth
> and real at INVESTED. If it is much worse than 250ms, the text model is the
> thing to look at, not the buffer — see the note at the end of §8.

---

## 0. The diagnosis in one sentence

**The state machine is at ninety percent. The rendering is at twenty.**

`HUMANNESS.md` describes a system that models a stranger's interior with more
care than any competitor in this category: three semi-independent axes, five
postures, asymmetric gain and decay, diminishing returns, temperament weighting,
intimacy measured against what has been earned. That work is real and it is
correct.

Then all of it is compressed into **one bracketed line of at most 420
characters**, handed to a text model that writes **at most fifteen words**, and
spoken by a TTS model that is **told nothing about the rep, the character, the
warmth, or what she said ten seconds ago.**

She is not failing to *be* a person. She is failing to *be rendered* as one.
Everything below is about the rendering.

---

## 1. Why she sounds like an AI

There are three tells, and they are ranked by how loudly they announce
themselves. None of them is word choice — the banned register in §6.4 has
already handled word choice better than most shipped products.

### Tell 1 — she is never late

This is the largest, the cheapest to fix, and it is currently not modelled at
all.

Stivers et al. (2009, PNAS) measured turn-taking across ten languages, from
indigenous communities to major world languages, and found a **universal modal
gap of about 200ms** between one speaker stopping and the next starting, with
every language falling within 250ms of that mean. The variance is wide — one
standard deviation is roughly 519ms — but the *distribution* is universal.

The part that matters for Nerve is what the tail means. **Gaps beyond roughly
700ms are read, cross-culturally, as a dispreferred response.** Silence before
an answer is not neutral. It means: I don't want to. I disagree. I'm about to
say no. Listeners decode this without being taught it, in every language tested.

Nerve ships a character whose entire product premise is *variable, earned
interest* — and delivers every one of her lines at the same machine-determined
latency. The single most-read social signal for reluctance is sitting unused in
the pipeline, treated as a cost to minimise rather than as a channel to write
on.

Worse: a **constant** latency is itself a tell, even at a plausible mean. Human
response times are a wide distribution. A character who answers at 840ms, then
860ms, then 850ms, is a machine no matter what the mean is.

### Tell 2 — she is never clumsy

A 2026 study on synthetic voice perception found that listeners rely on what the
authors call an **imperfection heuristic**. <cite>Participants overwhelmingly
interpreted localized irregularities — filler words, pauses, stuttering, minor
repetitions, breathing artifacts — as markers of humanness, describing them as
"natural," "genuine," "unpolished."</cite> The inverse held too: <cite>monotone
or "overly clean" human recordings were perceived as artificial.</cite> Of eight
AI-generated clips that deliberately included disfluencies and breathing, six
were majority-labelled human.

Nadia is flawless. Every line is a complete, well-formed sentence, delivered
cleanly, with no breath, no restart, no trailing off, no "um."

And here is the part that should be uncomfortable: **`lib/warmth/fast.ts`
penalises the user −2 for filler rate and −2 for hesitation.** The product
explicitly measures the two most reliable markers of human speech production,
charges the user for producing them, and gives the character zero. That
asymmetry is not subtle. A nervous user stumbles for three minutes across from
someone who never does, and at some level he knows what he's talking to.

### Tell 3 — she resets tone every sentence

This is the one already reported: *"we are getting the voice from ElevenLabs line
by line, so the tone doesn't feel consistent."* It is real, it is mechanical, and
the cause is precise. Part 2 is entirely about it.

### The corollary

The three tells share a structure. Real speech carries meaning on at least six
channels: **words, length, timing, prosodic continuity, disfluency, and
turn-taking.** Nerve writes on two of them — words and length — with enormous
sophistication, and leaves the other four at their factory defaults.

That ratio, roughly two channels of six, is close to the twenty percent.

---

## 2. The prosody bug, precisely

### 2.1 What is happening now

The pipeline flushes her line to ElevenLabs **sentence by sentence as it
arrives**, each sentence a separate generation with no knowledge of its
neighbours. Three facts make this worse than it looks.

**Fact one: v3 is documented as unstable on short inputs.** ElevenLabs' own
prompting guide for v3 states plainly that <cite>very short prompts are more
likely to cause inconsistent outputs</cite>, and recommends inputs **greater
than 250 characters**.

Now read the band table in §5.3 against that number:

| Band | Typical words | Approx. characters |
|---|---|---|
| HOSTILE | 3–4 | **~20** |
| CLOSED | 4–5 | **~25** |
| GUARDED | 6–7 | **~35** |
| OPEN | 7–8 | **~42** |
| ENGAGED | 8–9 | **~48** |
| INVESTED | 9–10 | **~55** |

Every band in the product sits in the regime the vendor documents as unstable —
the warmest band at about **a fifth** of the recommended floor. And then the
pipeline *splits that further*.

This is not a tuning problem. The product's central design decision — a stranger
who is terse because coldness is terse — puts it permanently in the worst
operating regime of the model it uses. That collision has to be solved
deliberately, and §4 solves it in a way that costs nothing in words.

**Fact two: request stitching does not work here.** ElevenLabs' `previous_text` /
`next_text` / `previous_request_ids` parameters exist for exactly this problem —
<cite>maintaining a consistent voice and prosody throughout the entire text</cite>
— but <cite>request stitching is not available for the eleven_v3 model</cite>.
The obvious fix is closed off on the current model.

**Fact three: the sentence-splitting buys nothing.** Splitting at sentence
boundaries is a latency optimisation for long generations. Her turns are three to
fifteen words. **Nine times out of ten the entire turn is one sentence.** The
pipeline is paying the full prosodic cost of chunking and receiving, on the
overwhelming majority of turns, zero latency benefit in return.

### 2.2 The fix

**Stop splitting. One turn is one prosodic unit. Buffer her complete line, then
speak it.**

On a nine-word turn, buffering the full generation from a streaming text model
costs roughly 150–250ms over first-sentence flush. Part 3 argues you should be
*spending* that latency deliberately anyway, which makes this free twice over.

Then move from per-sentence HTTP calls to the **Text to Dialogue WebSocket**
(`wss://api.elevenlabs.io/v1/text-to-dialogue/stream-input`), held open for the
whole rep. This is the only route to the v3 models and their inline audio tags,
and it is the only mechanism that gives cross-turn prosodic continuity now that
stitching is unavailable.

Four operational details that will bite otherwise:

- **`new_turn` is a prosodic reset.** The documentation says to <cite>set
  new_turn: true when a speaker finishes a turn so prosody resets cleanly.</cite>
  Prosody therefore *carries* between inputs by default. This is a gift: map
  `new_turn` onto **band or posture change**, not onto every turn boundary. Let
  her voice carry its colour across turns while her state is stable, and reset it
  at the moment the state actually moves. That is one line of code and it is the
  difference between a character who has a mood and a character who has a mood
  per sentence.
- **The buffer threshold will strand her short lines.** Text on a turn is
  buffered until the server has <cite>at least ~40 characters and 8 words</cite>.
  A HOSTILE four-word reply never reaches that threshold and will simply sit
  there. Send `flush: true` to force generation without closing the socket. Every
  band below OPEN needs it on every turn.
- **The socket idles out at 20 seconds.** Send `{"keep_alive": true}` during the
  brief screen and during long user turns.
- **Tags return as spoken characters in the alignment.** Pipecat's integration
  notes warn that audio tags <cite>come back as spoken characters in the
  alignment, so they reach the LLM context as text unless a text filter removes
  them.</cite> `HUMANNESS.md` §9 rule 8 requires both voice arms to emit
  identical normalised transcript turns. **Strip tags before the transcript
  normaliser**, or `lib/metrics/stability.ts` will start scoring `[dry]` as part
  of her vocabulary and the grade will drift between arms.

### 2.3 What this fixes and what it does not

This fixes tone *discontinuity* — the jump between sentence one and sentence two,
and the reset between turn four and turn five. It does not make her prosody
*meaningful*, because the TTS still has no idea what the conversation is about.
That is the harder half, and §4 addresses it.

### What shipped — the first half of §2.2 only

**Splitting is gone.** `combined.ts` collects the whole generation and hands it
to synthesis in one request; `shouldFlush` is deleted. The band ceiling, which
used to ride on the flush, is now `capToBudget` applied to the buffered reply —
the same rule (whole sentences, always at least the first, never a cut
mid-clause), and it is now the *live* path rather than the offline one, so the
audition harness and the customer go through one function instead of two
implementations. The compatibility path in the adapter buffers identically.

Measured on the stubbed pipeline: a three-sentence reply that previously reached
the vendor as three generations of 9, 38 and 15 characters now arrives as one of
76. Still under v3's documented floor — the word caps are product law and are
not moving — but four times closer to it, and the `[playful]` delivery tag now
colours the whole turn rather than only its first sentence.

**The socket did not ship.** Everything from "Then move to the Text to Dialogue
WebSocket" onward — one socket per rep, `new_turn` mapped onto band change,
`flush` for the short bands, keep-alives, tag stripping before the normaliser —
is item 5 and is untouched. Cross-turn prosody is still reset every turn.

**One new failure window, closed in the same commit.** While the pipeline
flushed sentence by sentence there was almost always audio in flight by the time
a barge-in landed. Now generation runs with nothing playing, so a barge-in in
that window must commit *no* transcript at all — a turn recorded there would be
a line she never said, coming back as history on the next turn. Asserted in
`adapter.test.ts`.

---

## 3. Latency as the fourth layer

This is the highest-value change in the document and it requires no vendor, no
model, and no new dependency. It is a `setTimeout` and a lookup table.

### 3.1 The principle

`HUMANNESS.md` §4 describes the character as four layers: trajectory,
personality, gated, room. **Timing should be the fifth**, and it should read the
same warmth the other four read.

The scorecard already grades *the user* on mean response latency (target: at most
1.8s). The product understands that latency carries meaning. It has simply never
applied that understanding to her.

### 3.2 `responseDelayFor(warmth, posture, turnKind)`

A pure function in `lib/warmth/`, tested like `rep-rules.ts`, returning a
millisecond delay applied between the model's line being ready and playback
starting. Indicative shape — the numbers want tuning against real reps, the
*structure* is the point:

| Band | Target gap | Distribution | What it says |
|---|---|---|---|
| HOSTILE | 900–1400ms | wide | I am not going to make this easy |
| CLOSED | 700–1100ms | wide | dispreferred, audibly |
| GUARDED | 500–900ms | medium | polite reluctance |
| OPEN | 350–650ms | medium | ordinary |
| ENGAGED | 200–400ms | narrow | engaged, ready |
| INVESTED | 120–280ms | narrow, occasional overlap | I was already going to say something |

Three refinements that carry most of the realism:

- **Posture overrides band.** `wary` — interested but not at ease — should be
  *slow* even at warmth 70. That is what wariness sounds like. A character who is
  warm and fast is easy; a character who is warm and hesitant is a person.
- **Question type moves it.** An intimate question, or one near the overreach
  gap, should add 300–600ms *regardless of band*. Hesitation before a personal
  answer is the most legible social signal in the product, and right now it does
  not exist.
- **Sample, never fix.** Draw from a distribution with realistic spread
  (SD ≈ 300–500ms). A constant delay is a metronome and a metronome is a machine.

### 3.3 Why this is worth more than it looks

Your pipeline almost certainly *already* sits around 800ms–1.5s. That means the
cold bands need **no engineering at all** — they need the existing latency to
stop being treated as a defect. Only the warm bands need real optimisation, and
only down to ~200ms.

So the work inverts. Instead of "reduce latency everywhere," it becomes "get the
floor to 200ms for INVESTED, and spend the rest deliberately." That is a much
cheaper engineering target than uniform low latency, and it produces a better
character.

### What shipped

`lib/warmth/timing.ts`, replacing `replyDelayMs`. `responseDelayFor(warmth,
shape, rng)` is pure, tested in `timing.test.ts`, and reads exactly the table in
§3.2. All three refinements landed:

- **Posture is a floor, not an addition.** Adding 400ms to INVESTED would still
  leave a wary character faster than a merely open one, which is the opposite of
  what wariness sounds like. `wary` is timed as GUARDED and `polite` as OPEN, so
  the rule reads as "she answers like a guarded stranger" rather than as
  arithmetic. `taken` is the only posture that may run early, by 80ms.
- **Turn kind is derived from the pre-filter that has already run.** `intimate`
  is a personal-marker hit, `dispreferred` is hostility or a sharply negative
  fast score. Synchronous, no model, no new call — `WarmthSession.replyShape`.
- **Sampled.** Box–Muller centred on the band with its half-width as one SD,
  clamped to ±2 SD and to a 2,000ms ceiling. Drawn once per turn and cached, so
  the number cannot depend on how many times a player happened to be built.

It reaches the ear through `PcmPlayer`'s existing `notBefore`, after
`remainingResponseDelayMs` subtracts the time the pipeline has already spent —
so it is a target onset and never an added wait. `setWarmth(warmth, shape)`
carries it on both arms; the Realtime arm feeds the same draw to its response
gate.

The numbers are the ones in §3.2 and they want tuning against real reps. The
tests assert the *structure* — the band ordering, the posture floor, the
hesitation bump, and that no two draws in the same state are equal — and
deliberately not the constants, because a test that pins them is a test that
argues against tuning them.

### 3.5 The latency budget, measured — and §3.3 was wrong by 2.5x

This document guessed the pipeline "almost certainly already sits around
800ms–1.5s". Measured on a real rep, the median perceived latency is **3,683ms**
(p90 3,934):

| Stage | Median |
|---|---|
| VAD silence | 615ms |
| STT | 658ms |
| LLM first token → complete | 701 → 941ms |
| TTS first byte | 603ms |

So `responseDelayFor` returns **zero on every turn**, at every band, because
`remainingResponseDelayMs` subtracts time the pipeline has already spent and
even HOSTILE only asks for 1,400ms. The layer is live and inert.

That is not a bug, it is arithmetic — but note what it means: **every line she
speaks is already four times past the 700ms dispreferred threshold, uniformly.**
The reluctance signal is permanently on, and a signal that is always on carries
no information.

The cheapest part of that budget is the VAD: Smart Turn v3 (item 7) should take
615ms to under 200. STT and the character model are both vendor swaps. A
realistic floor is 1.2–1.5s, which buys a **one-second expressive spread** —
not the 200ms this document imagined, but enough to be heard.

### 3.4 And it is the only change here that teaches

Everything else in this document makes her more convincing. This one makes the
product *work better as training*.

A user who practises against a character whose silences mean something learns to
read silence. That skill transfers directly and completely to a real bookshop,
because the 200ms/700ms structure is not a Nerve convention — it is, per Stivers,
a human universal. Currently the product teaches the user to ignore timing,
because timing carries no information. That is a small amount of active harm.

---

## 4. The disfluency engine

### 4.1 The rule

**Delivery is forced, not hoped for.** §7.10 already establishes this: expression
is realised as audio tags and voice settings rather than as prose the model may
ignore. Disfluency must follow the same rule.

**Do not ask gpt-4.1-mini to write fillers.** It will produce parody — "Um, like,
I guess, um" — and it will do it every turn because instructions at maximum
recency read as *do this now* (a lesson §5.4 already learned the hard way about
permissions). Instead: let the model write her line clean, then run a
**deterministic post-processor** that injects disfluency at a linguistically
valid position, at a rate set by state.

This is testable, cheap, consistent with the existing architecture, and it
belongs in the same layer as `wordCapFor`.

### 4.1a What shipped instead — 10 September 2026

**Not the post-processor.** A different mechanism, for a reason this section
half-anticipated and half-got-wrong.

The measurement first. Across 1,274 real agent turns: **six** disfluencies,
five self-repairs, three bare answers, and one request to repeat something. So
the diagnosis in §4 is correct and if anything understated — she is not
under-disfluent, she is *never* inarticulate.

**What was wrong was the account of why.** §4.1 says "do not ask gpt-4.1-mini to
write fillers, it will produce parody, and it will do it every turn because
instructions at maximum recency read as *do this now*". That is true of the
DIRECTIVE and it is the reason the steering line was never the place for this.
But it is not true of the **cached prefix**, and the prefix is where a
demonstration can live: a permission restated before every single generation is
an order, and an example sitting in a system prompt that has not changed for
fifteen turns is a description of a register. The two are not the same
instrument, and §4.1 treated them as one.

So what shipped is:

- **`Persona.examples`** — eight authored exchanges per shipped character,
  compiled into the contract. Two of Maya's eight hesitate, one mishears him,
  one is a single word. Framed explicitly as a range and not as lines to reuse,
  because a parroted few-shot block is a louder tell than an epigram.
- **`budgetedWordCount`** — the other half, and it is arithmetic rather than
  prose. At a six-word ceiling "Um, I dunno. Work stuff." spends a third of its
  budget on nothing, so a writer optimising for informative density under a hard
  cap correctly drops the filler. **The cap and the register were fighting and
  the cap always won.** Filler is now free against the band budget;
  `spokenWordCount` keeps the honest number for telemetry and the drift
  detector.

**§4.2–§4.4 are not superseded and the injector may still be needed.** The
honest position is that this is the cheaper experiment and it has not been
heard: the suite proves the examples compile and the budget forgives filler, and
neither proves she hesitates. `npm run rep:audition` is the instrument
(`PERSONA-AUDIT.md` §14.5). If a listening pass says the examples sit there
unread, the deterministic injector below is the fallback and the placement rules
in §4.2 are what it should be built on.

### 4.2 Placement is not random

The literature is specific about where disfluency occurs, which is what makes a
rule-based injector viable:

- **Length predicts rate.** Oviatt found that a simple linear regression over
  utterance length accounts for **77% of the variance** in disfluency. Longer
  turn, more disfluency. Her INVESTED turns should be measurably messier than her
  CLOSED ones — which is a lovely inversion of the band table, and reads exactly
  right: cold people are curt and clean, warm people ramble and stumble.
- **Unfamiliarity predicts rate.** Merlo et al.: disfluencies rise on unfamiliar
  topics, and Beattie et al.: on contextually improbable words. Route this off
  the slow scorer's `intimacy` score — she should stumble more when the topic is
  further from small talk.
- **Dispreferred responses attract hesitation.** Declining, deflecting, or
  refusing draws a filled pause before it. This maps onto the `decline` safety
  action and onto every low-warmth answer.

### 4.3 Disfluency type is a personality channel

This is the part worth building carefully, because it turns a realism hack into a
fifth expression of layer 2.

Székely et al. (Interspeech 2017) found that **decreased vocal effort, filled
pauses, and prolongation of function words all increase perceived uncertainty**,
and that the effects interact rather than merely adding. Separately, Wester et
al. (2015) found that fillers like *I mean, you know, like, uh* made a synthetic
voice read as **less extroverted, less open, less conscientious**.

That is not a problem — it is a dial. Nadia at `sharpness` 35 and Alex at 25 want
different disfluency vocabularies:

| State | Disfluency signature | v3 realisation |
|---|---|---|
| Cold, sharp, composed | none; clipped; fast onset | `[clipped]`, short line, no tags |
| Low comfort, high interest | filled pauses, prolongation | `[hesitant]`, ellipses, `[drawn out]` |
| High distraction | trailing off, restarts | em-dash restart, `[distracted]`, unfinished clause |
| Warm, at ease | breath, soft laugh, latching | `[breathes]`, `[light chuckle]` |
| Dispreferred / declining | pause *before* the line | `[pause]` + hesitation marker |

Derive it in `compileInstructions` alongside the behaviour block, so it lives in
exactly one place, like every other derived dial.

### 4.4 This also solves the character-count collision

Recall §2.1: every band is far below v3's stability floor, and the word caps are
load-bearing product design that must not change.

**Tags and disfluency markers add characters without adding words.**

```
Before:  Yeah, it's fine.
         (16 chars, 3 words)

After:   [quiet] Mm. Yeah, it's... it's fine.
         (44 chars, 5 words — clears the 40-char buffer threshold)
```

The word cap is respected. The v3 input is nearly tripled. The line crosses the
Text-to-Dialogue buffer threshold without needing `flush`. One change serves
three constraints at once, which is usually the sign it is the right change.

**One caveat to enforce in code:** the injector must run *after* `wordCapFor`,
and injected fillers must not count toward the cap. Otherwise §9 rule 1 —
only one system may own reply length — quietly breaks, and you get the third
answer nobody asked for.

### 4.5 Text-level disfluency, which is free

Separately from audio tags, the contract should require **orthographic
reduction**. TTS speaks what is written. "I don't know" and "dunno" are different
performances. "Going to" and "gonna" are different people.

Add to the compiled contract: *write speech, not prose. Contractions always.
Fragments are correct. Sentences may be abandoned.* Then relax the band directive
language slightly — "one sentence, seven or eight words" quietly enforces
grammaticality, and real disengaged speech is not grammatical. `Yeah, no — it's`
is a complete disengaged reply and the current directives forbid it.

---

## 5. Turn-taking

### 5.1 Replace the silence-threshold VAD

`lib/voice/elevenlabs/vad.ts` decides he has stopped speaking by silence
threshold, calibrated per user. This is the pre-2025 approach and it fails
hardest on exactly your user.

The product's own words: hesitation is *"disabled below level 4, because our user
is nervous by definition."* A nervous person pauses mid-sentence constantly. A
silence-threshold endpointer interprets every one of those pauses as a completed
turn and talks over him. **Being interrupted mid-thought by someone who is not
listening is the single most inhuman experience the product can deliver**, and it
is happening to the users who need the product most.

**Smart Turn v3** (`pipecat-ai/smart-turn-v3`) is the fix: an open-source
semantic VAD that <cite>tells you whether a speaker has finished their turn by
analysing the raw waveform, not the transcript</cite>. It outputs a single
completion probability. It is BSD-licensed, runs fast CPU inference via ONNX, and
was trained on datasets that deliberately included <cite>sentences ending in a
filler word</cite> and <cite>sentences where the speaker uses intonation and
vocal cues to indicate that they have more to say</cite> — precisely the two
cases your users produce.

Cost: **zero.** Dependency: one ONNX runtime. LiveKit ships an equivalent at
~10ms inference for English if you prefer that lineage.

### 5.2 The part that turns this into a character feature

Once you hold a *probability* that he has finished rather than a boolean, you
unlock something the roster cannot currently express: **deliberate interruption**.

`distraction` is currently prose in a contract. With a turn probability it
becomes mechanical:

```
floorTakingThreshold = f(distraction, warmth, patience)
```

- A patient, engaged character waits for p ≥ 0.85, and pauses after.
- A distracted, cold character takes the floor at p ≥ 0.40 — cutting across the
  tail of his sentence.

A stranger who cuts you off because she has stopped caring is worth more
humanness than any amount of prosody work, and it makes `distraction` a real
dial instead of an adjective. It also gives the roster a genuine difficulty axis
that is not just arithmetic.

Constrain it: never on his first turn, never during a `repair` window, never
after a boundary strike. And it must be reflected in the transcript truncation
that §3 already does correctly for her side.

### 5.3 Backchannels

Lower priority, real payoff. A short `[mm]` or `[mhm]` while he is mid-sentence
does two things: it signals listening, and it covers latency.

Pre-generate three or four of these per voice **once**, cache them as audio, and
play them locally. Zero per-rep cost, no round trip, no socket contention.

Gate them on warmth — a CLOSED character does not backchannel, and her *not*
backchannelling is itself a signal a user should learn to read. Roughly one per
four-to-six sentences of extended user speech is the rate the literature
suggests; err low, since silence is also natural and over-backchannelling is
worse than none.

---

## 6. The integrity defects

These are already documented in §7 as "does not fire today." They are listed here
because they are not polish — they are the difference between a training product
and a toy, and the fix for the first one is very small.

### 6.1 Contempt

Measured, in your own document: *"a user was openly contemptuous for two minutes
and warmth rose from 47 to 52, because 'What the fuck?' was scored as an open
question."*

The structural cause is stated exactly right in §6.2: **the one layer that can
recognise hostility is gated behind the one layer that cannot.** `negative-turn`
routes to the slow scorer on `fast ≤ −3`, and the fast scorer has no
representation for contempt.

Two changes, both small:

1. **A lexical hostility pre-filter in `lib/warmth/triggers.ts` that does not
   read the fast score.** Second-person negative predicates, imperatives to
   leave, directed profanity, dismissals. Loose is fine — §6.2 already argues
   correctly that a false positive costs one cheap model call and a false
   negative costs the rule the only turn it existed for.
2. **Suppress positive fast reasons on a flagged turn.** One guard in `fast.ts`:
   a turn matching the hostility filter cannot earn `open-question` or
   `engaged-length`. Hostility is currently *farmable* — a user who learns to
   insult her with a question mark is being actively trained in the wrong
   direction.

This is perhaps a day of work and it is the largest single threat to the claim
that the product teaches anything.

### What shipped

Both changes, as described. `hasHostilityMarker` in `lib/warmth/triggers.ts`
reads the text and nothing else, adds a `hostility` trigger that fires before
`negative-turn` and independently of it, and is re-read by `fast.ts` to refuse
`open-question` and `engaged-length` on a flagged turn.

**One deviation, and it matters.** §6.1 says "loose is fine", and that is right
for the trigger — a false positive costs one cheap model call. It is *not* right
for the second half, because that one costs the user points, and charging an
enthusiastic user for "this is fucking great" would be the filler-rate mistake
`fast.ts` already made once and recorded. So the filter is tuned for precision
as well: profanity matches only where it is **directed or exclamatory** ("What
the fuck?", "fuck you", "what the hell are you on about"), alongside
second-person insults, imperatives to leave and explicit dismissals. Bare
profanity mid-sentence does not match, and neither does "what the hell is that
one about", which is a person being curious with their voice up.

The fast layer still has no *representation* for contempt and deliberately never
will — judging what a turn meant is the slow scorer's job and §07 splits the two
layers precisely so this one never pretends to understand. What changed is that
it stopped paying for the shape.

Replayed end to end through a real `WarmthSession` with the slow scorer off, so
only the layer that was paying is exercised: five contemptuous turns now move
the meter **down** (32.0 → 29.9, the only reason paid being `dead-end`), where
the same turns previously earned `open-question` and `engaged-length`. An
ordinary civil exchange still rises (32.0 → 39.2).

#### What shipped — 10 September 2026

Contempt is no longer farmable and it now costs something. The hostility guard
was two `!hostile &&` conditions bolted to two of the three structural
positives, so **the callback was not covered**: "You're making me miserable."
repeated a word she had said one turn earlier and was paid +2 for listening, and
"Why are you still here?" came out net **+2.25**. Warmth rose 27 → 48 through
two minutes of contempt.

It is one rule over the finished reason set now, so a reason added later cannot
forget it, and a dismissal is charged `CONTEMPT_POINTS` rather than only being
charged for being short. Contempt is also exempt from the patience discount —
patience is grace for fumbling, not grace for being told to fuck off — and it no
longer arms the repair window. Replaying the real transcript through the live
session: peak 45 during the banter, final **17**.

### 6.2 The boundary exit

Every character carries *"he crosses a real boundary"* in prose and nothing ever
tells her one was crossed. §6.2 already computes the signal:
`classifyOverreach` returns `boundary-violation` at gap > 30. Wire that verdict
to the exit condition. The mechanism exists; the wire does not.

Note what this unlocks, given §3: **her leaving is the strongest humanness event
in the product** — the one moment where she demonstrably has her own interests.
It has never fired.

---

## 7. Free wins, in the authoring layer

No engineering. These are the cheapest points in the document.

### 7.1 Moods

*"No character has any authored `moods`, so `moodFor` is dead code and every rep
against a given character is the same afternoon."*

The reader who is doing ten reps against Nadia to climb the ladder is having the
same conversation ten times, and the reviews of every competitor in this category
converge on the same complaint — that experienced users start to see the pattern.
The code path already exists.

Three moods per character, each shifting: opening affect ±8, `want`, one scene
beat, and disfluency rate. That is four numbers and two sentences of prose per
mood. It is the highest realism-per-hour item in this entire document, and it is
pure authoring.

### What shipped — three moods each, and none of them touches a dial

Twenty-seven authored afternoons, three per character across the live roster and
the retired five. One sentence each, second person, present tense, about her own
day: *"Your sister has moved the coffee to half four, so you have longer in here
than you planned and nothing left to look at."*

**The ±8 opening affect did not ship, and should not.** This document proposes
that a mood shift `want`, a scene beat and the opening affect. `PERSONA.md`
already settles that question the other way and the reasoning is better than the
proposal's: *a mood changes what she has to talk about and **never** what she
gives.* A mood that moved warmth would be a difficulty roll wearing a costume,
and the ladder is the one thing in this product that has to keep meaning
something. `tess.test.ts` now asserts that `composeSteering` is byte-identical
across all three moods at every warmth, for every character. Disfluency rate is
item 6 and is not built.

**The roll had to be made deterministic, which the proposal does not mention.**
`moodFor` existed and worked, and on the Realtime arm minting is the obvious
once-per-rep moment. The pipeline arm has no such moment — it recompiles the
whole contract on **every turn** — so an unseeded roll would have given her a
different afternoon every time she opened her mouth *and* broken the cached
prompt prefix with it. So the roll is seeded from the rep's session id
(`lib/voice/seed.ts`), which is server-resolved and never read off the request
body. Verified: the prompt recompiles byte-identical across a rep, and thirty
different reps produce all three afternoons.

**One cost note.** The mood sits early in the system prompt, so it invalidates
the cross-*rep* cache prefix for the first turn of each rep. Within a rep — the
24 turns that matter — the prefix is unchanged, which is what
`handleLlmRequest` was written to protect.

### 7.2 Room tone

*"Eight of nine rooms are silent."*

A silent room is a recording booth, and a recording booth is a robot. Ambient bed
audio is the cheapest realism in all of audio production — one loop per room,
loaded once, no per-rep cost. `bed`, `bedDb`, `reverbIr`, `reverbWet` are already
in the layer-4 schema and already read by the audio graph. The files are missing,
not the code.

Reverb matters more than most people expect: a dry voice with no room response is
detectable as synthetic even when the voice itself is not.

### What shipped — and the diagnosis was wrong in an interesting way

"Eight of nine rooms are silent" was true when `HUMANNESS.md` was written and had
stopped being true by 1 September, when `lib/audio/room-tone.ts` landed: the bed
plays for everybody, synthesised rather than recorded, because `sceneId` returns
`bed ?? reverbIr` and every character named a real impulse response.

**The actual defect was worse than silence.** Nine authored characters shared
**two** authored scenes, so seven of them were handed somebody else's room. Erin
stood on a train platform listening to glasses being set down and chairs
scraping. Priya lifted weights in a bar. And because `roomName` reads the same
`sceneId`, it reached the *contract*: Maya and Robin — both live rungs — were
told in their **absolute rules** to react "the way a stranger in a bookshop
would", from a coffee shop and a hotel lobby respectively. That is
`PERSONA-AUDIT.md` §3.6 exactly, the defect fixed for Tess alone in September
and left running on two shipped characters.

So the files were not missing; the **rooms** were. Seven new scenes, each a
config row the way §1c always intended — launderette, coffee shop, hotel lobby,
gallery, house-party kitchen, train platform, gym — with three new layer kinds
(`machine-tumble`, `hall-air`, `muffled-music`) and eight new one-shots. Every
character's `bed` and `reverbIr` now name her own room, and `place` gives the
word the contract says where the scene id would not read as English ("in a train
platform" is not a sentence).

Nothing got louder except the three characters who were on the near-silent
bookshop bed and should not have been; the loudest room on the roster is still
the bar at -24 dBFS, which already shipped. `room-tone.test.ts` now asserts
across the whole roster that every character has a bed, that no two characters
in different places share a room, that the absolute rules name the room she is
standing in, and that the persona's authored one-shot interval and the scene's
cannot disagree.

**Recorded beds are still the plan, not this.** These are synthesised, and
`AUDIO.md` is the record.

### 7.3 The opening line

Duolingo generates Lily's first question during the ring animation, before the
call connects — the highest-leverage line in the interaction, pre-computed in
dead time.

Nerve has a **brief** screen doing nothing. Use it to:

- open and warm the Text-to-Dialogue socket (with keepalives — it idles at 20s)
- pre-generate her opening line and its audio
- if she opens at all

That last point is worth considering as a design question rather than a defect: a
stranger in a bookshop does not greet you. If she currently speaks first, the
most realistic and most instructive opening in the product is **silence** — he
has to open. That is the actual skill, and it is currently being done for him.

#### What shipped — 10 September 2026

The opening line has a response class for the first time. `mirrorCapFor` is a
measured **no-op** on the opening turn — a one-word hello yields
`ceil(1 × 1.3) = 2`, which the "a real turn always buys a sentence" floor then
raises to the band's own typical — so "Hello." bought exactly as many words as a
real sentence would have. `replyWordCap` caps a reply to a bare greeting at four
words, the steering line says what a greeting is answered *with* (nothing
anywhere did), the want clause no longer ships on her first line, and the shared
speech rule is exclusive: "a plain greeting OR one concrete observation, never
both". Both stored openers were a greeting AND an observation, and the
observation was her deterministic mood.

### 7.4 Cross-rep repetition

`lib/metrics/stability.ts` catches repetition *within* a rep at cosine > 0.8.
Nothing catches it *across* reps. Store a hash of her opening line per
`(persona, user)` and reject a repeat at generation time. Cheap, and it directly
attacks the pattern-recognition complaint above.

---

## 7.5 Two dead dials, measured — and neither was in the code

Added 7 September, after the first real interview was reported as "robotic".
Both halves belong here rather than in `INTERVIEW-PLAN.md` because neither is
about interviews: they are about what this arm can actually control, and a
tuning pass that does not know them is a tuning pass on nothing.

**`speed` is inert on `eleven_v3_conversational`.** That is the shipping model.
One line, Aisha's voice, the full documented range:

| Model | `speed: 0.7` | `speed: 1.2` | spread |
|---|---|---|---|
| `eleven_v3_conversational` | 3.84 s | 3.76 s | **1.02x** — noise |
| `eleven_flash_v2_5` | 5.25 s | 2.97 s | 1.77x |

So `deliveryFor`'s three pace bands are computed, sent, and dropped by the
vendor on every turn of every rep, on both tracks. This does not make §3's
latency layer wrong — that is `setTimeout` between turns and is unaffected — but
it does mean **the pace inside a turn is not currently ours to set**, and any
plan that leans on speaking rate as a warmth channel needs Flash or needs to
stop. Left in the request because it is correct for Flash; recorded beside the
code so nobody auditions against it.

**Stability was being set from outside the repo.** `ELEVENLABS_STABILITY=0.85`
in the production environment overrode `STABILITY_BY_EXPRESSION` for every
persona on this arm. On dating that is deliberate and stays. It also silently
governed a second track, which is how an interviewer authored `earnest` (0.55)
shipped at near-flat. Now scoped: an interviewer takes `INTERVIEW_STABILITY` and
the environment may not touch it.

**The generalisation, which is the reason this section exists.** The model is
**nondeterministic** — the same request twice differed by 13% in encoded length —
so A/B-ing voice settings by comparing output bytes proves nothing, and two of
the three "differences" in the first pass of this investigation were variance.
Voice settings can only be judged by ear, on more than one sample, and v3
documents stability as three modes (0.0 Creative, 0.5 Natural, 1.0 Robust)
rather than a continuous dial. Author on the points the vendor names.

---

## 8. Cost

Everything in this document is free, near-free, or cost-reducing, with one
exception that needs budgeting.

| Change | Cost impact |
|---|---|
| Stop sentence-splitting | **Neutral** — same characters, fewer requests |
| Text-to-Dialogue WebSocket | **Neutral** — v3 Conversational is billed from $0.05/1k chars either way; one socket per rep removes per-request overhead |
| Latency layer (§3) | **Zero** — `setTimeout` |
| Smart Turn v3 (§5.1) | **Zero** — BSD-licensed, local CPU |
| Interruption behaviour (§5.2) | **Negative** — she speaks fewer characters |
| Cached backchannels (§5.3) | **~Zero** — generated once, replayed |
| Contempt fix (§6.1) | Marginal — a few extra slow-scorer calls per rep |
| Moods, room tone, opening (§7) | **Zero** — authoring and asset work |
| **Disfluency tags (§4)** | **The one to watch** — see below |

**The tag budget.** Audio tags are billed as characters. `[hesitant]` is eleven
characters. Three tags per turn across twenty-five turns is roughly 750 extra
characters — on a rep where her total output is perhaps 1,200 characters, that is
a **60% increase in TTS spend.**

So set a rule and enforce it in the injector, the same way `wordCapFor` is
enforced rather than hoped for:

> **One tag per turn typical, two maximum, zero in HOSTILE and CLOSED.**

Cold bands should be clean and clipped anyway — which means the discipline the
budget requires is the same discipline the character requires. Punctuation is
free: ellipses and em-dashes carry hesitation at zero marginal cost and should be
the first reach, with tags reserved for what punctuation cannot do.

**One thing worth checking that is not in this document:** `gpt-4.1-mini` is
now well behind the current cheap tier. Several 2026 budget models sit at or
below its price with better instruction-following, which matters for a system
whose entire character control surface is a 420-character steering line. Worth a
bake-off against your existing scripted-conversation tests before doing anything
else here — you have the test harness for it already, which most people do not.

---

## 9. The order to do this in

Estimates are rough and assume you are working alone.

| # | Change | Effort | Why here |
|---|---|---|---|
| 1 | ✅ Stop sentence-splitting; buffer the full turn | hours | Fixes the reported bug outright; unblocks everything downstream |
| 2 | ✅ `responseDelayFor` — latency as a channel | 1–2 days | Largest perceived gain per hour in the document; free |
| 3 | ✅ Contempt pre-filter + suppress positives | 1 day | Product-integrity, not polish |
| 4 | ✅ Moods and room tone | 2–3 days authoring | Zero code; kills the sameness complaint |
| 5 | Text-to-Dialogue WebSocket, one socket per rep | 3–5 days | Cross-turn prosody; `new_turn` on band change |
| 6 | Disfluency injector + orthographic reduction | 3–5 days | The imperfection heuristic; also fixes the char-count collision |
| 7 | Smart Turn v3 | 2–3 days | Stops her interrupting nervous users |
| 8 | Interruption as a `distraction` behaviour | 2 days | Only possible after 7; large character payoff |
| 9 | Boundary exit wiring | hours | Mechanism exists, wire is missing |
| 10 | Cached backchannels | 1–2 days | Diminishing returns, still real |

**Items 1–4 are roughly a week and should move the needle furthest**, because
three of the four are attacking channels that are currently at zero rather than
improving channels that are already at seventy.

**Items 1–4 shipped on 6 September 2026.** Item 4's authoring was smaller than
estimated and its diagnosis was wrong (see §7.2); item 3 needed a tighter filter
than proposed (§6.1). Nothing in 5–10 is started. Item 5 is the natural next
one: it is the second half of §2.2 and the buffering that landed in item 1 is
what makes one socket per rep coherent.

---

## 10. On "one hundred percent"

It is worth being precise about the ceiling, because it changes what to optimise.

Sesame's evaluation of CSM is the cleanest measurement available. Testing
human-recorded speech against generated speech, they found that <cite>without
conversational context, human evaluators show no clear preference between
generated and real speech, suggesting that naturalness is saturated</cite> — but
that <cite>when context is included, evaluators consistently favor the original
recordings</cite>, concluding that <cite>a noticeable gap remains between
generated and human prosody in conversational speech generation.</cite>

Read that carefully, because it is the single most useful finding for this
project: **isolated-sentence realism is solved. Contextual prosody is not solved
by anybody**, including a lab that raised nine figures to work on precisely this
and open-sourced the result.

So a hundred percent is not available to Nerve, or to ElevenLabs, or to Sesame,
in 2026. What *is* available is the observation that **you are currently losing on
axes that have nothing to do with that frontier.** Timing, disfluency,
turn-taking, prosodic continuity within a single turn, and whether she ever
leaves — none of these are hard research problems. They are unwritten channels.

And there is a genuine strategic point buried in that. The frontier will arrive
on its own: contextual speech models will get better whether or not you work on
them, and when they do you swap a provider behind `VoiceProvider` and inherit the
gain for free. That interface is already built, which is the best decision in the
document.

What will not arrive on its own is the warmth engine, the overreach model, the
temperament weighting, and the field track. Nobody else is building those. The
right allocation of your time is therefore: **spend a week closing the free
rendering gaps, then go back to the mechanic**, because the mechanic is the moat
and the rendering is a rental.

---

## 11. One note on the training claim

Since the product's promise is transferable skill, it is worth recording what the
evidence actually supports, because it validates a decision already made.

The VRET literature on social anxiety is the closest analogue. The finding that
matters: in comparisons of virtual exposure programmes, <cite>participants who
received therapist-led VRET and performed homework assignments alongside the VRET
showed an improvement in fear of negative evaluation. Participants who did not
perform homework assignments did not show this improvement.</cite>

Practice inside the simulation, on its own, moved the measure less than practice
plus a real-world assignment. **The field track is the ingredient the literature
credits.** It is currently described in `HUMANNESS.md` in a single clause.

If the goal is that users walk away able to talk to a real person, the strongest
version of this product is not the one where the character is most convincing —
it is the one where the loop from rep to real-world challenge to logged outcome
is tightest. The humanness work in this document raises the fidelity of the
rehearsal. The field track is what converts it.

Both matter. Only one of them is defensible.

---

*Written against `HUMANNESS.md` as of this revision. Cross-references to
`PERSONA-AUDIT.md` (§6.1, §6.2, §7.1), `PIPELINE.md` (§2), `PERSONA.md` (§4.3,
§7.1).*
