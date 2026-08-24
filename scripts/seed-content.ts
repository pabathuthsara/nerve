/**
 * Mirrors the authored content into the database.
 *
 *   npm run db:content
 *
 * Two libraries, same rule as personas: the repo is where content is written
 * and reviewed, the table is where it is read. Both are hand-written and
 * neither is ever generated at runtime — §09 for the challenges, because one
 * bad challenge ends the company, and §10 for the techniques, because a
 * generated coaching card is exactly the "wrapper" §02 exists to prevent.
 *
 * Idempotent. Run it after every edit to either file.
 */

import { createClient } from '@supabase/supabase-js'
import { FIELD_CHALLENGES, REVIEWED_BY } from '@/lib/field/challenges'
import { TECHNIQUES } from '@/lib/techniques/library'
import { asJson } from '@/lib/db/json'
import type { Database } from '@/lib/db/types'
import { loadEnvLocal } from './env'

async function main(): Promise<void> {
  await loadEnvLocal()

  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']
  const key = process.env['SUPABASE_SECRET_KEY']
  if (!url || !key) {
    console.error(
      'Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local.\n'
        + 'The secret key is required: content tables have no insert policy, by design.',
    )
    process.exit(1)
  }

  const supabase = createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: challenges, error: challengeError } = await supabase
    .from('field_challenges')
    .upsert(
      FIELD_CHALLENGES.map((challenge) => ({
        slug: challenge.slug,
        tier: challenge.tier,
        title: challenge.title,
        brief: challenge.brief,
        done_when: challenge.doneWhen,
        safety_note: challenge.safetyNote ?? null,
        setting: challenge.setting,
        // Stamped per row. A challenge with no reviewer is not publishable
        // (§09) — the rule is only real if it leaves a mark on the data.
        reviewed_by: REVIEWED_BY,
        published: true,
      })),
      { onConflict: 'slug' },
    )
    .select('slug, tier')

  if (challengeError) {
    console.error(`Challenges failed: ${challengeError.message}`)
    process.exit(1)
  }

  const { data: techniques, error: techniqueError } = await supabase
    .from('techniques')
    .upsert(
      TECHNIQUES.map((technique) => ({
        slug: technique.slug,
        kind: technique.kind,
        title: technique.title,
        summary: technique.summary,
        body: technique.body,
        targets: technique.targets,
        setting: technique.setting ?? null,
        examples: asJson(technique.examples),
        drill: technique.drill ?? null,
        published: true,
      })),
      { onConflict: 'slug' },
    )
    .select('slug, kind')

  if (techniqueError) {
    console.error(`Techniques failed: ${techniqueError.message}`)
    process.exit(1)
  }

  for (const tier of [1, 2, 3, 4]) {
    const count = (challenges ?? []).filter((row) => row.tier === tier).length
    console.log(`  T${tier}  ${count} challenge(s)`)
  }
  const kinds = new Map<string, number>()
  for (const row of techniques ?? []) kinds.set(row.kind, (kinds.get(row.kind) ?? 0) + 1)
  for (const [kind, count] of [...kinds].sort()) console.log(`  ${kind.padEnd(10)} ${count}`)

  console.log(`\n${challenges?.length ?? 0} challenge(s), ${techniques?.length ?? 0} library card(s) seeded.`)
}

void main()
