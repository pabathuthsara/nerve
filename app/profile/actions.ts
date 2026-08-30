'use server'

/**
 * Preference writes.
 *
 * These are the settings a user owns — their name, their audio, whether the
 * warmth number is on the screen, what they said they were here for. They go
 * through the user's own client so RLS is the authorisation, and `profiles`
 * grants exactly one row: theirs.
 *
 * What is NOT here, on purpose: plan, quota, streak and level. Those live on
 * `entitlements`, which has a read policy and nothing else, and they are
 * written by the rep lifecycle with the service role. A settings screen that
 * could raise your own daily limit is the same bug as a ledger you can edit
 * (§14).
 *
 * Like every other write in this app, each returns a result rather than
 * throwing: a thrown Server Action error reaches the client as an opaque
 * digest, and a settings row has to be able to say what went wrong.
 */

import { revalidatePath } from 'next/cache'
import { currentUser, supabaseServer } from '@/lib/db/server'
import { announceUnlock } from '@/lib/db/unlocks'
import { ONBOARDING_DEFERRED_FLAG, ONBOARDING_NAME_FLAG, ONBOARDING_TRACK_FLAG } from '@/lib/data/guards'
import { trackWaitlistFlag } from '@/lib/data/ui-flags'
import type { FocusArea } from '@/lib/data/focus'
import type { TablesUpdate } from '@/lib/db/types'
import type { Track } from '@/lib/data/types'
import { OFFSET_MAX_MS, OFFSET_MIN_MS } from '@/lib/voice/calibration'
import { checkAge } from '@/lib/safety/age'

export interface SaveResult {
  ok: boolean
  message: string | null
}

const SIGNED_OUT: SaveResult = { ok: false, message: 'Not saved — you are signed out.' }

type ProfilePatch = TablesUpdate<'profiles'>

/**
 * `revalidate: false` for writes made from a screen the shell is not behind.
 *
 * The default revalidates the whole layout, because everything the shell draws
 * — name, track, reps — comes from the profile. Onboarding is the one run in
 * the product where that is pure cost: the shell is not rendered on any step,
 * and paying for a full layout revalidation on each of five answers is a
 * measurable part of why the run felt slow. `finishOnboarding` revalidates,
 * which is the one write on the run the shell actually has to see.
 */
async function updateProfile(patch: ProfilePatch, options: { revalidate?: boolean } = {}): Promise<SaveResult> {
  const user = await currentUser()
  if (!user) return SIGNED_OUT

  const supabase = await supabaseServer()
  const { error } = await supabase.from('profiles').update(patch).eq('id', user.id)
  if (error) return { ok: false, message: `Not saved — ${error.message}` }

  if (options.revalidate !== false) revalidatePath('/', 'layout')
  return { ok: true, message: null }
}

/**
 * Read `ui_flags`, merge, write. One round trip's worth of read-modify-write,
 * shared by everything on this file that stamps a flag.
 *
 * Last write wins on a concurrent stamp, which is the right trade for a column
 * whose worst failure is an explainer shown twice. Anything that records
 * something *earned* goes to `unlocks` instead (§08, §14).
 */
async function stampFlags(
  flags: readonly string[],
  patch: ProfilePatch = {},
  options: { revalidate?: boolean } = {},
): Promise<SaveResult> {
  const user = await currentUser()
  if (!user) return SIGNED_OUT

  const supabase = await supabaseServer()
  const { data: profile } = await supabase.from('profiles').select('ui_flags').eq('id', user.id).maybeSingle()
  const current = isFlagRecord(profile?.ui_flags) ? profile.ui_flags : {}
  const stamp = new Date().toISOString()

  return updateProfile(
    { ...patch, ui_flags: flags.reduce<Record<string, string>>((carry, flag) => ({ ...carry, [flag]: stamp }), { ...current }) },
    options,
  )
}

export async function saveDisplayName(name: string): Promise<SaveResult> {
  const trimmed = name.trim().slice(0, 60)
  if (!trimmed) return { ok: false, message: 'A name cannot be empty.' }
  return updateProfile({ display_name: trimmed })
}

/**
 * The age gate, for the accounts the sign-up form could not ask (§16.4).
 *
 * Google's button has no fields on it, and every account created before this
 * shipped has no date on file either. Both land on `/onboarding/age`, and this
 * is what that step writes.
 *
 * `age_confirmed_at` is stamped here, after `checkAge` has agreed with the
 * date — never from anything the form posted. The date itself is self-declared
 * and the migration says so plainly; the stamp is not. It means "the server
 * did the arithmetic and the answer was 18 or over", which is the thing terms
 * clause 02 acts on.
 *
 * `final` is what the gate needs and could not previously ask for. Every
 * refusal used to arrive as one shape, so `/onboarding/age` offered another
 * attempt on all of them — including the verdict, which made a rule the screen
 * describes as absolute into one you retype your way past. Only `under-age` is
 * final; a mis-scrolled wheel has to stay correctable.
 */
export interface AgeResult extends SaveResult {
  final: boolean
}

export async function confirmAge(dateOfBirth: string): Promise<AgeResult> {
  const check = checkAge(dateOfBirth, new Date())
  if (!check.ok) return { ok: false, message: check.message, final: check.reason === 'under-age' }
  const saved = await updateProfile({
    date_of_birth: check.dob,
    age_confirmed_at: new Date().toISOString(),
  })
  return { ...saved, final: false }
}

export async function saveTrainingWheels(on: boolean): Promise<SaveResult> {
  return updateProfile({ training_wheels: on })
}

export async function saveAudioPreferences(input: {
  ambience?: boolean
  ambienceVolume?: number
  inputDevice?: string | null
  outputDevice?: string | null
}): Promise<SaveResult> {
  const patch: ProfilePatch = {}
  if (typeof input.ambience === 'boolean') patch.ambience = input.ambience
  if (typeof input.ambienceVolume === 'number') {
    patch.ambience_volume = Math.max(0, Math.min(100, Math.round(input.ambienceVolume)))
  }
  if (input.inputDevice !== undefined) patch.input_device = input.inputDevice
  if (input.outputDevice !== undefined) patch.output_device = input.outputDevice
  if (Object.keys(patch).length === 0) return { ok: true, message: null }
  return updateProfile(patch)
}

export async function setActiveTrack(track: Track): Promise<SaveResult> {
  return updateProfile({ active_track: track })
}

/**
 * Onboarding, written a step at a time.
 *
 * Not batched at the end: a person who closes the tab on step three has still
 * told us what they are here for, and asking again would be a worse first
 * impression than not having asked.
 *
 * Nothing here revalidates. The run holds its own state and the shell is not
 * behind it, so the only thing a layout revalidation would buy on these five
 * writes is latency between a tap and the next question.
 *
 * `experience` used to be one of these. It was written, and read by nothing:
 * absent from `fetchUserState`, so it never reached a screen, a persona
 * choice, a field assignment or the grader. The step is gone rather than
 * wired, because the honest wiring for a self-reported experience level is a
 * difficulty adjustment, and §08/§12 forbid announcing one — which makes it
 * exactly the wrong thing to hang a user's own answer on. The column stays;
 * dropping it would rewrite a migration that has run.
 */
export async function saveOnboardingChoice(input: {
  track?: Track
  focusArea?: FocusArea
  /**
   * The name step (§08's `usesYourName` dial).
   *
   * `null` is a deliberate skip and is recorded as answered — the step is
   * optional, and a resume path that reads an empty `display_name` as "not
   * asked yet" would put somebody who declined back on the same screen every
   * time they reload.
   */
  displayName?: string | null
}): Promise<SaveResult> {
  const patch: ProfilePatch = {}
  const flags: string[] = []

  if (input.track) patch.active_track = input.track
  if (input.focusArea) patch.focus_area = input.focusArea

  // The track step needs a marker of its own. `active_track` carries a default,
  // so it is already set for somebody who has answered nothing — which made it
  // useless for "where did this person stop". See `onboardingResumePath`.
  if (input.track) flags.push(ONBOARDING_TRACK_FLAG)

  if (input.displayName !== undefined) {
    const trimmed = input.displayName?.trim().slice(0, 40) ?? ''
    if (trimmed) patch.display_name = trimmed
    flags.push(ONBOARDING_NAME_FLAG)
  }

  if (Object.keys(patch).length === 0 && flags.length === 0) return { ok: true, message: null }
  if (flags.length === 0) return updateProfile(patch, { revalidate: false })
  return stampFlags(flags, patch, { revalidate: false })
}

/**
 * The focus answer, changed later (§07's sub-scores, `lib/data/focus.ts`).
 *
 * It steers three surfaces — the first character, the first field challenge
 * and the technique card on the brief before a graded rep exists to draw one
 * from — and until now it was set once, in the first ninety seconds somebody
 * ever spent here, and then permanent.
 *
 * A preference, not an entitlement, so it goes through the user's own client
 * like every other setting on this file. Nobody would pay to change what they
 * said the hard part was — which is the line rule 9 actually draws.
 */
export async function saveFocusArea(focusArea: FocusArea): Promise<SaveResult> {
  return updateProfile({ focus_area: focusArea })
}

/**
 * A track asked for before it exists.
 *
 * The interview option on the onboarding track step is M4 by §17's ordering.
 * The screen that answered it used to say "Demand recorded" over a
 * `setTimeout` and write nothing, which made a claim on the one screen that
 * could actually tell us whether the track is worth building. This is the
 * write that sentence was describing.
 *
 * Only the ask. It deliberately does NOT stamp the track step as answered or
 * set `active_track`: wanting interview training is not choosing dating, and
 * recording it as though it were would put a choice on the record that nobody
 * made. Somebody who closes the tab on this screen resumes on the question,
 * which is where they actually are.
 */
export async function recordTrackWaitlist(track: 'interview' | 'english'): Promise<SaveResult> {
  return stampFlags([trackWaitlistFlag(track)], {}, { revalidate: false })
}

/**
 * The flag the route guard reads.
 *
 * It lives on the profile rather than in auth metadata because the guard reads
 * it on every protected route, and auth metadata is writable by the user it
 * describes. Whether you have been through onboarding is not one of the things
 * you get to declare.
 *
 * This one DOES revalidate. It is the write the shell has to see — it is the
 * moment the app opens.
 */
export async function finishOnboarding(): Promise<SaveResult> {
  return updateProfile({ onboarding_complete: true })
}

/**
 * *Look around first*, which is not *I am finished*.
 *
 * This used to call `finishOnboarding`, and that made the mic step's escape
 * hatch a trapdoor: somebody whose browser would not grant a microphone in
 * that moment permanently skipped the check, the brief and the "How a rep
 * works" sheet, with nothing in the product that would ever offer them again.
 *
 * The flag buys the same freedom of movement without the claim. See the guard
 * in `lib/data/guards.ts`: a deferred run is let past exactly as a finished
 * one is, `onboarding_complete` stays false, and `/train` carries one quiet
 * row back to the step they stopped on.
 */
export async function deferOnboarding(): Promise<SaveResult> {
  return stampFlags([ONBOARDING_DEFERRED_FLAG])
}

/* ------------------------------------------------------------------ *
 * Character memory (§08)
 * ------------------------------------------------------------------ */

/**
 * Forgetting is the user's, and it is one tap.
 *
 * A character who remembers you is disproportionately what makes her feel
 * real, which is exactly why there has to be a way out of it that does not
 * involve deleting anything else. These clear the line and nothing more —
 * history, scores, streak and ladder position are untouched, and the copy
 * beside the control says so.
 *
 * User context, not the service role. `persona_memory` grants its owner all
 * four verbs because this is the one piece of progression-adjacent state that
 * is genuinely theirs: nobody would pay to change what Nadia remembers.
 */
/**
 * Store the turn-taking calibration measured on the mic check (§05).
 *
 * The write path this column never had. Everything else existed — the column,
 * the check constraint, the read on the live rep page — so every user ran at a
 * flat 600ms window regardless of how they actually speak, and a hesitant
 * speaker had their sentences cut in half and answered as two fragments.
 *
 * Clamped here as well as at the measurement, because this is a user-context
 * write and the constraint should not be the only thing standing between a bad
 * client and a three-second silence window.
 */
export async function saveVadOffset(offsetMs: number): Promise<SaveResult> {
  const user = await currentUser()
  if (!user) return SIGNED_OUT
  if (!Number.isFinite(offsetMs)) return { ok: false, message: 'Not saved — bad measurement.' }

  const bounded = Math.round(Math.max(OFFSET_MIN_MS, Math.min(OFFSET_MAX_MS, offsetMs)))
  const supabase = await supabaseServer()
  const { error } = await supabase
    .from('profiles')
    .update({ vad_offset_ms: bounded })
    .eq('id', user.id)

  if (error) return { ok: false, message: `Not saved — ${error.message}` }
  return { ok: true, message: null }
}

export async function forgetPersona(slug: string): Promise<SaveResult> {
  const user = await currentUser()
  if (!user) return SIGNED_OUT

  const supabase = await supabaseServer()
  const { data: persona } = await supabase
    .from('personas')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()

  // No row means she was never seeded and therefore never remembered anything.
  // Nothing to forget is a success, not a failure.
  if (!persona) return { ok: true, message: null }

  const { error } = await supabase
    .from('persona_memory')
    .delete()
    .eq('user_id', user.id)
    .eq('persona_id', persona.id)

  if (error) return { ok: false, message: `Not cleared — ${error.message}` }

  revalidatePath('/roster', 'layout')
  revalidatePath(`/rep/${slug}/brief`)
  return { ok: true, message: null }
}

/** Every character at once, from Settings. Same promise: the line only. */
export async function forgetAllMemory(): Promise<SaveResult> {
  const user = await currentUser()
  if (!user) return SIGNED_OUT

  const supabase = await supabaseServer()
  const { error } = await supabase.from('persona_memory').delete().eq('user_id', user.id)
  if (error) return { ok: false, message: `Not cleared — ${error.message}` }

  revalidatePath('/', 'layout')
  return { ok: true, message: null }
}

/**
 * Marks a one-time beat as shown.
 *
 * `profiles.ui_flags` is a single jsonb column rather than a boolean per beat,
 * so adding the next one is a string and not a migration. The value is the
 * timestamp rather than `true` — it costs nothing and answers "when" later.
 *
 * Read-modify-write, which races if two tabs fire the same beat at once. The
 * worst outcome of losing that race is a sheet shown twice, so a transaction
 * would be more machinery than the problem deserves.
 */
export async function markUiFlag(flag: string): Promise<SaveResult> {
  const user = await currentUser()
  if (!user) return SIGNED_OUT

  const supabase = await supabaseServer()
  const { data: profile } = await supabase
    .from('profiles')
    .select('ui_flags')
    .eq('id', user.id)
    .maybeSingle()

  const current = isFlagRecord(profile?.ui_flags) ? profile.ui_flags : {}
  if (current[flag]) return { ok: true, message: null }

  return updateProfile({ ui_flags: { ...current, [flag]: new Date().toISOString() } })
}

function isFlagRecord(value: unknown): value is Record<string, string> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Marks a level or field-tier unlock as celebrated (§12).
 *
 * Called when the sheet is dismissed, not when it renders: §12 calls this a
 * designed beat rather than a toast, and a beat that flashed past behind a
 * navigation was not one. The service role does the stamping because `unlocks`
 * is read-only to its owner — what is unlocked is earned, not declared.
 */
export async function acknowledgeUnlock(
  kind: 'level' | 'tier',
  ref: number,
): Promise<{ ok: boolean }> {
  const user = await currentUser()
  if (!user) return { ok: false }
  if (!Number.isInteger(ref) || ref < 1 || ref > 4) return { ok: false }

  await announceUnlock(user.id, kind, String(ref))
  return { ok: true }
}
