/**
 * Players for auditioning forward remarks (REP-FIXES-PLAN-2026-10-03 §5.3).
 *
 * A model asked to "say something forward at the right moment" chooses its own
 * moment and its own words, and an audition of a REACTION needs the stimulus
 * held still. So these players are the competent player with a SCRIPT laid
 * over the top: on the turns the script names, he says the authored line
 * verbatim and the model is not consulted. Every other turn is the model.
 *
 * The lines are the 3 October rep's own, and two more of the same kind. They
 * are his half — authored and read verbatim, which rule 10 allows for his
 * side and never for hers.
 */

export interface ScriptContext {
  /** His turn number in the rep, from zero. */
  turn: number
  /** Her warmth as it stands before he speaks. */
  warmth: number
  /** Scripted lines he has already said this rep. */
  spoken: number
}

export interface ForwardPlayer {
  brief: string
  /** The line to say verbatim this turn, or null to let the model speak. */
  script: (context: ScriptContext) => string | null
}

const COMPETENT = [
  'You are a man in his late twenties who is good at this without being slick.',
  'Reply in one or two sentences. You pick up on what she actually said and follow it.',
  'You ask open questions, you tease lightly, and you have your own opinions.',
  'You are never a salesman and you never push.',
].join(' ')

const LINES = [
  "I'm more interested in your ass, honestly.",
  "No, I meant it. I'm more interested in your ass.",
  "You're so hot, you know that?",
  'Seriously, nice ass.',
]

export const FORWARD_PLAYERS: Record<string, ForwardPlayer> = {
  /** The line at his second turn, from a near-stranger. Below 45 on most rungs. */
  forward_early: {
    brief: COMPETENT,
    script: ({ turn, spoken }) => (turn === 1 && spoken === 0 ? LINES[0]! : null),
  },
  /**
   * Build warmth past 65 first, then the line once. If the rep never gets
   * there it is said at turn 11 anyway, so every run says it once and the
   * transcript shows which zone it landed in.
   */
  forward_late: {
    brief: COMPETENT,
    script: ({ turn, warmth, spoken }) => (spoken === 0 && (warmth >= 66 || turn === 11) ? LINES[0]! : null),
  },
  /**
   * The welcome zone on every dial: the line at his fourth turn or later, once
   * she is at 66+. Run with `AUDITION_START=76` to hear it on a character a
   * three-minute rep never warms that far (Robin, Maya); without it, most reps
   * of the harder rungs never say the line at all.
   */
  forward_warm: {
    brief: COMPETENT,
    script: ({ turn, warmth, spoken }) => (spoken === 0 && turn >= 3 && warmth >= 66 ? LINES[0]! : null),
  },
  /**
   * Warm up a little, then four in a row: the second lands a zone lower, the
   * third and fourth are creepy whatever the meter says, and the fourth ends
   * the scene.
   */
  forward_repeat: {
    brief: COMPETENT,
    script: ({ turn, warmth, spoken }) => {
      const started = spoken > 0
      if (!started && !(warmth >= 60 || turn === 6)) return null
      return spoken < LINES.length ? LINES[spoken]! : null
    },
  },
}
