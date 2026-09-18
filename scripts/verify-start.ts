/**
 * The acquisition funnel's crossing into a new account, against the real
 * database.
 *
 *   npm run db:funnel
 *
 * `/start` collects three answers before an account exists and
 * `signUpWithPassword` writes them, with the date of birth, in one update
 * against a row a database trigger has just inserted. Everything about that
 * sentence is testable except the part that matters most — whether the write
 * actually lands, and whether the row it leaves behind sends somebody to the
 * microphone check rather than back to question one.
 *
 * The pure half is `lib/data/start-funnel.test.ts`. This is the half that
 * needs Postgres:
 *
 *   the profile row exists by the time `auth.admin.createUser` returns
 *   the combined write affects exactly one row
 *   every answer reads back on the columns `onboardingResumePath` reads
 *   a SKIPPED name is stored as answered, with no name
 *   the English ask lands on the same flag `recordTrackWaitlist` stamps
 *   the interview arm's role reaches `interview_setups`, and only that arm's
 *   a skipped role creates no empty row, and is still flagged as asked
 *   a sign-up with no funnel behind it writes nothing but the date (§16.4)
 *   a Google sign-up carries the same answers in a cookie, invents no date,
 *   and refuses a second crossing onto an account that has already answered
 *   a carried birth year is stamped as 31 December, and an under-age one is
 *   never stamped at all however it arrived
 *
 * The last one is the regression check: `/signup` is still a door, people
 * still arrive at it directly, and an account created that way must resume
 * exactly where it always did.
 *
 * The users are deleted at the end whatever happens.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/db/types'
import {
  EMPTY_START_ANSWERS,
  decodeStartAnswers,
  encodeStartAnswers,
  type StartAnswers,
} from '@/lib/data/start-funnel'
import { crossOAuthAccount, stampNewAccount } from '@/lib/db/start-crossing'
import {
  ONBOARDING_CV_FLAG,
  ONBOARDING_NAME_FLAG,
  ONBOARDING_ROLE_FLAG,
  ONBOARDING_TRACK_FLAG,
  trackWaitlistFlag,
} from '@/lib/data/ui-flags'
import { onboardingResumePath } from '@/lib/data/guards'

let failures = 0

function check(passed: boolean, description: string): void {
  console.log(`  ${passed ? 'pass' : 'FAIL'}  ${description}`)
  if (!passed) failures += 1
}

/** A profile row's flags, in the shape the guard reads them. */
function flagsOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

/**
 * The real crossing, against the real database.
 *
 * This used to be a reconstruction, with a comment explaining that the
 * original "lives inside a `'use server'` module, which may only export async
 * Server Actions" — so the script rebuilt the write out of the same pure
 * `startProfileWrite` and tested a copy.
 *
 * It does not any more. Adding Google meant a second door needed the same
 * write, and a `'use server'` module could not safely lend it out: every
 * export there is callable from the browser with arbitrary arguments, and
 * this one takes a user id. Moving it to `lib/db/start-crossing.ts` closed
 * that hole and, as a side effect, made it importable here — so the thing
 * under test is now the thing that runs in production, including its retry
 * and its empty-patch guard.
 *
 * `stampNewAccount` builds its own service-role client from the environment
 * this script has already loaded, so there is no client to pass.
 */
async function stamp(userId: string, dateOfBirth: string | null, answers: StartAnswers): Promise<void> {
  await stampNewAccount(userId, dateOfBirth, answers)
}

async function main(): Promise<void> {
  const { loadEnvLocal } = await import('./env')
  await loadEnvLocal()

  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']
  const secret = process.env['SUPABASE_SECRET_KEY']
  if (!url || !secret) {
    console.error('Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local.')
    process.exit(1)
  }

  const admin = createClient<Database>(url, secret, { auth: { autoRefreshToken: false, persistSession: false } })
  const created: string[] = []

  const newAccount = async (label: string): Promise<string> => {
    const now = Date.now()
    const { data, error } = await admin.auth.admin.createUser({
      email: `start-${label}-${now}@nerve.test`,
      password: `pw-${now}-xyz`,
      email_confirm: true,
    })
    if (error || !data.user) throw new Error(`could not create the ${label} user: ${error?.message}`)
    created.push(data.user.id)
    return data.user.id
  }

  try {
    /* ---------------------------------------------------------------- *
     * A funnel answered in full
     * ---------------------------------------------------------------- */
    console.log('\nA run answered in full')

    const answers = decodeStartAnswers(encodeStartAnswers({
      ...EMPTY_START_ANSWERS,
      track: 'dating',
      focusArea: 'rejection',
      displayName: 'Sam',
      named: true,
    }))
    const full = await newAccount('full')

    // The race `stampNewAccount` retries for. `handle_new_user` is an AFTER
    // INSERT trigger inside the same transaction, so this should already be
    // true — worth measuring rather than assuming, because the retry above it
    // exists precisely because the original comment said it might not be.
    const { data: beforeWrite } = await admin.from('profiles').select('id').eq('id', full).maybeSingle()
    check(!!beforeWrite, 'the profile row exists as soon as the account does')

    await stamp(full, '1998-04-12', answers)

    const { data: row } = await admin
      .from('profiles')
      .select('active_track, focus_area, display_name, ui_flags, age_confirmed_at, onboarding_complete')
      .eq('id', full)
      .maybeSingle()

    check(row?.active_track === 'dating', 'the track answer is on the row')
    check(row?.focus_area === 'rejection', 'the focus answer is on the row')
    check(row?.display_name === 'Sam', 'the name answer is on the row')
    check(!!row?.age_confirmed_at, 'the §16.4 date is stamped, so the age gate does not divert')
    check(row?.onboarding_complete === false, 'the run is not claimed to be finished — the mic check has not happened')

    const stamped = flagsOf(row?.ui_flags)
    check(!!stamped[ONBOARDING_TRACK_FLAG], 'the track step is flagged as answered')
    check(!!stamped[ONBOARDING_NAME_FLAG], 'the name step is flagged as answered')
    check(
      !!stamped[ONBOARDING_TRACK_FLAG] && !!row?.focus_area && !!stamped[ONBOARDING_NAME_FLAG],
      'every condition onboardingResumePath tests before /onboarding/mic is met',
    )

    /* ---------------------------------------------------------------- *
     * The interview arm
     *
     * D22. The run forks at the track question, and the fork is only real if
     * the account lands ready to run its free screener: a role title in
     * `interview_setups` (which is all `complete` is), the role step flagged,
     * and a resume that asks for the CV rather than for a dating focus answer
     * nobody on this arm was ever offered.
     * ---------------------------------------------------------------- */
    console.log('\nAn interview run answered in full')

    const interviewAnswers = decodeStartAnswers(encodeStartAnswers({
      ...EMPTY_START_ANSWERS,
      track: 'interview',
      roleTitle: 'Senior Backend Engineer',
      company: 'Monzo',
      roleAsked: true,
      displayName: 'Sam',
      named: true,
    }))
    const interview = await newAccount('interview')
    await stamp(interview, '1997-02-18', interviewAnswers)

    const { data: interviewRow } = await admin
      .from('profiles')
      .select('active_track, focus_area, ui_flags, unlocked_tracks')
      .eq('id', interview)
      .maybeSingle()
    check(interviewRow?.active_track === 'interview', 'the track answer is on the row')
    check(!interviewRow?.focus_area, 'no dating focus was invented for an arm that never asked')
    const interviewFlags = flagsOf(interviewRow?.ui_flags)
    check(!!interviewFlags[ONBOARDING_ROLE_FLAG], 'the role step is flagged as answered')
    check(!interviewFlags[ONBOARDING_CV_FLAG], 'and the CV step is not — it happens after the account')

    const { data: setupRow } = await admin
      .from('interview_setups')
      .select('role_title, company')
      .eq('user_id', interview)
      .maybeSingle()
    check(setupRow?.role_title === 'Senior Backend Engineer', 'the role reached interview_setups')
    check(setupRow?.company === 'Monzo', 'and so did the company')
    check(
      onboardingResumePath({
        active_track: interviewRow?.active_track ?? null,
        focus_area: interviewRow?.focus_area ?? null,
        ui_flags: interviewRow?.ui_flags ?? {},
      }) === '/onboarding/cv',
      'the run resumes at the CV step, not at a dating question',
    )
    check(
      (interviewRow?.unlocked_tracks ?? []).includes('interview'),
      'the free screener opened the track, so /interview* renders (E1)',
    )

    /* ---------------------------------------------------------------- *
     * An interview run that skipped the role
     * ---------------------------------------------------------------- */
    console.log('\nAn interview run that skipped the role')

    const noRole = await newAccount('norole')
    await stamp(noRole, '1993-09-09', { ...interviewAnswers, roleTitle: null, company: null })
    const { data: noRoleSetup } = await admin
      .from('interview_setups').select('user_id').eq('user_id', noRole).maybeSingle()
    check(!noRoleSetup, 'no empty setup row is created for a question that was skipped')
    const { data: noRoleRow } = await admin
      .from('profiles').select('ui_flags').eq('id', noRole).maybeSingle()
    check(
      !!flagsOf(noRoleRow?.ui_flags)[ONBOARDING_ROLE_FLAG],
      'and the step is still flagged, so the question is not asked a second time',
    )

    /* ---------------------------------------------------------------- *
     * A name declined
     * ---------------------------------------------------------------- */
    console.log('\nA name declined')

    const skipped = await newAccount('skip')
    await stamp(skipped, '1996-01-30', {
      ...answers, displayName: null, named: true,
    })
    const { data: skippedRow } = await admin
      .from('profiles').select('display_name, ui_flags').eq('id', skipped).maybeSingle()
    check(!skippedRow?.display_name, 'no name is written for somebody who declined to give one')
    check(
      !!flagsOf(skippedRow?.ui_flags)[ONBOARDING_NAME_FLAG],
      'and the step is still flagged, so the question is not asked a second time',
    )

    /* ---------------------------------------------------------------- *
     * The track that does not exist yet
     * ---------------------------------------------------------------- */
    console.log('\nThe English ask')

    const waiting = await newAccount('english')
    await stamp(waiting, '1994-07-02', { ...EMPTY_START_ANSWERS, english: true })
    const { data: waitingRow } = await admin
      .from('profiles').select('ui_flags').eq('id', waiting).maybeSingle()
    check(
      !!flagsOf(waitingRow?.ui_flags)[trackWaitlistFlag('english')],
      'the ask lands on the same flag recordTrackWaitlist stamps, so the count stays one count',
    )

    /* ---------------------------------------------------------------- *
     * The door that was there before
     * ---------------------------------------------------------------- */
    console.log('\nA sign-up with no funnel behind it')

    const direct = await newAccount('direct')
    await stamp(direct, '1990-11-05', EMPTY_START_ANSWERS)

    const { data: directRow } = await admin
      .from('profiles').select('focus_area, display_name, ui_flags, age_confirmed_at').eq('id', direct).maybeSingle()
    check(!!directRow?.age_confirmed_at, 'the §16.4 date is stamped')
    check(!directRow?.focus_area, 'nothing was invented for a run that never happened')
    check(!directRow?.display_name, 'and no name was invented either')
    check(
      Object.keys(flagsOf(directRow?.ui_flags)).length === 0,
      'no onboarding step is flagged, so /signup still resumes at question one',
    )

    /* ---------------------------------------------------------------- *
     * The door that leaves the site
     *
     * Google. The answers cross in a cookie rather than a form field, the
     * account already exists by the time we hear about it, and there is no
     * date of birth anywhere in the flow. Three things have to be true and
     * only one of them is about the answers:
     *
     *   the answers land, so the run is not asked all over again
     *   NO date is invented, so §16.4 still diverts to /onboarding/age
     *   a second crossing is refused, so a stale cookie cannot overwrite a
     *   track the account has since chosen
     * ---------------------------------------------------------------- */
    console.log('\nA Google sign-up carrying a finished run')

    const oauth = await newAccount('oauth')
    await crossOAuthAccount(oauth, decodeStartAnswers(encodeStartAnswers({
      ...EMPTY_START_ANSWERS,
      track: 'interview',
      roleTitle: 'Staff Engineer',
      company: 'Figma',
      roleAsked: true,
      displayName: 'Ada',
      named: true,
    })))

    const { data: oauthRow } = await admin
      .from('profiles')
      .select('active_track, display_name, ui_flags, age_confirmed_at, date_of_birth')
      .eq('id', oauth)
      .maybeSingle()
    check(oauthRow?.active_track === 'interview', 'the track answer crossed the redirect')
    check(oauthRow?.display_name === 'Ada', 'and so did the name')
    check(!!flagsOf(oauthRow?.ui_flags)[ONBOARDING_ROLE_FLAG], 'the role step is flagged as answered')
    check(!oauthRow?.age_confirmed_at, 'no date was invented, so the §16.4 gate still fires on the first render')
    check(!oauthRow?.date_of_birth, 'and no date of birth was stored for an account that never gave one')

    const { data: oauthSetup } = await admin
      .from('interview_setups').select('role_title').eq('user_id', oauth).maybeSingle()
    check(oauthSetup?.role_title === 'Staff Engineer', 'the role reached interview_setups through the OAuth door too')

    // The stale-cookie case. Same account, different answers, and the guard
    // reads "this row has already answered something" off the flags rather
    // than off any timestamp.
    await crossOAuthAccount(oauth, decodeStartAnswers(encodeStartAnswers({
      ...EMPTY_START_ANSWERS, track: 'dating', focusArea: 'opening',
    })))
    const { data: oauthAgain } = await admin
      .from('profiles').select('active_track, focus_area').eq('id', oauth).maybeSingle()
    check(oauthAgain?.active_track === 'interview', 'a second crossing does not overwrite the track')
    check(!oauthAgain?.focus_area, 'and invents nothing new on an account with a history')

    /* ---------------------------------------------------------------- *
     * A Google sign-up that carries the age answer
     *
     * SIGNUP-FIXES §2.2's payoff for §2.1. The birth year is given on screen
     * two, six screens before any door is chosen, so it crosses the redirect
     * with everything else and the OAuth account arrives §16.4-complete — no
     * `/onboarding/age`, and the gate ran before the account, because
     * `signInWithGoogle` refuses an under-age year before it redirects.
     * ---------------------------------------------------------------- */
    console.log('\nA Google sign-up carrying the age answer')

    const aged = await newAccount('aged')
    await crossOAuthAccount(aged, decodeStartAnswers(encodeStartAnswers({
      ...EMPTY_START_ANSWERS, birthYear: 1999, track: 'dating', focusArea: 'opening', named: true, displayName: 'Ira',
    })))
    const { data: agedRow } = await admin
      .from('profiles').select('date_of_birth, age_confirmed_at, active_track').eq('id', aged).maybeSingle()
    check(agedRow?.date_of_birth === '1999-12-31', 'the year is stored as 31 December, the cautious reading')
    check(!!agedRow?.age_confirmed_at, 'the §16.4 stamp is set, so this account does NOT meet /onboarding/age')
    check(agedRow?.active_track === 'dating', 'and the rest of the run crossed with it')

    // The cookie is httpOnly so its subject cannot edit it, and the stamp is
    // still not taken on trust: `checkAge` is the only thing allowed to turn
    // a date into a verdict, so an under-age year that somehow reached here
    // writes the answers and no stamp, and /onboarding/age asks properly.
    const young = await newAccount('young')
    await crossOAuthAccount(young, decodeStartAnswers(encodeStartAnswers({
      ...EMPTY_START_ANSWERS, birthYear: new Date().getUTCFullYear() - 5, track: 'dating', named: true,
    })))
    const { data: youngRow } = await admin
      .from('profiles').select('date_of_birth, age_confirmed_at, active_track').eq('id', young).maybeSingle()
    check(!youngRow?.age_confirmed_at, 'an under-age year is never stamped, whatever the cookie said')
    check(!youngRow?.date_of_birth, 'and no date of birth is stored for it')
    check(youngRow?.active_track === 'dating', 'the gate refuses the stamp without discarding the run')

    /* ---------------------------------------------------------------- *
     * A Google sign-in with no run behind it
     *
     * The ordinary case, and the one an empty patch would have thrown on:
     * somebody pressing the button on /login has no answers and no date, so
     * there is nothing to write at all.
     * ---------------------------------------------------------------- */
    console.log('\nA Google sign-in with nothing carried')

    const plain = await newAccount('plain')
    await crossOAuthAccount(plain, EMPTY_START_ANSWERS)
    const { data: plainRow } = await admin
      .from('profiles').select('active_track, focus_area, display_name, ui_flags, age_confirmed_at').eq('id', plain).maybeSingle()
    check(!!plainRow, 'the row survives a crossing with nothing in it')
    check(!plainRow?.focus_area && !plainRow?.display_name, 'nothing was invented for a run that never happened')
    check(Object.keys(flagsOf(plainRow?.ui_flags)).length === 0, 'no onboarding step is flagged')
    check(!plainRow?.age_confirmed_at, 'and the §16.4 gate is still in front of them')

  } finally {
    for (const id of created) await admin.auth.admin.deleteUser(id)
    console.log(`\n${created.length} test user(s) removed.`)
  }

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`)
    process.exit(1)
  }
  console.log('\nAll checks passed.')
}

void main()
