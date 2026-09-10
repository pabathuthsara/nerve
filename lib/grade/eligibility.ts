/**
 * Whether there is anything here worth turning into a number.
 *
 * ── THE DEFECT THIS EXISTS FOR ───────────────────────────────────────────
 *
 * There was no gate. `app/api/grade/route.ts` required a non-empty transcript
 * and nothing else, and `lib/data/rep.ts` required one non-empty user turn.
 * Measured on 9 September 2026:
 *
 *   · **18 seconds and one "Hello." received a complete score of 45.**
 *   · **A 38-second session with ZERO agent turns scored 36**, including zero
 *     talk-ratio points because the user supplied every audible word. Its voice
 *     operations were aborted before delivering audio. An infrastructure
 *     failure was graded as the user's conversational performance, and the
 *     user was shown the number.
 *
 * `docs/NERVE-SPEC.md` says sessions under twenty seconds are not scored. That
 * sentence was implemented nowhere.
 *
 * ── WHY A REFUSAL IS KINDER THAN A NUMBER ────────────────────────────────
 *
 * §07 grades PROCESS, and the promise underneath that is that the number means
 * something. A 45 on an eighteen-second hello is not a low score, it is a
 * fabricated one — the user did not do anything badly, there was nothing to
 * measure. Showing it teaches them that the scorecard is noise, which is the
 * one belief this product cannot survive.
 *
 * ── ONE DECISION, THREE READERS ──────────────────────────────────────────
 *
 * The `resultReading` pattern from `lib/data/rep-rules.ts`: the route refuses,
 * the client does not bother asking, and the scorecard screen explains — all
 * off this function, so the three cannot disagree about what "too short" means.
 *
 * Pure. No model, no database, and it runs after the rep, so it costs nothing
 * anybody hears.
 */

/**
 * The two fields this needs, and nothing more.
 *
 * Structural on purpose: there are two `TranscriptTurn` types in this codebase
 * — `lib/voice/types` carries `t_start`/`t_end` and the data layer's does not —
 * and all three readers of this function hold a different one. Naming either
 * would force a cast at two of the three call sites, and a cast is how a screen
 * ends up asserting a shape it does not have.
 */
export interface GradedTurn {
  /**
   * Both spellings of "her", because the two layers disagree.
   *
   * `lib/voice/types` says `'agent'` and the data layer says `'persona'`. That
   * seam is older than this file and not worth reopening here; what matters is
   * that a screen holding one of them cannot silently count zero of her turns
   * and render "she never got a word out" over a rep she talked through.
   */
  speaker: 'user' | 'agent' | 'persona'
  text: string
}

/**
 * The floor, in seconds. `NERVE-SPEC.md` §15.
 *
 * Not a round number chosen for tidiness: below twenty seconds a rep has at
 * most two exchanges, and every rate metric in `lib/grade/metrics.ts` — filler
 * rate, questions per three minutes, talk ratio — is extrapolating from a
 * sample too small to carry a rate. One "Ah" in 2.3 seconds of speech became
 * 26.11 fillers per minute and zeroed a band.
 */
export const MIN_GRADED_SECONDS = 20

/**
 * He has to have said two things.
 *
 * A greeting is one turn and it is not a conversation. Two means at least one
 * exchange happened — he said something, she answered, he responded to that —
 * which is the smallest unit any of the six dimensions can describe.
 */
export const MIN_USER_TURNS = 2

export type GradeRefusal = 'too-short' | 'no-reply'

export type GradeEligibility = { ok: true } | { ok: false; reason: GradeRefusal }

export function gradeEligibility(input: {
  sessionSeconds: number
  transcript: readonly GradedTurn[]
}): GradeEligibility {
  const said = (match: (speaker: GradedTurn['speaker']) => boolean) =>
    input.transcript.filter((turn) => match(turn.speaker) && turn.text.trim().length > 0).length

  // CHECKED FIRST, because it is the one that is not the user's fault and the
  // one whose copy must not sound like it is. A rep where she never spoke is a
  // pipeline failure however long it ran.
  if (said((speaker) => speaker !== 'user') === 0) return { ok: false, reason: 'no-reply' }

  if (!Number.isFinite(input.sessionSeconds) || input.sessionSeconds < MIN_GRADED_SECONDS) {
    return { ok: false, reason: 'too-short' }
  }
  if (said((speaker) => speaker === 'user') < MIN_USER_TURNS) return { ok: false, reason: 'too-short' }

  return { ok: true }
}

/**
 * What the screen says. Hand-authored, one per reason (rule: no placeholder
 * copy, empty states included).
 *
 * Neither of them apologises and neither of them blames. "Too short" is a fact
 * about the rep; "no reply" is a fact about us, and says so, because the
 * alternative is letting the user believe they were graded 36 for a rep in
 * which nobody answered them.
 *
 * **Neither promises a refund.** The state this replaces said "Your rep has
 * been given back", which is not true — `voice_session_refund` refuses any rep
 * in which she spoke, and for `no-reply` she did not speak, so the two cases
 * differ in a way the old single string could not express. Telling somebody
 * their rep is returned when it is not is the one sentence on this screen that
 * can cost trust.
 */
export const GRADE_REFUSAL_COPY: Record<GradeRefusal, { title: string; body: string }> = {
  'too-short': {
    title: 'Too short to score',
    body: 'Twenty seconds is the floor and this one stopped short of it. There is nothing in here that would survive being turned into a number, so we have not invented one. The transcript is still here if you want it.',
  },
  'no-reply': {
    title: 'She never got a word out',
    body: 'Her side of this one never reached you, so what is in the transcript is your half of a conversation that did not happen. That is ours to fix, not yours, and grading it would have measured the wrong person.',
  },
}
