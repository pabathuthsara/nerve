/**
 * What a share card says, and what it is forbidden from saying (§08, §14, §18).
 *
 * Organic distribution is a survival requirement rather than a growth channel
 * (§18): dating-adjacent ad creative is regularly banned on Meta and TikTok,
 * so the artefacts people post themselves are the channel.
 *
 * **This is the one part of the product with real positioning risk, so the
 * guardrails are code.** §14 records that every merchant of record on the
 * shortlist bans dating products by name and that a human reviews what we
 * publish. A card is the thing that reviewer is most likely to find, usually
 * screenshotted out of context — so the rules below are enforced by
 * `assertPublishable`, not requested in a comment:
 *
 *   no phone number, ever, in any field
 *   no "her number", no trophy framing — a rep win reads as a level cleared
 *   character first name only, never a surname, portrait or scene
 *   no email, no display name, nothing that identifies the person sharing
 *   the product line rides on every card, so it says what this is out of context
 *
 * A card that fails any of those does not get made. Throwing is right here and
 * wrong almost everywhere else in this codebase: the failure mode is a public
 * artefact, and not publishing is always recoverable.
 */

export type ShareCardKind = 'rejections' | 'weekly' | 'streak' | 'baseline' | 'rep_win'

export interface ShareCard {
  kind: ShareCardKind
  /** The hero figure. Large, tabular, the only volt on the card. */
  headline: string
  /** One hand-written line under it. */
  line: string
  /** Small caps above the figure. */
  label: string
}

/** Stamped on every card so the artefact says what the product is. */
export const PRODUCT_LINE = 'NERVE · conversation training'

/**
 * Anything that would make a reviewer read this as a dating product, or that
 * would identify the person sharing it.
 *
 * Deliberately broad. A false positive costs one card; a false negative costs
 * the payment account (§14), and those are not comparable.
 */
const FORBIDDEN = [
  { pattern: /\+?\d[\d\s().-]{6,}\d/, why: 'looks like a phone number' },
  { pattern: /\bher number\b|\bhis number\b|\bgot the number\b|\bdigits\b/i, why: 'frames the rep as getting a number' },
  { pattern: /\b(hookup|hook up|pickup|pick-up|seduc\w*|score[ds]?\s+a\s+date|conquest|smash)\b/i, why: 'reads as a dating product' },
  { pattern: /@[\w.-]+\.\w{2,}/, why: 'contains an email address' },
  { pattern: /\b(girlfriend|boyfriend|dating app|match(ed)? with)\b/i, why: 'reads as a relationship product' },
] as const

export class UnpublishableCard extends Error {}

/**
 * The last gate before a card exists.
 *
 * Checks every visible string, not just the line: a headline is as public as
 * anything else, and a payload assembled from a template is exactly where an
 * unexpected value arrives.
 */
export function assertPublishable(card: ShareCard): void {
  const fields = [card.headline, card.line, card.label]
  for (const value of fields) {
    for (const rule of FORBIDDEN) {
      if (rule.pattern.test(value)) {
        throw new UnpublishableCard(`Refused: ${rule.why} — "${value}"`)
      }
    }
  }
}

function build(card: ShareCard): ShareCard {
  assertPublishable(card)
  return card
}

/** 10 / 25 / 50 / 100 refusals collected (§09). */
export function rejectionsCard(input: { count: number; meanPredicted: number | null; meanActual: number | null }): ShareCard {
  const gap = input.meanPredicted !== null && input.meanActual !== null
    ? `Expected ${input.meanPredicted} out of ten. It cost ${input.meanActual}.`
    : 'Every one of them was survivable. That is the whole finding.'
  return build({
    kind: 'rejections',
    label: 'Rejections collected',
    headline: String(input.count),
    line: gap,
  })
}

/** The Sunday letter, as an artefact. */
export function weeklyCard(input: { asksMade: number; rejections: number; reps: number }): ShareCard {
  return build({
    kind: 'weekly',
    label: 'This week',
    headline: String(input.rejections),
    line: `${input.reps} rehearsed, ${input.asksMade} asked for real, turned down ${input.rejections} times.`,
  })
}

/** 7 / 14 / 30 / 60 days trained (§09). */
export function streakCard(input: { days: number }): ShareCard {
  return build({
    kind: 'streak',
    label: 'Days trained',
    headline: String(input.days),
    line: 'One rep a day. The practice is the point, not any single conversation.',
  })
}

/** Week four against day one (§08). */
export function baselineCard(input: { then: number; now: number; days: number }): ShareCard {
  const delta = input.now - input.then
  return build({
    kind: 'baseline',
    label: 'Composure score',
    headline: `${input.then} → ${input.now}`,
    line: delta > 0
      ? `${input.days} days of practice, measured the same way both times.`
      : `${input.days} days apart, measured the same way both times.`,
  })
}

/**
 * A rep that went well — the card §08 flags as the real positioning risk.
 *
 * It reads as a LEVEL CLEARED with the process score present, never as a
 * trophy. No number is rendered, no copy says "her number", and the character
 * is a first name with no portrait and no scene. What a merchant-of-record
 * reviewer finds is a training product with a score on it.
 */
export function repWinCard(input: {
  level: number
  personaFirstName: string
  durationMs: number
  composite: number
  strongestLabel: string
  strongestValue: number
}): ShareCard {
  const minutes = Math.floor(input.durationMs / 60_000)
  const seconds = Math.floor((input.durationMs % 60_000) / 1000)
  return build({
    kind: 'rep_win',
    label: `Level ${String(input.level).padStart(2, '0')} cleared`,
    headline: String(input.composite),
    line: `${minutes}:${String(seconds).padStart(2, '0')} against ${firstNameOnly(input.personaFirstName)} · ${input.strongestLabel.toLowerCase()} ${input.strongestValue}`,
  })
}

/** First token only. A surname on a card is a person, not a character. */
function firstNameOnly(name: string): string {
  return (name.trim().split(/\s+/)[0] ?? '').slice(0, 24)
}
