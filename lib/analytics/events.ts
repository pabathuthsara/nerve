/**
 * The event catalogue, and the rule about what may travel with an event.
 *
 * Why this file is pure and separate from the SDK: §04 names PostHog, and the
 * codebase's first rule is that a vendor lives behind one module. Everything
 * here — the names, the shapes, the redaction — is testable without a network,
 * a browser, or a key, and `components/analytics.tsx` is the only file allowed
 * to import `posthog-js`.
 *
 * ── WHY THESE NINE EVENTS AND NOT OTHERS ─────────────────────────────────
 *
 * `LAUNCH-GAP.md` B7 exists because M5's gate is *week-4 retention above 25%
 * among users who did three or more reps*, and that number cannot be computed
 * from anything the product currently records. The funnel below is the shortest
 * path to computing it:
 *
 *   brief viewed → rep started → first user turn → rep completed →
 *   scorecard viewed → technique opened → focused rep started →
 *   field challenge accepted → field challenge logged
 *
 * `rep_first_user_turn` is the one that looks redundant and is not. The drop
 * between "rep started" and "the user actually said a word out loud" is the
 * product's central fear made measurable — somebody opening their microphone,
 * hearing a stranger speak, and freezing. No other pair of events can see it.
 *
 * Retention itself is not an event. PostHog computes D7 and W4 cohorts from
 * an identified person plus any activity, which is why `identifyPerson` sends
 * `signed_up_at` and a rep count and nothing else.
 */

/** The funnel, in the order it happens. */
export const FUNNEL_EVENTS = [
  'brief_viewed',
  'rep_started',
  'rep_first_user_turn',
  'rep_completed',
  'scorecard_viewed',
  'technique_opened',
  'focused_rep_started',
  'field_challenge_accepted',
  'field_challenge_logged',
] as const

export type FunnelEvent = (typeof FUNNEL_EVENTS)[number]

/**
 * What each event carries.
 *
 * Ids, enums and numbers. Never a transcript turn, a display name, an email, a
 * field-log note or a character's memory line — see `isSafeValue`.
 */
export interface EventProps {
  brief_viewed: { persona_id: string; level: number; track: string; mode: 'voice' | 'text' }
  rep_started: { persona_id: string; level: number; track: string; mode: 'voice' | 'text' }
  /** `ms_to_first_turn` is measured from the moment the connection opens. */
  rep_first_user_turn: { session_id: string; ms_to_first_turn: number }
  /**
   * `ended_by` is the adapter's own reason, not a re-derivation:
   * `character` is she left or the clock ran out, `user` is the back button,
   * `cap` is the 8-minute hard stop, `error` is the transport dying. Telling
   * the last one from the first is the point — a rep that ended because the
   * connection dropped is a reliability failure wearing a rejection's clothes.
   */
  rep_completed: { session_id: string; duration_ms: number; ended_by: 'user' | 'character' | 'cap' | 'error' }
  scorecard_viewed: { session_id: string; composite: number }
  technique_opened: { slug: string; from: 'library' | 'scorecard' | 'train' }
  focused_rep_started: { persona_id: string; focus: string }
  field_challenge_accepted: { challenge_id: string; tier: number; predicted_anxiety: number }
  field_challenge_logged: { challenge_id: string; tier: number; predicted_anxiety: number; actual_anxiety: number; asked: boolean }
}

/**
 * What we are willing to say about a person, for cohorting and nothing else.
 *
 * Deliberately three fields, and deliberately not `reps_completed`. M5's gate
 * is *week-4 retention above 25% among users who did three or more reps*, and
 * the obvious way to serve it is a running count on the person — which is a
 * number that is wrong between every rep and its next identify call. The
 * cohort is defined on the event stream instead: *performed `rep_completed` at
 * least 3 times*. That is exact, it is recomputed whenever the question is
 * asked, and it cannot drift from the sessions table.
 *
 * No email, no display name. PostHog keys on the account id and there is
 * nothing this product needs to ask it that a name would answer.
 */
export interface PersonTraits {
  plan: string
  level: number
  streak_days: number
}

/**
 * The routes session replay must never run on.
 *
 * §04's table says it in one line — *"Session replay disabled on the
 * live-session route for privacy"* — and the reason is that a replay of a live
 * rep is a recording of somebody being bad at talking to a stranger, with the
 * transcript drawn on screen. That is the single most sensitive artefact this
 * product creates.
 *
 * Text mode is on the list for the same reason even though the spec does not
 * name it: the thread is on screen, so a replay of `/text/nadia` is a
 * transcript by another route. So is a saved scorecard, and so is the field
 * log, where somebody has written down what happened when they approached a
 * stranger in real life.
 *
 * Checked here rather than in the provider so it is a tested rule instead of a
 * condition somebody can forget to re-add when a route is renamed.
 */
const REPLAY_FORBIDDEN = ['/rep/', '/text/', '/session/', '/interview/rep/', '/field'] as const

export function sessionReplayAllowed(pathname: string): boolean {
  return !REPLAY_FORBIDDEN.some((prefix) => pathname === prefix.replace(/\/$/, '') || pathname.startsWith(prefix))
}

/**
 * Whether a value may leave the device.
 *
 * Numbers and booleans always may. A string may only if it is an identifier —
 * a slug, a uuid, an enum member — and never if it is prose. The bound is
 * deliberately crude and deliberately tight: no spaces, 64 characters, and a
 * character class that a sentence cannot satisfy.
 *
 * This is the §16 rule applied to a third party. A transcript turn, a name, an
 * email or a field-log note reaching an analytics vendor is the same class of
 * failure as one reaching a share card, and `assertPublishable` is the
 * precedent for checking it in code rather than in a style note.
 */
export function isSafeValue(value: unknown): boolean {
  if (value === null) return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'boolean') return true
  if (typeof value === 'string') return /^[A-Za-z0-9_.:@/-]{1,64}$/.test(value)
  return false
}

/**
 * Strip anything that must not travel, and say so loudly in development.
 *
 * The asymmetry is the point, and it is the same one `lib/safety/assess.ts`
 * argues for. In development an unsafe property is a bug in the calling code
 * and throwing is how it gets found before it ships. In production a live rep
 * is in progress and §05 does not allow instrumentation to end it, so the
 * property is dropped and the event still goes.
 */
export function safeProps(
  props: Record<string, unknown>,
  isProduction = process.env.NODE_ENV === 'production',
): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {}
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined) continue
    if (!isSafeValue(value)) {
      if (!isProduction) {
        throw new Error(
          `analytics: property "${key}" is not an id, enum, number or boolean and must not be sent. ` +
            `Free text never leaves the device — see lib/analytics/events.ts.`,
        )
      }
      continue
    }
    out[key] = value as string | number | boolean | null
  }
  return out
}
