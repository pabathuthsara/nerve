'use server'

/**
 * Saving a tuning to the persona file it came from.
 *
 * The bench used to print a block for you to paste. This writes it, because a
 * panel whose save button is a clipboard is a panel that has not saved.
 *
 * **Local only, and that is not a limitation to work around.** Three gates,
 * all of them here rather than in the component, because a hidden button is
 * not a boundary:
 *
 *   1. `NODE_ENV !== 'production'`. Vercel's filesystem is read-only and
 *      ephemeral — a write there would either throw or vanish at the next
 *      deploy, and a save that silently disappears is worse than no save.
 *   2. The caller is on `ADMIN_EMAILS`.
 *   3. The slug is one the registry already knows. This is the one that
 *      matters most: the path is built from a user-supplied string, and
 *      without the check `../../` reaches anything the dev server can write.
 *      An allowlist of known slugs is the only form of this check that cannot
 *      be argued with.
 *
 * What it does NOT do is commit. The change lands in your working tree as a
 * diff of numbers, and `git diff lib/personas/` is the review step rule 8 asks
 * for — the same review a pasted block would have got, minus the pasting.
 */

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { adminUser } from '@/lib/db/admin-gate'
import { PERSONA_SLUGS } from '@/lib/personas'
import { applyDialEdits, type DialEdit } from '@/lib/tuning/patch'

export interface SaveDialsResult {
  ok: boolean
  message: string
}

/** Where a persona's source lives, once the slug is known to be real. */
function fileFor(slug: string): string {
  return path.join(process.cwd(), 'lib', 'personas', `${slug}.ts`)
}

export async function saveDials(slug: string, edits: DialEdit[]): Promise<SaveDialsResult> {
  if (process.env.NODE_ENV === 'production') {
    return { ok: false, message: 'Saving is local only — this deployment has a read-only filesystem.' }
  }

  const user = await adminUser()
  if (!user) return { ok: false, message: 'Not signed in as an admin.' }

  // Allowlist, not sanitisation. A slug that is not already a character is not
  // a path worth repairing.
  if (!PERSONA_SLUGS.includes(slug)) {
    return { ok: false, message: `No character called "${slug}".` }
  }

  if (edits.length === 0) return { ok: false, message: 'Nothing has moved.' }

  const file = fileFor(slug)
  let source: string
  try {
    source = await readFile(file, 'utf8')
  } catch {
    return { ok: false, message: `Could not read lib/personas/${slug}.ts.` }
  }

  const { source: next, applied, missed } = applyDialEdits(source, edits)

  // A miss means the file is shaped differently from what the patcher expects,
  // and a partial write of a character's dials is worse than none: half the
  // tuning you heard, with no sign of which half. Refuse and say which.
  if (missed.length > 0) {
    return {
      ok: false,
      message: `Nothing written. ${missed.length} dial${missed.length === 1 ? '' : 's'} could not be found in the file: ${missed.join(', ')}.`,
    }
  }

  try {
    await writeFile(file, next, 'utf8')
  } catch {
    return { ok: false, message: `Could not write lib/personas/${slug}.ts.` }
  }

  return {
    ok: true,
    message: `Saved ${applied.length} dial${applied.length === 1 ? '' : 's'} to lib/personas/${slug}.ts. Check it with git diff.`,
  }
}
