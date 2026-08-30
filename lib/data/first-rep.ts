import 'server-only'

/**
 * The characters the first rep could be against, read on the server.
 *
 * `/onboarding/ready` used to hardcode `usePersona('nadia')` — a client fetch,
 * drawing a skeleton on the one screen where somebody is already waiting to
 * start, for an answer the server rendering that route already had. It also
 * quietly contradicted `lib/data/focus.ts`, which says the focus answer picks
 * "the character the first rep is against". The two agreed only because Nadia
 * is currently the only level-1 character; the agreement was a coincidence
 * maintained by hand, and a second level-1 persona would have made `/train`
 * and the ready screen name different people on consecutive screens.
 *
 * Candidates rather than a choice, deliberately. The choice depends on the
 * focus answer, and on the run that answer is two screens newer than this
 * request — the user picks it after the page has rendered. So the server sends
 * the list and the run applies `chooseTodayPersona` to it with the answer it
 * actually has, which is the same pure function `/train` calls. Nothing about
 * the roster, the personas or the selection rule changes to accommodate any of
 * this. It is a read.
 */

import { supabaseServer } from '@/lib/db/server'
import { uiLevel } from './progression'
import type { Level } from './types'

export interface FirstRepCandidate {
  id: string
  name: string
  setting: string
  hook: string
  level: Level
  locked: boolean
}

export async function fetchFirstRepCandidates(currentLevel: Level): Promise<FirstRepCandidate[]> {
  const supabase = await supabaseServer()
  const { data: rows } = await supabase
    .from('personas')
    .select('slug, name, scene, setting_label, hook, level')
    .eq('track', 'dating')
    .eq('published', true)
    .order('level')

  /**
   * `locked` is `level > currentLevel`, which is the same statement the roster
   * read makes the long way round. `profiles.current_level` is the mirror
   * `syncLevel` maintains from the qualifying sessions, so deriving it here
   * from the sessions again would be a second implementation of one rule —
   * which is exactly how a roster and a stored ladder position come to
   * disagree.
   */
  return (rows ?? []).map((row) => {
    const level = uiLevel(row.level)
    return {
      id: row.slug,
      name: row.name,
      setting: row.setting_label ?? row.scene,
      hook: row.hook ?? '',
      level,
      locked: level > currentLevel,
    }
  })
}
