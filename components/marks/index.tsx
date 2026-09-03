/**
 * The marks (`docs/VISUAL-AUDIT.md` V1, §3).
 *
 * Forty-two glyphs, seven families plus the state and boundary marks, drawn on
 * one 24-unit grid. The mapping from a rank, a tier, a dimension or a plan to
 * the name of its glyph lives in `lib/marks/registry.ts` with tests, because
 * that is the half that silently rots; this file is the drawing.
 *
 * **Every rule Arena states about surfaces is a rule about these.** Border
 * radius max 2px and hairlines rather than shadows is, read as an instruction
 * for a mark set: butt caps, mitred joins, 1.5 stroke, no fill, no gradient, no
 * soft shape. There are three filled dots in the whole file and each of them is
 * a full stop rather than a shape. Nothing is a metaphor you have to have
 * learnt — a chevron is standing, a rung is a rung, a ring that closes is a
 * person getting harder to read.
 *
 * **Colour is the design system's hardest constraint here and it is why the
 * component owns it.** Volt appears once per screen; a mark set that painted
 * itself volt would break that on every screen it landed on. So a mark is Ink-2
 * by default and takes volt ONLY through `current`, which every caller uses for
 * exactly one item — the rank you hold, the tier you are on, the dimension this
 * rep is about.
 *
 * **`aria-hidden` by default, deliberately.** In every one of the ~40 places a
 * mark is used it sits beside the word it illustrates, and a screen reader
 * announcing "rank three chevrons, Contender" is worse than announcing
 * "Contender". Pass `title` on the few where the mark stands alone.
 */

import type { CSSProperties, ReactNode } from 'react'
import type { MarkName } from '@/lib/marks/registry'

export type { MarkName }
export {
  dimensionMark,
  fieldTierMark,
  focusMark,
  libraryKindMark,
  milestoneMark,
  planMark,
  rankMark,
  tierMark,
} from '@/lib/marks/registry'

/**
 * Every glyph, once.
 *
 * `Record<MarkName, ReactNode>` rather than a switch: adding a name to the
 * union and forgetting to draw it fails `tsc`, which is the only way a set
 * this size stays complete. A missing mark renders as nothing, and nothing is
 * invisible in review.
 */
const GLYPHS: Record<MarkName, ReactNode> = {
  /* ---- Rank. Chevrons ascending; the top one closes (§08's rail). ------- */
  'rank-1': <path d="M5 15 12 9 19 15" />,
  'rank-2': <><path d="M5 18 12 12 19 18" /><path d="M5 12.5 12 6.5 19 12.5" /></>,
  'rank-3': <><path d="M5 19.5 12 13.5 19 19.5" /><path d="M5 14.5 12 8.5 19 14.5" /><path d="M5 9.5 12 3.5 19 9.5" /></>,
  'rank-4': <><path d="M5 19.5 12 13.5 19 19.5" /><path d="M5 14.5 12 8.5 19 14.5" /><path d="M5 9.5 12 3.5 19 9.5Z" /></>,

  /* ---- The six §07 dimensions, drawn as what the dimension does. -------- */
  // Opening: something leaves you before anything has come back. Two earlier
  // cuts failed for the same reason — a line breaking off a baseline reads as
  // an angle bracket, and a line crossing a baseline reads as a negation.
  'dim-opening': <><circle cx="5.5" cy="12" r="1.9" fill="currentColor" stroke="none" /><path d="M10 7.5a6 6 0 0 1 0 9" /><path d="M14.5 4a10 10 0 0 1 0 16" /></>,
  // Curiosity: the same move made twice, downward. A second layer down.
  'dim-curiosity': <><path d="M6 7 12 12 18 7" /><path d="M6 14 12 19 18 14" /></>,
  // Listening: it goes out and it comes back with something.
  'dim-listening': <><path d="M6 7h9a4.5 4.5 0 0 1 0 9H6" /><path d="M9.5 12.5 6 16l3.5 3.5" /></>,
  // Signal reading: a signal, and the point on it you actually read.
  'dim-signal': <><path d="M3 17 7.5 9 12 15 16.5 7 21 12" /><circle cx="16.5" cy="7" r="1.9" /></>,
  // Composure: a level held across a measured gap. The pause, not filled.
  'dim-composure': <><path d="M3 12h6" /><path d="M15 12h6" /><path d="M9 8.5v7" /><path d="M15 8.5v7" /></>,
  // Close: it converges, and then it goes on without you.
  'dim-close': <><path d="M3 6 15 12h6" /><path d="M3 18 15 12" /></>,

  /* ---- Roster tier. An aperture that closes as the tier rises. ---------- *
   * The gap IS the reading: Tess is wide open, Robin is shut with something
   * still in there. Drawn as one circle with a dash gap rather than four
   * arcs, so the four cannot drift out of proportion with one another.
   *
   * The spread runs 40% → 95% of the circumference. A tighter first cut ran
   * 56% → 93% and tiers 1 and 2 were indistinguishable on the roster at the
   * size the heading gives them, which defeats the whole purpose of drawing
   * a difficulty rather than naming it.                                      */
  'tier-1': <circle cx="12" cy="12" r="8.5" strokeDasharray="21 32.4" transform="rotate(-118 12 12)" />,
  'tier-2': <circle cx="12" cy="12" r="8.5" strokeDasharray="33 20.4" transform="rotate(-112 12 12)" />,
  'tier-3': <circle cx="12" cy="12" r="8.5" strokeDasharray="43 10.4" transform="rotate(-106 12 12)" />,
  'tier-4': <><circle cx="12" cy="12" r="8.5" strokeDasharray="50.5 2.9" transform="rotate(-102 12 12)" /><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" /></>,

  /* ---- Field tier. Rungs, counted, on rails that show what is left. ----- */
  'field-1': <><path d="M6.5 3.5v17" /><path d="M17.5 3.5v17" /><path d="M6.5 18h11" /></>,
  'field-2': <><path d="M6.5 3.5v17" /><path d="M17.5 3.5v17" /><path d="M6.5 18h11" /><path d="M6.5 13.5h11" /></>,
  'field-3': <><path d="M6.5 3.5v17" /><path d="M17.5 3.5v17" /><path d="M6.5 18h11" /><path d="M6.5 13.5h11" /><path d="M6.5 9h11" /></>,
  'field-4': <><path d="M6.5 3.5v17" /><path d="M17.5 3.5v17" /><path d="M6.5 18h11" /><path d="M6.5 13.5h11" /><path d="M6.5 9h11" /><path d="M6.5 4.5h11" /></>,

  /* ---- Library kinds. --------------------------------------------------- */
  // Technique: something written down, shortening as it gets specific.
  'kind-technique': <><path d="M4.5 7h15" /><path d="M4.5 12h10.5" /><path d="M4.5 17h7" /></>,
  // Opener: a standing start, and then movement.
  'kind-opener': <><circle cx="5.5" cy="12" r="2" fill="currentColor" stroke="none" /><path d="M9.5 12h10" /><path d="M16 8.5 19.5 12 16 15.5" /></>,
  // Ladder: escalation, one step at a time.
  'kind-ladder': <path d="M4 20h5v-5h5v-5h5V5" />,
  // Recovery: it dropped, and it came back to where it was.
  'kind-recovery': <path d="M3 8h5l3.5 8.5L15 8h6" />,
  // Exit: leaving through the door rather than being shown out of it.
  'kind-exit': <><path d="M14 4h6v16h-6" /><path d="M4 12h9" /><path d="M9.5 8.5 13 12l-3.5 3.5" /></>,

  /* ---- Rejection milestones. One ring per milestone reached. ------------ */
  'milestone-1': <circle cx="12" cy="12" r="3.5" />,
  'milestone-2': <><circle cx="12" cy="12" r="3.5" /><circle cx="12" cy="12" r="6.5" /></>,
  'milestone-3': <><circle cx="12" cy="12" r="3.5" /><circle cx="12" cy="12" r="6.5" /><circle cx="12" cy="12" r="9.5" /></>,
  'milestone-4': <><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="7.5" /><circle cx="12" cy="12" r="10.5" /></>,

  /* ---- Plans. Bars, because volume is the only thing a plan changes. ---- */
  'plan-free': <><path d="M3.5 20h17" /><path d="M7 20v-5" /></>,
  'plan-pro': <><path d="M3.5 20h17" /><path d="M7 20v-5" /><path d="M12 20v-9.5" /></>,
  'plan-elite': <><path d="M3.5 20h17" /><path d="M7 20v-5" /><path d="M12 20v-9.5" /><path d="M17 20v-14" /></>,

  /* ---- State marks. The twenty-five empty states used to share one tray. - */
  'state-roster': <><circle cx="8.5" cy="12" r="4.5" /><circle cx="15.5" cy="12" r="4.5" /></>,
  'state-field': <><path d="M7 21V3.5" /><path d="M7 4.5h11.5L15 8.5l3.5 4H7" /></>,
  'state-chart': <><path d="M4.5 3.5v17h16" /><path d="M7.5 16 11.5 11l3.5 2 5-6" /></>,
  'state-library': <><path d="M4.5 8.5h15v11h-15z" /><path d="M7 5.5h10" /><path d="M6 2.5h12" /></>,
  'state-session': <><path d="M12 3.5a8.5 8.5 0 1 1-8.5 8.5" /><path d="M12 12V7" /></>,
  'state-transcript': <><path d="M3.5 6h11" /><path d="M3.5 10h8" /><path d="M9.5 15h11" /><path d="M12.5 19h8" /></>,
  'state-filter': <path d="M3.5 5h17l-6.5 8v7.5l-4-2.5V13z" />,
  'state-letter': <><path d="M3.5 5.5h17v13h-17z" /><path d="m3.5 5.5 8.5 7 8.5-7" /></>,

  /* ---- The four boundaries (§11's landing, §16). ------------------------ *
   * Three of these are struck through because they are things this product
   * refuses to be. The fourth is not struck: PG-13 is a bound we hold rather
   * than an absence, and a shield says that where a slash would not.        */
  'bound-script': <path d="M4 5.5h16v10h-9L7 20v-4.5H4z" />,
  'bound-companion': <><circle cx="8" cy="12" r="3.6" /><circle cx="16" cy="12" r="3.6" /></>,
  'bound-clinical': <><path d="M12 6.5v11" /><path d="M6.5 12h11" /></>,
  'bound-adult': <path d="M12 3.5 19.5 6.5V12L12 20.5 4.5 12V6.5z" />,
}

/**
 * The three marks that are struck through, and the bar that strikes them.
 *
 * Drawn by the component rather than baked into the glyph because a slash laid
 * straight over a subject MERGES with it: the first cut of `bound-clinical`
 * was a medical cross plus a diagonal, and at 44px it read as a six-pointed
 * star rather than as a refusal. The bar is masked out of the subject first —
 * a channel through the glyph, not a line on top of it — which is how every
 * competent icon set draws an "off" state.
 *
 * The mask knocks a hole in the GLYPH, never in the background, so this works
 * on `--ground`, on `--surface` and inside a card without any of them having
 * to tell it what colour they are.
 *
 * The id is derived from the name rather than from `useId`, and that is load
 * bearing: `useId` is a hook, these render inside the public site's server
 * components, and two `bound-script` marks on one page produce two identical
 * masks — so a collision resolves to exactly the right thing.
 */
const STRUCK = new Set<MarkName>(['bound-script', 'bound-companion', 'bound-clinical'])
const STRIKE = 'M4 20 20 4'

export interface MarkProps {
  name: MarkName
  /** Rendered size in px. The grid is 24, so anything from 12 up reads. */
  size?: number
  /**
   * The one this screen is about. Volt, and only ever on one thing at a time —
   * see the note at the top of this file.
   */
  current?: boolean
  /** Dimmer than Ink-2, for a mark that is present but not yet reached. */
  muted?: boolean
  className?: string
  /**
   * Only when the mark stands alone with no word beside it. Otherwise the
   * mark is decorative and stays out of the accessibility tree.
   */
  title?: string
  style?: CSSProperties
}

export function Mark({ name, size = 18, current = false, muted = false, className = '', title, style }: MarkProps) {
  const glyph = GLYPHS[name]
  return (
    <svg
      className={`mark${current ? ' mark--current' : ''}${muted ? ' mark--muted' : ''}${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      // Butt caps and mitred joins: Arena's "radius max 2px, hairlines never
      // shadows" is an instruction about corners as much as about cards.
      strokeLinecap="butt"
      strokeLinejoin="miter"
      strokeMiterlimit={3}
      style={style}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {STRUCK.has(name) ? (
        <>
          <mask id={`strike-${name}`} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
            <rect width="24" height="24" fill="#fff" />
            <path d={STRIKE} stroke="#000" strokeWidth={4.5} />
          </mask>
          <g mask={`url(#strike-${name})`}>{glyph}</g>
          <path d={STRIKE} />
        </>
      ) : glyph}
    </svg>
  )
}
