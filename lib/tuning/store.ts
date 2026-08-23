/**
 * The live tuning store.
 *
 * One mutable source of truth for everything the dev panel can change, read on
 * every turn rather than snapshotted at connect. That is the whole requirement:
 * sliding `sharpness` up must be audible on her NEXT reply, without restarting
 * the session — so the warmth engine and the steering composer are handed
 * getters into this store, never copies of a persona.
 *
 * Deliberately not React state. The engine and the session live outside the
 * component tree and need to read the current value synchronously from inside a
 * callback; a `useState` snapshot captured in a closure is exactly the bug this
 * exists to avoid. React subscribes to it instead.
 *
 * Dev-only in practice, but it is plain data with no dev-tools import, so
 * nothing here has to be stripped from a production build — the panel that
 * edits it is what gets gated.
 */

import type { Persona } from '@/lib/voice/types'

export interface TuningState {
  /** All four persona layers, live. */
  persona: Persona
  /** VAD threshold in milliseconds (§05, problem one). */
  silenceMs: number
  /** Character model arm. */
  model: string
  /** TTS voice, on the arm that has one. Null means the persona's own. */
  voiceId: string | null
}

export type Listener = (state: TuningState) => void

export class TuningStore {
  private state: TuningState
  private readonly initial: TuningState
  private readonly listeners = new Set<Listener>()

  constructor(initial: TuningState) {
    this.state = { ...initial, persona: clonePersona(initial.persona) }
    this.initial = { ...initial, persona: clonePersona(initial.persona) }
  }

  get(): TuningState {
    return this.state
  }

  get persona(): Persona {
    return this.state.persona
  }

  /** Shallow patch at the top level. */
  set(patch: Partial<TuningState>): void {
    this.state = { ...this.state, ...patch }
    this.emit()
  }

  /** Patch one persona layer without disturbing the others. */
  setLayer<K extends 'trajectory' | 'personality' | 'gated' | 'room'>(
    layer: K,
    patch: Partial<Persona[K]>,
  ): void {
    this.state = {
      ...this.state,
      persona: {
        ...this.state.persona,
        [layer]: { ...this.state.persona[layer], ...patch },
      },
    }
    this.emit()
  }

  /** One gate at a time; they are nested a level deeper than the rest. */
  setGate(
    name: keyof Persona['gated'],
    patch: Partial<Persona['gated'][keyof Persona['gated']]>,
  ): void {
    const gated = this.state.persona.gated
    this.state = {
      ...this.state,
      persona: {
        ...this.state.persona,
        gated: { ...gated, [name]: { ...gated[name], ...patch } },
      },
    }
    this.emit()
  }

  reset(): void {
    this.state = { ...this.initial, persona: clonePersona(this.initial.persona) }
    this.emit()
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(): void {
    for (const listener of [...this.listeners]) listener(this.state)
  }
}

/* ------------------------------------------------------------------ *
 * Presets
 * ------------------------------------------------------------------ */

/**
 * A named parameter set.
 *
 * The point is not convenience. It is that a recording and the settings that
 * produced it must be joinable after the fact — six sessions into a tuning pass
 * nobody remembers which one had decay at 0.5, and a telemetry file that cannot
 * answer that question is a file that cannot be learned from.
 */
export interface TuningPreset {
  name: string
  savedAt: string
  /** Schema version, so an old preset can be recognised rather than misread. */
  version: 1
  state: TuningState
}

const STORAGE_KEY = 'nerve.tuning.presets'

export function toPreset(name: string, state: TuningState): TuningPreset {
  return { name, savedAt: new Date().toISOString(), version: 1, state }
}

/**
 * The preset in force, stamped into session telemetry.
 *
 * Named separately from `toPreset` because this one is not user-initiated: it
 * runs at the end of every rep whether or not anything was saved, so a session
 * JSON always says which settings produced it.
 */
export function activePreset(state: TuningState): TuningPreset {
  return toPreset('active', state)
}

export function listPresets(): TuningPreset[] {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as TuningPreset[]) : []
  } catch {
    // A private window, cleared site data, or a browser refusing storage. A
    // missing preset list must never take the rep page down with it.
    return []
  }
}

export function savePreset(preset: TuningPreset): TuningPreset[] {
  const existing = listPresets().filter((entry) => entry.name !== preset.name)
  const next = [...existing, preset].slice(-50)
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* Storage refused. The preset still applies to this session. */
  }
  return next
}

export function deletePreset(name: string): TuningPreset[] {
  const next = listPresets().filter((entry) => entry.name !== name)
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* As above. */
  }
  return next
}

/** Parses a preset file. Returns null rather than throwing on anything odd. */
export function parsePreset(raw: string): TuningPreset | null {
  try {
    const parsed = JSON.parse(raw) as Partial<TuningPreset>
    if (!parsed || typeof parsed !== 'object') return null
    if (parsed.version !== 1) return null
    const state = parsed.state
    if (!state || typeof state !== 'object' || !state.persona) return null
    return {
      name: typeof parsed.name === 'string' ? parsed.name : 'imported',
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date().toISOString(),
      version: 1,
      state: state as TuningState,
    }
  } catch {
    return null
  }
}

/** Structured clone without depending on the global, which is absent in some
 *  test environments. Personas are plain JSON by construction. */
function clonePersona(persona: Persona): Persona {
  return JSON.parse(JSON.stringify(persona)) as Persona
}

/**
 * The one gate on everything in `app/rep/dev-panel`.
 *
 * WHAT THIS GUARANTEES, stated precisely, because it is easy to overclaim.
 *
 * With the flag off the panel never renders and a browser never downloads it:
 * it is behind `next/dynamic`, so it lives in its own chunk which is fetched
 * only when the component actually mounts, and two independent guards stop it
 * mounting — this constant at the call site, and a second check inside the
 * component itself.
 *
 * What it does NOT guarantee is that the chunk is absent from the build output.
 * Webpack emits a chunk for every `import()` expression whether or not the
 * branch containing it is reachable, and that holds even with the flag
 * explicitly set to `false`. The file exists on the server; nothing requests
 * it. Genuinely removing it would need a build-time alias to a stub, which is
 * more build machinery than a dev panel justifies.
 *
 * So: safe to leave off in production, not a place to put a secret.
 */
export const DEV_TOOLS = process.env.NEXT_PUBLIC_DEV_TOOLS === 'true'

export function devToolsEnabled(): boolean {
  return DEV_TOOLS
}
