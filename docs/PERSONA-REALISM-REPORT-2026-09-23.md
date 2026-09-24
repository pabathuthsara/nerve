# Persona realism report — 23 September 2026

> **Status: research only. Nothing in this document has been implemented.**
> It is the input to a deliberate, signed-off change to the dating arm, which is
> what `CLAUDE.md` rule 19 requires before any Tier 0 file moves. Every item
> below carries its tier, its latency effect and its cost per rep so it can be
> accepted or refused one line at a time.
>
> **The question it answers:** how do the four dating characters stop sounding
> like an AI — a stranger at the start and, gradually, someone who is into you —
> with lower latency, a better warmth engine and a better scorecard, without the
> cost per rep breaking the plans in `lib/site/plans.ts`. It also answers the
> question added mid-way: **is ElevenLabs' own realtime agent any use to us?**
>
> **How it was done.** The docs and the judgement code were read end to end
> (`HUMANNESS.md`, `HUMANNESS-PLAN.md`, `PERSONA-AUDIT.md` §12–§15,
> `REP-BEHAVIOUR-AUDIT-2026-09-09.md`, `PIPELINE.md`, `perfect.md`, the four
> persona files, `lib/warmth/*`, `lib/voice/elevenlabs/*`, `lib/grade/*`). The
> production database was queried read-only for every dating rep since the
> 10 September retune (223 agent turns, 18 reps with voice operations; 42 reps
> ≥60 s since 5 September). The real `WarmthEngine` and `scoreFast` were driven
> offline by synthetic players, costing nothing (§1.2, Appendix C). Vendor claims
> were checked against their own pricing and documentation pages (Appendix A)
> and the design choices against the conversation-science literature
> (Appendix B).

---

## 0. The answer on one page

### What is wrong, in the order a listener notices it

| # | Finding | Evidence | Where |
|---|---|---|---|
| 1 | **She is slow on every turn, and slowest on the first.** Every reply sounds reluctant, however the rep is going | Median gap from him stopping to her starting is **~3.4 s** (per-rep medians 2.7–4.3 s). Her first reply averages **7.6 s** on Cass, the free sign-up rep. Server-side, the first turn costs 3.3 s against 1.7 s later, because every connection and cache is cold | §1.1 |
| 2 | **The slowness broke the difficulty ladder, so "gradually into you" only exists on rung 1** | The ladder was tuned for **15** turns a rep (`engine.test.ts:736`). Production delivers **12.4**; the realtime arm used to deliver 18. At 12 turns even a *strong* player arms Nadia 7% of the time; at 16 it is 98%. Measured arm rates: Cass 89%, Nadia 14%, Maya 0%, Robin 0% | §1.2 |
| 3 | **She gets cut down to one word** | Nadia is truncated on **70%** of turns and her median reply is **3 words**. At GUARDED the sentence ceiling is 1, so "[Name]. Nice to meet you." ships as "[Name]." | §1.3 |
| 4 | **She still rescues silences**, because the cap cannot bind a long first sentence | After three "Okay."s in a row, Cass volunteered three unprompted sentences, each voicing her `want` clause. The two-word mirror cap never fired, because the first sentence is always kept whole | §1.4 |
| 5 | **Her voice is held flat and never laughs** | `ELEVENLABS_STABILITY=0.85` is near v3's "Robust", which the vendor says is "less responsive to directional prompts". It stays flat at INVESTED too. **0 laughs in 585 agent turns**, and 2.2% disfluency even after the 10 September examples | §1.5 |
| 6 | **The personality numbers barely reach the model** | All four characters compile to "fully present", "meet them halfway", "amused occasionally" and "not cutting". Robin's talkativeness of 35 misses the ≤33 "does not carry the conversation" band by two points | §1.6 |
| 7 | **She has little to reveal as she warms** | No disclosure ladder, three moods each, and every authored example shows the cold register. Nothing shows how she sounds when she is into him | §7 |
| 8 | **The locale is mixed** | British idiom ("reckon", "mate", "flat", "half four", "London"), three American voices and one British, sold into a US launch (`MARKETING-PLAN.md`) | §1.7 |
| 9 | **The meter can be won by trolling on rung 1** | A user who gave "Fuckwit" as his name and then argued was offered her number at the wind-down. The overreach "boundary" verdict is still wired to nothing (`slow.ts:94`) | §1.4, §5 |

### What to do, in order of value per dollar

| ID | Change | Humanness effect | Latency Δ (median) | Cost Δ / rep | Tier |
|---|---|---|---|---|---|
| **L1** | Pre-warm turn 1 during the 3·2·1: auth, admission, the LLM prompt cache and the TTS connection | The first line stops taking 7.6 s | first reply −1.5 s | +$0.001 | infra |
| **L2** | Reserve turn N+1 while turn N plays (the compliant option in `PERSONA-AUDIT.md` §14.7) | — | −0.38 s (Asia), −0.05–0.1 s (US) | $0 | Tier 1 |
| **L3** | Streaming STT: ElevenLabs Scribe v2 Realtime, Deepgram Flux, or OpenAI `gpt-realtime-whisper` | — | −0.45 s | −$0.001 to +$0.011 | `PIPELINE_*` = Tier 0 |
| **L4** | Semantic end-of-turn (Smart Turn v3.2 in the browser) replacing the fixed 600 ms silence | Stops cutting off a nervous user mid-thought | −0.35 s | $0 | infra |
| **L5** | Speculative generation on a probable end-of-turn | — | −0.2–0.3 s | +$0.002 | infra |
| **L6** | Character-model bake-off for time-to-first-token | Maybe a better register | −0.2–0.5 s | −$0.004 to +$0.008 | Tier 0 (`PIPELINE_LLM_MODEL`) |
| **R1** | Fix the one-word truncation: a leading acknowledgement or name does not count as the sentence | Kills "[Name]." / "Thanks." | 0 | 0 | Tier 0 |
| **R2** | Voice stability follows the band: Robust when cold, Natural when warm | **You can hear her warm up** | 0 | 0 | Tier 0 |
| **R3** | Laughter and non-verbals (`[laughs]`, `[sighs]`, `[exhales]`) gated by band | The strongest interest signal in the literature, currently at zero | 0 | +$0.002 | Tier 0 |
| **R4** | Turn-initial particles as cached audio ("Mm.", "Oh—", "Ha", "Well…") | Hides 300–500 ms on warm turns, and "well" marks a dispreferred answer on cold ones | perceived −0.3–0.5 s | ~$0 | infra + Tier 0 |
| **W1** | Re-measure the ladder after L1–L6. Retune trajectories only if it still fails | Restores the arc on rungs 2–4 | — | +$0.011 from more turns | Tier 0 |
| **W2** | A disclosure ladder, warm-band examples, authored gate "styles" and a `laughs` gate per persona | She has something true to give as she warms | 0 | 0 | Tier 0 |
| **W3** | Research-backed reward terms (follow-up questions, sympathy/appreciation, reciprocal disclosure, an interview-mode penalty) | The meter rewards what actually builds liking | 0 | 0 | Tier 0 |
| **W4** | No number offer after contempt; wire the boundary exit | She stops being "unselective", which makes the win mean something | 0 | 0 | rule 3 + Tier 0 |
| **S1–S6** | Scorecard: outcome-invariance test, the §17 calibration gate, responsiveness metrics, signal reading from the warmth trace, persona-normalised talk ratio, timestamped feedback | A score that teaches rather than grades | 0 | +$0–0.008 | Tier 0 (`lib/grade/prompt.ts`) |
| **P1–P4** | Persona v2 cards (§7): backstory, dials, voice brief, moods, beats, examples | "A stranger" becomes a specific person | 0 | 0 | Tier 0 |
| **V1** | TTS A/B: Inworld Realtime TTS-2 and Cartesia Sonic 3.6 against v3 Conversational | Both rank above v3 Conversational on blind preference; Inworld costs about half | 0 to −0.1 s | **−$0.02 to −$0.03** with Inworld | Tier 0 |

**Net effect of the recommended package** (L1–L6, R1–R4, W1–W4, S1–S5):
median reply gap **~3.4 s → ~1.0–1.3 s** (first reply ~7.6 s → ~2.5 s), turns
per rep **12.4 → ~15–16** (the ladder's design point), and cost per rep
**$0.054 → ~$0.070**. That is under the $0.08 `COST_PER_REP_USD` ceiling and the
~$0.083 hard limit of the yearly plan. Adding the TTS swap (V1, Inworld) takes it
to **~$0.049**, and the ElevenLabs Startup Grant, if we qualify, takes TTS to $0
for a year (§8.4).

### ElevenLabs Agents, in three lines (§8)

It is good, and it solves our two worst problems (turn-taking and latency) in
one product. **But at $0.08 a minute a three-minute rep costs ~$0.25 before our
own models, which is 4.7× today and 3× the ceiling every plan is priced
against. Pro at full use would cost $23 a month to serve on a $19 price.** Use
it for what it is worth to us: a free blind A/B under the startup grant, and a
blueprint for the three components we can buy separately (Scribe v2 Realtime,
v3 Conversational over the Text-to-Dialogue socket, and a speculative
turn-taker). Do not ship it as the engine at list price.

---

## 1. What was measured

### 1.1 Latency, as it is today

Production dating reps since the 10 September retune, from
`sessions.pipeline_telemetry` and `voice_operations.metadata` (read-only):

| Stage | Median | p90 | Note |
|---|---:|---:|---|
| VAD silence before the turn is conceded | 603–623 ms | 619 ms | A fixed 600 ms default, `resolveSilenceMs` |
| STT finalisation after commit | 625–885 ms | ~1,165 ms | `gpt-4o-mini-transcribe` in production. Transcription only **starts** at commit |
| Auth | 0 ms (cached) | 388 ms | The 10 September 60 s cache works |
| Admission (`maySpend` + reservation) | **378 ms** | 955 ms | Edge in `sin1` → Supabase in `us-east-1` |
| LLM first token | 681 ms | 1,274 ms | `gpt-4.1-mini` |
| LLM complete (the turn is buffered whole) | 870 ms | 1,453 ms | ~16 output tokens a turn |
| TTS first byte | 173 ms | 757 ms | `eleven_v3_conversational`, `asia-southeast1` |
| **Server request → first audio** | **1,768 ms** | 2,985 ms | |
| **Perceived gap, him → her** | **~3.4 s** (per-rep medians 2.7–4.3 s) | per-rep p90s 2.9–6.0 s | 16 reps |

**The first turn is a different, worse animal.** Server request to first audio
was 3,294 ms on turn 1 against 1,728 ms afterwards. On that turn auth takes 353 ms,
admission 588 ms, the LLM's first token **1,794 ms** (cold prompt cache and a new
connection) and TTS 558 ms. Measured in transcripts, her first reply lands a mean
**7.6 s** after his first line on Cass (max 13.4 s) and 5.7 s on Nadia. Cass is
the free sign-up rep, so this is the first thing the product ever does, and it
is the slowest thing it does.

**Everybody measured is in Asia.** Every turn on record ran in `sin1` or
`bom1` (12 users, 31 sessions in `sin1`), so every measurement is South or South-East Asian. The turn
route is `runtime = 'edge'` (`app/api/voice/turn/route.ts:8`), so it runs
nearest the user. A US customer's admission hop to `us-east-1` and LLM hop to
OpenAI should both be shorter than these numbers, so **US latency is probably
0.5–0.8 s better than anything measured and has never been measured.** The ads
are bought in the US (`MARKETING-PLAN.md`).

**What the numbers mean.** Stivers et al. (2009) found a universal ~200 ms
modal turn gap and read gaps past ~700 ms as a *dispreferred* answer. At ~3.4 s
every line she says reads as "I don't want to", on every rung at every warmth,
and `responseDelayFor` returns 0 on essentially every turn. The timing layer is
still inert. For scale: one LiveKit optimisation guide measures a stock agent
loop at 1.2–1.4 s p95, and 500–650 ms p95 once pre-emptive generation and a turn
detector are added (Appendix A). Artificial Analysis' Speech Agent
Arena finds that **preference rises as time-to-first-audio falls**.

### 1.2 Turns per rep, and why the ladder only works on rung 1

**Measured, reps ≥60 s since 5 September** (small n, all Asian traffic, see
§1.1):

| Rung | Reps | Avg start | Avg peak | Max peak | Reached ENGAGED | Armed (≥65) | Reached INVESTED |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1 Cass | 18 | 47.5 | 76.4 | 85.0 | 17 | **16 (89%)** | 7 |
| 2 Nadia | 14 | 30.0 | 55.6 | 73.5 | 4 | **2 (14%)** | 0 |
| 3 Maya | 5 | 29.1 | 50.5 | 63.3 | 2 | **0** | 0 |
| 4 Robin | 5 | 18.3 | 37.6 | 45.5 | 0 | **0** | 0 |

A rep averages **12.4** of her turns (223 turns across 18 reps). The realtime
arm got 18 (`PERSONA-AUDIT.md` §12), and the engine tests model a rep at **15**
(`TURNS_IN_A_REP = 15`, `lib/warmth/engine.test.ts:736`). Three turns were lost
to latency, and those three turns are the difference between arming and not.

**Simulated with the real engine and scorer** (2,000 reps per cell, synthetic
players, a simulated friendly slow-score every third turn; see Appendix C). It
shows the arm rate and, in brackets, the share reaching ENGAGED:

| Rung (current dials) | Player | 12 turns (today) | 16 turns (after L1–L6) |
|---|---|---:|---:|
| Cass | strong / competent / nervous | 100% / 95% / 49% | 100% / 100% / 80% |
| Nadia | strong / competent / nervous | **7%** / 0% / 0% | **98%** / 6% (37%) / 0% |
| Maya | strong / competent / nervous | **0%** / 0% / 0% | **34%** / 0% (5%) / 0% |
| Robin | strong / competent / nervous | 0% / 0% / 0% | **0%** (peak 51.7) / 0% / 0% |

Two conclusions follow, and the order matters:

1. **Latency is the first ladder fix.** Moving from 12 to 16 turns takes a strong
   player's arm rate on Nadia from 7% to 98% and on Maya from 0% to 34%,
   without touching a Tier 0 number. The ladder was never mistuned; it was
   tuned for a rep length production stopped delivering.
2. **Robin is sealed in practice.** The engine test itself says she needs 24
   turns of perfect play (`engine.test.ts`, "leaves the top rung hard and not
   sealed"), and no latency gets a three-minute rep to 24. Nobody has ever heard
   her mask slip, and that moment is the whole reward for her rung.

### 1.3 She gets cut down to one word

Share of turns where `capToBudget` removed words, since 10 September:

| | Turns | Capped | Median spoken words | p90 |
|---|---:|---:|---:|---:|
| Nadia | 30 | **70%** | **3** | 9 |
| Cass | 157 | 48% | 9 | 12 |
| Robin | 36 | 25% | 6 | 8.5 |

The mechanism is exact. At HOSTILE, CLOSED and GUARDED `maxSentences` is 1
(`bands.ts:229/239/249`). `capToBudget` keeps the first sentence and nothing
after it (`truncate.ts:204`). The 10 September register work ("say it how it
comes out", fragments) makes her write two fragments, and the first one is
usually an acknowledgement, so the acknowledgement is all that ships. Nadia's
rep on 10 September, verbatim:

> him "My name is [name]." → her **"[name]."**
> him "Maybe I can be of help. I'm a good reader." → her **"Thanks."**
> him "Hej der." *(the transcriber's Danish for "Hey there")* → her **"Hej."**

The operation records for that rep include turns reading `wordCap 10,
sentenceCap 1, spoken 1, capped true, out_tokens 10`: she wrote a whole line and
the listener got one word of it. **A three-second pause followed by one word is the most
AI-sounding thing this product currently does.** The last row is a separate
defect (§1.7): she mirrors a mis-transcription instead of asking "sorry?".

### 1.4 She still rescues a silence

Cass, production, 18 September (her warmth 50–60, OPEN):

> him "Okay." → her "I'm just trying to find one painting I like here."
> him "Ok" → her "There's a lot of stuff here I don't get."
> him "Okay." → her "Sometimes I think art's just stuff people hang up."

Three dead ends, three volunteered sentences: the exact failure
`reciprocity.ts` was written for. Three things compose into it:

- **The cap cannot bind.** The mirror cap on a dead end is 2 words, but the
  first sentence always ships whole (`truncate.ts:204`), so a ten-word first
  sentence goes out untouched.
- **The `want` clause ships on dead ends by design** ("an agenda pulling her away
  from a man who has given her nothing is exactly right there", `steering.ts:214`).
  On a voice arm, *pulling away* has to be silence or a grunt, not a sentence
  about the agenda. She was told "Match it. Do not fill the gap." and "You would
  still rather be getting round the last two rooms", and she voiced the second.
- **Silence is only allowed at GUARDED and below** (`SILENCE_BAND`,
  `reciprocity.ts:129`), and Cass lives in OPEN.

The same rep went on: "You're too talkative." → "Yeah, yeah, sorry." (service
register). He then gave "Fuckwit" as his name. She used it back to him twice,
argued about who had said it first, and **offered her number at the wind-down**
because warmth was 66. The research reading is in §5 (W4): a character who is
warm to anybody is *unselective*, and unselective interest is valued less
(Eastwick et al. 2007).

### 1.5 The voice

- **Stability is near-Robust on every dating turn.** `ELEVENLABS_STABILITY=0.85` is
  set in production and wins over `STABILITY_BY_EXPRESSION`
  (`lib/voice/elevenlabs/persona.ts`). ElevenLabs' v3 guide: Robust is "highly
  stable, but less responsive to directional prompts"; tags need Creative or
  Natural. The codebase already knows this and says it about interviewers: "a
  flattened voice does not read as a severe interviewer, it reads as a robot"
  (`persona.ts`, `INTERVIEW_STABILITY`). The same holds for a dating character
  at INVESTED. Flatness is right as a weapon when she is cold and wrong once she
  has warmed.
- **`speed` is inert on v3 Conversational** (`HUMANNESS-PLAN.md` §7.5), so pace is
  not a channel we own on this model.
- **No cross-turn prosody.** Item 5 of `HUMANNESS-PLAN.md` (the Text-to-Dialogue
  socket, `new_turn` on band change) is still unbuilt, so every turn resets.
- **Casting.** The four voices are premade-library picks made on the free plan,
  where Voice Design returns 403. Cass's voice was chosen for a `playful` rung 1
  and has never been re-cast for `earnest` (`tess.ts`, "THIS CASTING IS OWED A
  LISTENING PASS").
- **Register, measured across 585 agent turns since 5 September:**

  | | Before 10 Sep noon (401) | After (184) |
  |---|---:|---:|
  | Disfluent (`um`, `uh`, `hm`, `er`) | 0.0% | 2.2% |
  | Trailing off | 1.7% | 2.7% |
  | Two words or fewer | 4.0% | 13.6% (partly truncation, §1.3) |
  | **Laughter** | **0** | **0** |
  | Contains a question | 17.7% | 17.9% |

  The examples moved disfluency off zero, and nothing makes her laugh. In
  mixed-sex encounters, a woman's laughter in the man's company tracks her
  interest in him (Grammer & Eibl-Eibesfeldt 1990), and shared laughter signals
  that a connection is good (Kurtz & Algoe 2015). A character who warms up
  without ever laughing is missing one of the most legible signals a user can
  learn to read.

### 1.6 The personality numbers barely reach the model

`compileInstructions` bands every layer-2 dial into thirds (≤33 / 34–66 / ≥67,
`lib/voice/openai/persona.ts:96`), and the steering clauses fire only past
60–70. Where the four characters actually sit:

| Dial | Cass | Nadia | Maya | Robin | Compiled line (all four unless noted) |
|---|---:|---:|---:|---:|---|
| distraction | 10 | 20 | 20 | 30 | **"You are fully present. Nothing is competing for your attention."**, for a woman hunting a present, one writing in her notebook and one waiting for her car |
| talkativeness | 55 | 50 | 45 | **35** | "You meet them halfway". Robin misses "you do not carry the conversation… you let it sit" and the `[clipped]` tag by **two points** |
| humour | 45 | 50 | 55 | 45 | "amused occasionally". Nobody reaches the ≥70 "Tease him" clause or the `[amused]` tag |
| sharpness | 15 | 25 | 30 | 20 | "You do not get cutting, even when unimpressed" |
| patience | 85 | 64 | 60 | 55 | Cass "Awkwardness does not bother you", the rest mid |
| signalClarity | 92 | 90 | 85 | **20** | Robin alone "hard to read", plus the "Stay pleasant either way" clause and the `[polite]` tag |

The characters are told apart almost entirely by the hand-written contract, the
expression word and the examples. `PERSONA-AUDIT.md` §2 said so on 2 September
("somebody tuned five numbers and the pipeline read none of them") and it is still
true. §7 moves only the dials whose current band contradicts the character.
The lesson of §7 of that audit stands: **no per-character judgement machinery**.

### 1.7 Locale, and hearing mistakes

The prose is British ("reckon", "mate", "round here", "half four", "flat",
"launderette" until 10 September, "Are you from London?"). The voices are Jessica,
Laura and Sarah (American) and Lily (British). The launch, the ads and the
landing copy are American. A mismatch between accent, idiom and place is a
realism tell in its own right, before a word of the character is judged.
Separately, `STT` pinned to `'en'` still produced "Hej der", and she answered in
kind. Nothing tells her that text which does not parse as English was probably
misheard.

### 1.8 Cost, as it is today

Measured from `voice_operations`, dating, since 10 September:

| Line | $/rep | Share |
|---|---:|---:|
| TTS (`eleven_v3_conversational`, avg 51 characters a turn × 12.4 turns) | 0.0316 | 58% |
| STT (`gpt-4o-mini-transcribe`, prorated reservation) | 0.0089 | 16% |
| Character LLM (`gpt-4.1-mini`, ~2,725 input tokens of which ~1,891 cached, ~16 output) | 0.0068 | 13% |
| Grade (`gpt-4.1`) | 0.0038 | 7% |
| Live judge (`gpt-4.1-mini`, ~5.8 calls) | 0.0031 | 6% |
| **Total** | **$0.054** | |

The ceiling every plan is costed against is **$0.08** (`COST_PER_REP_USD`,
`lib/billing/economics.ts:45`). The binding plan is the year: at full use (3 reps
a day for 365 days) with a 30% affiliate commission and its interview credits,
voice can cost at most **~$0.083 a rep** before the year sells at a loss. So the
room to spend is **~2.6¢ a rep**, and §10 spends it carefully.

### 1.9 The scorecard

Composite scores since 1 September: Cass 70 ± 9, Nadia 64 ± 10, Maya 57 ± 11,
Robin 62 ± 8. **The correlation between composite and peak warmth is 0.67
(Nadia), 0.72 (Maya) and 0.80 (Robin)**, against 0.42 on Cass. Some of that is
correct: good process warms her. But `close` averages 38–45 on rungs 2–4 against
60 on Cass, where she offers her number 89% of the time. That pattern is what
outcome leaking into the grade would look like, and rule 2 says outcome is worth
zero. It has never been tested (S1). The §17 calibration gate (twenty
hand-scored transcripts) has never passed either (`M3-PLAN.md`).

---

## 2. The diagnosis in one paragraph

`HUMANNESS-PLAN.md` §0 said the state machine was at ninety percent and the
rendering at twenty. Three weeks of work have taken the state machine to
ninety-five: it now reads meaning, leaving is a state, greetings have a response
class, and the register has examples. The rendering is still at about thirty,
and the loudest part of it is not prosody. **It is time.** Every line arrives
three seconds late. That makes her sound reluctant on every turn, it costs three
turns a rep, and three turns is exactly what the difficulty ladder needed to let
a stranger warm up in three minutes. Behind the time sits a truncation rule that
cuts her to one word, a voice pinned flat for the whole rep, zero laughter, and
characters with little to reveal as they warm. Fix the time first. It is the
largest humanness win, it is mostly infrastructure rather than Tier 0, and it
restores the arc on rungs 2–3 before a single persona number moves.

---

## 3. Latency plan

### 3.1 The target budget

| Stage | Today (Asia, median) | Target | How |
|---|---:|---:|---|
| End-of-turn decision | ~610 ms | ~200–300 ms | L4 semantic end-of-turn, with a calibrated maximum kept for mid-thought pauses |
| Transcript ready | +650–850 ms | +100–250 ms | L3 streaming STT (partials while he speaks) |
| Auth + admission | ~380 ms | ~0 | L2 pre-reservation. Auth is already cached |
| LLM to a complete turn | ~870 ms | ~350–600 ms | L6 bake-off, and L5 speculative start overlapping the end-of-turn wait |
| TTS first byte | ~170 ms | ~100–170 ms | Warm socket (L1 and the Text-to-Dialogue socket, R5) |
| Transport and playout | ~150 ms | ~100 ms | — |
| **Perceived gap** | **~3.4 s** | **~1.0–1.3 s** | |
| **First reply** | **~7.6 s** | **~2–2.5 s** | L1 |

At ~1.1 s, `responseDelayFor` finally has room: the warm bands play at the floor
and the cold bands can be held 0.5–1.0 s longer, a spread a listener can hear.
**Retune `BAND_ONSET` to the new floor** once the floor is measured (R6).

### 3.2 The items

**L1 — Pre-warm turn 1 during the countdown.** *infra, +$0.001, first reply
−1.5 s.* The 3·2·1 already opens the session under the count (`PIPELINE.md`).
Use it to:
- seed the 60 s auth cache;
- reserve turn 1 (the rep is already owned);
- send one `max_tokens: 1` request carrying the exact compiled prefix, so
  OpenAI's prompt cache and the TLS connection are warm. The prefix is seeded
  per rep (`lib/voice/seed.ts`), so it must be the same bytes the first real turn
  will send;
- open the TTS connection, or with R5, the Text-to-Dialogue socket with a
  keep-alive.

The first-turn LLM first token alone is 1,794 ms against 671 ms later.

**L2 — Reserve turn N+1 during turn N's playback.** *Tier 1 (`lib/db/spend.ts`),
$0, −380 ms in Asia.* `PERSONA-AUDIT.md` §14.7 already costs this as the
rule-11-compliant option: `maySpend` still runs before every turn, just earlier.
An unused reservation must be released at rep end (`finishRep`), and a leak is
bounded by the existing $0.20 per-rep envelope. `npm run db:spend` needs a case
for the release path.

**L3 — Streaming STT.** *`PIPELINE_STT_MODEL` is Tier 0; −450 ms.* Today
transcription starts at commit (`stt.ts`, `turn_detection: null`). A streaming
model transcribes while he speaks, so the final is ~150–300 ms behind his last
syllable. Three candidates:

| Candidate | Price | Latency | Notes |
|---|---|---|---|
| ElevenLabs Scribe v2 Realtime | $0.39/h ($0.0065/min) | "~150 ms" | Same vendor as TTS, and the model ElevenLabs' own turn-taker is built on. Keyterm prompting. Speech-gated ≈ **−$0.001/rep**; streamed continuously ≈ +$0.009 |
| Deepgram Flux (`flux-general-en`) | $0.0065/min | end-of-turn median <300 ms, p95 1.5 s | Built-in end-of-turn plus `EagerEndOfTurn` / `TurnResumed` events, which *are* L4 and L5. Needs continuous streaming, ≈ +$0.009. New vendor, so a privacy-page change |
| OpenAI `gpt-realtime-whisper` | $0.017/min | partials within a few hundred ms | No new vendor or DPA. Speech-gated ≈ +$0.011, which is the most expensive option |

Recommendation: **Scribe v2 Realtime**, speech-gated as today, with our own
end-of-turn logic (L4). Choose Flux instead if L4 in the browser proves
unreliable. All three must emit the identical normalised turn (rule 1), and the
new vendor needs a line in `components/site/legal-pages.tsx`, because it
processes user audio.

> **L3 status, 24 September 2026: built and measured, NOT switched on**
> (branch `pr/scribe`). `lib/voice/elevenlabs/scribe.ts` is `ScribeTranscriber`,
> a drop-in for `RealtimeTranscriber` with the same options, methods and
> callbacks, speech-gated with the same 300 ms pre-roll, `commit_strategy=manual`
> so the end of turn stays ours, and English pinned. With
> `PIPELINE_STT_MODEL=scribe_v2_realtime` the mint issues an ElevenLabs
> single-use token (`mintScribeToken`) instead of the OpenAI secret and says so
> in `stt: { vendor: 'elevenlabs', … }`. Every other value mints the bytes it
> always did. It is priced at $0.0065/min in both the admission envelope and
> the meter, and the privacy page names ElevenLabs as a transcriber.
>
> Measured with `npm run scribe:probe -- --openai`: the same synthetic audio,
> real time, 20 ms frames, from Sri Lanka:
>
> | | commit → final | partials before commit |
> |---|---:|---:|
> | Scribe v2 Realtime (6 segments, 3 runs) | **294, 298, 350, 330, 329, 336 ms** | 5, 3, 5, 3, 5, 3 |
> | `gpt-4o-transcribe` (2 segments) | 1,409, 816 ms | 0, 0 |
>
> Both arms transcribed word for word. A run sends ~9.3 s of audio for ~$0.001.
> Five behaviours of the real socket are load-bearing and are recorded in the
> file header with captured fixtures (rule 14). It hangs up after ~15 s without
> audio, so a 20 ms keep-alive runs every 5 s (held for 90 s). A commit under
> 0.3 s of audio is fatal, so commits are padded. It commits by itself at ~36 s
> of audio, so long monologues are split first. A spent token opens and THEN
> refuses. It repeats a non-empty committed text as a partial 5–50 ms later, and that
> repeat is dropped.
>
> **Owed by hand:** (1) one change in `lib/voice/elevenlabs/index.ts` to build
> the transcriber through `transcriberFor(minted, …)`; (2) a real-microphone
> rep, because synthetic speech is the easiest a transcriber will ever hear and
> this says nothing about accuracy on a nervous man; (3) the vendor's maximum
> session length is undocumented, and a twenty-minute interview is one socket,
> so run one interview to its end before enabling Scribe on that track; (4)
> `pipeline_telemetry` files Scribe's milliseconds and cost under `openai.*`,
> because relabelling it needs `lib/voice/types.ts`.

**L4 — Semantic end-of-turn.** *infra, $0, −350 ms, and better for nervous
users.* Replace "600 ms of silence" with: after ~200 ms of silence, run Smart
Turn v3.2 (8 M parameters, ONNX, ~12 ms on a CPU, 23 languages, listens to
prosody rather than words) on the last 8 s of his audio.

- If p(done) ≥ 0.7, concede the turn now.
- If it is low, keep waiting up to the user's calibrated maximum. That maximum can
  now be *longer* than 600 ms, because it only applies when he sounds unfinished.

This keeps "turn-taking is ours" (`config.ts`) and fixes what `HUMANNESS-PLAN.md`
§5.1 calls the most inhuman thing the product can do: talking over a nervous
man's mid-sentence pause. The browser runs it with `onnxruntime-web` (a one-off
~8 MB download, cached).

**L5 — Speculative generation.** *infra, +$0.002, −200–300 ms.* On a probable
end-of-turn (Smart Turn p ≥ 0.5, or Flux `EagerEndOfTurn`), start the character
LLM on the stable partial transcript. Commit the result if the final transcript
matches. Discard it and regenerate if he resumes or the words changed. This is
standard practice (LiveKit's `preemptive_generation` is on by default). L2 must
land first so the speculative call is already admitted (rule 11). TTS is **not**
speculated: synthesis is 58% of the bill and is only paid once the turn is final.

**L6 — Character-model bake-off.** *`PIPELINE_LLM_MODEL` is Tier 0.* This was
recommended in `HUMANNESS-PLAN.md` §8 and never run. The LLM is 13% of the rep,
so **choose on latency and register, not price**. Candidates:
- `gpt-4.1-mini` (the baseline);
- `gpt-4.1-nano` ($0.10/$0.40);
- `gpt-5-mini` / `gpt-5-nano` at minimal reasoning;
- Groq `gpt-oss-120b` ($0.15/$0.60, first token under 200 ms, low reasoning; the
  self-serve catalogue shrank to the two gpt-oss models on 26 August);
- Gemini 3.x Flash-Lite;
- Claude Haiku 4.5.

Measure first-token p50/p90 from `sin1` **and** from a US region, obedience to
the band (word cap, question rule, silence), stability-meter breaks per 100
turns, and blind-rated humanness on 50 lines per model. `npm run rep:audition`
is the harness. It spends money, so it is run by hand.

**L7 — Measure the US before touching regions.** *$0.* Run a synthetic probe, or
one tester, from a US vantage. The edge route already follows the user.
`PERSONA-AUDIT.md` §14.7's "move the functions to `iad1`" is only right for a
server-pinned function, and L9 would be one.

**L8 — Instrument the first reply.** Add `firstReplyGapMs` and
`agentTurnsPerRep` to the admin panel (`lib/db/admin-metrics.ts`). They are the
two numbers this whole report is about, and today they can only be pulled by
SQL.

**L9 — Strategic: one socket per rep.** Vercel Functions now hold WebSockets
(Fluid Compute). A per-rep socket would carry mic audio up and her audio down,
and let the server hold the STT stream, the `WarmthSession`, the LLM and the
TTS socket for three minutes. That removes every per-turn HTTP, auth and
admission leg and every cold connection, and makes speculation trivial. It also
moves the warmth engine server-side, where the user cannot touch it, which is
rule 11's spirit. It is the Pipecat / LiveKit shape and the right end state. It
is also the largest change here, so it comes after L1–L6 prove the gains.

---

## 4. Rendering plan: how she sounds

**R1 — Stop cutting her to one word.** *Tier 0 (`bands.ts` `maxSentences`,
`capToBudget`).* Two options:
- **Preferred:** a leading unit of three words or fewer (an acknowledgement, a
  name, an interjection) is not counted as a sentence against `maxSentences`,
  as long as the combined reply fits the word cap. "[Name]. Nice to meet you."
  then ships at GUARDED; "Yeah. Crime, mostly. Some non-fiction." still stops
  at two units.
- **Alternative:** `maxSentences: 2` at GUARDED, with the word cap as the real
  bound.

Either is `PERSONA-AUDIT.md` §14.5's own lesson ("rough speech fragments into
more pieces than it has thoughts") applied to the band where Nadia and Maya
spend most of a rep. Re-baseline `dating-arm.test.ts` with the digest diff read
line by line. **Do not raise the word caps** (§14.5a).

**R2 — Stability follows the band.** *Tier 0 (`lib/voice/elevenlabs/persona.ts`
and the env dial).*

| Band | Stability |
|---|---|
| HOSTILE, CLOSED | 0.9 |
| GUARDED | 0.8 |
| OPEN | 0.65 |
| ENGAGED, INVESTED | 0.5 (Natural, the documented point) |

This keeps stability as the "weapon" `persona.ts` describes: she cannot warm up
on her own, because her voice follows the meter and not her whim. It stops the
weapon firing when she is supposed to be warm. The production env var becomes
the *cold* end of the ramp rather than a flat override. Author on the vendor's
named points (0.5 and 1.0). The 7 September listening test could not tell
intermediate decimals apart, so 0.65 and 0.8 need an ear.

**R3 — She laughs.** *Tier 0.* A new gate, `laughs` (per-persona `unlocksAt`,
§7), whose clause lets the model open a reply with `[laughs]` when something he
said is actually funny. At most one in four of her turns, never twice running,
never at CLOSED or HOSTILE. Add `[sighs]`, `[exhales]` and `[curious]` to the
allowed-tag list for the warm bands, and `[sighs]` for the cold ones. Tags cost
characters (`[laughs]` = 8, about $0.0004), so budget roughly +$0.002 a rep.
Strip tags before the transcript normaliser, which already happens
(`stripDeliveryTags`).

**R4 — Turn-initial particles, pre-rendered.** *infra + Tier 0 for the rules.*
Render a set of 8–12 particles per voice once, at voice-casting time:
"Mm.", "Mm-hm.", "Oh—", "Ha.", "Hm.", "Well…", "Yeah.", "Right."

Play one ~250–400 ms after he stops, while the LLM runs:
- **warm bands:** "Oh—" / "Ha." / "Mm." as change-of-state and appreciation
  tokens (Heritage 1984);
- **cold bands:** "Well…" / "Hm." in front of a dispreferred answer (Pomerantz
  1984).

The particle is **prefixed to her stored turn**, so the transcript, the
stability meter and rule 17's audibility accounting all see what the ear heard.
Rules:
- at most one in three turns, never two in a row;
- never before a question she is about to ask;
- never on the opening turn or the closing turn;
- `sanitiseForSpeech` must not double it if the model also wrote "Mm".

The cost is a few hundred characters, once per voice. The perceived gap on those
turns falls by 300–500 ms. This is **not** HUMANNESS-PLAN item 10's mid-speech
backchannel. That one waits until echo cancellation has been proven on laptop
speakers, because her "mm-hm" leaking into the mic would read as barge-in.

**R5 — Text-to-Dialogue socket, one per rep** (`HUMANNESS-PLAN.md` item 5,
unchanged). *infra.*
- Register the single voice.
- Set `new_turn` on a band or posture change, so prosody carries while her state
  is stable.
- Send `flush` on short lines (the buffer waits for ~40 characters / 8 words).
- Keep-alive during the brief.

This gives cross-turn prosodic continuity, which is what ElevenLabs' own agents
get and we do not, and it removes the per-turn TTS request.

**R6 — Retune the timing table to the new floor.** *Tier 0 (`timing.ts`).* When
L1–L6 land, measure the floor (probably ~1.0 s) and re-express `BAND_ONSET` as
offsets above it:

| Band | Offset above the floor |
|---|---:|
| INVESTED | +0 |
| ENGAGED | +100 ms |
| OPEN | +250 ms |
| GUARDED | +500 ms |
| CLOSED | +800 ms |
| HOSTILE | +1,200 ms |

Keep `MAX_RESPONSE_DELAY_MS` (2.0 s), so HOSTILE tops out there rather than at
floor + 1.2 s. The `intimate` and `dispreferred` hesitations then become
audible for the first time.

**R7 — A dead end gets a dead-end reply.** *Tier 0.* When his turn is a dead end
and her first sentence exceeds twice the mirror cap, replace the line with one
of her authored **micro-replies** (§7: "Mm.", "Yeah.", "Hm, maybe.", each in her
own voice) instead of shipping ten words of rescue. On a *second* consecutive
dead end at OPEN, allow silence (extend `SILENCE_BAND` for exactly that case).
Keep "never twice running" and every other guard. On the voice arm, the `want`
on a dead end should read as turning away: "Your attention goes back to the
painting. Two words at most, if anything." It should not read as a thought to
voice.

**R8 — Treat text that does not parse as English as misheard.** *Tier 0
(`classifyUserTurn` + the clarification rule).* A turn that is mostly non-English
script or unknown tokens is classified `unclear`. She answers "Sorry?" or
"Sorry, what?" (the existing rule names the part she did not catch), and it
never scores. "Hej der" → "Hej." stops happening, and the fast scorer stops
paying for noise (the "음." that earned +2.44 in `HUMANNESS-PLAN.md`).

**R9 — Variety across reps.** *Tier 0, authoring.*
- Six to eight moods per character instead of three.
- Four scene beats instead of two, two of them *openers* (§7).
- Sample 6 of 10 examples per rep, seeded like the mood so the cached prefix is
  still stable within a rep.
- Store a hash of her opening line per (persona, user) and refuse a repeat
  (`HUMANNESS-PLAN.md` §7.4).

---

## 5. Warmth engine plan: from a stranger to someone who is into you

### 5.1 Make interest *audible*, continuously, not only at band edges

Bands are twenty points wide, and a user who climbs from 42 to 58 hears nothing
change. The band stays the only owner of reply length (rule 4). These channels
can move *continuously* with warmth, and none of them is about length:

| Channel | Cold → warm | Where |
|---|---|---|
| Onset time | slow → fast | `timing.ts` (R6) |
| Voice | Robust → Natural | R2 |
| Laughter probability | 0 → up to 1 in 4 turns | R3 |
| Turn-initial particle | "Well…" → "Oh—" | R4 |
| Disclosure depth | nothing → L1 → L2 → L3 (§7 disclosure ladder) | gate |
| Her `want` | pulls away → yields ("the car can wait") | `wantClauses` |

This is the **gain effect** made legible: people like someone more when that
person's regard for them visibly *rises* than when it was high all along
(Aronson & Linder 1965). The contrast is the reward, and today the contrast is
mostly silent.

### 5.2 The interest-signal ladder, as authored behaviour

Research-grounded markers of interest, in roughly the order they appear. They are
authored per persona (§7), gated by warmth, and taught on the scorecard *after*
the rep (rule 8: nothing during it):

1. Answers come faster (timing).
2. Answers get longer and add a detail (OPEN permission).
3. She asks one back: curiosity about him, which reads as responsiveness
   (Huang et al. 2017).
4. She laughs at his remark (Grammer & Eibl-Eibesfeldt 1990; Kurtz & Algoe 2015).
5. She teases or challenges him playfully.
6. She discloses something personal: reciprocal, escalating disclosure (Aron et
   al. 1997; Sprecher et al. 2013).
7. She brings back something he said earlier (INVESTED permission).
8. Her own agenda yields: she stops mentioning the car, the present, the closing
   time.
9. Future talk: "if you're around…", "you should…" (INVESTED), then the number at
   the wind-down.

Disinterest is the same list read backwards: slower, shorter, no questions,
turning back to her task, polite closers, leaving.

### 5.3 What the meter rewards: research-backed terms for `fast.ts`

*All Tier 0; re-check the applied ratio (`README.md`: "a dead end has to cost
more than a good question earns").*

| Term | Rule (lexical, synchronous) | Points | Evidence |
|---|---|---:|---|
| **Follow-up question** | A question reusing a content word from *her last turn* | +4 (the fresh open question stays +3) | Huang et al. 2017: follow-ups specifically drive liking and second dates. McFarland et al. 2013 is the counterweight: plain question-asking left women feeling *less* connected, so the follow-up, not the question, is what to pay for |
| **Appreciation / sympathy** | "that must be…", "no way", "good for you", "that's awesome", "that sucks" after she disclosed | +1.5 | McFarland et al. 2013: appreciative and sympathetic language predicted women "clicking" |
| **Reciprocal disclosure** | A first-person content statement straight after she disclosed | +2 | Sprecher et al. 2013: turn-taking disclosure beats one-way |
| **Interview mode** | 3+ consecutive questions with no first-person content | −2, only for characters whose authored dislikes say so (Maya) | Her own contract. Today only the slow judge sees it |
| **Topic hop** | A new question with no overlap, and no acknowledgement of her answer | −1 | Not listening |

Each is a pure function with tests, in a new file beside `fast.ts`
(`lib/warmth/rapport.ts`), not a parameter added to it. That is the shape
`turn-kind.ts` and `leaving.ts` set.

### 5.4 The judge, on every turn, cheaper

The live judge runs on about 46% of turns (triggers plus every third). Move it to
every turn on `gpt-4.1-nano` or `gpt-5-nano` (≈ ¼ of the price), so it costs
roughly the same (~$0.002–0.004 a rep). Add one boolean to its output, `funny`:
"his line was an intended joke". That feeds R3, so she laughs at jokes and not at
random. Add a loose `profanity-present` trigger that only *routes* to the judge
and never penalises. "Fuckwit." as a name would then have been judged. Re-run
`npm run grade:calibrate` and the live-scorer calibration, since the model moved.

### 5.5 Integrity: selectivity is what makes the win mean something

- **W4a — No number after contempt.** *Rule 3 (`rep-rules.ts`), product law.* The
  keep condition becomes "≥55 **and** no contempt event, or judged intent ≤ −5,
  in the last 45 s". Eastwick et al. (2007): unselective interest is valued less.
  A character who offers her number to someone who has just insulted her teaches
  that it works. Outcome is still worth zero on the scorecard. This changes her
  *behaviour*, not the grade.
- **W4b — Wire the boundary exit.** `classifyOverreach` returns
  `boundary-violation` at gap > 30, and nothing consumes it (`slow.ts:94`). It
  should commit `wrapping` in `leaving.ts`, the same monotonic state dismissals
  use. This has been item 9 of `HUMANNESS-PLAN.md` since 6 September.

### 5.6 Gates with a personality of their own

`gateText` says "You may flirt." for every character. Add an optional authored
`style` string per gate in the persona file (rule 10). The clause then reads
"You may flirt, the way you do: teasing him about his taste in books". There is
still one owner of the gate and no per-character judgement code. Add two gates,
`laughs` and `teases`, so they can open at a character-specific warmth rather than
through the humour ≥70 clause, which would ship "Tease him" on *every* turn and
break rule 5's rationing.

---

## 6. Scoring plan

| ID | Change | Why | Cost / rep |
|---|---|---|---:|
| **S1** | **An outcome-invariance test** in `grade:calibrate`: pairs of transcripts identical except the ending (she offers her number vs she leaves). The composite must not move beyond noise | Rule 2 has never been tested. Composite–peak-warmth correlation is 0.67–0.80 on rungs 2–4, and `close` tracks the win rate | 0 |
| **S2** | **Pass the §17 gate**: twenty hand-scored transcripts across the four rungs | The 40% judgement is uncalibrated today | 0 (owed by hand) |
| **S3** | **Deterministic responsiveness features**, shown as evidence: follow-up rate, callbacks (long-range), her questions answered ("bids turned toward"), reciprocal disclosures | They are what the literature says builds liking, and they are measurable without a model | 0 |
| **S4** | **Signal reading from the event log.** After a cooling event (warmth −3, or two minimal replies in a row) did he change tack or give space? After a warming event (she asked back, laughed, disclosed) did he pick it up? | Turns the one dimension that is most "judgement" into timestamped, teachable facts | 0 |
| **S5** | **Persona-normalised talk ratio.** Target his share relative to her band's typical length, not a fixed 40–55% | Robin says less by design, which inflates his share and costs points he did not lose | 0 |
| **S6** | Grade reliability: median of 3 samples, or one stronger model, checked on the golden set | Scores cluster in 50–80 with SD 8–11, and one sample is noisy | +$0.004–0.008 |

S3–S4 also give the scorecard its best line: "At 1:12 she asked what you do. You
answered in two words and changed the subject. That was her interest, and you
missed it." Rule 8 keeps it after the rep, and `assertNoScript` still forbids
handing him a line.

---

## 7. The four characters: settings cards and backstory v2

**Decide the locale first.** The market is the US. Unless there is a reason to
be British, localise all four: place names, idiom, and American voices. Every card
below is written US-first, with the British variant a find-and-replace away.

**Across all four:**
- Add a **disclosure ladder**: three true things at rising intimacy, gated by
  warmth, so she has something real to give as she warms. Today the
  `personalDisclosure` gate opens onto almost nothing.
- Add **4 warm-band examples** to the 8 cold ones. Every current example shows
  the cold register, so nothing demonstrates how she sounds when she is into
  him. `examples.test.ts`'s "≥¼ of the set is four words or fewer" still holds,
  and no name or proper noun goes in his half.
- Add **micro-replies** for R7.
- Add a **laughs gate**, and gate **styles**.

Numbers below were checked in the offline simulation at 16 turns. **Change
trajectories only if the measured arm rates after L1–L6 miss these targets.**

### 7.1 Rung 1 — Cass: "the first stranger who is glad you spoke"

**Lesson:** opening your mouth works. **Targets at 16 turns:** competent ~100%
arm, nervous ~80%. ENGAGED by ~75 s for a competent player. **Never** a number
for a troll.

| Layer | Current | Proposed | Why |
|---|---|---|---|
| trajectory | 48±6 / 1.8 / 0.3 / 0.1 / cap 4.5 / ceil 85 | **unchanged** | Sim: competent 100%, nervous 80% at 16 turns. The troll case is fixed by W4a, not by a number |
| humour | 45 | 58 | Raises the liking multiplier (0.7 + humour/100) and keeps the "amused occasionally" prose. She is not ironic, so no tease clause |
| other personality | sharp 15, talk 55, patience 85, distraction 10, clarity 92, `earnest` | unchanged | Coherent with the character |
| gates | name 28, topics 30, flirt 32 (100), disclosure 34 (75) | add **laughs 50**. Flirt style: *"sincere: say plainly that you are enjoying this"* | Her interest signal is laughter and plain sincerity |
| voice | Jessica ("bright, warm"), never re-cast for `earnest` | **Re-cast.** Brief: *"American woman, 26, warm mid-low voice, soft and a little breathy because she is keeping her voice down in a gallery, unpolished, not bright or salesy"* | Warm and direct is a different instrument from bright and quick |

**Backstory v2 (additions to the contract):**
- A vet tech at a small-animal clinic. She holds dogs still for x-rays and is
  currently devoted to a three-legged greyhound patient called Biscuit.
- Twenty-six and the youngest person by forty years in her adult swim class at
  the Y.
- Her brother sends her links to "things she should have opinions about".
- In the modern wing of the city art museum on a day off. Her friend bailed this
  morning.
- She liked exactly one painting in the first room "because of the blue". The
  museum closes at five.

**Disclosure ladder:**
- **L1 (OPEN):** the job, the friend who bailed, the blue painting.
- **L2 (ENGAGED):** she keeps thinking about vet school. It is four more years and
  she would be thirty when she started.
- **L3 (INVESTED):** her dad used to bring her here when she was little. This is
  her first time back, and that is part of why she came alone.

**Into-you, her version:** she laughs; she makes him pick a painting for her
("okay, your turn"); she tells him a Biscuit story; she stops mentioning closing
time; at INVESTED, "there's a sculpture garden out back, if you've got ten
minutes."

**Moods (+3):**
- A dog at work had a good x-ray this morning and you are still pleased about it.
- An attendant has told you twice not to stand so close to the paintings.
- Your brother just texted asking what you think of Rothko, and you had to look up
  who that is.

**Beats (+2, both openers):**
- (An attendant announces the gallery closes in forty minutes.)
- (A child near you says loudly that a painting looks like spaghetti.)

**Warm examples (+4), for instance:**
- him "So you're a secret art critic." → her "Ha. A terrible one. I just know
  what I like."
- him "Pick one for me then." → her "That one. The ugly one. Nobody'd miss it."

**Micro-replies:** "Mm.", "Yeah.", "Huh."

### 7.2 Rung 2 — Nadia: "keep it going, and show you listened"

**Lesson:** follow-ups and callbacks. **Targets at 16 turns:** strong ~100%,
competent 30–50%, nervous ≤5%.

| Layer | Current | Proposed | Why |
|---|---|---|---|
| trajectory | 32±6 / 1.1 / 0.5 / 0.2 / cap 3.5 / ceil 85 | *if still needed after L1–L6:* start **34**, gain **1.3**, cap **3.9** | Sim, with the traits below: strong 100%, competent 29% (ENGAGED 72%), against 98% / 6% (37%) today. Start 34 flips her compiled disposition from "guarded" to "neutral". Pin it with `disposition` if unwanted |
| humour | 50 | 62 | She is `playful` and compiles to "amused occasionally". The tease arrives through a gate, not the ≥70 clause |
| distraction | 20 | 35 | Compiles to "something is half-competing for your attention", which is the present hunt and matches her `want`. The generic-gain penalty stays mild (1.03) |
| patience | 64 | 70 | Rung 2 forgives |
| gates | flirt 45, disclosure 40, topics 45, name 45 | add **laughs 50**, **teases 55**. Flirt style: *"teasing him about his taste in books"* | |
| voice | Laura (American, "quirky") | keep, R2 stability ramp | She is already American-voiced. Localise her prose |

**Backstory v2:**
- Saturday afternoon in a used bookstore, killing forty minutes before meeting
  her younger sister at four.
- She routes trucks for a grocery chain, is secretly good at it, and would rather
  not talk about it.
- She reads crime and non-fiction and is on her third time through a Tana
  French. She is mildly embarrassed by airport thrillers and holds that literary
  fiction is "sad people in nice houses".
- **A live dilemma he can help with:** her sister reads romance. Does Nadia buy
  what her sister will love, or the "good" book she thinks her sister should
  read? This makes the conversation *collaborative* and *about her*, both of
  which McFarland et al. found in the speed dates where people clicked.

**Disclosure ladder:**
- **L1:** the present, the crime novels.
- **L2:** she and her sister were not close until the sister moved back last
  year, so this birthday matters.
- **L3:** she is half-writing a mystery set in a distribution warehouse. Nobody
  knows. "Don't laugh."

**Into-you:** she gets quick and nerdy about crime novels; judges what he reads,
fondly; calls him "Mister good-reader" (a callback); hands him a book to read the
blurb aloud; at INVESTED, "there's a coffee place two doors down. I'm meeting my
sister at four, but…"

**Moods (+3):**
- Your sister has texted a photo of a book she already owns, captioned "do NOT
  buy me this one".
- You got a parking ticket twenty minutes ago and have decided not to think about
  it.
- The man at the register has already recommended three books to you and you did
  not want any of them.

**Beats (+2):**
- (The shop cat walks along the shelf past your head.)
- (Your sister texts: running ten minutes late.)

**Warm examples (+4), for instance:**
- him "I only read biographies." → her "Oh no. Okay. We can work with that."
- him "Get her both." → her "Ha. You're dangerous in a bookshop."

**Micro-replies:** "Mm.", "Yeah.", "Hm."

### 7.3 Rung 3 — Maya: "don't run dry at ninety seconds, and bring an opinion"

**Lesson:** build on what she said, and have views. Don't interview her.
**Targets at 16 turns:** strong 80–95%, competent 10–25%.

| Layer | Current | Proposed | Why |
|---|---|---|---|
| trajectory | 28±6 / 1.0 / 0.7 / 0.25 / cap 3.2 / ceil 82 | *if needed:* start **30**, gain **1.2**, cap **3.6**, ceil **85** | Sim, with traits: strong 95% (34% today), competent 1% (ENGAGED 21%). If competent should reach 10–25%, raise gain toward 1.3 and re-simulate |
| sharpness | 30 | 38 | Compiles to "when you are displeased it shows, briefly", which is her dry guardedness |
| humour | 55 | 62 | |
| distraction | 20 | 45 | The notebook genuinely competes. It also lowers generic-turn gain (0.97) while leaving callback turns at full price, which **is** her lesson |
| gates | flirt 60 (ceil 60), disclosure 45, topics 64, name 50 | topics **58**; add **teases 55** and **laughs 62** (hard to make laugh, so it means something). Flirt style: *"a dry challenge: make him defend an opinion"* | |
| voice | Lily (British, "velvety") | **Recast American** if localising. Brief: *"American woman, 29, low, even, unhurried, dry; little pitch movement until something amuses her"* | |

**Backstory v2:**
- Sunday morning, the window table, a pocket sketchbook. She draws the people in
  the café, badly and daily. This is a free opener: "Are you drawing me?" /
  "Not yet."
- Accounts payable: "I make sure people get paid. It's less boring than it
  sounds, then exactly as boring."
- A running argument with a friend about whether an oat flat white is a real
  drink.
- Dry takes: brunch is a scam; people who say they have no time to read have
  phones.

**Disclosure ladder:**
- **L1:** accounts, the sketch habit.
- **L2:** at nineteen she wanted to illustrate books, and did accounting because
  it paid.
- **L3:** she has drawn the same old man in this café every Sunday for a year and
  he does not know. She has never shown anyone the book, and offers to show him.

**Into-you:** dry turns into banter ("Defend the oat milk. Go."); she turns the
notebook towards him; she asks one real question; at INVESTED, "I'm here most
Sundays. Same table."

**Moods (+3):**
- You have drawn the same stranger twice this morning and he keeps moving.
- Someone two tables away is on speakerphone, and you have drawn him as a goose.
- You got up early for no reason and are quietly pleased with yourself about it.

**Beats (+2):**
- (The man at the next table knocks your elbow and your pen line skids across the
  page.)
- (The barista calls a name that is clearly misspelled on a cup.)

**Warm examples (+4), for instance:**
- him "Fine. Oat milk is a crime." → her "Finally. Somebody sane."
- him "Can I see it?" → her "Um. Okay. Don't say anything about the hands."

**Micro-replies:** "Mm.", "Right.", "Sure."

### 7.4 Rung 4 — Robin: "read an ambiguous no, and leave well"

**Lesson:** signal reading under polite ambiguity. **Targets at 16 turns:** strong
player arms 10–30% and reaches ENGAGED ~80% (the mask slips); competent ~0–3%.

| Layer | Current | Proposed | Why |
|---|---|---|---|
| trajectory | 20±6 / 0.8 / 1.1 / 0.35 / cap 2.7 / ceil 78 | start **25**, gain **1.05**, decay **1.0**, per-turn **0.30**, cap **3.3**, ceil **82** | Sim at 16 turns: strong 7% armed, **79% reach ENGAGED** (peak 62), against 0% and a 51.7 peak today. She stops being a wall and stays the hardest rung. `engine.test.ts` "leaves the top rung hard and not sealed" must be re-baselined deliberately |
| talkativeness | 35 | **30** | Crosses into "you do not carry the conversation… you let it sit", plus `[clipped]`: her whole mechanic is that warmth shows only in answer length |
| distraction | 30 | 40 | The car and the phone. Compiles to "half-competing" |
| other | sharp 20, humour 45, patience 55, clarity 20, `dry` | unchanged | clarity 20 *is* the rung |
| gates | disclosure 60 (40), name 66, flirt 72 (40), topics 74 | Flirt style: *"one sincere compliment, said lightly, never repeated"*. Add a **want-yields** beat at INVESTED | |
| voice | Sarah (American, "mature, reassuring") | keep. Stability 0.8 for most of the ramp, and only ENGAGED+ drops to Natural | The mask slipping *audibly* is her reward |

**Backstory v2:**
- 34, a strategy consultant for retail companies: "I tell companies what they
  already know, slowly, for money."
- In the lobby of a business hotel, flying out tonight. The car is fifteen
  minutes late.
- She has just left a meeting that went better than expected and has nobody to
  tell. Gracious, unreadable, faintly amused.

**Disclosure ladder:**
- **L1:** consulting, the flight.
- **L2:** she has not been home in three weeks and her plants are probably dead.
- **L3 (the mask slip):** "I'm actually terrible at small talk. I'm just very
  polite about it."

**Into-you:** longer answers; one genuine laugh; one real question about him;
"the car can wait a minute."

**Moods (+3):**
- Your phone is on nine percent and you are rationing it.
- The lobby has played the same song three times since you sat down.
- Your flight has been moved up an hour and you are pretending that is fine.

**Warm examples (+4)**, still complete sentences and still courteous, because her
warmth shows only in length:
- him "What would you do if the car never came?" → her "Honestly? Order room
  service and pretend I live here. It is not the worst idea I have had today."
- him "You don't seem like you hate this." → her "I don't. That is slightly
  inconvenient, actually."

**Align the scene with the wind-down.** Add a beat at ~0.82 of the rep, "(Your
phone buzzes: the car is outside.)", so the rule-3 decision at 30 s left lands on
a real event: "That's my car… [number]" when armed, "That's me. Nice talking to
you." when not.

**Micro-replies:** "Mm.", "Of course.", "I see."

---

## 8. ElevenLabs Agents and Speech Engine: is it any use to us?

### 8.1 What it is

- **ElevenAgents (the agents platform):** Scribe v2 Realtime STT, a
  **speculative turn-taking model** ("differentiates a pause for thought from a
  finished turn", reads prosody and emotional cues, prefetches responses),
  **Expressive Mode**, and an LLM of theirs or ours. Expressive Mode is
  `eleven_v3_conversational`, which "carries the emotional temperature of the
  conversation forward across turns", with tags like `[laughs]`, `[sighs]` and
  `[whispers]` affecting ~4–5 words.
- **Controls:** `turn_eagerness` (patient / eager), soft-timeout fillers,
  "interruption ignore terms" so "mm-hm" does not barge in, and system tools
  `skip_turn` and `end_call`.
- **Custom LLM:** any OpenAI-compatible streaming endpoint. It receives the full
  history and system prompt.
- **Speech Engine** (launched 25 May 2026): the same audio, turn-taking and
  interruption stack for "your own chat agent". Our server receives transcripts
  over a WebSocket and streams text back. The quickstart documents no way to
  skip a turn.

### 8.2 What it would fix, and what it would cost us

| | ElevenAgents / Speech Engine | Our pipeline today |
|---|---|---|
| Turn-taking | Semantic and speculative, built by people doing only this | Fixed 600 ms silence |
| Latency | "End-to-end under a second" is the claim | ~3.4 s |
| Cross-turn prosody | Yes (Expressive Mode) | No (R5 unbuilt) |
| **Per-turn word cap enforced in code** | Only via our custom LLM (we control the stream) | Yes |
| **Silence as a move** | `skip_turn` on Agents; not documented on Speech Engine | Yes |
| **Timing as a channel** | No: their turn-taker decides when she speaks | Yes, once latency allows |
| **Per-band voice settings** | Per conversation, not per turn | Per turn (R2) |
| Warmth engine placement | Must move server-side, stateful per conversation | Browser |
| Rule 1 | Their browser SDK must live behind `VoiceProvider` | OK |
| **Price** | **$0.08 / minute + LLM** ($0.16 burst over concurrency) | TTS $50/M characters + STT + LLM |
| **Per rep** | **~$0.25** | **$0.054** |

**The economics decide it.** Three minutes at $0.08 is $0.24 before our LLM,
judge and grade. That is **4.7× today** and **3× `COST_PER_REP_USD`**:

| Plan | Price | Reps at full use | Cost to serve at ~$0.256/rep |
|---|---|---:|---|
| Pro monthly | $19 | 90 | ~$23 |
| Pro yearly | $149 | 1,095 | ~$280 |

`economics.test.ts` would fail on every rung. Custom LLM does not change the
per-minute charge, and a silent user still accrues cost.

### 8.3 Verdict

**Not as the production engine at list price.** It becomes viable only with
roughly $0.02–0.03 a minute on an enterprise contract, or with plans that
permit far fewer dating reps. Neither is a trade to make blind.

### 8.4 How to use it anyway

1. **Apply for the ElevenLabs Startup Grant** (companies under 25 people, not on
   enterprise). It is 12 months free with **33 M credits**, "680+ hours of
   conversational AI audio". At ~880 characters a rep that covers ~37,000 TTS
   reps, or ~13,600 three-minute agent sessions, which is all of our current
   volume. It makes TTS $0 for a year and pays for item 2. Plan the exit: the
   account drops to Free when the grant ends.
2. **Run the blind A/B that §04 always asked for and M0 never passed**, at zero
   marginal cost under the grant. Arm A is our optimised pipeline after L1–L6.
   Arm B is Speech Engine with our warmth engine as the server. Judge on:
   - blind listener preference;
   - perceived latency;
   - control fidelity (does the band cap hold, can she be silent, does she
     leave);
   - character breaks.

   `lib/voice/index.ts` already carries an A/B split.
3. **Buy the parts, not the platform.** Scribe v2 Realtime (L3) is the STT their
   turn-taker is built on, at $0.39/h. v3 Conversational over the
   Text-to-Dialogue socket (R5) gives the cross-turn prosody. The speculative
   turn-taker is L4 + L5. Together these capture most of what Agents would give
   us, at in-house cost, with the warmth engine keeping per-turn control.

---

## 9. Other vendors worth a listen

Priced from vendor pages in September 2026. Quality is the Artificial Analysis TTS
arena (blind preference on isolated sentences; it does not measure conversational
context, `HUMANNESS-PLAN.md` §10).

### 9.1 TTS (58% of the bill)

| Model | Arena Elo (rank) | $ / 1M chars | TTS $/rep (12.4 turns) | Fit |
|---|---:|---:|---:|---|
| ElevenLabs v3 Conversational (**current**) | 1196 (#10) | 50 | 0.032 | Tags, alignment, and the voices we cast |
| **Inworld Realtime TTS-2** | 1245 (#3) | 20.8–25 on demand, 12.5 on tiers | **0.013–0.016** | Natural-language delivery directions, non-verbals (`[laugh]`, `[sigh]`, `[breathe]`), generates its own "uh"/"um". **Conditions on prior-turn audio** (contextual prosody, the thing `HUMANNESS-PLAN.md` §10 said nobody had solved). Timestamps, sub-200 ms. TTS-2 Flash: $15/M, 25 ms. *Verify the standalone `prior_audio` API; the docs are login-gated* |
| **Cartesia Sonic 3.6** | 1273 (#1) | 49 | 0.031 | Top of both arenas. Speed, volume and emotion controls that actually work (unlike `speed` on v3), `[laughter]`, sub-90 ms |
| Google Gemini 3.1 Flash TTS | 1199 (#8) | ~18 | 0.011 | Preview. Weaker realtime story |
| ElevenLabs Flash v2.5 | 1074 (#42) | 50 | 0.032 | No tags. Not worth it |

**V1:** A/B Inworld TTS-2 and Cartesia against v3 Conversational on *her real
short lines* ("Yeah, maybe." is the product, `PIPELINE.md` "Casting a voice"),
blind, with two listeners and more than one sample each (v3 is
nondeterministic).

- A swap is a new TTS module inside the pipeline arm. Rule 1 holds, and word
  alignment is required for barge-in truncation.
- Casting redoes all four voices.
- The privacy page must name the processor.
- If Inworld wins or ties, it also funds most of this report: roughly −$0.02 a
  rep.

### 9.2 Speech-to-speech arms, for the same A/B

| | Price | Latency | For | Against |
|---|---|---|---|---|
| OpenAI `gpt-realtime-2.1-mini` | audio $10/M in, $20/M out, cached $0.30/M → ~$0.03–0.05/rep | ~0.8–1.0 s perceived (M0 measured 0.3 s model + VAD) | Already built as the second arm; 18 turns a rep | Preset voices only; TTS arena #44 for the realtime family; no code-enforced word cap |
| Google Gemini 3.x Flash Live | audio $3/M in, $12/M out, context re-billed per turn → ~$0.06–0.10/rep (estimate) | fast | **Leads the Speech Agent Arena on preference.** "Affective dialog" plus **"proactive audio"** (the model may decline to answer, which maps onto the silence gate) | 30 preset voices; context re-billing; preview; no hard cap |

Both give up the per-turn control the warmth engine lives on (hard caps,
enforced silence, code-side truncation). **Keep the cascade and upgrade its
parts.** Include one S2S arm in the blind A/B only to learn what the ceiling
sounds like.

---

## 10. Cost model

Dollars per rep, measured base, then each accepted item. "Turns ×1.29" is the
cost of success: ~16 turns instead of 12.4 once latency falls, which is more
practice per rep and more TTS.

| Line | Today | Package A: optimised ElevenLabs stack | Package B: A + Inworld TTS-2 (on demand) |
|---|---:|---:|---:|
| TTS (incl. tags) | 0.0316 | 0.0430 | 0.0215 |
| STT (Scribe v2 RT, speech-gated) | 0.0089 | 0.0080 | 0.0080 |
| Character LLM (+25% speculative, +prewarm) | 0.0068 | 0.0122 | 0.0122 |
| Live judge (every turn, nano) | 0.0031 | 0.0025 | 0.0025 |
| Grade (single stronger sample) | 0.0038 | 0.0045 | 0.0045 |
| **Total** | **0.054** | **~0.070** | **~0.049** |
| vs `COST_PER_REP_USD` $0.080 | 68% | 88% | 61% |
| vs the yearly plan's hard limit ~$0.083 | 65% | 84% | 59% |

- **Package A fits and leaves ~1¢ of headroom.** A three-sample grade (+$0.008)
  would use all of it, so take S6 as "one stronger model" unless B lands.
- **Package B** restores the headroom and pays for the three-sample grade.
- **Under the Startup Grant**, TTS and Scribe are $0 for a year: ~$0.025–0.03 a
  rep.
- **ElevenLabs Agents / Speech Engine: ~$0.256.** Not viable (§8).

---

## 11. The order of work

Each phase ends with the same checks: `npm run typecheck && npm run lint && npm
test && npm run build:check`, the `db:*` harnesses that touch what moved, and for
anything that changes what she says or how she sounds, **`npm run rep:audition`
and a listening pass** (both spend money and are run by hand).

| Phase | Items | Tier | Verify with |
|---|---|---|---|
| **0: decisions (this week)** | Locale (US?); ladder targets per rung (§7); apply for the ElevenLabs grant; approve new vendors (Scribe is the same vendor; Deepgram, Inworld and Groq are new, each with a `legal-pages.tsx` line) | — | — |
| **1: latency without touching her** | L1 prewarm, L2 pre-reservation, L4 Smart Turn, L7 US measurement, L8 instrumentation | infra / Tier 1 | `db:spend` (release path); first-reply gap; turns per rep |
| **2: latency that touches `PIPELINE_*`** | L3 streaming STT, L5 speculation, L6 LLM bake-off, R5 TTD socket | Tier 0 (`PIPELINE_*`) | `dating-arm.test.ts` re-baselined with the diff read; `rep:audition` per candidate; latency p50/p90 from Asia and the US |
| **3: re-measure the ladder** | Arm and ENGAGED rates per rung at the new turns-per-rep, before any trajectory moves | — | Admin metrics, plus `rep:audition` archetypes ×10 per rung |
| **4: one signed-off rendering retune** | R1 truncation, R2 stability ramp, R3 laughter, R4 particles, R6 timing table, R7 micro-replies, R8 misheard, W4a no number after contempt, W4b boundary exit | Tier 0 + rule 3 | `dating-arm.test.ts` re-baselined once for the whole set; `rep-behaviour.test.ts` replays; listening pass on all four |
| **5: persona v2** | §7 backstories, disclosure ladders, gate styles, `laughs`/`teases` gates, moods, beats, warm examples, micro-replies, locale, recasting; trajectories only if phase 3 says so | Tier 0 | `examples.test.ts`, `roster.test.ts`, `room-tone.test.ts`, `npm run db:seed`, `rep:audition`, casting by ear |
| **6: meter and scorecard** | W3 rapport terms, 5.4 judge on every turn, S1–S6 | Tier 0 (`fast.ts`, `lib/grade/prompt.ts`) | `grade:calibrate` incl. S1 pairs; S2 hand scores; applied-ratio check |
| **7: strategic** | V1 TTS A/B; S2S and Speech Engine arms in a blind A/B under the grant; L9 per-rep socket | infra | The §04 blind A/B, finally |

**Owed by hand, whatever is chosen:**
- the grant application;
- casting all four voices by ear (Voice Design needs the paid plan);
- the twenty hand-scored transcripts (S2);
- listening passes after phases 2, 4 and 5;
- a US latency measurement.

---

## 12. What not to do

The history here is long and these are the reversals it cost:

- **Do not raise the word caps** to reduce truncation (§14.5a). Fix what counts as
  a sentence (R1).
- **Do not give a character her own judgement machinery.** Give her her own
  *life* (`PERSONA-AUDIT.md` §7 and §15.1). Everything in §7 here is content and
  dials, not code paths.
- **Do not add a standing order that ships every turn.** Rule 5. Laughter and
  teasing arrive as gates, rationed, not as a humour ≥70 clause.
- **Do not ask the model for fillers in the directive.** Demonstrate them in the
  prefix. A pre-rendered particle is audio, not an instruction.
- **Do not move trajectories before latency is fixed.** The ladder may already
  be right for 15 turns.
- **Do not let outcome into the grade**, and test that it has not leaked (S1).
- **Do not ship ElevenLabs Agents at $0.08 a minute** on plans priced against
  $0.08 a rep.
- **Never publish "flirty" anywhere a reviewer reads.** The gate names stay
  internal (`tess.ts`). PG-13 is unchanged on both streams.

---

## Appendix A — Sources (vendor and industry)

- ElevenLabs Agents pricing: https://elevenlabs.io/pricing/agents
- ElevenLabs API pricing (v3 Conversational $0.05/1k chars, Scribe v2 Realtime $0.39/h): https://elevenlabs.io/pricing/api
- Expressive Mode: https://elevenlabs.io/docs/eleven-agents/customization/voice/expressive-mode
- Interaction models / turn-taking: https://elevenlabs.io/blog/interaction-models
- Custom LLM for agents: https://elevenlabs.io/docs/eleven-agents/customization/llm/custom-llm
- Speech Engine: https://elevenlabs.io/docs/overview/capabilities/speech-engine and quickstart https://elevenlabs.io/docs/eleven-api/guides/cookbooks/speech-engine; changelog 25 May 2026: https://elevenlabs.io/docs/changelog/2026/5/25
- Price cut to $0.08/min: https://elevenlabs.io/blog/weve-lowered-api-agents-pricing-and-introduced-pay-as-you-go
- Startup Grants: https://elevenlabs.io/startup-grants and https://elevenlabs.io/blog/elevenlabs-startup-grants-just-got-bigger-now-12-months-and-over-680-hours-of-conversational-ai-audio
- v3 prompting guide (stability modes): https://elevenlabs.io/docs/best-practices/prompting/eleven-v3
- Models (v3 Conversational ~280 ms): https://elevenlabs.io/docs/overview/models
- Text-to-Dialogue WebSocket: https://elevenlabs.io/docs/api-reference/text-to-dialogue/ttd-websocket
- OpenAI pricing (gpt-4.1 family, gpt-5 family, realtime-2.1, transcription): https://developers.openai.com/api/docs/pricing
- gpt-realtime-2.1 / 2.1-mini (6 July 2026): https://www.marktechpost.com/2026/07/06/openai-gpt-realtime-2-1-mini-reasoning-realtime-api/
- gpt-realtime-whisper (streaming STT): https://developers.openai.com/api/docs/models/gpt-realtime-whisper
- Deepgram Flux: https://deepgram.com/learn/introducing-flux-conversational-speech-recognition and pricing https://deepgram.com/pricing
- Smart Turn v3 / v3.1 / v3.2: https://www.daily.co/blog/announcing-smart-turn-v3-with-cpu-inference-in-just-12ms/, https://www.daily.co/blog/improved-accuracy-in-smart-turn-v3-1/, https://github.com/pipecat-ai/smart-turn
- LiveKit pre-emptive generation: https://docs.livekit.io/agents/multimodality/audio/ and latency guide https://futureagi.com/blog/how-to-optimize-livekit-latency-2026/
- Artificial Analysis TTS leaderboard: https://artificialanalysis.ai/text-to-speech/leaderboard
- Artificial Analysis Speech Agent Arena: https://artificialanalysis.ai/articles/announcing-the-speech-agent-arena
- Cartesia Sonic-3.6: https://www.marktechpost.com/2026/08/18/cartesia-ships-sonic-3-6-a-streaming-tts-model-that-now-leads-both-artificial-analysis-speech-arenas/
- Inworld Realtime TTS-2: https://www.marktechpost.com/2026/05/05/inworld-ai-launches-realtime-tts-2-a-closed-loop-voice-model-that-adapts-to-how-you-actually-talk/ and pricing https://www.orcarouter.ai/blog/inworld-realtime-tts-2-flash-launch
- Groq pricing (gpt-oss self-serve only from 26 Aug 2026): https://www.cloudzero.com/blog/groq-pricing/
- Gemini API pricing (Live, Flash, TTS): https://ai.google.dev/gemini-api/docs/pricing
- Vercel Functions WebSockets: https://vercel.com/docs/functions/websockets

## Appendix B — The research behind the design choices

- Stivers et al. (2009), *PNAS*: universal ~200 ms turn gap; >700 ms read as dispreferred. Levinson & Torreira (2015), *Frontiers in Psychology*: speakers plan during the other's turn.
- McFarland, Jurafsky & Rawlings (2013), "Making the Connection", *American Journal of Sociology*: in 4-minute speed dates, women "clicked" with men who used appreciation and sympathy, who made collaborative interruptions (finishing or extending her sentence), and when the talk centred on her. https://web.stanford.edu/~jurafsky/pubs/mcfarlandjurafskyrawlings.pdf
- Huang, Yeomans, Brooks, Minson & Gino (2017), "It doesn't hurt to ask", *JPSP*: follow-up questions increase liking and second-date agreement (a correction was issued in 2025; the effect was replicated in Yeomans et al., "It helps to ask"). https://www.hbs.edu/ris/Publication%20Files/Huang%20et%20al%202017_6945bc5e-3b3e-4c0a-addd-254c9e603c60.pdf
- Aron et al. (1997), *PSPB*: sustained, escalating, reciprocal disclosure generates closeness. Sprecher et al. (2013), *JESP*: reciprocal turn-taking disclosure beats one-way disclosure for liking.
- Aronson & Linder (1965), *JESP*: gain–loss. Rising regard is liked more than constant regard.
- Eastwick, Finkel, Mochon & Ariely (2007), *Psychological Science*: unselective romantic interest is not reciprocated; selectivity makes interest valuable.
- Whitchurch, Wilson & Gilbert (2011), *Psychological Science*: uncertainty about someone's interest can increase attraction (Robin's rung).
- Grammer & Eibl-Eibesfeldt (1990): in mixed-sex encounters, women's laughter tracks interest. Kurtz & Algoe (2015), *Personal Relationships*: shared laughter signals relationship quality. Provine (2000), *Laughter*.
- Clark & Fox Tree (2002), *Cognition*: "uh" and "um" are signals, not noise. Heritage (1984): "oh" as a change-of-state token. Pomerantz (1984): dispreferred answers come late and prefaced ("well…"). Ward & Tsukahara (2000): prosodic cues for backchannels.
- Ireland et al. (2011), *Psychological Science*: language-style matching predicts mutual interest in speed dates (supports the mirror cap in `reciprocity.ts`).
- The imperfection heuristic, and Sesame's "context is the unsolved gap": as cited in `HUMANNESS-PLAN.md` §1 and §10.

## Appendix C — How the numbers were produced

- **Production reads** were `SELECT`s through the Supabase MCP against
  `sessions`, `transcripts`, `voice_operations` and `scores` (dating track,
  since 5 or 10 September as stated). No writes. Transcript excerpts are
  shortened and names removed.
- **The ladder simulation** ran the real `WarmthEngine` and `scoreFast` from
  `lib/` in a scratch Vitest file outside the repo.
  - Archetypes (per-turn mix):
    - strong = 50% open question, 40% callback, 10% ordinary;
    - competent = 35/20/25/12/8 good/callback/ordinary/short-answer/dead end;
    - nervous = 20/10/30/25/15.
  - A simulated slow judgement (intent +5 / +3 / +2) every third non-dead-end
    turn.
  - Start jitter included; 2,000 reps per cell.
  - "Armed" means peak ≥65 before the last three turns (the wind-down).

  It is a model of the ladder, not of a person. It shows the **direction and
  size** of turn-count and trajectory effects, and every number in §7 has to be
  confirmed with `rep:audition` archetypes and real reps before it ships. The
  script can be added under `scripts/` when this report is implemented.
- **Costs** are `voice_operations.cost_usd` sums divided by sessions, split into
  TTS and LLM from `usage`. Package costs in §10 scale the measured per-turn
  figures by vendor list prices; they are estimates until an invoice reconciles
  them (rule 18).
