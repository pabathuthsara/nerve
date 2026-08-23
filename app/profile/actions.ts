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
import type { TablesUpdate } from '@/lib/db/types'
import type { Track } from '@/lib/data/types'

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
}): Promise<SaveResult> {
  const patch: ProfilePatch = {}
  if (input.track) patch.active_track = input.track
  if (input.focusArea) patch.focus_area = input.focusArea
  if (input.experience) patch.experience = input.experience
  if (Object.keys(patch).length === 0) return { ok: true, message: null }
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
