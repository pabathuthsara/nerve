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
import { ONBOARDING_NAME_FLAG, ONBOARDING_TRACK_FLAG } from '@/lib/data/guards'
import type { TablesUpdate } from '@/lib/db/types'
import type { Track } from '@/lib/data/types'
import { OFFSET_MAX_MS, OFFSET_MIN_MS } from '@/lib/voice/calibration'

export interface SaveResult {
  ok: boolean
  message: string | null
}

const SIGNED_OUT: SaveResult = { ok: false, message: 'Not saved — you are signed out.' }

type ProfilePatch = TablesUpdate<'profiles'>

async function updateProfile(patch: ProfilePatch): Promise<SaveResult> {
  const user = await currentUser()
  if (!user) return SIGNED_OUT

  const supabase = await supabaseServer()
  const { error } = await supabase.from('profiles').update(patch).eq('id', user.id)
  if (error) return { ok: false, message: `Not saved — ${error.message}` }

  // Everything the shell draws — name, track, reps — comes from the profile.
  revalidatePath('/', 'layout')
  return { ok: true, message: null }
}

export async function saveDisplayName(name: string): Promise<SaveResult> {
  const trimmed = name.trim().slice(0, 60)
  if (!trimmed) return { ok: false, message: 'A name cannot be empty.' }
  return updateProfile({ display_name: trimmed })
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
 */
export async function saveOnboardingChoice(input: {
  track?: Track
  focusArea?: 'opening' | 'sustaining' | 'flirting' | 'rejection'
  experience?: 'never' | 'sometimes' | 'often'
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
  if (input.experience) patch.experience = input.experience

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

  if (flags.length > 0) {
    const user = await currentUser()
    if (!user) return SIGNED_OUT
    const supabase = await supabaseServer()
    const { data: profile } = await supabase.from('profiles').select('ui_flags').eq('id', user.id).maybeSingle()
    const current = isFlagRecord(profile?.ui_flags) ? profile.ui_flags : {}
    const stamp = new Date().toISOString()
    patch.ui_flags = flags.reduce<Record<string, string>>(
      (carry, flag) => ({ ...carry, [flag]: stamp }),
      { ...current },
    )
  }

  return updateProfile(patch)
}

/**
 * The flag the route guard reads.
 *
 * It lives on the profile rather than in auth metadata because the guard reads
 * it on every protected route, and auth metadata is writable by the user it
 * describes. Whether you have been through onboarding is not one of the things
 * you get to declare.
 */
export async function finishOnboarding(): Promise<SaveResult> {
  return updateProfile({ onboarding_complete: true })
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
