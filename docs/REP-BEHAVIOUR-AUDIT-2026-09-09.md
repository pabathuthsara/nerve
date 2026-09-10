# Recent rep behaviour audit — 9 September 2026

> **RESOLVED 10 September 2026.** Every numbered section below shipped a fix.
> What landed, and the corpus measurement that reframed §1–§2, is
> `docs/PERSONA-AUDIT.md` §14; the behaviour is pinned end to end by
> `lib/warmth/rep-behaviour.test.ts`, which replays all four of these
> transcripts through the live session with no model.
>
> | § | Fix | Where |
> |---|---|---|
> | 1 | A greeting has a response class, a four-word cap and its own steering clause | `steering.ts`, `session.ts` |
> | 2 | `capToBudget` asks before spending; `BandSpec.maxSentences` enforces "never two" | `truncate.ts`, `bands.ts` |
> | 3 | One hostility guard over the whole reason set; `turn-kind.ts` classifies instead of counting words | `fast.ts`, `turn-kind.ts` |
> | 4 | The judge gets the run, her authored preferences, and the terminal exchange | `prompt.ts`, `session.ts`, `persona-notes.ts` |
> | 5 | `SceneExit` is monotonic and committed synchronously from what he said | `leaving.ts` |
> | 6 | Auth verified once a minute rather than once a turn; parse runs concurrently | `api-auth.ts`, `turn/route.ts` |
> | 7 | `gradeEligibility` refuses; rate metrics need a denominator | `grade/eligibility.ts`, `grade/metrics.ts` |
>
> **§6 is the one that is only partly resolved.** ~250ms came back. The
> remaining ~1.9s is three network legs and a region decision — see
> `PERSONA-AUDIT.md` §14.6. **Nothing here has been auditioned out loud**
> (§14.5).

The reported behaviour is real. Maya starts in the intended GUARDED band, but reply enforcement, conflicting instructions, semantic scoring and exit handling do not reliably turn that state into believable behaviour. The scorecard arithmetic is correct in the recent records checked; the evidence being scored and the eligibility to receive a score are not consistently sound. Lowering Maya's starting warmth would not resolve these defects.

This was an investigation, not a retune. No application code, persona content, production configuration or database records were changed.

**Evidence scope.** Located the latest rep, then restricted the detailed data pull to that account's latest 20 sessions: 15 dating and 5 interview sessions, 20 transcripts, 18 scores and 391 voice operations. Closely examined the latest four production dating reps, the two earlier Maya audio-failure reps, and older Maya/Nadia/Robin conversations. The latest four production sessions identify deployment `afc95b0d8e9eeca3203ebdf81f2df8af51b02b10`, matching the audited checkout. Older sessions establish recurrence, not proof that every historical defect remains in that deployment. Conclusions below concern the dating track. Audio waveforms/recordings were not auditioned; delivery findings use transcripts and recorded telemetry.

| Rep, Colombo time | Session | Main evidence |
|---|---|---|
| Maya, Sep 9, 22:16 | `1ddd3326-c178-4f66-9109-e8cd53a66663` | Hello produces two sentences; 3.806s opening gap; 30s rep scores 45 |
| Maya, Sep 9, 22:13 | `22e37e39-4e39-4e1f-b007-c64284ffa6e2` | Same opening failure; 3.837s gap; 18s rep scores 45 |
| Maya, Sep 9, 22:08 | `4f7da3d4-3ddd-4563-9d57-d3e27007efdb` | Contempt earns warmth; dismissal does not end scene; no score stored |
| Nadia, Sep 9, 22:05 | `29ad83c1-6573-4ac4-93bf-ffc614dedeb7` | 9.773s opening gap; inconsistent facts; resumes questioning after wind-down |

## 1. The opening policy still asks her to fill a greeting

The latest exchange was:

> User: Hello.
>
> Maya: Hello. Not a bad morning for sitting still.

The preceding short rep answered “Hello there” with “Morning. The place is noisier than I wanted.” Both began GUARDED, around 29–33 warmth. A replay through the current `WarmthSession` gives a **six-word runtime cap**, but its steering still says **“Six or seven words. Ten at the very most.”** A greeting is exempt from `deadEnd`, which is correct for scoring, but `mirrorCapFor` consequently grants the band's six-word typical floor. There is no separate greeting-only response shape.

The model also receives these competing permissions:

- GUARDED: answer only what he asked; never two sentences.
- Shared speech rules: a first hello may receive “a plain greeting or a concrete observation.”
- Compiled talkativeness: “occasionally add something.”
- A prominent authored mood. For the 22:13 rep, the deterministic mood is the flat being too quiet and the café too loud. Her unsolicited reply directly surfaces that content.

The opening invitation/gate suppression already exists. It is insufficient because the base prompt and length target still encourage an addition. Two sentences are not inherently inhuman, but this particular response contradicts both the intended guarded greeting and the explicit current directive.

Sources: `lib/warmth/reciprocity.ts:166`, `lib/warmth/bands.ts:189`, `lib/warmth/steering.ts:230`, `lib/personas/shared.ts:59`, `lib/voice/openai/persona.ts:155`.

## 2. The word ceiling and monitoring do not enforce that policy

`capToBudget` **adds a sentence before checking the accumulated word count**. With a cap of six it accepts “Hello.”, sees only one word spent, accepts the whole seven-word second sentence, then stops at eight. A single arbitrarily long first sentence also survives.

Both latest opening operations recorded `wordCap: 6`, `spokenWords: 8`, `capped: false`. The flag means “some generated words were removed”, not “the output stayed within its budget”. There is no runtime sentence-count enforcement. Therefore changing “never two” in the prompt alone cannot guarantee the result.

The stability detector has a different purpose and misses this too: its normal verbosity threshold is a six-turn median above 18 words, not compliance with the actual turn's six-word cap or one-sentence rule. Both short reps have zero recorded character breaks.

Locally reproduced with the exact stored first response. Sources: `lib/voice/elevenlabs/truncate.ts:100`, `lib/voice/elevenlabs/combined.ts:277`, `lib/metrics/stability.ts:365`.

## 3. Warmth rewards conversational shape when the meaning is wrong

In the 22:08 Maya rep:

| User turn | Recorded change | What went wrong |
|---|---:|---|
| “You're making me miserable.” | +0.67 fast, +1.61 slow | Repeating “miserable” counted as listening; the model also rated the exchange positively |
| “You making everybody miserable?” | +0.62 | Another keyword callback rewarded |
| “Just fuck off.” | −0.25 fast, then −5.60 slow | Fast layer withheld shape rewards but applied no immediate hostility consequence |
| “Why are you still here?” | +2.25 fast, then −1.40 slow | A dismissal had a **net positive** effect |
| “Go away.” | −4.03 | Classified mechanically as a short dead end |

Warmth rose from 27.48 to a peak of 48.60 before the explicit dismissal, and remained 39.57 at the cap. Some early disagreement about oat milk can reasonably be banter; the stronger evidence is the personal dismissal and continuing after the user told her to leave.

The current hostility regex misses “You're making me miserable” and “Why are you still here”. More fundamentally, **the callback reward bypasses the hostility guard entirely**. A local probe of “Fuck you, miserable idiot” after an agent line containing “miserable” returns `hostile: true` and a positive raw callback score of +2.

There is also an inverse error: `deadEnd` means fewer than three words after the opening, regardless of whether those words are a complete question or a valid answer. “What's up?” in the Maya rep lost warmth; “How come?” in the Nadia rep did too. The current scorer reproduces both as open questions **and** dead ends. “Yes” and “No” are likewise penalized without checking what she asked.

Sources: `lib/warmth/fast.ts:216–258`, `lib/warmth/triggers.ts`, `lib/warmth/reciprocity.ts`.

## 4. The semantic judge cannot fully represent her personality or the conversation

The slow scorer receives the user's line, her preceding line, her response, and current warmth. It does not receive a run of recent exchanges, Maya's likes/dislikes, or the sequence of unanswered questions. Persona name and room select the generic dating prompt; they do not convey her individual social preferences.

Consequently, Maya's authored dislike of “a run of questions with nothing of his own in between” is present for the actor but not directly represented for the judge. Generic open questions continue to earn mechanical positives. The semantic score is added separately; it does not retract an erroneous fast reward.

The judge normally runs only **after she finishes her reply**. That helps resolve transcription ambiguity, but it means the actor already answered before the semantic consequence exists. Using her own playful reply as evidence also risks treating her mistaken acceptance of an insult as proof that the exchange was friendly. That feedback mechanism is an inference; the stored positive judgement on “miserable” is observed.

At disposal, `WarmthSession` clears an awaiting score and aborts a pending one. It does not flush and await the terminal exchange despite the nearby comment suggesting end-of-scene flushing. “Go away” has no stored slow event in this rep.

Sources: `app/api/warmth/score/route.ts:58`, `lib/warmth/prompt.ts:229`, `lib/warmth/session.ts:435`, `lib/warmth/session.ts:521`, `lib/warmth/session.ts:589`, `lib/warmth/engine.ts:618`.

## 5. Leaving is still a request to the model, not a committed scene state

After “Just fuck off”, Maya said “Right. You've made your point. Enjoy your Sunday.” The scene continued. After “Why are you still here?” she answered again. The rep ended by the duration cap, not by character exit.

The pipeline ends voluntarily only if the model emits `[[END_SCENE]]`. A spoken goodbye alone does not commit an exit. Meanwhile, ordinary standing steering at warmth 20–59 says **“You are not going yet.”** This competes directly with the exit conditions. The boundary-violation verdict also has no explicit connection to scene termination.

Wind-down steering is consumed once, then ordinary steering resumes on later turns. In Nadia's latest rep, she said she had better check the present, then answered “OK then, let us...” with a fresh question: “Pabat, what's your secret talent besides sneaky sales pitches?” This is evidence that a farewell can be undone before the cap.

Sources: `lib/warmth/steering.ts:308`, `lib/voice/elevenlabs/server.ts:140`, `lib/voice/elevenlabs/index.ts:548`, `lib/warmth/session.ts:257`, `lib/data/rep.ts:1253`.

## 6. The delay is the serial pipeline, not mostly her personality pause

The 22:13 Maya opener gives a particularly clean measurement:

| Stage | Recorded duration |
|---|---:|
| Wait for speech-end silence | 602ms |
| Final transcription | 796ms |
| Authentication | 287ms |
| Admission/budget checks | 736ms |
| Full text generation | 1,093ms |
| Speech synthesis to first audio byte | 161ms |
| **End of user speech to agent audio** | **3,837ms** |

The stage sum is 3,675ms; the remaining roughly 162ms includes transit, scheduling and differences between the measurement boundaries. These are stages from this one-turn rep, not unrelated session medians added together. Text generation's first-token time is included in its complete time and must not be added again.

The latest opener was similarly slow at 3.806s. Nadia's first reply took 9.773s; her server request-to-first-audio measurement explains 4.603s of that, so the whole tail cannot be attributed to the LLM or a server cold start from these records alone. Her later perceived median was about 3.6s.

The adapter already subtracts elapsed processing time from its intended personality pause. GUARDED aims for 500–900ms; ordinary processing has overspent that before audio is ready. The timing engine therefore cannot express the intended difference between a quick warm answer and a reluctant one. Removing the personality delay or changing TTS alone will not remove most of the observed gap.

Sources: `app/api/voice/turn/route.ts:10`, `lib/voice/elevenlabs/index.ts:423`, `lib/voice/elevenlabs/index.ts:461`, `lib/voice/elevenlabs/index.ts:789`, `lib/voice/elevenlabs/combined.ts:259`, `lib/warmth/timing.ts:95`.

## 7. The grade is arithmetically correct but sometimes unjustified

Recomputed the stored deterministic means and the 60% deterministic / 40% judgement composites for the latest two Maya scores and the latest Nadia score. All match. The post-rep grade does not drive live speech; fixing it alone will not change Maya's replies.

The defects are in eligibility and measurement:

- **18 seconds and one user greeting received a complete score of 45.** There is no minimum-duration or meaningful-exchange gate in the grade route; the caller only requires a nonempty user turn. The spec says sessions under 20s are not scored.
- **The 30-second rep got zero filler points from one “Ah”.** The rate was extrapolated from about 2.30 seconds of user speech to 26.11 fillers/minute. The live scorer already ignores a lone filler; the final grader does not.
- **A 38-second Maya session with zero agent turns scored 36**, including zero talk-ratio points because the user supplied all audible speech. Its voice operations were aborted before delivering audio. Infrastructure failure is being graded as the user's conversational performance.
- A fixed speaking-share target depends partly on how much the persona chooses to say. The overlong opening therefore helps create the user's low talk-ratio score.
- Other semantic shortcuts remain: merely discussing “coffee” counts as a proposed meeting in `PLAN_PROPOSAL`, while words such as “please” in the last two turns can mark an exit as pushy without examining their meaning. These are code-level findings, not claimed causes of the latest scores.

The long hostile Maya rep has no score row and no recorded grade operation. Its absence cannot be diagnosed conclusively from these records; the client silently turns grading errors into null, so there is insufficient evidence to distinguish a request failure, admission refusal or interrupted completion.

Sources: `lib/data/rep.ts:663`, `app/api/grade/route.ts:82`, `lib/grade/metrics.ts:131`, `lib/grade/index.ts:148`, `docs/NERVE-SPEC.md:748`.

## Recommended implementation order

1. Give bare greetings their own small response allowance, remove conflicting instructions to add material, and enforce sentence/word allowances before speech. Keep substantive short questions answerable. Avoid cutting speech in the middle of a thought.
2. Fix semantic turn classification: distinguish greetings, acknowledgements, valid brief answers, questions, dismissals and repeated nonparticipation. Prevent any mechanical reward from paying for clear hostility, including callbacks. Give the semantic judge enough recent context and the persona's social preferences; reconcile its verdict with provisional fast rewards.
3. Make explicit dismissal and committed goodbyes terminal states. Prioritize them over ordinary wants, repair invitations and the clock's closing offer. Do not use a low warmth threshold alone as an automatic exit rule.
4. Reduce measured serial work before audio: inspect admission round trips and authentication reuse without weakening authorization or budget enforcement; then evaluate earlier reliable transcription and generation overlap. Benchmark opening latency separately from later turns.
5. Refuse full grades on insufficient or technically invalid conversations; use adequate sample sizes for rate metrics and semantic evidence for asks/exits. Preserve outcome-independent grading.
6. Validate with these actual conversational failures plus counterexamples: a bare hello, a real short question, harmless disagreement, a valid yes/no answer, a direct dismissal, a successful repair, a noisy/unheard turn and a completed goodbye. Test generated dialogue and real microphone timing, not only prompt text and arithmetic. Tune the model and voice after those checks.

**Verification performed:** 259 existing tests passed across nine warmth, scoring, truncation and pipeline test files. Additional local probes reproduced the greeting overshoot, positive hostile callback, question-as-dead-end penalty and score arithmetic. Passing existing tests does not demonstrate human dialogue: several tests currently preserve the rules responsible for these failures. No new model generations or paid voice auditions were run.
