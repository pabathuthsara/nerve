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
- [x] The library reads real rows. `/library` and `/library/[slug]` render the
      seeded `techniques` table; the scorecard's two weakest sub-scores and the
      brief's technique of the session resolve from the authored registry so the
      links are there on first paint.
- [x] `/progress` reads real rows — the composure trend, the six sub-score
      lines and the two habit metrics all come off `scores`, and the Sunday
      letters off `weekly_reviews`.
- [x] The rank rail reads `profiles.rank`, mirrored by `syncLevel` from the same
      qualifying counts the unlocks use.
- [ ] The interview track is still fixtures — `useInterviewers` and
      `useInterviewSetup` are mocks and nothing writes `interview_setups`. The
      route now redirects unless `unlocked_tracks` says otherwise, so nobody
      reaches it by accident.
- [x] Three characters, one per rung, seeded with their presentation copy —
      §06 authors eight and five are retired rather than deleted, unpublished
      by `npm run db:seed` so their old sessions stay readable (D10a in
      `LAUNCH-GAP.md`). The trajectory table is read from the roster rather
      than kept beside it, so the shipped roster IS the ladder.
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
- [x] **The field, in full.** Assignment, accept with the prediction, the log,
      the tier gate and the streak were already bound; the predicted-versus-actual
      chart and the rejection milestones now are too. The chart on `/field` and
      the summary figure on `/profile` are both computed by `anxietySeries` in
      `lib/field/anxiety.ts`, so the line and the number cannot disagree.
      Milestones at 10 / 25 / 50 / 100 are recorded in `unlocks` as
      `kind = 'milestone'`, which is what makes each fire once and never again.
      `npm run db:field` covers all of it in 27 checks.
- [x] **Character memory (§08).** The grade returns a `memoryLine`,
      `lib/grade/memory.ts` decides whether it may be stored — second person,
      affection and performance judgement are all rejected — and the live page
      injects the survivor into the character contract through the shared
      `compileInstructions`, so the OpenAI arm and the pipeline arm cannot
      disagree. Reset is one tap on the brief screen or the persona sheet, or
      all of them at once from Settings, and it clears the line and nothing
      else. `profiles.ui_flags` carries the first-time beat. `npm run db:rep`
      covers the write, the read, the replacement and the reset.

- [x] **Progression (§08), end to end.** A tier opens on two reps scoring 70+
      at the tier below — the gate reads `scores`, not wins — and `syncLevel`
      and `fetchPersonas` share one piece of arithmetic so the stored ladder
      position and the roster's locked state cannot disagree. Opening a tier
      records an `unlocks` row and the scorecard celebrates it once, off the row
      rather than off the `useState(false)` that nothing set.
- [x] **Adaptive difficulty (§08, §12).** `difficulty_offsets`, per user and
      per level, applied where the live page builds the persona config — the
      seam the engine's trajectory getter exists for, so no engine change. The
      downward adjustment returns nothing displayable by construction.
- [x] **The baseline and the week-four re-test (§08).** Written once by the
      first graded rep, offered at day 28 in the user's own timezone, compared
      at `/progress/baseline` sub-score by sub-score.
- [x] **The Sunday review (§09, §11).** Hourly cron reading each user's own
      clock, stored rather than recomputed, copy assembled from hand-written
      sentences and never from a model.
- [x] **Share cards (§18).** Five kinds, all opt-in, none automatic. Rendered as
      PNG by an unguessable token through the service role, so `share_cards`
      needs no anonymous policy. Revocable from Settings → Data.

## Still open

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
- [ ] `subscriptions` is a table with nothing writing to it — schema and
      policies are proven, the merchant of record is the next phase (B2).
- [ ] The technique library is seeded (14 cards) and unread: no `/library`
      route, and the scorecard does not yet link the two weakest sub-scores to
      the cards that target them.
- [ ] Reads run from the browser under RLS. Moving the ones that could be
      server-rendered would cut a round trip on first paint; the revalidation
      calls in `app/rep/actions.ts` are already in place for that day.
