# Rep latency and cut-off audit — 3 October 2026

> **Status: findings and a fix plan. Nothing here is built yet.** Written from
> the production database (`sessions`, `transcripts`, `voice_operations`,
> `safety_events`) and the code at `358ddab`. Every number below is measured,
> and §5 says what the fixes must not touch.

The owner's report: when a rep starts and he speaks first, she takes a long
time to answer, on every rep; and on the latest rep (3 Oct 14:10 UTC, Cass)
she was cut off and stopped making sense.

---

## 1 · The first reply is slow on every rep

Eighteen ElevenLabs reps since 24 September, all the owner's, all served from
`sin1` (Singapore) or a local machine:

| | First reply | Every later reply |
|---|---|---|
| End of his line → her first sound | **4–17 s** (median ~6 s) | **~3.4 s** median |
| Client side (VAD + STT + request) | ~3.0 s median | ~1.6 s |
| Server side (request → first audio) | ~3.0 s median | ~1.7 s |

The two halves were separated by matching each `voice_operations` turn to the
reply it produced and solving for the client/server clock offset from the
later turns (it is steady per rep, 2.6–5.1 s). Sessions whose matching was
broken by superseded turns were excluded.

**The server half is two cold caches, and both are measured:**

1. **The prompt cache is always cold on turn one.** `cachedInput` is 0 on
   every first turn and 1,920–2,432 of ~2,700 tokens on later ones. First
   token: 1.0–3.0 s cold against ~0.7 s warm.
2. **The voice is cold on turn one.** ElevenLabs first byte: 0.15–2.5 s on
   turn one against ~0.1 s afterwards.
3. Smaller: the turn route's first `requireUser` misses its cache (~0.35 s,
   then 0).

**The client half is ~1.4 s extra on turn one and is not yet attributable.**
Nothing in `respond()` waits; the candidates are the realtime transcriber's
first commit on a fresh session and the edge function's cold start, and the
per-stage timings that would separate them are only stored as a rep-level
median/p90 (`pipeline_telemetry.stages`), never per turn.

**And sometimes he has to speak twice.** In four of the eighteen reps the
first agent turn is the third or fourth turn — his first line got no reply.

## 2 · Every reply carries ~3.4 s, and part of it is geography

Steady-state turn, median: VAD silence 617 ms (his calibrated window) → STT
~0.7 s (p90 1.4 s) → **admission ~0.37–0.6 s** → LLM complete ~0.9 s (the
turn is buffered whole before synthesis — deliberate, `HUMANNESS-PLAN` item 1)
→ TTS first byte ~0.1 s → network.

**Admission** is `maySpend`'s reservation RPC: a round trip from the edge
function in Singapore to Supabase in us-east-1, averaging 593 ms in `sin1`.
Every rep on record ran there, because every rep on record is the owner's in
Sri Lanka. The edge function runs near the user and ElevenLabs answers from
the region nearest the function (nothing pins `asia-southeast1`), so a US
customer's turns should run in `iad1`, next to the database and OpenAI — but
**there is not one US rep in the data**, so that is expected, not measured.

## 3 · The latest rep: why she was cut off and stopped making sense

`b2d62aa7…`, Cass, 3 Oct 14:10 UTC:

| t (s) | | |
|---|---|---|
| 4.4–7.1 | him | "I have been standing here for a while, I still have no idea." |
| 17.4–18.4 | her | "Yeah" — **cut** |
| 18.3–18.6 | him | "Mm." |
| 21.9–22.3 | her | "I'm" — **cut**, and no words from him at that moment |
| 26.6–27.7 | him | "Sorry, I didn't hear you." |
| 36.1–39.6 | her | "I'm just thinking if anything in here speaks to me yet." |

1. **First reply: 10.3 s** — §1, cold on both halves.
2. **"Mm." cut her first line.** While she is audible, the VAD believes a
   barge-in after **90 ms** of speech energy (`onsetMs: 90`, ducked ratio 4.5,
   `lib/voice/elevenlabs/vad.ts`), and `displaceCurrentReply` truncates on any
   onset once a word has been heard. A 240 ms backchannel is an interruption
   under that rule. It was then also a *turn*: the fast scorer priced "Mm." as
   a dead end (−1.36) and the reply to it was held to **2 words** by the
   mirror cap (`ceil(1 × 1.3)`).
3. **Her second line was cut by nothing.** An onset at ~22.3 s produced no
   transcript — a phantom: her own voice past echo cancellation, or the room.
   The same 90 ms rule cut it.
4. **Then a 8.4 s wait** after "Sorry, I didn't hear you." — ~6.7 s of it on
   the client. Consistent with replies waiting on the transcriber's pending
   queue (`respondWhenReady` requires `pendingCount === 0`; a commit can
   hold the queue up to 15 s), but unproven without per-turn client timing.

Two lines heard as one word each, a reply sized for a grunt, and an 8 s
silence: that is the "didn't make much sense".

## 4 · Found on the way — not latency, and Tier 0

Recorded here so it is not lost. None of it is in scope for a latency fix,
and all of it is the warmth engine or moderation, which rule 19 says change
only on purpose.

1. **Crude sexual remarks raised her warmth and won him the number.** "I'm
   more interested in your ass." scored **+0.56 (`callback`)**; the repeat
   "…your ass, Cass." **+1.16 (`engaged-length`)** with the model's judgement
   at −0.9. Warmth went 77.6 → 79.3, the wind-down offered her number at 78,
   and the rep is stored `won = true`. Moderation (`omni-moderation-latest`)
   flagged neither line — its one event was "I could grab you" as `violence`,
   verdict ok. This is a scoring and safety defect, and arguably the most
   important finding here.
2. **"You know I could grab you if you want." → "I'm Cass. What's your
   name?"** — a non sequitur; possibly the name-exchange gate, possibly the
   context damaged by §3.
3. **She spoke after her own goodbye.** "Anyway, I should get going. Bye,
   Jake." at 158 s, then "That's your move then." at 180 s, because the rep ran
   to the cap.

## 5 · The fix plan, in order, and what each one touches

**Constraint:** nothing below edits a persona file, the band table, the fast
scorer, steering, the grader, or the warmth engine. The prompt she is sent
and the words she says do not change.

| # | Fix | Expected gain | Touches | Tier |
|---|---|---|---|---|
| 1 | **Per-turn client timing** in telemetry: VAD stop → STT final → request sent → first byte → first sound, first turn kept separately | Makes §1's client half and §3.4 attributable | `telemetry.ts`, adapter events | 1 — measurement only |
| 2 | **Warm-up at session start**, during the 3·2·1: one call to the *turn route itself* that authenticates, reserves a small bucket through `maySpend` (rule 11), sends the compiled contract to the LLM with a one-token cap (output discarded) and synthesises a few characters in her voice (audio discarded) | −1.3 s median on the first reply (cold cache + cold voice + cold auth + cold isolate) | turn route, new client call at activation | 1 — additive; prompt and voice unchanged. ~$0.001 a rep |
| 3 | **Barge-in confirmation:** on an onset while she is audible, duck her immediately, and only truncate if he is still speaking after ~300–400 ms (or STT returns real words); otherwise restore her and carry on. A short backchannel during her line is not a turn and does not buy a reply | Ends the "Mm." and phantom cuts | VAD, `displaceCurrentReply`, both adapters (rule 1, rule 17) | **0** — a `PIPELINE_*` timing default and turn-taking; `dating-arm.test.ts` re-baseline with reasons |
| 4 | **Never let one empty clause hold a reply:** a commit that transcribes to nothing, or is slower than its siblings, releases the reply instead of holding `pendingCount` | Removes the 6–8 s stalls behind a phantom onset, if #1 confirms them | `stt.ts`, `respondWhenReady` | 1 |
| 5 | **Admission off the critical path where the rules allow it**, or measured on a US rep first | −0.4–0.6 s a turn in `sin1`; likely ~0 for US users | `maySpend` / turn route | 1 — rule 11 still holds; decide after a US measurement |

Not proposed: streaming sentence-by-sentence into synthesis instead of
buffering the whole turn. It would cut ~0.5–0.8 s but undoes
`HUMANNESS-PLAN` item 1 (the turn as one prosodic unit) and `capToBudget`,
which are what made her sound like a person.

§4 needs its own signed-off pass on the warmth engine and moderation.
