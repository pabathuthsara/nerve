/**
 * Mirrors the TypeScript persona registry into the `personas` table.
 *
 *   npm run db:seed          # upsert every persona
 *   npm run db:seed -- nadia # one of them
 *
 * §13 says characters are content, not code, and eventually they will be
 * authored as rows. Today the registry is what is tuned and tested, so it
 * stays authoritative and this script pushes it downstream. The rep path still
 * reads the registry; the table exists so `sessions.persona_id` is a real
 * foreign key and so the switch, when it comes, is a read change and nothing
 * else.
 *
 * Idempotent. Run it after every persona edit.
 */

import { createClient } from '@supabase/supabase-js'
import { PERSONAS, getPersona } from '@/lib/personas'
import { presentationFor } from '@/lib/personas/presentation'
import type { Persona } from '@/lib/voice/types'
import { asJson, type Database } from '@/lib/db/types'
import { loadEnvLocal } from './env'

function row(persona: Persona) {
  // Presentation is authored beside the contract and seeded with it. A
  // character whose card describes someone the model was never told to be is
  // worse than no card at all.
  const shown = presentationFor(persona.slug)
  if (!shown) {
    console.error(
      `No presentation copy for "${persona.slug}". Add it to lib/personas/presentation.ts —`
        + ' the roster has nothing to draw without it.',
    )
    process.exit(1)
  }

  return {
    slug: persona.slug,
    name: persona.name,
    scene: persona.scene,
    level: persona.level,
    track: persona.track,
    // The four-layer schema from docs/PERSONA.md, not §05's flat record. The flat
    // shape was replaced because a separate friendliness dial and the warmth
    // band argued over the same behaviour.
    dials: asJson({
      trajectory: persona.trajectory,
      personality: persona.personality,
      gated: persona.gated,
      room: persona.room,
    }),
    voice: asJson(persona.voice),
    contract: persona.contract,
    exit_conditions: persona.exitConditions,
    outcome_weights: asJson(persona.outcomeWeights),
    setting_label: shown.setting,
    setting_short: shown.settingShort,
    hook: shown.hook,
    blurb: shown.blurb,
    responds_to: shown.respondsTo,
    shuts_down_on: shown.shutsDownOn,
    portrait_url: shown.portraitUrl,
    published: true,
  }
}

async function main(): Promise<void> {
  await loadEnvLocal()

  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']
  const key = process.env['SUPABASE_SECRET_KEY']
  if (!url || !key) {
    console.error(
      'Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local.\n'
        + 'The secret key is required: personas has no insert policy, by design.',
    )
    process.exit(1)
  }

  const requested = process.argv.slice(2).filter((arg) => !arg.startsWith('-'))
  const personas = requested.length
    ? requested.map((slug) => {
        const persona = getPersona(slug)
        if (!persona) {
          console.error(`No persona named "${slug}". Known: ${Object.keys(PERSONAS).join(', ')}`)
          process.exit(1)
        }
        return persona
      })
    : Object.values(PERSONAS)

  const supabase = createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data, error } = await supabase
    .from('personas')
    .upsert(personas.map(row), { onConflict: 'slug' })
    .select('slug, name, level')

  if (error) {
    console.error(`Seed failed: ${error.message}`)
    process.exit(1)
  }

  for (const persona of (data ?? []).sort((a, b) => a.level - b.level)) {
    console.log(`  L${persona.level}  ${persona.slug.padEnd(10)} ${persona.name}`)
  }
  console.log(`\n${data?.length ?? 0} persona(s) seeded.`)
}

void main()
