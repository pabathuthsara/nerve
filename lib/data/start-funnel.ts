/**
 * The acquisition funnel — the run a stranger walks before an account exists.
 *
 * ── WHY THERE IS A SECOND RUN AT ALL ─────────────────────────────────────
 *
 * `components/screens/onboarding-screens.tsx` asks the same three questions
 * and has done since M1. The difference is not the questions, it is the
 * *order of the account*: onboarding runs after sign-up, over a `profiles`
 * row, writing every answer the moment it is given. This one runs before
 * sign-up, over no row at all, and carries its answers into the sign-up form.
 *
 * That reordering is the whole feature. Forty-two people arrived from paid
 * social between 4 and 10 September 2026 and none of them created an account —
 * and the first thing every one of them was asked for, at the top of a page
 * they had been on for four seconds, was an email address. The questions were
 * on the other side of it, doing no work.
 *
 * ── ONE COPY OF THE QUESTIONS, TWO RUNS ──────────────────────────────────
 *
 * The three questions themselves are NOT duplicated here. They live in
 * `onboarding-questions.tsx` and both runs render the same components, for the
 * reason `PRESENTATION.name` exists: rung 1 was renamed from Tess to Cass and
 * the landing page went on introducing her by the old name for a day, because
 * one fact had two authored homes. A funnel that asks "what's the hard part?"
 * in its own words would drift from the run behind the door within a month.
 *
 * What this file owns is everything the questions are wrapped in: the step
 * order, the answers as a value, and the one derivation the pre-auth screens
 * need that the post-auth ones get from the database.
 *
 * ── THE PREVIEW IS DERIVED FROM THE REPO, NOT THE DATABASE ───────────────
 *
 * `lib/data/first-rep.ts` reads `personas`, and that table is `for select to
 * authenticated` — a stranger cannot read it, and opening it to `anon` to
 * decorate a marketing page would be a new public surface bought for one
 * sentence of copy. It is not needed: rule 10 says characters are authored in
 * `lib/personas/` and *seeded* from there, so the repo is the source and the
 * table is the copy. `startRosterCandidates` builds the same shape
 * `fetchFirstRepCandidates` returns, out of the same authored rows
 * `scripts/seed-personas.ts` publishes, and hands it to the same pure
 * `chooseTodayPersona` the run and `/train` both call.
 *
 * So the character named on the last screen before sign-up is the character
 * the account actually meets, and `start-funnel.test.ts` is what holds those
 * two together rather than a comment asking the next person to be careful.
 */

import { chooseTodayPersona, uiLevel } from './progression'
import { ONBOARDING_NAME_FLAG, ONBOARDING_TRACK_FLAG, trackWaitlistFlag } from './ui-flags'
import { DATING_PERSONAS } from '@/lib/personas'
import { PRESENTATION } from '@/lib/personas/presentation'
import type { FirstRepCandidate } from './first-rep'
import type { FocusArea } from './focus'
import type { Level, Track } from './types'

/**
 * The screens, in order.
 *
 * Five of the eight are new and three are the onboarding questions. The three
 * that are neither a question nor the form — `reframe`, `mechanism`, `build` —
 * are the ones that make this a funnel rather than a form with a longer walk
 * to it, and they are placed deliberately: never two in a row, and never
 * before the first question. A stranger's first interaction has to be cheap
 * and it has to be *theirs*; three claims in a row before they have touched
 * anything is an advertisement, which is the thing they just clicked out of.
 */
export type StartStep =
  | 'hook'
  | 'track'
  | 'reframe'
  | 'focus'
  | 'mechanism'
  | 'name'
  | 'build'
  | 'account'

export const START_STEPS: readonly StartStep[] = [
  'hook',
  'track',
  'reframe',
  'focus',
  'mechanism',
  'name',
  'build',
  'account',
]

/**
 * What the funnel has learnt, and the only thing that crosses into the account.
 *
 * `named` is separate from `displayName` for the reason `ONBOARDING_NAME_FLAG`
 * is separate from `profiles.display_name`: the name step is skippable, so an
 * empty string is an answer and not an absence. Without the boolean, somebody
 * who declined to give a name would be put back on that question by the resume
 * — and then again by `onboardingResumePath` after signing up.
 */
export interface StartAnswers {
  track: Track | null
  focusArea: FocusArea | null
  displayName: string | null
  named: boolean
  /**
   * They asked for the English track, which does not exist yet.
   *
   * Carried rather than written, because the ask is recorded in `ui_flags` and
   * there is no row to stamp until they sign up. `flushStartAnswers` writes it
   * with everything else, so the count is the same count `recordTrackWaitlist`
   * keeps and `waitlist:track:english` means one thing.
   */
  english: boolean
}

export const EMPTY_START_ANSWERS: StartAnswers = {
  track: null,
  focusArea: null,
  displayName: null,
  named: false,
  english: false,
}

/**
 * Where the run keeps its answers across a reload, and the name of the hidden
 * field that carries them into `signUpWithPassword`.
 *
 * One encoding for both, and one parser — `decodeStartAnswers` — used by the
 * browser reading its own storage and by the server reading a form post. The
 * server's copy is the one that matters: everything below arrives from a
 * client that can say anything, and the enums are checked rather than cast.
 * Nothing here is an entitlement (rule 11) — a track, a focus and a first name
 * are three things any account can change in `/profile/settings` — so the
 * check is about not writing junk into a column, not about who may write it.
 */
export const START_STORAGE_KEY = 'nerve:start'
export const START_FIELD = 'start_answers'

const TRACKS: readonly Track[] = ['dating', 'interview']
const FOCUS_AREAS: readonly FocusArea[] = ['opening', 'sustaining', 'flirting', 'rejection']

/** The same ceiling `saveOnboardingChoice` applies, applied at the same edge. */
const NAME_MAX = 40

export function encodeStartAnswers(answers: StartAnswers): string {
  return JSON.stringify(answers)
}

export function decodeStartAnswers(raw: string | null | undefined): StartAnswers {
  if (!raw) return EMPTY_START_ANSWERS
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return EMPTY_START_ANSWERS
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return EMPTY_START_ANSWERS
  const record = parsed as Record<string, unknown>

  const displayName = typeof record['displayName'] === 'string'
    ? record['displayName'].trim().slice(0, NAME_MAX)
    : ''

  return {
    track: TRACKS.find((value) => value === record['track']) ?? null,
    focusArea: FOCUS_AREAS.find((value) => value === record['focusArea']) ?? null,
    displayName: displayName || null,
    named: record['named'] === true,
    english: record['english'] === true,
  }
}

/** Whether anything crossed at all — a signup with none of this is an ordinary one. */
export function hasStartAnswers(answers: StartAnswers): boolean {
  return !!answers.track || !!answers.focusArea || answers.named || answers.english
}

/**
 * Where a reload lands.
 *
 * The three interstitials are deliberately not resumable: they are read once
 * and re-reading them is a cost, not a service. So the resume goes to the
 * first *unanswered question*, or to the build screen once all three are in.
 * A run with nothing in it opens on the hook, which is the only screen that
 * explains what any of this is.
 */
export function startResumeIndex(answers: StartAnswers): number {
  const at = (step: StartStep) => START_STEPS.indexOf(step)
  if (!answers.track) return hasStartAnswers(answers) ? at('track') : at('hook')
  if (!answers.focusArea) return at('focus')
  if (!answers.named) return at('name')
  return at('build')
}

/* ------------------------------------------------------------------ *
 * The first rep, before there is an account to read one for
 * ------------------------------------------------------------------ */

/**
 * A new account is level 1, so that is what the preview resolves against.
 *
 * Not a guess: `handle_new_user` inserts a profile with the column default and
 * nothing on this run can move it. The one thing that would make this wrong is
 * a second level-1 dating character, and that is fine — `chooseTodayPersona`
 * would then pick between them on the focus answer exactly as `/train` does.
 */
const NEW_ACCOUNT_LEVEL: Level = 1

/**
 * The published dating roster, in the shape the database read returns.
 *
 * `DATING_PERSONAS` rather than `PERSONAS`: the interview track has no first
 * rep and `RETIRED_PERSONAS` is unpublished by `seed-personas.ts`. Everything
 * in this record seeds with `published: true`, which is what makes the two
 * lists the same list.
 */
export function startRosterCandidates(): FirstRepCandidate[] {
  return Object.values(DATING_PERSONAS).map((persona) => {
    const shown = PRESENTATION[persona.slug]
    const level = uiLevel(persona.level)
    return {
      id: persona.slug,
      name: shown?.name ?? persona.name,
      setting: shown?.setting ?? persona.scene,
      hook: shown?.hook ?? '',
      level,
      locked: level > NEW_ACCOUNT_LEVEL,
    }
  })
}

/** Who a brand-new account meets, given the focus answer it has just given. */
export function firstRepPreview(focusArea: FocusArea | null): FirstRepCandidate | null {
  return chooseTodayPersona(startRosterCandidates(), [], NEW_ACCOUNT_LEVEL, focusArea)
}

/* ------------------------------------------------------------------ *
 * Crossing into the account
 * ------------------------------------------------------------------ */

/**
 * What a finished funnel becomes on the profile row.
 *
 * Pure, and separate from the write, because this mapping is the funnel's
 * worst failure mode wearing its quietest face: get one flag wrong and
 * somebody who has just answered three questions is asked all three again by
 * `onboardingResumePath` the moment they sign up. That is a silent bug — every
 * screen still works — so it is tested rather than reviewed.
 *
 * It is deliberately the same set of writes `saveOnboardingChoice` makes for
 * the signed-in run. Both flags matter and neither is redundant with its
 * column: `active_track` carries a database default, so the column alone
 * cannot tell an answer from an absence, and `display_name` can be
 * legitimately empty because the name step is skippable.
 */
export interface StartProfileWrite {
  patch: { active_track?: Track; focus_area?: FocusArea; display_name?: string }
  /** Flag names to stamp. The timestamp belongs to the caller that writes them. */
  flags: string[]
}

export function startProfileWrite(answers: StartAnswers): StartProfileWrite {
  const patch: StartProfileWrite['patch'] = {}
  const flags: string[] = []

  if (answers.track) {
    patch.active_track = answers.track
    flags.push(ONBOARDING_TRACK_FLAG)
  }
  if (answers.focusArea) patch.focus_area = answers.focusArea
  if (answers.named) {
    if (answers.displayName) patch.display_name = answers.displayName
    flags.push(ONBOARDING_NAME_FLAG)
  }
  /**
   * The ask for a track that does not exist yet, recorded now that there is a
   * row to record it on — the same flag `recordTrackWaitlist` stamps, so the
   * count `waitlist:track:english` answers stays one count.
   */
  if (answers.english) flags.push(trackWaitlistFlag('english'))

  return { patch, flags }
}

/**
 * Opening the run: what is on the screen, and what it opens on.
 *
 * Two sources disagree here and the tie has to be broken deliberately —
 * `INTERVIEW-PLAN.md` E2 is the same problem one layer up, where a shared
 * route inherited the `dating` default because a late answer overruled an
 * early one.
 *
 *   `asked`   an explicit `?track=` — the page they just clicked. `/interviews`
 *             sends `interview`, and it is a statement of intent made seconds
 *             ago.
 *   `stored`  a run already open in this tab, from `sessionStorage`.
 *
 * A session that agrees wins outright: it knows more, because it has answers
 * in it. A session that *disagrees* loses the track and keeps everything else.
 * Somebody who started a dating run, went back to read `/interviews` and came
 * in through its button has said something newer than their first tap, and
 * answering it with the dating build screen would be the run ignoring them —
 * while throwing away the focus and the name they had already given would be
 * making them pay for changing their mind.
 *
 * Only the track moves. The focus answer is collected on both arms and the
 * name is a name.
 */
export function startOpening(stored: StartAnswers, asked: Track | null): { answers: StartAnswers; index: number } {
  if (!hasStartAnswers(stored)) {
    /**
     * Nothing open. A named track skips the two screens before it — the hook
     * says what this is, and somebody arriving from `/interviews` has just
     * read a longer version of it.
     */
    if (!asked) return { answers: EMPTY_START_ANSWERS, index: START_STEPS.indexOf('hook') }
    return { answers: { ...EMPTY_START_ANSWERS, track: asked }, index: START_STEPS.indexOf('reframe') }
  }
  const answers = asked && stored.track !== asked ? { ...stored, track: asked } : stored
  return { answers, index: startResumeIndex(answers) }
}
