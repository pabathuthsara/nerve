/**
 * The persona tuning bench (admin).
 *
 * The dev panel in `app/rep/dev-panel.tsx` tunes the character you are talking
 * to, live, mid-rep. That is the right tool for judging a dial by ear and the
 * wrong one for everything else: it only reaches one character, only while a
 * session is running, and only on a machine with `NEXT_PUBLIC_DEV_TOOLS` set.
 *
 * This is the other half. Every character on one screen, side by side, with no
 * rep running and no microphone — for comparing levels against each other,
 * seeing where the gates sit across the roster, and drafting a change before
 * spending three minutes hearing it.
 *
 * Gated on `adminUser()`, and a non-admin gets `notFound()` rather than a 403,
 * so this route answers a stranger with exactly what a misspelt URL answers.
 * See `lib/db/admin-gate.ts` for what that does and does not buy.
 *
 * Server component on purpose: the allowlist is read here and never reaches
 * the browser, and the registry is serialised into the client rather than
 * imported by it.
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { adminUser } from '@/lib/db/admin-gate'
import { PERSONAS } from '@/lib/personas'
import { presentationFor } from '@/lib/personas/presentation'
import { PersonaTuner, type TunerPersona } from '@/components/admin/persona-tuner'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Persona tuning',
  // Never indexed, never previewed. An admin route in a search result is an
  // admin route somebody found without guessing.
  robots: { index: false, follow: false },
}

/** The character arms `app/api/voice/token` will accept. Kept in step by hand. */
const MODELS = ['gpt-realtime-mini', 'gpt-realtime-2.1-mini', 'gpt-realtime'] as const

export default async function AdminPersonasPage() {
  const user = await adminUser()
  if (!user) notFound()

  // Only the four dial layers plus what the card needs to identify her. The
  // contract is deliberately not sent: it is prose, this screen cannot edit
  // prose, and shipping every character's full prompt to a browser is a copy
  // of the most valuable text in the product sitting in a network tab.
  const personas: TunerPersona[] = Object.values(PERSONAS)
    .sort((a, b) => a.level - b.level)
    .map((persona) => ({
      slug: persona.slug,
      name: persona.name,
      scene: persona.scene,
      level: persona.level,
      track: persona.track,
      voice: persona.voice,
      want: persona.want,
      setting: presentationFor(persona.slug)?.settingShort ?? persona.scene,
      dials: {
        trajectory: persona.trajectory,
        personality: persona.personality,
        gated: persona.gated,
        room: persona.room,
      },
    }))

  return <PersonaTuner personas={personas} models={[...MODELS]} signedInAs={user.email ?? ''} />
}
