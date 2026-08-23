# Frontend integration gaps

The Arena frontend was built against `lib/data`, which returned fixtures. Most
of that seam is now real: the hooks kept their shapes and the screens did not
change, which was the point of building them against a seam.

## Bound to the database

- [x] **The live rep.** `lib/data/rep.ts` is the real session now:
      `createVoiceProvider`, the warmth engine, the recorder, the session row
      and the grade. Three minutes; warmth 65 arms it silently and thirty
      seconds from the end she is told either to leave or to offer her number;
      her closing line is allowed to finish; and the rep is written down when
      it ends however it ends. The rules are pure functions in
      `lib/data/rep-rules.ts` with tests; the whole lifecycle behind the
      transport is covered by `npm run db:rep`.
- [x] Eight characters, one per level (§06), seeded with their presentation
      copy. The trajectory table is read from the roster rather than kept
      beside it.
- [x] The daily quota is checked where money is committed — `/api/voice/token`
      refuses a caller with none left, and a rep in flight may reconnect on the
      one it already spent.
- [x] Auth. Password sign-up, sign-in, reset and Google (§04) as Server Actions
      in `app/auth/actions.ts`, wired into `/login`, `/signup`, `/verify-email`,
      `/forgot-password`, `/reset-password`. `/auth/confirm` keeps all three
      link shapes, fragment handling included, and now carries `next` so a
      recovery link lands on the reset screen with a session.
- [x] The route guard reads the session and `profiles.onboarding_complete`.
      There is no development bypass any more: `MOCK_AUTH` is gone.
- [x] Entitlements and training state: plan, daily quota with a local-midnight
      reset, streak, longest streak, active track, level, onboarding, focus
      area, training wheels, audio preferences, timezone.
- [x] Personas from `personas`, presentation copy included, seeded from the
      registry by `npm run db:seed`. Nadia and Alex are the two authored
      characters; the frontend's other six were fixtures and are gone.
- [x] Engine levels 1-8 mapped to frontend tiers 1-4, and engine `HOSTILE`
      folded into UI `CLOSED`, in `lib/data/progression.ts`. Calibration
      untouched.
- [x] Locked personas and level unlocks derived from wins per tier rather than
      stored, so an unlock cannot disagree with the history that earned it.
- [x] Session history, per-persona records, lifetime stats and the profile
      chart, all counted from stored reps.
- [x] Turn-level warmth, deltas and reasons persisted beside the transcript,
      and read by the gutter, the sparkline and the two moments.
- [x] The scorecard reconciles to the composite: six deterministic metric rows
      worth ten each (the 60%) plus one judgement row worth forty (the 40%).
      The visible rows sum to the stored composite.
- [x] `tryNext` is one hand-written line per sub-score, chosen by the stored
      focus. Never model-generated at runtime.
- [x] Outcome translated into the result screen's narrative without entering
      the score (§07).
- [x] Quota spent when a rep opens, streak written when one ends, ladder
      position recomputed when the grade lands — all service-role writes.

## Still open

- [ ] Field: the predicted-versus-actual chart and the rejection milestones.
      The rest of the loop is bound — assignment, accept with the prediction,
      the log, the tier gate and the streak — and `lib/data/mock/field.ts` is
      gone. `npm run db:field` covers it.
- [ ] The interview track (M4) in full: interviewers, interview metrics and the
      question index. `interview_setups` and a private `cv` bucket now exist for
      the role, JD, questions and CV; nothing writes them yet.
- [ ] Standalone speech-to-text for the onboarding mic echo. The analyser is
      real; the transcript line under it is scripted.
- [ ] Pause is advisory. It stops the UI affordances, not the microphone —
      `VoiceProvider` exposes no mute, and the clock keeps running because
      three minutes is three minutes.
- [ ] The number she gives is shown on the live screen and not stored, so the
      result screen says she gave it without repeating it.
- [ ] Selected input/output devices are stored on the profile but not yet
      opened by the audio graph.
- [ ] Room sound. The procedural reverb and bed are switched off for
      intelligibility (see AUDIO.md); recorded beds as audio files are the
      replacement. The ambience controls in Settings are disabled and say why
      until there is something for them to turn down.
- [ ] Merchant-of-record checkout and the billing portal (§14). Plans are
      granted with `npm run db:plan` until then; `entitlements` has a read
      policy and no write path on purpose.
- [ ] Account deletion and data export from Settings. Both controls are
      disabled and say so rather than pretending.
- [ ] Persona memory (§08) is a table with nothing writing to it. So are
      `unlocks`, `weekly_reviews` and `subscriptions` — schema and policies are
      proven, the writers are the next phase.
- [ ] The technique library is seeded (14 cards) and unread: no `/library`
      route, and the scorecard does not yet link the two weakest sub-scores to
      the cards that target them.
- [ ] Reads run from the browser under RLS. Moving the ones that could be
      server-rendered would cut a round trip on first paint; the revalidation
      calls in `app/rep/actions.ts` are already in place for that day.
