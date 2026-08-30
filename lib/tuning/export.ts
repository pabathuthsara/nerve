/**
 * Dials back out as the TypeScript you paste into `lib/personas/<slug>.ts`.
 *
 * This is the admin panel's real output, and the reason is rule 8: content is
 * authored in the repo, reviewed in a pull request, and seeded — never written
 * at runtime. A panel that saved a flirtiness ceiling straight to the database
 * would be changing what a character is willing to say without anybody reading
 * the diff, which is the exact review step §16 depends on.
 *
 * It would also not work. Both voice paths resolve a character through
 * `getPersona()` against the TypeScript registry — `app/api/voice/token` for
 * OpenAI and `lib/voice/elevenlabs/server.ts` for the adapter — and the
 * `personas` table is roster metadata, so `sessions.persona_id` has something
 * to point at. `scripts/seed-personas.ts` says so in its own header: *"The rep
 * path still reads the registry."* A panel writing dials to that table would
 * look like it worked and change nothing.
 *
 * So the loop is: tune here, copy, paste, commit. Which is slower than a save
 * button by exactly one paste, and keeps every change to a character in the
 * history where the rest of them already are.
 *
 * Formatting matches the existing files by hand — two-space indent, the layer
 * comments, trailing commas — so the paste is a diff of the numbers that
 * changed and nothing else.
 */

import type { Gated, Personality, RoomConfig, Trajectory } from '@/lib/voice/types'

export interface PersonaDials {
  trajectory: Trajectory
  personality: Personality
  gated: Gated
  room: RoomConfig
}

/** A number as it should read in source: no trailing `.0`, no exponent. */
function num(value: number): string {
  if (!Number.isFinite(value)) return '0'
  // Rounded to the precision the sliders actually offer. `0.05` steps and
  // floating point produce 0.30000000000000004, which is not a number anybody
  // wants to read in a reviewed file.
  const rounded = Math.round(value * 1000) / 1000
  return String(rounded)
}

function str(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

export function formatScalar(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'number') return num(value)
  if (typeof value === 'string') return str(value)
  if (typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return `[${value.map(formatScalar).join(', ')}]`
  return 'null'
}

/** One flat object, one key per line, at the given indent. */
function block(record: Record<string, unknown>, indent: string): string {
  return Object.entries(record)
    .map(([key, value]) => `${indent}${key}: ${formatScalar(value)},`)
    .join('\n')
}

/** The gates, which are one nested object each and read better on one line. */
function gatesBlock(gated: Gated, indent: string): string {
  return Object.entries(gated)
    .map(([key, gate]) => {
      const inner = Object.entries(gate as Record<string, number>)
        .map(([field, value]) => `${field}: ${num(value)}`)
        .join(', ')
      return `${indent}${key}: { ${inner} },`
    })
    .join('\n')
}

/**
 * The four layers, ready to paste over the ones in the persona file.
 *
 * Deliberately not the whole file. The contract, the want, the scene beats and
 * the exit conditions are prose somebody wrote, and regenerating them from a
 * form is how hand-authored copy quietly becomes machine-authored copy.
 */
export function dialsToSource(dials: PersonaDials): string {
  const { trajectory, personality, gated, room } = dials
  return [
    '  // LAYER 1 — where warmth starts and how it moves.',
    '  trajectory: {',
    block(trajectory as unknown as Record<string, unknown>, '    '),
    '  },',
    '',
    '  // LAYER 2 — who she is. None of this moves with warmth.',
    '  personality: {',
    block(personality as unknown as Record<string, unknown>, '    '),
    '  },',
    '',
    '  // LAYER 3 — what she opens up to, and when.',
    '  gated: {',
    gatesBlock(gated, '    '),
    '  },',
    '',
    '  // LAYER 4 — the room.',
    '  room: {',
    block(room as unknown as Record<string, unknown>, '    '),
    '  },',
  ].join('\n')
}

/** Which dials differ from the ones in the repo, for the "what changed" line. */
export function changedDials(base: PersonaDials, next: PersonaDials): string[] {
  const changed: string[] = []
  const walk = (a: unknown, b: unknown, path: string) => {
    if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a)) {
      for (const key of Object.keys(a as Record<string, unknown>)) {
        walk((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], path ? `${path}.${key}` : key)
      }
      return
    }
    if (JSON.stringify(a) !== JSON.stringify(b)) changed.push(path)
  }
  walk(base, next, '')
  return changed
}
