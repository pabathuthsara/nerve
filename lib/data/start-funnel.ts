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
import {
  ONBOARDING_NAME_FLAG,
  ONBOARDING_ROLE_FLAG,
  ONBOARDING_TRACK_FLAG,
  trackWaitlistFlag,
} from './ui-flags'
import { DATING_PERSONAS } from '@/lib/personas'
import { PRESENTATION } from '@/lib/personas/presentation'
import type { FirstRepCandidate } from './first-rep'
import type { FocusArea } from './focus'
import type { Level, Track } from './types'

/**
 * The screens, in order.
 *
 * Four are questions, two are claims, one is a demo and one is the form. They
 * are placed deliberately: never two claims in a row, and never a claim
 * before the first question. A stranger's first interaction has to be cheap
 * and it has to be *theirs*; three claims in a row before they have touched
 * anything is an advertisement, which is the thing they just clicked out of.
 *
 * ── THE 18 SEPTEMBER REORDER (SIGNUP-FIXES §2.2, §3.1, §3.2) ─────────────
 *
 * The run was hook → track → claim → question → claim → name → CASS → form:
 * three arguments and *then* the demo. Two changes, and the second is the one
 * with the number behind it.
 *
 * **`age` is now screen two.** It was the first field of the account form,
 * where a birthday asked at the point of purchase reads as a data grab. Asked
 * on screen two with a sentence explaining it, the same question reads as the
 * product being careful — and it is the only screen on the whole run that
 * demonstrates the §16 safety position out loud. §16.4 is untouched: the gate
 * is still checked on the server before `auth.signUp`, and moving it *earlier*
 * makes it earlier, not weaker. It also lets the Google door satisfy the gate
 * before the account exists, which is the one thing that door could not do.
 *
 * **`build` moved to position four and `reframe` is gone.** `build` is the
 * only screen in the run that stops being an argument and becomes a thing —
 * the character, her room, her hook — and it used to arrive after every
 * abstract screen had taken its cut. `reframe`'s argument ("reading about it
 * doesn't transfer") is made better by meeting Cass than by reading a
 * paragraph about meeting Cass, so it was cut rather than moved.
 */
export type StartStep =
  | 'hook'
  | 'age'
  | 'track'
  | 'build'
  | 'focus'
  | 'role'
  | 'mechanism'
  | 'name'
  | 'account'

/**
 * ── TWO ARMS, ONE SHAPE ──────────────────────────────────────────────────
 *
 * The track question is the third thing that happens and it is answered by
 * somebody who came for one of two different products. Until 16 September the
 * run carried on regardless: an interview answer was followed by the dating
 * focus question ("Making it flirty without being weird"), the dating
 * mechanism screen ("she can get bored... one small thing to do in the real
 * world") and a name step asking what *she* should call you. Every screen
 * worked and the whole run said the product had not listened.
 *
 * So there are two lists. They are the same length and they differ at exactly
 * one index — question two, which is the focus area on the dating arm and the
 * role on the interview one — and that is a property rather than a
 * coincidence: the run holds the step as an INDEX, and somebody who changes
 * their track answer with the back arrow has to stay on the screen they were
 * on rather than being teleported. `start-funnel.test.ts` asserts it.
 *
 * The two interstitials that survive — `build` and `mechanism` — are shared
 * positions that branch on their own copy, which is the right split: they
 * make the same argument about two different rooms, and a third list of
 * screens would drift. `age` is shared outright; §16.4 does not have an arm.
 */
const DATING_STEPS: readonly StartStep[] = [
  'hook',
  'age',
  'track',
  'build',
  'focus',
  'mechanism',
  'name',
  'account',
]

const INTERVIEW_STEPS: readonly StartStep[] = [
  'hook',
  'age',
  'track',
  'build',
  'role',
  'mechanism',
  'name',
  'account',
]

/**
 * The steps, for the track as it stands right now.
 *
 * `null` is the dating list deliberately, because the screens before the track
 * question are identical on both and the answer arrives before the first one
 * that is not.
 */
export function startSteps(track: Track | null): readonly StartStep[] {
  return track === 'interview' ? INTERVIEW_STEPS : DATING_STEPS
}

/**
 * The dating list, kept as an export for the analytics note and the tests.
 * Screens read `startSteps(track)`; nothing renders from this.
 */
export const START_STEPS: readonly StartStep[] = DATING_STEPS
export { INTERVIEW_STEPS }

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
  /**
   * Screen two, and the §16.4 gate (SIGNUP-FIXES §2.2).
   *
   * A year rather than a date, because this is a funnel and a three-wheel
   * date picker on screen two of a cold ad click is three interactions for an
   * answer one gives. `birthDateFromYear` turns it into the `YYYY-MM-DD` that
   * `checkAge` has always taken, so the gate itself is unchanged and untested
   * code paths are not introduced into the one function §16.4 rests on.
   *
   * It is on `StartAnswers` rather than in the form's local state because the
   * answer is now given six screens before the form, has to survive a reload
   * like every other answer, and — the part that earns its place — has to
   * cross the Google redirect. Without it every OAuth sign-up lands on
   * `/onboarding/age` for something it was already told.
   */
  birthYear: number | null
  track: Track | null
  focusArea: FocusArea | null
  /**
   * The interview arm's question two, and the reason the account arrives
   * ready to run one.
   *
   * `interview_setups.complete` is *a role title and nothing else* — the CV is
   * optional by design (§C4) — so this single field is the difference between
   * an account that lands on "Tell us about the job" and one that lands on its
   * free screener. It is asked here, before the account, for the same reason
   * everything else on this run is: the answer is cheap to give and it is the
   * one that makes the first round specific.
   */
  roleTitle: string | null
  company: string | null
  /**
   * Asked, whether or not it was answered — the same distinction `named` draws.
   *
   * The role step is skippable ("I'm not sure yet"), so an empty title is an
   * answer and not an absence. Without the boolean, somebody who skipped would
   * be put back on the question by the resume, and then again by
   * `onboardingResumePath` after signing up.
   */
  roleAsked: boolean
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
  birthYear: null,
  track: null,
  focusArea: null,
  roleTitle: null,
  company: null,
  roleAsked: false,
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

/**
 * The third carrier, for the door that leaves the site.
 *
 * `START_STORAGE_KEY` is the run holding its own answers across a reload and
 * `START_FIELD` is the form handing them to `signUpWithPassword`. Neither
 * survives Google: the browser goes to accounts.google.com and comes back to a
 * route handler with no form behind it and no access to another origin's
 * `sessionStorage`.
 *
 * Same encoding, same `decodeStartAnswers`, so the server still parses one
 * shape from one function however it arrived — which is the whole reason that
 * parser checks its enums instead of casting.
 */
export const START_COOKIE = 'nerve_start'

/**
 * Ten minutes. It describes one crossing that is seconds long; anything
 * longer is a stale answer waiting to be applied to an account that has since
 * chosen otherwise. `crossOAuthAccount` refuses that case anyway — this is the
 * belt to its braces.
 */
export const START_COOKIE_MAX_AGE = 600

const TRACKS: readonly Track[] = ['dating', 'interview']
const FOCUS_AREAS: readonly FocusArea[] = ['opening', 'sustaining', 'flirting', 'rejection']

/** The same ceiling `saveOnboardingChoice` applies, applied at the same edge. */
const NAME_MAX = 40

/** The same ceiling `sanitisePatch` applies to `role_title` and `company`. */
const ROLE_MAX = 120

/** Trim, cap, and read blank as absent. Three fields need exactly this. */
function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  return value.trim().slice(0, max) || null
}

/**
 * A four-digit year, or nothing. Accepts the number and the string, because
 * this parser reads `sessionStorage`, a form post and a cookie, and only one
 * of the three keeps a number a number.
 *
 * The bounds are deliberately loose — they refuse a typo, not an age.
 * `checkAge` is the only thing allowed to return a verdict, and a year that
 * passes here and fails there gets that function's authored sentence rather
 * than a silent null that would look like an unanswered question.
 */
function year(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : NaN
  if (!Number.isInteger(parsed) || parsed < 1900 || parsed > 2200) return null
  return parsed
}

/**
 * The year, as the date `checkAge` takes.
 *
 * **31 December, and the day of the month is the whole point.** Deriving from
 * 1 January would treat everybody born in that year as the OLDEST they could
 * be, which lets a real seventeen-year-old born in November through the gate
 * for eleven months. 31 December treats them as the YOUNGEST they could be,
 * so the only people it is wrong about are refused a few months early — which
 * is the direction §16.4 requires an imprecise gate to be wrong in.
 *
 * (`SIGNUP-FIXES.md` §2.2 prescribes 1 January and states the intent this
 * implements; its arithmetic is inverted. The intent is what shipped.)
 */
export function birthDateFromYear(value: number | null): string {
  return value === null ? '' : `${String(value).padStart(4, '0')}-12-31`
}

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

  return {
    birthYear: year(record['birthYear']),
    track: TRACKS.find((value) => value === record['track']) ?? null,
    focusArea: FOCUS_AREAS.find((value) => value === record['focusArea']) ?? null,
    roleTitle: text(record['roleTitle'], ROLE_MAX),
    company: text(record['company'], ROLE_MAX),
    roleAsked: record['roleAsked'] === true,
    displayName: text(record['displayName'], NAME_MAX),
    named: record['named'] === true,
    english: record['english'] === true,
  }
}

/** Whether anything crossed at all — a signup with none of this is an ordinary one. */
export function hasStartAnswers(answers: StartAnswers): boolean {
  return !!answers.birthYear || !!answers.track || !!answers.focusArea || answers.roleAsked || answers.named || answers.english
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
  const steps = startSteps(answers.track)
  const at = (step: StartStep) => steps.indexOf(step)
  if (!hasStartAnswers(answers)) return at('hook')
  // §16.4 first, and in the same order the signed-in guard enforces it: an
  // account with no date is sent to the gate ahead of everything else, so a
  // resume that put somebody past it would be the one screen in the run that
  // a reload could skip.
  if (!answers.birthYear) return at('age')
  if (!answers.track) return at('track')
  // Question two, which is a different question on each arm. The interview arm
  // reads the FLAG rather than the title, because "I'm not sure yet" is an
  // answer — the same reason `named` exists beside `displayName`.
  if (answers.track === 'interview') {
    if (!answers.roleAsked) return at('role')
  } else if (!answers.focusArea) return at('focus')
  if (!answers.named) return at('name')
  return at('account')
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
  /**
   * The interview arm's question two, stamped for the same reason the name is:
   * the step is skippable, so the title alone cannot tell a skip from a
   * question nobody has been asked — and `onboardingResumePath` would put
   * somebody who said "not sure yet" back on it every time they loaded.
   *
   * Never stamped on the dating arm, whatever is in the answers. Only one of
   * the two question-twos is asked, and flagging a step that was never shown
   * would skip it in the signed-in run if they switched tracks later.
   */
  if (answers.track === 'interview' && answers.roleAsked) flags.push(ONBOARDING_ROLE_FLAG)
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
 * The other table a finished interview funnel writes.
 *
 * `profiles` is not where a role title belongs — `interview_setups` is, and
 * `setupFromRow` reads `complete` off exactly this field. Kept pure and
 * separate from `startProfileWrite` for the same reason that one is: it is the
 * difference between an account that opens on its free screener and one that
 * opens on "Tell us about the job", and that is a silent failure — every
 * screen still works.
 *
 * `null` when there is nothing to write, so the caller can skip the round trip
 * rather than upserting an empty row. A row with no role title reads as
 * incomplete anyway, but an empty row is one the user never created.
 */
export interface StartInterviewWrite {
  roleTitle: string
  company: string
}

export function startInterviewSetup(answers: StartAnswers): StartInterviewWrite | null {
  if (answers.track !== 'interview' || !answers.roleTitle) return null
  return { roleTitle: answers.roleTitle, company: answers.company ?? '' }
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
 * Only the track moves. The name is a name, and the two question-twos are
 * kept rather than cleared: somebody who answered the focus question and then
 * switched to interviews has still told us something true about the dating
 * reps their account also has, and clearing it would be charging them for
 * changing their mind. `startResumeIndex` then asks whichever question two the
 * new track has and has not had an answer.
 */
export function startOpening(stored: StartAnswers, asked: Track | null): { answers: StartAnswers; index: number } {
  if (!hasStartAnswers(stored)) {
    /**
     * Nothing open. A named track skips the two screens before it — the hook
     * says what this is, and somebody arriving from `/interviews` has just
     * read a longer version of it.
     */
    if (!asked) return { answers: EMPTY_START_ANSWERS, index: startSteps(null).indexOf('hook') }
    /**
     * A named track skips the hook and lands on the age gate.
     *
     * It used to skip the track question too, and it cannot any more: §16.4
     * is now screen two, and the one screen a run is not allowed to jump over
     * is the gate. So `?track=interview` saves the hook — somebody arriving
     * from `/interviews` has just read a longer version of it — and then
     * meets the track question with their answer already selected, which is a
     * confirmation rather than a question.
     */
    return { answers: { ...EMPTY_START_ANSWERS, track: asked }, index: startSteps(asked).indexOf('age') }
  }
  const answers = asked && stored.track !== asked ? { ...stored, track: asked } : stored
  return { answers, index: startResumeIndex(answers) }
}
