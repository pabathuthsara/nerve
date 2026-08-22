# The ElevenLabs arm

An assembled pipeline behind the same `VoiceProvider` interface, so the blind
A/B in §04 can be run against the same application code.

```
mic -> VAD (ours) -> STT -> LLM -> ElevenLabs TTS -> playback
```

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
| `lib/voice/elevenlabs/player.ts` | PCM playback with an exact playhead |
| `lib/voice/elevenlabs/truncate.ts` | What she actually said. The load-bearing piece |
| `lib/voice/elevenlabs/telemetry.ts` | Per-stage latency, per-vendor cost, the credit guard |
| `lib/voice/elevenlabs/mint.ts` | Server side: ephemeral secret, credit check |
| `lib/voice/elevenlabs/server.ts` | The two proxy handlers |
| `lib/voice/elevenlabs/design.ts` | Voice design briefs and the audition lines |
| `scripts/voice.ts` | The casting CLI. Standalone |

`app/api/voice/{llm,tts,credits}/route.ts` are one-line re-exports of the
handlers above and contain no provider vocabulary, which is what keeps §04's
rule intact.

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
sample-exact, and falls back to a proportional cut. Either way it never ends
inside a word — the round-8 log has `"Depends, a lot's just sad people in"`,
and that specific failure has a test.

Onset fires ~90ms after the first loud frame, locally, with no network in the
path. That is the number to beat two overlaps with.

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

`totalPerceivedMs` is the number to put next to gpt-realtime's 1368ms.
`getTransportStats()` returns nulls on this arm — there is no peer connection to
read an ICE round trip from, so `ttsFirstByteMs` is the stage that moves when
the region does.

## Cost

ElevenLabs bills characters. Both TTS models bill **$0.05 per 1,000 characters
— identically**, so Flash is not the cheap option and v3 is not the expensive
one; the choice is latency against expressiveness.

Characters *sent* are counted, including the ones a barge-in throws away,
because that is what the invoice says.

The free plan is 10,000 credits a month with no overage: synthesis stops
mid-sentence. So the console screams from 8,000 upward — at mint time in the
server log, and on every further turn in the browser — and the CLI refuses a run
it cannot afford.

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

Nothing below spends a credit until step 4, and every step isolates one failure.

**0 — offline.** `npm run typecheck && npm test && npm run build`. The truncation,
VAD, telemetry and credit-guard suites all run without hardware or a key.

**1 — keys and the mint.** Put a fresh `ELEVENLABS_API_KEY` in `.env.local`, set
`VOICE_PROVIDER=elevenlabs`, `npm run dev`, then:

```
curl -s -X POST localhost:3000/api/voice/token \
  -H 'content-type: application/json' -d '{"personaId":"nadia"}' | head -c 400
```

Zero credits. It validates both keys at once, exercises the transcription-session
mint, and returns the live credit counter. A 500 is our misconfiguration, a 502
is the vendor refusing.

**2 — the character model.** Still zero ElevenLabs credits:

```
curl -N -X POST localhost:3000/api/voice/llm -H 'content-type: application/json' \
  -d '{"personaId":"nadia","history":[{"role":"user","content":"Is that one any good?"}],"steering":null}'
```

Server-sent events with her reply in the deltas. If she sounds like an assistant
here, the contract is the problem and no amount of voice will fix it.

**3 — cast a voice.** `npm run voice:voices` (free), shortlist two, then
`npm run voice:audition -- <voice_id>` at ~348 characters each. Put the winner in
`ELEVENLABS_VOICE_ID`, or better, in `persona.voice.ids.elevenlabs`.

Until a voice is set, **the mint refuses with an actionable message** rather than
letting a rep connect and then 404 on her first word.

**4 — synthesis through the proxy.** Twelve characters:

```
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:3000/api/voice/tts \
  -H 'content-type: application/json' -d '{"personaId":"nadia","text":"Yeah, maybe."}'
```

**5 — a live rep.** `localhost:3000/rep`. Watch the Pipeline section of the report
and the console. Deliberately test barge-in: let her start a long answer and talk
over her, then check `bargeIns`, `truncatedTurns`, and that her stored line in the
transcript stops where you stopped hearing it.

**Budget.** She says roughly 40 characters a reply and 20–30 replies fit in three
minutes, so a rep costs ~800–1,200 credits. That is **eight to twelve reps on the
whole free plan**. Run the OpenAI arm for anything that is not specifically about
the voice.

**Comparing arms.** Download the JSON on each arm and diff. Every pre-existing
field is unchanged; `pipeline` is additive and null on the realtime arm.
