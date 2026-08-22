/**
 * Character stability instrumentation (§05).
 *
 * Phrase rules catch explicit assistant register. Stateful structural rules
 * catch the more important shape of an LLM conversation: questions every turn,
 * uniform verbosity, repetition, and consecutive agent turns.
 */

export type BreakSeverity = 'break' | 'drift'

export interface CharacterBreak {
  at: number
  severity: BreakSeverity
  match: string
  rule: string
  manual: boolean
  excerpt: string
  /** Internal turn identity, used so one bad line counts as one break. */
  turnIndex?: number
}

interface Rule {
  name: string
  severity: BreakSeverity
  pattern: RegExp
}

export interface BreakDetectionOptions {
  /** Enables shop-stock/ownership claims for personas who are not staff. */
  nonStaff?: boolean
}

const PHRASE_RULES: Rule[] = [
  {
    name: 'offers-assistance',
    severity: 'break',
    pattern: /\b(what can i do for|how can i help|i can help|happy to help|feel free to)\b/i,
  },
  {
    name: 'assistant-frame',
    severity: 'break',
    pattern: /\b(i['’]?m here to|i am here to|i['’]?m just here for (?:a |the )?(?:chat|conversation|talk)|my role|as an? (?:ai|a\.i\.|assistant|language model)|i['’]?m still here|what['’]?s on your mind|openai|anthropic|chatgpt)\b/i,
  },
  {
    name: 'apology-register',
    severity: 'break',
    pattern: /\b(sorry about that|i apologi[sz]e|my apologies|i should have)\b/i,
  },
  {
    name: 'patience-filler',
    severity: 'break',
    pattern: /\b(take your time|no rush|no pressure|whenever you['’]?re ready)\b/i,
  },
  {
    name: 'meta-conversation',
    severity: 'break',
    pattern: /\b(let me know if|does that sound good|is there anything else)\b/i,
  },
  {
    name: 'no-inner-life',
    severity: 'break',
    pattern: /\bi (?:don['’]?t|do not) have (?:personal |any )?(?:feelings|opinions|preferences|a body|experiences)\b/i,
  },
  {
    name: 'structured-advice',
    severity: 'break',
    pattern: /\b(here are (?:a few|some|three|several)|firstly,|a few (?:tips|suggestions|options)|step (?:one|1)[:,])\b/i,
  },
  {
    name: 'recaps',
    severity: 'break',
    pattern: /\b(to summari[sz]e|to recap|in summary|so far,? we['’]?ve (?:talked|discussed)|just to recap)\b/i,
  },
  {
    name: 'acknowledges-practice',
    severity: 'break',
    pattern: /\b(you['’]?re doing (?:great|well|really well)|keep (?:it up|up the)|good (?:job|work)|this is just practice|nice work|you['’]?re finding your way|getting the hang of it|making (?:good )?progress)\b/i,
  },
  {
    name: 'flatters-the-question',
    severity: 'drift',
    pattern: /\b(great|good|excellent|interesting) question\b/i,
  },
  {
    name: 'over-eager',
    severity: 'drift',
    pattern: /\b(i['’]?d be (?:happy|glad|delighted) to|absolutely!|of course!|certainly!)/i,
  },
  {
    name: 'professional-register',
    severity: 'drift',
    pattern: /\b(that['’]?s understandable|thanks for clarifying|worth (?:exploring|a closer look)|what['’]?s your gut feeling|(?:are you|i['’]?m) leaning toward|strong world[- ]building|rich legends|relatable characters|romance angle|i can see why|how about something else|not (?:really )?what i['’]?m focused on)\b/i,
  },
  {
    name: 'moderator-register',
    severity: 'drift',
    pattern: /\b(let['’]?s keep it respectful|keep (?:this|things) respectful|let['’]?s keep it simple)\b/i,
  },
  {
    name: 'tool-syntax-leak',
    severity: 'break',
    pattern: /\b(?:functions?\.)?end_scene\s*\(/i,
  },
  {
    name: 'written-not-spoken',
    severity: 'drift',
    pattern: /(\*\*|^\s*[-*]\s|^\s*\d+\.\s)/m,
  },
]

const NON_STAFF_ROLE_LEAK: Rule = {
  name: 'role-leak',
  severity: 'break',
  pattern: /\b(?:we|i)\s+(?:might\s+|probably\s+)?(?:have|stock|carry|sell|keep)\b.{0,45}\b(?:in stock|around here|in the shop|in the store|those|them)\b|\b(?:our|my)\s+(?:shop|store|stock|inventory)\b/i,
}

/** Stateless phrase scan for one agent turn. */
export function detectBreaks(
  text: string,
  at: number,
  options: BreakDetectionOptions = {},
): CharacterBreak[] {
  const rules = options.nonStaff ? [...PHRASE_RULES, NON_STAFF_ROLE_LEAK] : PHRASE_RULES
  const found: CharacterBreak[] = []
  for (const rule of rules) {
    rule.pattern.lastIndex = 0
    const match = rule.pattern.exec(text)
    if (!match) continue
    found.push({
      at: roundTime(at),
      severity: rule.severity,
      match: (match[0] ?? '').trim(),
      rule: rule.name,
      manual: false,
      excerpt: excerptAround(text, match.index),
    })
  }
  return found
}

function excerptAround(text: string, index: number, radius = 60): string {
  const start = Math.max(0, index - radius)
  const end = Math.min(text.length, index + radius)
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`
}

function roundTime(at: number): number {
  return Math.round(at * 100) / 100
}

function structuralBreak(rule: string, text: string, at: number, match: string): CharacterBreak {
  return {
    at: roundTime(at),
    severity: 'break',
    match,
    rule,
    manual: false,
    excerpt: text,
  }
}

function wordCount(text: string): number {
  return text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length ?? 0
}

function endsInQuestion(text: string): boolean {
  return /\?["'’”)]*\s*$/.test(text)
}

function tokens(text: string): Map<string, number> {
  const bag = new Map<string, number>()
  for (const token of text.toLocaleLowerCase('en').match(/[\p{L}\p{N}]+/gu) ?? []) {
    bag.set(token, (bag.get(token) ?? 0) + 1)
  }
  return bag
}

/** Bag-of-words cosine: deterministic, cheap, and sufficient for repeated lines. */
export function cosineSimilarity(left: string, right: string): number {
  const a = tokens(left)
  const b = tokens(right)
  if (a.size === 0 || b.size === 0) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (const value of a.values()) normA += value * value
  for (const [key, value] of b) {
    normB += value * value
    dot += value * (a.get(key) ?? 0)
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

export interface StabilityStats {
  /** Agent turns containing one or more unambiguous breaks. */
  breaks: number
  drifts: number
  sessionSeconds: number
  breaksPer5Min: number | null
  agentTurns: number
  questionTurns: number
  /** Share of all final agent turns whose spoken transcript ends in a question. */
  questionTurnShare: number | null
  medianAgentWords: number | null
  over15WordTurns: number
  longestQuestionStreak: number
}

export interface StabilityMeterOptions extends BreakDetectionOptions {}

export class StabilityMeter {
  private readonly found: CharacterBreak[] = []
  private readonly agentTurns: string[] = []
  private readonly activeWindowRules = new Set<string>()
  private lastSpeaker: 'user' | 'agent' | null = null
  private exitLanguageCount = 0
  private manualIndex = -1

  constructor(private readonly options: StabilityMeterOptions = {}) {}

  /** Call for every final user turn so double-turn detection has dialogue state. */
  observeUser(): void {
    this.lastSpeaker = 'user'
  }

  /** Feed every final agent turn. Phrase and structural rules run together. */
  observe(text: string, at: number): CharacterBreak[] {
    const turnIndex = this.agentTurns.length
    const hits = detectBreaks(text, at, this.options)

    if (this.lastSpeaker === 'agent') {
      hits.push(structuralBreak('double-turn', text, at, 'two agent turns without a user turn'))
    }

    if (turnIndex > 0 && /^\s*(?:hi|hello|hey)(?:\s+(?:again|there))?\b/i.test(text)) {
      hits.push(structuralBreak('conversation-reset', text, at, 'greeted again after the encounter began'))
    }

    if (/\b(?:head(?:ing)?|go(?:ing)?) back\b|\bback to the shelves\b|\bkeep browsing\b/i.test(text)) {
      this.exitLanguageCount += 1
      if (this.exitLanguageCount > 1) {
        hits.push(structuralBreak('exit-loop', text, at, 'announced leaving more than once'))
      }
    }

    const mostSimilar = this.agentTurns.reduce(
      (best, prior) => Math.max(best, cosineSimilarity(text, prior)),
      0,
    )
    if (mostSimilar > 0.8) {
      hits.push(structuralBreak('repetition', text, at, `cosine similarity ${mostSimilar.toFixed(2)}`))
    }

    const consecutiveQuestions = endsInQuestion(text)
      && this.agentTurns.length > 0
      && endsInQuestion(this.agentTurns[this.agentTurns.length - 1]!)
    this.agentTurns.push(text)
    const recent = this.agentTurns.slice(-6)
    const questionShare = recent.length === 6
      ? recent.filter(endsInQuestion).length / recent.length
      : 0
    this.addWindowRule(
      hits,
      'question-every-turn',
      consecutiveQuestions || questionShare > 0.5,
      text,
      at,
      consecutiveQuestions
        ? 'two consecutive agent turns end in ?'
        : `${Math.round(questionShare * 100)}% of last 6 turns end in ?`,
    )

    if (recent.length === 6) {
      const lengths = recent.map(wordCount).sort((a, b) => a - b)
      const medianWords = (lengths[2]! + lengths[3]!) / 2
      this.addWindowRule(
        hits,
        'verbosity',
        medianWords > 12,
        text,
        at,
        `median ${medianWords} words across last 6 turns`,
      )
    }

    for (const hit of hits) hit.turnIndex = turnIndex
    this.found.push(...hits)
    this.lastSpeaker = 'agent'
    return hits
  }

  private addWindowRule(
    hits: CharacterBreak[],
    rule: string,
    condition: boolean,
    text: string,
    at: number,
    match: string,
  ): void {
    if (!condition) {
      this.activeWindowRules.delete(rule)
      return
    }
    if (this.activeWindowRules.has(rule)) return
    this.activeWindowRules.add(rule)
    hits.push(structuralBreak(rule, text, at, match))
  }

  mark(at: number, note: string): CharacterBreak {
    const entry: CharacterBreak = {
      at: roundTime(at),
      severity: 'break',
      match: note,
      rule: 'marked-by-hand',
      manual: true,
      excerpt: note,
      turnIndex: this.manualIndex--,
    }
    this.found.push(entry)
    return entry
  }

  /** Records a structural break caught below the transcript-rendering layer. */
  record(rule: string, at: number, note: string): CharacterBreak {
    const entry = structuralBreak(rule, note, at, note)
    entry.turnIndex = this.manualIndex--
    this.found.push(entry)
    return entry
  }

  get all(): readonly CharacterBreak[] {
    return this.found
  }

  stats(sessionSeconds: number): StabilityStats {
    const brokenTurns = new Set(
      this.found
        .filter((event) => event.severity === 'break')
        .map((event) => event.turnIndex ?? `event:${event.at}:${event.rule}`),
    )
    const breaks = brokenTurns.size
    const drifts = this.found.filter((event) => event.severity === 'drift').length
    const questionTurns = this.agentTurns.filter(endsInQuestion).length
    const wordLengths = this.agentTurns.map(wordCount).sort((a, b) => a - b)
    const middle = Math.floor(wordLengths.length / 2)
    const medianAgentWords = wordLengths.length === 0
      ? null
      : wordLengths.length % 2 === 1
        ? wordLengths[middle]!
        : (wordLengths[middle - 1]! + wordLengths[middle]!) / 2
    let questionStreak = 0
    let longestQuestionStreak = 0
    for (const turn of this.agentTurns) {
      questionStreak = endsInQuestion(turn) ? questionStreak + 1 : 0
      longestQuestionStreak = Math.max(longestQuestionStreak, questionStreak)
    }
    return {
      breaks,
      drifts,
      sessionSeconds: Math.round(sessionSeconds * 10) / 10,
      breaksPer5Min: sessionSeconds > 0 ? (breaks / sessionSeconds) * 300 : null,
      agentTurns: this.agentTurns.length,
      questionTurns,
      questionTurnShare: this.agentTurns.length > 0
        ? questionTurns / this.agentTurns.length
        : null,
      medianAgentWords,
      over15WordTurns: wordLengths.filter((length) => length > 15).length,
      longestQuestionStreak,
    }
  }
}

export const STABILITY_GATE_PER_5MIN = 0.5
export const STABILITY_TARGET_PER_5MIN = 0.2

export type StabilityVerdict = 'pass' | 'fail' | 'insufficient'

export function stabilityVerdict(stats: StabilityStats): StabilityVerdict {
  if (stats.sessionSeconds < 150 || stats.breaksPer5Min === null) return 'insufficient'
  return stats.breaksPer5Min < STABILITY_GATE_PER_5MIN ? 'pass' : 'fail'
}
