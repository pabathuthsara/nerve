# The ElevenLabs arm

An assembled pipeline behind the same `VoiceProvider` interface, so the blind
A/B in §04 can be run against the same application code.

```
mic -> VAD (ours) -> STT -> LLM -> ElevenLabs TTS -> playback
```

The current browser transport is one HTTP turn stream. Microphone audio still
uses the existing OpenAI transcription socket; no ElevenLabs WebSocket was
introduced in the September 2026 latency work. After STT finalizes a user turn,
the browser posts to `/api/voice/turn`. The server streams the persona model's
first complete thought directly into ElevenLabs and returns audio, alignment,
usage and timing events as NDJSON. LLM tokens no longer travel back through the
browser before another synthesis request can start.

**ElevenAPI — raw text-to-speech, billed per character.** Not ElevenAgents. A
managed agent takes over turn-taking, and turn-taking is a calibrated per-user
number (§05, problem one). We are buying the voice and nothing else.

## Where things live

| Path | Contains |
|---|---|
| `lib/voice/elevenlabs/config.ts` | TTS models, pricing, output format, env dials |
| `lib/voice/elevenlabs/persona.ts` | The compiler. Same contract in, a different idiom out |
| `lib/voice/elevenlabs/vad.ts` | Our detector. Pure — energy in, events out |
| `lib/voice/elevenlabs/capture.ts` | One mic tap feeding both the VAD and the transcriber |
| `lib/voice/elevenlabs/stt.ts` | Realtime transcription, driven by our VAD, not theirs |
| `lib/voice/elevenlabs/llm.ts` | The character as a streaming text model. Cancellable |
| `lib/voice/elevenlabs/tts.ts` | Streaming synthesis and character alignment |
| `lib/voice/elevenlabs/turn-protocol.ts` | Request and event contract for the combined HTTP reply |
| `lib/voice/elevenlabs/turn.ts` | Browser stream reader, completion marker, cancellation and deadline |
| `lib/voice/elevenlabs/combined.ts` | Server orchestration: LLM to synthesis without a browser round trip |
| `lib/voice/elevenlabs/legacy.ts` | Session authorization and streaming usage observation for older clients |
| `lib/voice/elevenlabs/player.ts` | PCM playback with an exact playhead |
| `lib/voice/elevenlabs/truncate.ts` | What she actually said. The load-bearing piece |
| `lib/voice/elevenlabs/telemetry.ts` | Per-stage latency, per-vendor cost, the credit guard |
| `lib/voice/elevenlabs/mint.ts` | Server side: ephemeral secret, credit check |
| `lib/voice/elevenlabs/server.ts` | The two proxy handlers |
| `lib/db/voice-session.ts` | Owned sessions, resource reservations and server usage settlement |
| `lib/voice/elevenlabs/design.ts` | Voice design briefs and the audition lines |
| `scripts/voice.ts` | The casting CLI. Standalone |

The route files authenticate requests and enforce the spending boundary. They
are not one-line re-exports. Provider requests and stream formats remain in
`lib/voice/`, preserving §04's adapter boundary.

## Authorization and startup

For normal users, the token route opens an owned rep and reserves its
transcription allowance. Its response advertises the combined turn capability
and carries the session ID plus a startup-attempt ID. The client obtains
microphone permission first, so refusal never consumes a rep. Microphone ingress
stays muted while transport setup and owned-session activation complete.

Every combined turn has a unique operation ID. One reservation call checks the
owned session, persona, expiry and cumulative budget before either provider is
called, and returns the session's cached name/memory context. Each synthesis
clip in that turn shares this authorization; it does not repeat authentication,
memory reads or a separate browser-to-server hop. Settlement uses server-observed
provider usage and retains the conservative reservation when billing is unknown.
The route registers settlement with `after()` so a disconnect does not abandon it.

`/api/voice/llm` and `/api/voice/tts` remain for older minted clients. They require
an active session belonging to the authenticated user and requested persona,
then reserve that operation against the same budget. They preserve the original
SSE, PCM or NDJSON stream without buffering the complete response. They are not
an alternative path around the session budget. Internal calibration credentials
retain their explicit harness path. The credit endpoint is authenticated and
read-only.

An advertised combined turn never falls back to separate paid requests after an
error: that could generate and bill the same reply twice. Compatibility is
selected only from the mint response, before generation begins.
Budget exhaustion or a closed/expired/missing session ends and saves the rep;
a temporary busy/duplicate refusal remains a recoverable turn incident.

The advisory subscription check is cached for 15 seconds, shared between
simultaneous reads, and limited to 750 ms including its JSON body. An unavailable
counter is unknown rather than zero. The transcription mint is bounded at ten
seconds. Failed or cancelled setup closes capture, microphone tracks, the audio
context and transcription transport; the startup ID remains available so only
that attempt can be settled or refunded.

## Response timing and delivery

VAD keeps the user's existing calibrated silence threshold. The persona model
starts as soon as committed transcription settles and the user is no longer
speaking. The 0–700 ms personality beat
is now a desired onset measured from the actual end of user speech:
`max(0, desired beat − elapsed VAD/transcription/generation time)`. Only audio
that arrives early waits for the remainder. This removes the former sleep before
LLM generation without making every persona answer at the same pace.

Each STT commit snapshots its own speech start, speech stop, and commit time.
The transcriber's `input_audio_buffer.committed` item ID binds later results
to that snapshot; out-of-order finals drain in spoken order. A final from an
earlier clause is saved while newer speech continues, but it cannot start a
paid reply until that speech and all pending commits have settled. Empty or
failed clauses advance the queue without creating blank turns. Pending work
is bounded at 64 commits and 15 seconds per transcription; pause/end discard
text safely, including late acknowledgements after resume. Usage already
reported by a canceled transcription still counts while the session is open.

PCM still starts with a 20 ms scheduling lead. Playback completion follows the
AudioContext's scheduled end, including an optional onset pause, and a barge-in
releases a pending drain immediately. The client turn stream has a 25-second
deadline and requires an explicit completion marker; a broken stream cannot be
silently committed as a complete reply.

The cast voice IDs, persona contracts and stability baselines remain intact.
`deliveryFor` adds three small warmth-dependent pace bands, at most 2.5% above
the baseline before model bounds are applied. It retains the persona's
expression tag and stability. Explicit environment tuning overrides remain
respected; voice quality still needs listening comparisons before changing those
overrides or lowering the VAD threshold.

Pause disables microphone tracks and clears unfinished transcription input;
it does not pause the scene clock or her existing playback. Resume admits new
speech. Fatal live transport errors stop and persist the rep, and retry retires
the previous provider before starting another. Ending during connection cannot
resume that old attempt into the live state.

## Switching arms

```
VOICE_PROVIDER=elevenlabs
```

That is the whole switch. `lib/voice/index.ts` also takes a per-user override
and an A/B split, both of which work unchanged.

## Barge-in

The hard part, and the thing the managed API used to do for us. When the user
starts speaking over her, four things happen at once:

1. playback stops and the scheduled buffer is thrown away
2. the in-flight synthesis request is aborted
3. the in-flight character-model stream is aborted
4. **her turn is truncated to the words that reached the ear**

Four is the one that matters. Without it she remembers saying things the user
never heard, and every later turn answers a conversation that did not happen.

Truncation prefers character alignment from `/with-timestamps`, which is
mapped onto the actual PCM playhead, and falls back to a proportional cut. Either way it never ends
inside a word — the round-8 log has `"Depends, a lot's just sad people in"`,
and that specific failure has a test.

Aligned and unaligned clips retain their arrival order. Audio-only trailing
chunks add duration without repeating text, and actual PCM duration sets the
next clip's time offset. Continuation clips receive a transcript separator even
when the synthesis service trims input whitespace. Delivery tags are removed
before normalized turns reach scoring. Response identity checks discard late
audio and exit events from an aborted older turn.
The adapter seals the turn before notifying transcript or speech-stop listeners,
so a deadline listener that immediately ends the rep cannot commit it twice or
start another paid reply after the end.

Onset fires ~90ms after the first loud frame, locally, with no network in the
path. That is the number to beat two overlaps with.

### A barge-in is an interruption. Not everything that ends a turn early is one.

`onUserSpeechStart` used to cut whenever `player.isPlaying || responding`, and
`responding` is true from the instant generation begins — so a user speaking
while she was still *thinking* took the full barge-in path. That cost two of her
seven replies on 6 September (`LAUNCH-GAP.md` B11), and the second-order damage
was worse than the lost audio: a barge-in counted, a truncation counted, and a
turn sealed at zero played seconds that `commitAgentTurn` then found no text in
and dropped without a word anywhere.

`displaceCurrentReply` now decides between two dispositions, and it decides by
asking `playedText` — the same function that would do the truncating:

| | reached the ear | disposition |
|---|---|---|
| **barge-in** | words | truncate to them, commit, count `bargeIns`, count `truncated` |
| **supersede** | nothing | abandon the turn, count neither, report `agent.unheard` |

Asking `playedText` rather than a wall-clock grace is deliberate twice over. It
means the decision to truncate and the truncation itself cannot disagree — that
disagreement *was* the bug. And time is the wrong measure: an underrun advances
the clock while no audio plays, so a line "playing" for a second through a
stalled network has still not been heard. `PcmPlayer.playedSeconds` is derived
from the audio schedule precisely so that it knows the difference.

Both dispositions are shared with the overlap gate in `respond`, so a second
transcription final racing an in-progress reply disposes of it identically.

### Was that line audible?

`lib/voice/audibility.ts` is provider-neutral and, until 6 September, was
imported by exactly one adapter — the realtime one, which stopped shipping on
5 September. So the arm serving every customer reported `{unheard: 0}` through a
rep that lost two replies.

The watch now starts on `onFirstAudio` (a sample actually leaving the speaker,
not a buffer opening) and settles at commit. There is no `inbound-rtp` counter
to read here, so `UnheardTurn.packetDelta` stays null on this arm and `audioMs`
carries the equivalent evidence — how much audio the player was handed. It
separates the same two causes: **zero** means synthesis produced nothing and the
fault is upstream of the browser; a healthy number with a silent analyser means
the audio graph swallowed it.

Three things now report `agent.unheard` where all three were previously silent:
a superseded reply, a committed turn the analyser heard nothing during, and a
generation that produced no audio at all. The watch fails open — an analyser
that cannot be read yields no samples, and `TurnAudibility` already treats too
few samples as "withhold the verdict" rather than as silence, because
diagnostics may never end a live rep (§05).

**One behavioural difference from the OpenAI arm, stated plainly.** Here a
barge-in *always* cuts her off, whatever `persona.interrupts` says, because the
user must never be talked over. `interrupts` instead sets how hard the user has
to try to take the floor back: a character permitted to cut across people is
also permitted to hold a floor she has taken, so a quiet "mm" will not stop her.

## Telemetry

`summary.pipeline` on every session, folded into the downloaded JSON:

```json
"pipeline": {
  "ttsModel": "eleven_flash_v2_5",
  "sttModel": "gpt-4o-mini-transcribe",
  "llmModel": "gpt-4.1-mini",
  "stages": {
    "vadSilenceMs":    { "median": 0, "p90": 0, "count": 0 },
    "sttMs":           { "median": 0, "p90": 0, "count": 0 },
    "llmFirstTokenMs": { "median": 0, "p90": 0, "count": 0 },
    "llmCompleteMs":   { "median": 0, "p90": 0, "count": 0 },
    "ttsFirstByteMs":  { "median": 0, "p90": 0, "count": 0 },
    "totalPerceivedMs":{ "median": 0, "p90": 0, "count": 0 }
  },
  "bargeIns": 0,
  "truncatedTurns": 0,
  "usage": {
    "elevenlabs": { "characters": 0, "creditsUsed": 0, "creditsRemaining": 0, "costUsd": 0 },
    "openai": { "sttTokens": 0, "llmTokens": 0, "costUsd": 0 },
    "totalCostUsd": 0,
    "costPerMinuteUsd": 0
  }
}
```

The cost block sits **inside** `pipeline` rather than at the top level, because
the report already has a `usage` key holding realtime token usage and round 8
has to stay diffable against it. Every pre-existing field is untouched.

The normal finish-session path also stores `pipeline_telemetry`. This client
summary is diagnostic: it does not replace server settlement or add the old
elapsed-time fallback charge to a server-metered rep. Cached LLM input is priced
separately, unknown model rates produce an unpriced state, and long latency
stalls remain in the samples instead of being discarded above 20 seconds.

`totalPerceivedMs` is the number to put next to gpt-realtime's 1368ms.
`getTransportStats()` returns nulls on this arm. The combined stream's LLM and
TTS timings are measured on the server; perceived latency is measured from user
speech stop to first playback in the browser. Neither is an ICE round trip.
Operation metadata records the function region and the synthesis response's
region where available. Compare equivalent network conditions when interpreting
the historical Realtime measurement.

## Cost

ElevenLabs bills characters. Both TTS models bill **$0.05 per 1,000 characters
— identically**, so Flash is not the cheap option and v3 is not the expensive
one; the choice is latency against expressiveness.

Submitted characters include delivery tags and audio discarded by a barge-in.
They are a conservative synthesis estimate, not an assertion that every failed
or cancelled request was billed. Server records distinguish attempted/accepted
work and unknown usage; vendor reconciliation remains necessary. Legacy credit
counter units can differ from billable characters by model and account, so do
not infer dollar cost or remaining reps from a one-credit-per-character rule.

### An uncertain cost is bounded, never unknown — 6 September

`voice_operation_settle` reads a null `p_cost_usd` as `coalesce(p_cost_usd,
max_cost_usd)`: **an unpriced operation is charged its whole reservation.** Two
paths were handing it nulls on every rep.

`uncertainSynthesis` is set before a TTS request goes out and cleared when the
response comes back, so a turn interrupted in flight settled unpriced — and it
took the LLM half, which was never uncertain, down with it. Her first reply on
6 September synthesised **zero** characters against a known $0.0009 of
generation and was charged **$0.0357**: 38x, and 43% of that rep's entire
ledger. Five barge-ins in one rep reaches the $0.20 session budget and refuses a
turn at two minutes — the same failure the "drain, do not cancel" comment in
`combined.ts` already records for capped turns. The characters actually
*submitted* bound what the vendor could have charged, so that is the charge now.
`costUsd` stays null only when the model never sent a usage receipt at all,
which is the one case with no bound available.

The transcription envelope was the other. The browser holds that credential and
talks to OpenAI directly, so no route sees a receipt; `/api/voice/token`
reserves a flat four minutes as an admission bound, then settled it immediately
with a null. Every rep bought four minutes of transcription at the door
regardless of length — $0.024 against a measured $0.0018 on a 74-second rep,
27% of its ledger. It is no longer settled at mint. The reservation is simply
held, which is what a reservation is for and which
`voice_spend_committed_cents` counts against the daily cap identically, and
`finishRep` prorates it against the seconds the rep actually ran.

**The proration deliberately does not read the browser's measured token count**,
even though `pipeline_telemetry` carries it. This module settles from provider
responses, never from client-reported spend (rule 11), and a client that
under-reports would be buying free work. The user cannot have spoken for longer
than his rep ran; that bound is the server's own and is what gets billed. It is
still an over-estimate — he was silent while she talked — but an honest and
proportional one, and the measured figure stays in telemetry as the diagnostic
that will tighten the model once an invoice reconciles it.

Together these took the 6 September rep's ledger from **$0.0823 to $0.0253**,
which is what it actually cost: 3.3x, and the whole of the gap was those two
rows.

The free plan is 10,000 credits a month with no overage: synthesis stops
mid-sentence. So the console screams from 8,000 upward — at mint time in the
server log, and on every further turn in the browser — and the CLI refuses a run
it cannot afford.

At completion, recording flush starts before the provider closes its audio
context. Session persistence then runs before grading and audio upload start
independently. Slow or failed upload does not block grading, and a browser
recording failure does not end the conversation. A rep with no user text does
not buy a grade.

## Two ceilings, both made true — 10 September 2026

`## The band ceiling, made true` above is half the rule. The other half took
another five days and 487 measured turns to surface.

**`capToBudget` pushed a sentence and THEN tested the running total**, so the
sentence that broke the budget was always the one already added. With a cap of
six, "Hello." spent one word, the check passed, and the whole seven-word second
sentence went out — eight words against a six-word ceiling, reported as
`capped: false`. Across 487 production turns, **67 exceeded their word cap and
only 17 were flagged as trimmed at all**: the flag means "some generated words
were removed", never "the output stayed inside its budget".

**And there was no sentence ceiling.** "One sentence, never two" is stated at
four bands in `lib/warmth/bands.ts` and was measured disobeyed on 43% of opening
turns and 55% overall. That is the same lesson as `maxWords` — a ceiling nobody
enforces is a ceiling that becomes a target — arriving a second time in the same
table. `BandSpec.maxSentences` is now read by the same seam `wordCapFor` is.

Three things about the seam are load-bearing:

- **The two fallbacks are tied.** `sentenceCap` is only invented when the caller
  supplied NO ceiling at all. A caller that sent a `wordCap` has taken ownership
  of this turn's length — the wind-down hand-over stands the band down and sends
  `UNSTEERED_WORD_CAP` — and quietly applying a band sentence rule to a turn the
  band is not steering would drop the number offer, which is naturally two or
  three sentences and which rule 3 is written about.
- **Filler is free.** `budgetedWordCount` excludes hesitation from the budget
  while `spokenWordCount` keeps the honest number for telemetry and the drift
  detector. At a six-word ceiling "Um, I dunno. Work stuff." spends a third of
  its budget on nothing, so a writer optimising for density under a hard cap
  correctly drops the filler — the cap and the register were fighting and the
  cap always won. Six disfluencies in 1,274 turns.
- **`sanitiseForSpeech` runs BEFORE the ceiling**, so the sentence count is
  taken on the punctuation that will actually be spoken and the transcript
  matches the audio. It replaces an em-dash with a COMMA rather than a full
  stop: the dash almost always joins a clause to the one before it, and a full
  stop there makes two sentences out of one, which the ceiling would then halve.
  42 of 1,274 turns carried an em-dash against a contract that forbids them.

## Authorization, measured — 10 September 2026

Functions run in `sin1`. Supabase is in `us-east-1`. Every auth check and every
admission check crosses the Pacific, and both were strictly serial in front of
generation:

| Stage | p50 | p90 |
|---|---:|---:|
| Auth (`requireUser`) | 269 ms | 443 ms |
| Admission (`maySpend` + reservation) | 389 ms | 959 ms |
| LLM first token | 698 ms | — |
| LLM complete | 945 ms | 1,380 ms |
| TTS first byte | 164 ms | — |
| Server request → first audio | 1,923 ms | — |

`requireUser` now caches a SUCCESSFUL verification for 60 seconds, keyed on the
whole session cookie rather than a digest of it — a collision there would hand
one user another user's id, and no amount of unlikeliness makes that acceptable
for a cache that exists to save 269ms. Failures are never cached. `getUser()`
over `getSession()` is unchanged and the reasoning in `lib/db/api-auth.ts`
stands; what changed is how OFTEN, from fifteen times a rep to about three.

The turn route runs `requireUser` and `parseTurnRequest` concurrently: they read
different halves of the request, the slow one is a network hop, and the persona
compile that prices the turn does not need to know who is asking.

**Why this is a character problem and not a comfort one.** `lib/warmth/timing.ts`
is built on Stivers et al. (2009): the universal modal turn gap is ~200ms and
anything past ~700ms is decoded cross-culturally as a *dispreferred response*.
Her measured median across 586 real replies is **3.40s**, p90 4.58s, with 390 of
586 over three seconds — so `remainingResponseDelayMs` returns zero on
essentially every turn, the fifth layer of the character does not exist in
production, and every persona at every warmth sounds equally reluctant.

What is left is written up in `PERSONA-AUDIT.md` §14.6: reserving turn N+1
during turn N's playback (wins the 389ms without weakening rule 11, costs a
release path for unused reservations), or moving the functions to `iad1` (wins
auth, admission and the LLM hop, loses TTS and the user's own leg).

## Casting a voice

**Voice Design needs a paid plan.** On the free plan `/v1/text-to-voice/design`
returns 403 `feature_not_available`, so casting means picking from the premade
library instead — which is free to browse and auditions identically:

```
npm run voice:voices                    # free, lists what the plan can use
npm run voice:audition -- <voice_id>    # ~348 characters per voice
```

The library is tuned for narration and confident delivery, which is the opposite
of what Nadia needs. Push `ELEVENLABS_STABILITY` up towards 0.8–0.9 to flatten
whichever one you pick — that dial is the whole reason §04 argues tagged TTS
suits a product built out of difficulty dials.

`design` still builds and prints the brief, and works once the plan is paid:

> Native English. Female, late twenties. High quality, clean recording. |
> Persona: distracted bookshop browser. Emotion: flat, mildly bored, unhurried.

and on a paid plan saves the three previews plus their `generated_voice_id`s to
`voice-lab/nadia/design/`. On a free plan it prints the brief and then tells you
to use the library.

`audition` renders **her real lines from round 8** against both TTS models, into
`voice-lab/auditions/<voice_id>/<model>/`. Not the vendor's preview paragraph:
a narration-tuned voice sounds superb on a paragraph and falls apart on "Yeah,
maybe." At CLOSED the warmth band gives her one to four words, and two-word
replies are the product. Judge the short files first.

Both commands read `.env.local` themselves and price the run before making it.
A full audition is about 342 characters across all four combinations.

## Testing it

Offline tests spend nothing. Every live model call or synthesis audition can
spend provider usage; use an isolated authenticated test account and inspect
the resulting server operation records.

**0 — offline.** `npm run typecheck && npm test && npm run build:check`. The truncation,
VAD, telemetry and credit-guard suites all run without hardware or a key.
The adapter suite covers microphone refusal, real mute/resume, setup cleanup,
cancelled old responses, late transcription, and startup ID preservation. The
STT and adapter suites also cover overlapping clause timing, out-of-order item
completion, empty/failed segments, and one reply for the completed history. The
turn and legacy suites exercise fragmented streams, immediate first chunks,
deadlines, cached usage and one-time settlement after disconnection. Since the
default lint excludes voice/API directories, explicitly lint changed files with
`--no-ignore` as well.

**1 — keys and the mint.** Put a fresh `ELEVENLABS_API_KEY` in `.env.local`, set
`VOICE_PROVIDER=elevenlabs`, and open a rep from the authenticated app. Anonymous
requests to the token or paid endpoints return 401. Verify permission refusal
buys no rep, successful activation adopts the minted session, and failed setup
settles only its own startup attempt. Avoid printing the returned ephemeral
secret into logs.

**2 — the character model.** The isolated internal calibration harness can
still exercise the legacy SSE endpoint; ordinary requests require an owned
active rep. These calls spend LLM tokens even though they buy no ElevenLabs
speech. If the response sounds like an assistant here, inspect the compiled
contract before changing the cast voice.

**3 — cast a voice.** `npm run voice:voices` (free), shortlist two, then
`npm run voice:audition -- <voice_id>` at ~348 characters each. Put the winner in
`ELEVENLABS_VOICE_ID`, or better, in `persona.voice.ids.elevenlabs`.

Until a voice is set, **the mint refuses with an actionable message** rather than
letting a rep connect and then 404 on her first word.

**4 — synthesis through the proxy.** Exercise a short clip inside an owned test
rep or an explicitly configured internal harness. Verify audio format, alignment
and usage. A direct authenticated synthesis request without an active owned rep
must be refused before a vendor call.

**5 — a live rep.** `localhost:3000/rep`. Watch the Pipeline section of the report
and the console. Deliberately test barge-in: let her start a long answer and talk
over her, then check `bargeIns`, `truncatedTurns`, and that her stored line in the
transcript stops where you stopped hearing it.

**Budget.** Read the policy in `lib/db/voice-session.ts`, verify cumulative
reservations and protected grading capacity, and compare provider usage across
complete three-minute reps. The browser's direct transcription envelope and
unknown cancelled work are estimates, so a configured budget must not be
advertised as an invoice-exact maximum. Faster conversation can fit more turns
and consume more characters; measure again after latency improvements.

**Comparing arms.** Download the JSON on each arm and diff. Every pre-existing
field is unchanged; `pipeline` is additive and null on the realtime arm.


## Steering repair — 5 September 2026

The customer rep and admin audition now use `bindVoiceSteering`. For the
ElevenLabs HTTP pipeline, a synchronous `setReplyState` reader supplies one
current warmth directive immediately before every LLM request, after all pending
speech clauses have been scored. It reads current tuning and any slow score that
has already arrived without waiting for the scorer. The numeric warmth also
updates delivery at the same point. Previous directives never accumulate in
history. Scene, safety and closing reminders follow the current directive and
remain one-shot. OpenAI Realtime keeps its existing change/heartbeat strategy
because its conversation retains prior instructions.

This repairs steering parity in the admin preview. Saved persona files remain
the source for server-compiled identity, talkativeness and voice settings;
unsaved preview dials that only affect that static prompt still require a local
save and a fresh rep. This release does not change the points formula, slider
ranges, persona contracts, voice settings, VAD or payment checkout.

Validation: 1,405 tests pass, including repeated unchanged directions, scored
multi-clause speech, latest tuning, one-shot priority and Realtime compatibility.

The full TypeScript check, project lint and local production build pass. Explicit
voice/helper lint passes. The normally ignored legacy admin bench still has its
pre-existing raw-link lint errors and unused/dependency warnings; those were not
changed by this steering-only repair.

Released to `www.hellonerve.com` as `dpl_CDxyjKfkDzxuaE9dnEKctQG8fx2h`
(`nerve-1z6r5ayc2-pabathuthsaras-projects.vercel.app`). The hosted build passed;
its staged homepage returned 200 and unauthenticated turn endpoint returned 401.
Refresh an existing browser tab before starting a rep: steering is client code.
Rollback is the preceding `dpl_Gi8SUKRpz1jmXHmPu9548rKtoZqz` deployment.
No database migration or provider-setting change is part of this repair.

## Steering cadence — what the repair above cost (5 September, later)

The repair above is right about the mechanism and wrong about one consequence,
so it is left standing and corrected here rather than edited.

"One current warmth directive immediately before every LLM request" is forced:
the turn is stateless, the request is `[contract, exit rule, history, steering]`
and nothing carries, so an unchanged turn that sent no directive would leave her
with no band rule and nothing owning reply length. That much has to stay.

What came with it was not intended. The composed line also carries the **want
clause** — her own agenda — which was authored for a provider that retains
instructions, where the caller's change detection meant a rep saw a handful of
directives in total. Sent before every reply it becomes a standing order acted
on immediately, and it is the last thing the model reads before generating.
Nadia's retreat-to-the-scene rate went from 17.4% of her turns to 45.8%,
against a contract that says never; Tess went 12.7% to 21.7%. The closing
decision, appended *after* that line, produced three conditional number offers
in a row on a path that had been giving it cleanly the day before.

So the cadence is now explicit instead of incidental:

| | Sent |
| --- | --- |
| Band, posture, colour, gates | Every turn, both arms. Nothing else owns reply length |
| Want clause | Only when the direction is new — it changed, or the heartbeat came due |
| Closing decision | Alone. `handOverToClosing()` stands the directive down for exactly one turn |

`WarmthSession.statelessDirective()` is the reader for a provider that keeps
nothing; `directiveIfChanged()` remains the reader for one that does not, and
both honour the closing hand-over. `SteeringContext.includeWant` is the switch.
Six regressions in `lib/warmth/voice-steering.test.ts` pin all of it.

Unrelated, in the same change: the transcription session now pins
`language: 'en'`. Without it the model guessed per commit and a hum came back
as `อืม`, which reached the warmth engine as an unreadable turn and the
character as Thai. It is an option on `TranscriberOptions`, defaulted rather
than hard-coded.

The full argument, with the measurements and the transcripts, is
`PERSONA-AUDIT.md` §11. Two things there are owed rather than done:
`npm run rep:audition` drives `directiveIfChanged()` and so cannot audition the
arm that actually ships, and the warmth-dependent reply beat is still zero on
every reply and was left alone deliberately.

This release is also the first since 5 September that Vercel can identify by
commit. The four deployments before it went out from a dirty working tree
carrying the SHA `9d7297f`, which contains none of the pipeline; `9e9a155`
committed that tree unchanged and the git-linked build `dpl_3F8Ur99nDGC4iQdmm`
replaced it on `www.hellonerve.com`.

## The band ceiling, made true — 5 September, later still

The steering repair above fixed the cadence of one clause. It did not touch the
number, and the number was the larger half.

Every word cap in `lib/warmth/bands.ts` was authored against a speech-to-speech
model that ran at half of whatever it was allowed — measured across 51 realtime
reps, median agent turn 7 words, p90 11, against caps of 12 to 15. On this arm
the writer is `gpt-4.1-mini`, and a text model reads "twelve words at most" as a
specification. Her first line, before any history exists to dilute anything,
went from 4 words to 12. Then it climbs: within one rep, replies of three
sentences or more go from 30% to 67% here and from 0% to 2% on the realtime arm,
because her own turns come back as the conversation and become the example.

Four changes, and the full argument with the measurements is
`PERSONA-AUDIT.md` §12.

| | Before | Now |
| --- | --- | --- |
| Band directive | a ceiling only | a typical first, the ceiling second, both lower |
| Band invitation, gates | every turn | with the agenda, only when the direction is new |
| The ceiling | stated | enforced — the buffered reply is kept up to the first sentence boundary at or past it |
| Verbosity alarm | literal 12, fired the identity reminder | derived from the band table, no longer talks to the model |

Three things about the enforcement matter operationally.

**It trims the reply, it does not stop the turn.** Generation runs to its own
end and the tokens past the ceiling are read and thrown away rather than
cancelled — the accounting reason is in `combined.ts`, and it is that the usage
receipt is the last frame of the stream, so a cancelled turn settles with an
unknown cost and holds the whole conservative reservation. Measured on the first
real rep: three capped turns billed at $0.0358 each against an actual $0.003. A
capped turn emits `done`, never `error`, and settles `completed`, never
`aborted` — the browser commits it like any other reply.

**It never cuts mid-sentence and never returns nothing.** `capToBudget` splits
the buffered reply on terminal punctuation and keeps whole sentences, and the
first is spent before the budget can refuse anything. A single long sentence
still goes out whole: this is a ceiling on how much she piles on, not a
shredder.

> **Changed 6 September 2026.** This used to read "generation stops at the first
> sentence boundary at or past it", because the pipeline flushed her line to
> synthesis sentence by sentence and the budget rode on the flush. It no longer
> does: **one turn is one prosodic unit** (`HUMANNESS-PLAN.md` §2), the whole
> generation is buffered and spoken in a single request, and the ceiling is
> applied to the reply that arrived whole. Same rule, same boundary, one
> implementation instead of two — `capToBudget` was the offline version and is
> now the live one, so the audition harness and the customer go through the same
> function.

**It is visible.** Each turn's operation record carries `wordCap`, `spokenWords`
and `capped`. A cap firing on most turns means the band's typical is still above
what the writer wants to produce, which is a `bands.ts` question and not a bug in
this file. The legacy client path buffers and trims identically, and still never
cancels, because that path reads an aborted stream as "throw the turn away".

`sessions.character_breaks` is new (one migration, `DATA.md`): the stability
meter has run inside the live rep since this pipeline shipped and discarded
everything it found.

`npm run rep:audition` now drives `statelessDirective()` and trims with
`capToBudget`, so it finally auditions the arm customers are on — the item §11
recorded as owed. It spends money and is still run by hand.

**One live rep on this code, and it found two faults.** The behaviour landed —
median reply 14 → 8 words, three-sentence turns 48% → 9%, first line 12 → 6 —
but the rep ended at 126 seconds of 180 with a budget refusal. Cancelling the
model stream at the ceiling loses OpenAI's usage receipt, which is the last
frame of the stream, and an unknown cost keeps the whole conservative
reservation: three capped turns billed at $0.0358 against an actual $0.003, and
$0.149 of a $0.20 session budget gone. **The ceiling now drains the remaining
tokens instead of cancelling** — the tail of a 120-token ceiling is worth a
hundredth of a cent and the receipt is worth twelve times the turn. Separately,
`lib/data/rep.ts` had never called `StabilityMeter.observeUser`, so `double-turn`
fired on every reply and the identity reminder was injected before every one of
them. Both fixed; see `PERSONA-AUDIT.md` §12.

### Released

`552702d`, git-linked, as `dpl_95r7XyAXokfAWZAEBrNC8xjyjgUL`
(`nerve-q0rh277xr-pabathuthsaras-projects.vercel.app`) on `www.hellonerve.com`.
The second honest deployment label since 5 September: Vercel's own record carries
the real SHA with no `gitDirty`, unlike the four that went out from a working
tree carrying `9d7297f`.

Verified after the build: `www.hellonerve.com` 200, the apex still 308s to it,
`/api/voice/turn` and `/api/voice/llm` both 401 unauthenticated, the five public
pages and `sitemap.xml`/`robots.txt` 200, and `npm run whop:verify` clean apart
from its standing local-shell `RESEND_API_KEY` warning, which is
`LAUNCH-GAP.md`'s open secret and not this release. The migration was applied
before the build, so no deployed code reads a column that is not there.

**Rollback is `dpl_7g1cUFZ4FJKZfjtpyo7ZnmaEH192`**, the preceding production
deployment, and this is one commit — reverting the behaviour reverts all of it.
Refresh an existing browser tab before starting a rep: the band table, the
steering cadence and the reply budget are all client code.

One rep is one rep. Warmth has never passed 59 on this code, so ENGAGED and
INVESTED — the two bands retuned most — are now live and still unexercised by a
real conversation. That is the thing to watch in the next few reps.
