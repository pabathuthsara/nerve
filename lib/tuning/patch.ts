/**
 * Editing a persona file in place, one number at a time.
 *
 * The tuning bench used to hand you a regenerated block to paste. This is what
 * replaced it, and the reason it edits rather than regenerates is the comments.
 * Nadia's `room` block carries four lines explaining why her ambient bed is
 * `null` — that the synthesised one was audible to the microphone and read as
 * speech. Regenerating the block from the dial values would delete that, and
 * the next person to wonder why the bookshop is silent would turn it back on
 * and reintroduce the bug.
 *
 * So this finds the one line a change belongs to and rewrites the value on it.
 * Everything else in the file — every comment, every hand-authored string, the
 * contract, the scene beats — is untouched by construction rather than by
 * care, because nothing else is ever written to.
 *
 * Pure. It takes source text in and gives source text out, so the whole thing
 * is testable without a filesystem, and the Server Action that calls it is
 * three lines of `readFile`/`writeFile` around a function with tests.
 */

import { formatScalar } from './export'

/** One dial, by the same dotted path `changedDials` produces. */
export interface DialEdit {
  /** e.g. `personality.sharpness`, `gated.flirtiness.ceiling`. */
  path: string
  value: number | string | null
}

export interface PatchResult {
  source: string
  /** Paths that were found and rewritten. */
  applied: string[]
  /**
   * Paths the file did not contain.
   *
   * Reported rather than thrown, and never silently skipped: a miss means the
   * file is shaped differently from what this expects, and the caller has to
   * be able to say so instead of reporting a save that did not happen.
   */
  missed: string[]
}

/** The four editable layers. Nothing outside them is addressable. */
const LAYERS = ['trajectory', 'personality', 'gated', 'room'] as const
type Layer = (typeof LAYERS)[number]

function isLayer(value: string): value is Layer {
  return (LAYERS as readonly string[]).includes(value)
}

/**
 * The span of one layer's object literal, as [start, end) offsets.
 *
 * Matched on the two-space indent the persona files use, so a `trajectory:`
 * appearing inside some other nested structure cannot be mistaken for the
 * layer. Returns null when the file is not shaped as expected, which the
 * caller turns into a miss rather than into a wrong edit.
 */
function layerSpan(source: string, layer: Layer): [number, number] | null {
  const open = new RegExp(`^  ${layer}: \\{$`, 'm').exec(source)
  if (!open || open.index === undefined) return null
  const start = open.index + open[0].length
  const close = source.indexOf('\n  },', start)
  if (close === -1) return null
  return [start, close]
}

/** `  key: value,` on its own line, inside the given slice. */
function replaceOwnLine(slice: string, key: string, value: string): string | null {
  const pattern = new RegExp(`^(\\s*${key}: )(.*?)(,\\s*)$`, 'm')
  if (!pattern.test(slice)) return null
  return slice.replace(pattern, (_match, head: string, _old: string, tail: string) => `${head}${value}${tail}`)
}

/** `  gate: { ceiling: 60, unlocksAt: 55 },` — one field inside the braces. */
function replaceInlineField(slice: string, gate: string, field: string, value: string): string | null {
  const line = new RegExp(`^(\\s*${gate}: \\{ )(.*?)( \\},\\s*)$`, 'm')
  const found = line.exec(slice)
  if (!found) return null
  const inner = found[2] ?? ''
  const fieldPattern = new RegExp(`(\\b${field}: )([^,}]+)`)
  if (!fieldPattern.test(inner)) return null
  const rewritten = inner.replace(fieldPattern, (_m, head: string) => `${head}${value}`)
  return slice.replace(line, `${found[1]}${rewritten}${found[3]}`)
}

/**
 * Apply the edits to the file's text.
 *
 * Edits are applied one at a time against the running result, so two changes
 * inside the same layer both land — offsets are recomputed on every pass
 * rather than captured up front.
 */
export function applyDialEdits(source: string, edits: DialEdit[]): PatchResult {
  let result = source
  const applied: string[] = []
  const missed: string[] = []

  for (const edit of edits) {
    const parts = edit.path.split('.')
    const [layer, ...rest] = parts
    if (!layer || !isLayer(layer) || rest.length === 0 || rest.length > 2) {
      missed.push(edit.path)
      continue
    }

    const span = layerSpan(result, layer)
    if (!span) { missed.push(edit.path); continue }

    const [start, end] = span
    const slice = result.slice(start, end)
    const value = formatScalar(edit.value)

    const patched = rest.length === 1
      ? replaceOwnLine(slice, rest[0] as string, value)
      : replaceInlineField(slice, rest[0] as string, rest[1] as string, value)

    if (patched === null) { missed.push(edit.path); continue }

    result = result.slice(0, start) + patched + result.slice(end)
    applied.push(edit.path)
  }

  return { source: result, applied, missed }
}

/**
 * The dotted paths and values for everything that moved.
 *
 * Mirrors `changedDials` and returns the values with it, so the caller does
 * not walk the object a second time to find what to write.
 */
export function editsBetween(base: unknown, next: unknown): DialEdit[] {
  const edits: DialEdit[] = []
  const walk = (a: unknown, b: unknown, path: string) => {
    if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a)) {
      for (const key of Object.keys(a as Record<string, unknown>)) {
        walk((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], path ? `${path}.${key}` : key)
      }
      return
    }
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      edits.push({ path, value: b as number | string | null })
    }
  }
  walk(base, next, '')
  return edits
}
