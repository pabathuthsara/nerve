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
 *   a sign-up with no funnel behind it writes nothing but the date (§16.4)
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
  startProfileWrite,
  type StartAnswers,
} from '@/lib/data/start-funnel'
import {
  ONBOARDING_NAME_FLAG,
  ONBOARDING_TRACK_FLAG,
  trackWaitlistFlag,
} from '@/lib/data/ui-flags'

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
 * The write `stampNewAccount` makes, run the way it makes it.
 *
 * Deliberately reconstructed here from the same pure `startProfileWrite`
 * rather than imported: the real one lives inside a `'use server'` module,
 * which may only export async Server Actions. What is shared is the part that
 * decides — which is the part that can be wrong in a way nobody sees.
 */
async function stamp(
  admin: SupabaseClient<Database>,
  userId: string,
  dateOfBirth: string,
  answers: StartAnswers,
): Promise<number | null> {
  const at = new Date().toISOString()
  const { patch, flags } = startProfileWrite(answers)
  const { count } = await admin
    .from('profiles')
    .update({
      date_of_birth: dateOfBirth,
      age_confirmed_at: at,
      ...patch,
      ...(flags.length > 0
        ? { ui_flags: flags.reduce<Record<string, string>>((carry, flag) => ({ ...carry, [flag]: at }), {}) }
        : {}),
    }, { count: 'exact' })
    .eq('id', userId)
  return count
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
      track: 'dating',
      focusArea: 'rejection',
      displayName: 'Sam',
      named: true,
      english: false,
    }))
    const full = await newAccount('full')

    // The race `stampNewAccount` retries for. `handle_new_user` is an AFTER
    // INSERT trigger inside the same transaction, so this should already be
    // true — worth measuring rather than assuming, because the retry above it
    // exists precisely because the original comment said it might not be.
    const { data: beforeWrite } = await admin.from('profiles').select('id').eq('id', full).maybeSingle()
    check(!!beforeWrite, 'the profile row exists as soon as the account does')

    const count = await stamp(admin, full, '1998-04-12', answers)
    check(count === 1, 'the combined write affects exactly one row')

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
     * A name declined
     * ---------------------------------------------------------------- */
    console.log('\nA name declined')

    const skipped = await newAccount('skip')
    await stamp(admin, skipped, '1996-01-30', {
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
    await stamp(admin, waiting, '1994-07-02', { ...EMPTY_START_ANSWERS, english: true })
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
    const directCount = await stamp(admin, direct, '1990-11-05', EMPTY_START_ANSWERS)
    check(directCount === 1, 'the date of birth is still written on its own')

    const { data: directRow } = await admin
      .from('profiles').select('focus_area, display_name, ui_flags, age_confirmed_at').eq('id', direct).maybeSingle()
    check(!!directRow?.age_confirmed_at, 'the §16.4 date is stamped')
    check(!directRow?.focus_area, 'nothing was invented for a run that never happened')
    check(!directRow?.display_name, 'and no name was invented either')
    check(
      Object.keys(flagsOf(directRow?.ui_flags)).length === 0,
      'no onboarding step is flagged, so /signup still resumes at question one',
    )
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
