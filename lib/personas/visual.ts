/**
 * What a character looks like before she has said anything.
 *
 * `presentation.ts` is the half of a character the user *reads*. This is the
 * half they *see*: the form, the motion and the colour of the avatar on the
 * roster card, the brief, the live stage and the result screen.
 *
 * Authored here, in the repo, reviewed in a pull request — the same rule as
 * personas and field challenges (§09, §16). Nothing about a character's
 * appearance is generated at runtime; `visualFor` only picks a row and adds a
 * deterministic seed.
 *
 * ## The palette rule
 *
 * Arena says Volt is the only accent, and Cool, Amber and Red are data or
 * semantic colours, never branding. So a character's identity is carried by
 * **form and motion** — the fold mode, the petal count, the tilt — and colour
 * is a constrained material ramp underneath it:
 *
 * - `deep`  graphite, barely tinted. This is what warmth 0 looks like — dark,
 *            but still legible: a guarded character is quiet, not invisible.
 * - `core`  her hue, at moderate chroma. Only fully expressed near warmth 100.
 * - `sheen` rim light and specular. Desaturated, so highlights stay neutral.
 *
 * Chroma arrives *with warmth*. At rest the whole roster is graphite and
 * nothing on the screen competes with Volt; as the meter climbs, she gains her
 * colour. The colour is the signal, which is the point.
 *
 * Every row is generated from one recipe — `hsl(h, 26%, 9%)`, `hsl(h, 46%,
 * 40%)`, `hsl(h, 24%, 78%)`, scaled by a per-character chroma factor — so the
 * roster reads as one system rather than eight decisions. Hues avoid the
 * 60–115° band entirely, which is where Volt lives. `visual.test.ts` holds
 * both of those rules to account.
 */

/** Geometry, motion and colour for one character's avatar. */
export interface PersonaVisual {
  /** Which branch of the vertex shader folds her ring. 0–7. */
  mode: number
  /** How many times that fold repeats around the ring. */
  petals: number
  /** Translucent skins stacked to make the body. 2–4. */
  layers: number
  /** Tube thickness, as a fraction of the ring radius. */
  tube: number
  /** Resting orientation in radians. Layers are separated around this. */
  tilt: readonly [number, number, number]
  /** Warmth 0. Graphite, barely her hue at all — quiet, never invisible. */
  deep: string
  /** Warmth 100. Her hue, at the chroma the recipe allows. */
  core: string
  /** Rim and specular. Desaturated on purpose. */
  sheen: string
  /** Deterministic per-identity jitter. Added by `visualFor`. */
  seed: number
}

type AuthoredVisual = Omit<PersonaVisual, 'seed'>

/**
 * The four Arena colours an avatar may never wear. Volt is the only accent on
 * any screen; Cool is a second data series; Amber and Red are semantic. An
 * avatar that borrowed one of these would be making a claim it cannot back.
 */
export const RESERVED_ARENA_COLOURS: readonly string[] = ['#c4f82a', '#7a9b1a', '#5aa9ff', '#ffb020', '#ff4d3d']

/** The eight rungs of the roster, in ladder order (§06). */
export const PERSONA_VISUAL: Record<string, AuthoredVisual> = {
  // Level 01 — receptive. Open forms, few folds, slack tilt.
  // Tess holds the bottom rung: the openest form on the roster, two layers
  // rather than three, and the fattest tube. Her hue is a green at ~140deg,
  // which is the far side of the band Volt occupies and the only unclaimed
  // arc left between Robin's teal-green and the yellows nothing may wear.
  tess:  { mode: 0, petals: 4, layers: 2, tube: 0.33, tilt: [-0.16, 0.10, -0.06], deep: '#33473a', core: '#379556', sheen: '#c1d7c8' },
  nadia: { mode: 0, petals: 3, layers: 3, tube: 0.30, tilt: [-0.20, 0.08, -0.12], deep: '#473337', core: '#a8384f', sheen: '#d7c1c5' },
  priya: { mode: 1, petals: 7, layers: 3, tube: 0.26, tilt: [0.25, -0.12, 0.18], deep: '#473343', core: '#a83892', sheen: '#d7c1d3' },
  // Level 02 — neutral. Tighter tube, more structure.
  maya: { mode: 2, petals: 5, layers: 4, tube: 0.21, tilt: [-0.30, 0.16, 0.10], deep: '#334547', core: '#389da8', sheen: '#c1d5d7' },
  jules: { mode: 3, petals: 3, layers: 3, tube: 0.30, tilt: [0.12, -0.24, -0.22], deep: '#463b34', core: '#a5663b', sheen: '#d7cac1' },
  // Level 03 — resistant. Steeper tilt, colder hue.
  erin: { mode: 4, petals: 4, layers: 3, tube: 0.28, tilt: [-0.12, -0.20, 0.28], deep: '#333c47', core: '#3869a8', sheen: '#c1cbd7' },
  sam: { mode: 5, petals: 6, layers: 3, tube: 0.27, tilt: [0.30, 0.08, -0.08], deep: '#3e3347', core: '#7438a8', sheen: '#cdc1d7' },
  // Level 04 — closed. Robin still has a hue; Alex has almost none.
  robin: { mode: 6, petals: 5, layers: 3, tube: 0.25, tilt: [-0.22, -0.16, 0.20], deep: '#33473f', core: '#38a87b', sheen: '#c1d7ce' },
  alex: { mode: 7, petals: 8, layers: 3, tube: 0.23, tilt: [0.20, 0.24, 0.04], deep: '#393b41', core: '#596288', sheen: '#c7c9d1' },

  // The interview track. Lower chroma across the board — an interviewer is a
  // room to read, not a person to warm up, so her colour says less.
  'dan-whitfield': { mode: 6, petals: 4, layers: 2, tube: 0.29, tilt: [-0.16, 0.12, -0.08], deep: '#363f44', core: '#497897', sheen: '#c4ced4' },
  'aisha-rahman': { mode: 2, petals: 6, layers: 3, tube: 0.24, tilt: [0.18, -0.10, 0.14], deep: '#44363d', core: '#974970', sheen: '#d4c4cc' },
  'marcus-vance': { mode: 7, petals: 3, layers: 2, tube: 0.31, tilt: [-0.24, -0.14, 0.10], deep: '#364441', core: '#499788', sheen: '#c4d4d1' },
  'elena-kovac': { mode: 4, petals: 8, layers: 3, tube: 0.22, tilt: [0.26, 0.18, -0.16], deep: '#3a3644', core: '#5e4997', sheen: '#c8c4d4' },
}

/** FNV-1a. Stable across sessions and machines, which is the whole point. */
export function hashIdentity(value: string): number {
  let result = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index)
    result = Math.imul(result, 16777619)
  }
  return result >>> 0
}

/**
 * The visual for a character.
 *
 * Exact id first, then a substring match on `"<id> <name>"` so that a persona
 * seeded under a longer slug still finds her row. Anything genuinely unknown
 * gets a deterministic row from the table rather than a runtime-invented one —
 * the same identity always draws the same avatar.
 */
export function visualFor(name: string, personaId?: string): PersonaVisual {
  const id = (personaId ?? '').toLowerCase().trim()
  const identity = `${id} ${name}`.toLowerCase().trim()
  const seed = hashIdentity(identity)

  const exact = PERSONA_VISUAL[id]
  if (exact) return { ...exact, seed }

  const keys = Object.keys(PERSONA_VISUAL)
  const partial = keys.find((key) => identity.includes(key))
  if (partial) return { ...PERSONA_VISUAL[partial]!, seed }

  const fallbackKey = keys[seed % keys.length]!
  return { ...PERSONA_VISUAL[fallbackKey]!, seed }
}

/** How much geometry, and how many device pixels, a given on-screen size earns. */
export interface VisualLod {
  /** Segments around the tube. */
  radial: number
  /** Segments around the ring. */
  tubular: number
  /** Device-pixel ratio ceiling. */
  pixelRatio: number
  /** Motes drifting around her. */
  motes: number
  /** Frames per second this instance is allowed. */
  fps: number
}

/**
 * Detail from **measured pixels**, never from a `size` prop.
 *
 * Six of the seven call sites pass `fill` and no size, so a prop-driven ladder
 * silently rendered the 430px live stage at the 96px tier — which is what the
 * faceting on the live orb was. Buckets are stepped so that a few pixels of
 * layout drift cannot thrash geometry rebuilds.
 */
export function lodFor(cssSize: number, devicePixelRatio: number): VisualLod {
  const dpr = Math.min(Math.max(devicePixelRatio, 1), 2)
  const pixels = Math.max(1, cssSize) * dpr
  if (pixels <= 180) return { radial: 14, tubular: 96, pixelRatio: dpr, motes: 10, fps: 24 }
  if (pixels <= 360) return { radial: 20, tubular: 144, pixelRatio: dpr, motes: 16, fps: 30 }
  if (pixels <= 720) return { radial: 32, tubular: 224, pixelRatio: dpr, motes: 28, fps: 60 }
  return { radial: 44, tubular: 320, pixelRatio: dpr, motes: 44, fps: 60 }
}
