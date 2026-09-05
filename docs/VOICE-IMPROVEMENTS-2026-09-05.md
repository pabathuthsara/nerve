# Voice improvements — implementation and verification

Date: 5 September 2026. Scope: the non-WebSocket work authorized after the voice audit. Existing OpenAI transcription uses its existing socket; no persistent ElevenLabs socket was introduced.

**Release status:** deployed and promoted to [www.hellonerve.com](https://www.hellonerve.com) on 5 September 2026. The initial release was `dpl_Gi8SUKRpz1jmXHmPu9548rKtoZqz`. A same-day steering repair superseded it with `dpl_CDxyjKfkDzxuaE9dnEKctQG8fx2h`; see the steering repair record in [PIPELINE.md](PIPELINE.md). No ElevenLabs WebSocket was introduced.

## Changes

| Area | Implemented behavior |
| --- | --- |
| Response path | One authenticated HTTP turn stream coordinates LLM generation and ElevenLabs synthesis on the server. Audio begins as the first speakable text is generated. Subsequent clips reuse the same authorization and cached persona context. |
| Authentication | The exact paid routes authenticate once with verified Supabase getUser. Middleware skips its duplicate check only for the explicit registry of routes that own authentication. |
| Persona context | Name and memory are read at mint and kept in the short-lived owned rep. The server compiles the authored character contract; the browser does not supply it. |
| Personality timing | Generation starts immediately. Existing VAD and generation time count toward the small personality pause before playback. The existing 600 ms default and per-user calibration remain. |
| Voice delivery | The four cast ElevenLabs voices remain. Stability, similarity and explicit baseline settings remain; bounded warmth-dependent pace variation is at most about 2.5%. Delivery tags stay restricted to the first clip. |
| Startup | Microphone permission precedes credential mint. Credit status has a 750 ms deadline and 15-second cache. Failed and concurrent starts have attempt-specific cleanup and an idempotent quota refund. |
| Playback | Late audio from an interrupted response is rejected. PCM position and mixed alignment determine the transcript actually heard. Pause mutes input. Fatal failures close and save the rep. |
| Completion | Recording flush begins before the audio context closes. Grading and audio upload run independently after transcript persistence; upload delay cannot block the grade. |
| Measurement | Sessions save pipeline timing. Server operations save model, region, request IDs, cached input tokens, submitted TTS characters, cost basis and completion state. Unknown usage remains explicitly estimated. |
| Cost control | Atomic ownership, quota, resource, time, daily-spend and per-rep admission checks run before paid work. Legacy HTTP endpoints also require an owned active rep for ordinary callers. |

The deployed models are Eleven v3 Conversational, GPT-4.1 Mini for persona text and warmth, GPT-4o Mini Transcribe for input, and GPT-4.1 for the final grade. The grading prompt, rubric, personality contracts and product win rules were retained. Existing uncommitted persona edits present before this task were preserved.

## Verified results

A production-mode browser run used a temporary authenticated account and prerecorded user speech fed through the real microphone pipeline. This exercised actual OpenAI transcription, LLM generation, ElevenLabs PCM playback, moderation, warmth, recording, persistence, grading and result screens. The first development-mode run was interrupted by hot reload and is excluded from latency results.

The completed browser rep lasted 186 seconds, including closing grace, and stored 11 transcript entries, one scorecard and a 380,367-byte private WebM recording. Result, scorecard and transcript screens rendered without browser errors. Five completed voice replies had:

| Measurement | Median | p90 | Samples |
| --- | ---: | ---: | ---: |
| Speech end to first playback | 3,424 ms | 4,934 ms | 5 |
| VAD silence | 609 ms | 619 ms | 6 |
| STT finalization | 717 ms | 889 ms | 6 |
| LLM first token | 731 ms | 1,327 ms | 5 |
| TTS first audio | 462 ms | 541 ms | 12 clips |

The historical audit found a 6,467 ms median across 22 gaps in five short reps. These samples are encouraging but are not a controlled A/B or a production latency guarantee. The audit's 1.2-second median target is not yet demonstrated. Stage percentiles must not be added to construct an end-to-end percentile.

Additional real HTTP smoke tests produced aligned PCM and successful warmth scores for Nadia, Maya and Robin, twice each. Request-to-first-audio times, which exclude VAD and STT, were 1.67–2.95 seconds. Tess was covered by the full browser rep. No voices were replaced with Flash.

The full rep exposed a close-speech transcription race. Each speech commit now retains its own immutable timing and provider item ID. Finals drain in spoken order, including when the provider finishes them out of order. The adapter waits while later speech or transcription is pending, then generates one reply from the accumulated clauses. Pausing discards pending text without reassigning late acknowledgements. Eight transcriber regressions and three additional adapter regressions pass; the default silence calibration is unchanged. A final production-mode browser regression confirmed two consecutive clauses retained separate positive speech durations and triggered one reply, followed by successful persistence, grading and the result screen. Temporary test-harness interruptions (a concurrent script closing the same test rep and a stopped local server) are excluded from latency measurements; the recovery run is a functional regression check, not a new latency baseline.

## Cost interpretation

The default server admission envelope is **$0.20 per rep**, configured by NERVE_VOICE_BUDGET_USD. It reserves up to $0.03 for the final grade. The live authorization lasts 240 seconds; grading remains eligible until 600 seconds after opening. One initial transcription credential and one reconnect are allowed. Cumulative resource limits and per-call bounds prevent unlimited generation inside the same rep.

This intentionally keeps headroom for the current personas. An $0.08 setting is supported, but it should not be enabled until representative full-length quality trials show it does not cut natural conversations short. The existing audit's $0.05–$0.06 average remains an optimization target, not a promised maximum.

For the measured browser rep, server receipts recorded:

| Cost basis | USD |
| --- | ---: |
| Completed persona LLM + submitted TTS characters | 0.033290 |
| Warmth scoring | 0.001579 |
| Final grade | 0.003672 |
| Conservative transcription allowance | 0.012000 |
| Interrupted call with no final usage receipt | 0.035941 |
| Total recorded commitment | **0.086482** |

The last two rows are estimates, not verified provider charges. The interrupted call had not submitted any TTS; retaining its full reservation is deliberately conservative. The browser diagnostic total was $0.034009, which illustrates why it must not be used as the complete bill: it omits server-only scorers and incomplete operations.

**The $0.20 envelope is not a strict invoice ceiling.** Direct browser transcription is estimated, provider billing after cancellation needs reconciliation, and hosting, storage, payment fees, taxes and unused subscription allowances are separate. Enforcing a true all-provider ceiling requires authoritative transcription usage/control and reconciled tariffs. No such guarantee is advertised by this change.

TTS uses the published $0.05 per 1,000 characters for v3 Conversational; changing to Flash offers a latency comparison rather than a tariff saving. Character charges include submitted delivery tags and generated audio the user interrupts. Legacy credit counters can use different units. Sources: [ElevenAPI pricing](https://elevenlabs.io/pricing/api), [OpenAI pricing](https://developers.openai.com/api/docs/pricing).

## Database and release

The following additive migrations were applied through the Supabase SSL pooler and verified with migration history; MCP was not required:

- 20260905062922_voice_session_budget_and_usage.sql
- 20260905065411_voice_startup_attempt_and_grade_reservation.sql
- 20260905110407_voice_grade_commitment_cents.sql

Private voice tables have RLS and no client table privileges. Their invoker RPCs use an empty search path and service-role-only execution. Operations and receipt keys make settlement idempotent; deleting session history cannot erase held spend. Current-day accounting retains unfinished work without letting stale holds block later days forever. Cross-midnight, simultaneous starts, concurrent replies, post-close grading and duplicate refunds have database tests.

The initial hosted build revealed that production still selected OpenAI Realtime, unlike the local ElevenLabs configuration. Production VOICE_PROVIDER and ELEVENLABS_TTS_MODEL were corrected for the next staged build to elevenlabs and eleven_v3_conversational. Custom domains stayed on the previous deployment during validation. Final staged build `dpl_Gi8SUKRpz1jmXHmPu9548rKtoZqz` (`nerve-48uwcjtwh-pabathuthsaras-projects.vercel.app`) passed real token, two-turn aligned audio and warmth checks. Server request-to-first-audio was 2,438 and 2,864 ms; CLI process startup time is excluded. The earlier staged build also passed hosted grading and Nadia synthesis.

The database remains in US East (`us-east-1`). Colombo-origin hosted tests ran the edge handlers in `sin1`, with ElevenLabs reporting `asia-southeast1`. Region settings were preserved: these observations do not establish that moving the handlers to US East would improve end-to-end latency. A controlled test from the target customer locations is the next step before changing region placement.

## Final verification record

- Full test suite: 84 files passed, 1,402 tests passed and one preexisting opt-in calibration test skipped. Final TypeScript, lint and production-build checks passed. Independent review found no blocking issue in the transcription change.
- TypeScript, project lint, explicit lint on normally ignored voice/API files and production builds passed. A few unused mock-parameter warnings remain in tests.
- db:rep and db:spend passed on temporary accounts.
- db:voice passed 40 live REST, ownership and authenticated cross-user RLS checks. Temporary accounts from these harnesses were deleted.
- Both isolated SQL suites and concurrency tests passed. The additional grade-reservation cents regression failed against the old expression and passed after correction.
- The older db:verify harness was not used because it targets authored content and has incomplete storage cleanup. Relevant ownership/RLS coverage was added to the isolated db:voice harness instead.
- Final browser/provider test cleanup removed the dedicated temporary account, nine test sessions, four exact private audio objects and temporary authentication files. Earlier database harness accounts were also removed. No customer accounts or recordings were used.
- After promotion, the live homepage and pricing page returned HTTP 200; unauthenticated token and turn requests correctly returned HTTP 401. Hosted error-log checks returned no errors.
- The prior deployment `dpl_3pTjEBAbkWCvteJg9c9wcu8GskFy` remains available for rollback. The new database migrations are additive. This release was deployed from the working tree without creating a Git commit; its deployment ID/URL identifies the build because its Git SHA alone still identifies the earlier checkout.
- The human grading calibration gate is still unfulfilled: ten collected fixtures have no human expected scores, and the machine harness is not configured locally. No human scores were fabricated. The grader's model and rubric were retained.
- Human voice preference, hesitant speech across many users, a controlled US/Colombo comparison, p95 latency under load and invoice reconciliation still require representative trials. The current checks establish functionality, not perfect naturalness or a guaranteed response time.

Runtime architecture and verification commands are documented in [PIPELINE.md](PIPELINE.md); database invariants and RPCs are in [DATA.md](DATA.md).
