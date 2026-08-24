/**
 * Personality, expressed as arithmetic instead of adjectives.
 *
 * LAYER 2 of the persona schema described eight characters in some detail and
 * then moved none of them: the engine read `trajectory` and nothing else,
 * `scoreFast` took a level, `classifyOverreach` took two numbers. Sharpness,
 * humour, patience, distraction and signal clarity existed only in the contract
 * prose and the steering line.
 *
 * So all eight characters were MOVED by exactly the same things. A joke that
 * landed on Nadia (humour 60) was worth precisely what it was worth on Alex
 * (humour 30); a nervous pause cost the same against Nadia's patience of 80 as
 * against Alex's 25. The roster read as one character at eight difficulties,
 * which is what it mechanically was.
 *
 * This is the seam. Four multipliers, derived from the dials that were already
 * authored, applied where each one actually belongs:
 *
 *   penalty      what a misstep costs — patience
 *   genericGain  what an unspecific good turn earns — distraction
 *   liking       how much she warms to HIM rather than the conversation — humour
 *   comfort      how quickly she settles — patience again, more gently
 *
 * Deliberately narrow. Every multiplier stays inside a band where a well-played
 * rep still clears the same rungs, because this is meant to make the ladder feel
 * different at each step, not to re-tune the ladder — that lives in `trajectory`
 * and is checked end to end in `engine.test.ts`.
 */

import { clamp, type Personality } from '@/lib/voice/types'

export interface Temperament {
  /**
   * Multiplier on negative fast points.
   *
   * THE NERVOUSNESS QUESTION, settled per character rather than globally. A
   * short reply costs -3 and a streak another -4, and the user is nervous by
   * definition — short replies are the symptom the product exists to treat, so
   * a flat penalty means the character gets coldest exactly when they are
   * struggling most. In life some people soften toward somebody visibly
   * nervous and some do not, and that difference is precisely `patience`.
   *
   * Nadia (80) charges 0.7x. Alex (25) charges 1.25x. Neither is a bug.
   */
  penalty: number
  /**
   * Multiplier on positive fast points from a turn that is not about her or
   * the room — no callback in it.
   *
   * `distraction` is the whole obstacle on the higher rungs and it was pure
   * prose. Now a distracted character genuinely has to be reached: a good
   * generic turn earns less from Erin (70) than from Nadia (15), while a turn
   * that picks up something she actually said is worth full value from both.
   * That is the skill each of those levels claims to train.
   */
  genericGain: number
  /** Multiplier on the liking axis. High humour means a good turn lands harder. */
  liking: number
  /** Multiplier on the comfort axis. A patient character settles sooner. */
  comfort: number
}

export const NEUTRAL_TEMPERAMENT: Temperament = {
  penalty: 1,
  genericGain: 1,
  liking: 1,
  comfort: 1,
}

export function temperamentOf(personality: Personality | undefined): Temperament {
  if (!personality) return NEUTRAL_TEMPERAMENT
  const { patience, distraction, humour } = personality

  return {
    // 0.70 at patience 80, 1.00 at 50, 1.25 at 25.
    penalty: clamp(1 + (50 - patience) / 100, 0.7, 1.3),
    // 1.15 at distraction 15, 1.00 at 40, 0.80 at 70.
    genericGain: clamp(1 - (distraction - 40) / 150, 0.75, 1.2),
    // 1.30 at humour 60, 1.00 at 30.
    liking: clamp(0.7 + humour / 100, 0.8, 1.4),
    // 1.12 at patience 80, 0.90 at 25.
    comfort: clamp(0.8 + patience / 250, 0.85, 1.15),
  }
}
