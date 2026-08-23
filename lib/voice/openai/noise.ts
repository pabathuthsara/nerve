/**
 * Phantom turn detection.
 *
 * Speech-to-text models hallucinate on noise. Given a buffer of a fan, a chair,
 * or a door, they do not return an empty string — they return confident text,
 * very often in a script that has nothing to do with the session language.
 * Round 10's four live reps produced six of these:
 *
 *     "好。"  "อ่า เนาะ"  "ヘイレ"  "啊。"  "什拉卡姆斯"  "في يوسف"
 *
 * Each one is expensive in four separate ways, which is why they are worth a
 * module of their own rather than a filter in the UI:
 *
 *  1. It is a user turn, so the response gate creates a reply to it. The
 *     character answers a question nobody asked, which from the user's seat is
 *     her interrupting at random.
 *  2. It resets the double-turn guard, so a genuine double turn goes undetected.
 *  3. It reaches the warmth engine. "啊。" was scored intimacy 45 and moved the
 *     meter; the slow scorer quoted HER line back as the evidence, because
 *     there was nothing in his to quote.
 *  4. It lands in the scorecard as a user turn, moving talkRatio and the
 *     question counts that §07 grades on.
 *
 * Pure. No network, no provider vocabulary.
 */

/** A turn shorter than this cannot be a sentence; it is a click or a breath. */
const MIN_SPEECH_SECONDS = 0.25

/**
 * The session is English end to end: the contract, the transcription model and
 * every audition line. A transcript with no Latin letters in it is therefore
 * not something the user said — it is what the transcriber produced when handed
 * something that was not speech.
 *
 * Deliberately narrow. This does NOT try to detect a bad English transcription
 * ("cello combs" for "Sherlock Holmes"), because that is a real turn poorly
 * heard, and round 6 proved that punishing those is worse than accepting them.
 */
const LATIN_LETTER = /\p{Script=Latin}/u

/** Sounds, not words. A transcript of only these is a noise artefact. */
const FILLER_ONLY = /^[\s.,!?…-]*(?:u+h+|u+m+|m+h*m+|a+h+|e+r+m*|h+m+)[\s.,!?…-]*$/i

export type PhantomReason =
  | 'too-short'
  | 'no-latin'
  | 'empty'
  | 'filler-only'
  /** Her own voice, back in through the microphone. See `isAgentEcho`. */
  | 'agent-echo'

export interface PhantomVerdict {
  phantom: boolean
  reason: PhantomReason | null
}

export interface PhantomInput {
  text: string
  /** Seconds of speech the VAD actually saw. Null when it cannot be known. */
  speechSeconds: number | null
}

/**
 * Whether this looks like the transcriber inventing words from noise.
 *
 * Conservative by construction: every rule here has to be one that cannot fire
 * on a real English utterance, because suppressing a genuine turn is far worse
 * than letting a phantom through. A phantom costs one odd reply; a suppressed
 * turn means the character ignores something the user actually said, which is
 * the failure mode this whole module exists to remove.
 */
export function classifyPhantom(input: PhantomInput): PhantomVerdict {
  const text = input.text.trim()

  if (text === '') return { phantom: true, reason: 'empty' }

  // Sub-quarter-second "speech" is a door or a keyboard. "ヘイレ" arrived on
  // 0.12 seconds of audio.
  if (input.speechSeconds !== null && input.speechSeconds < MIN_SPEECH_SECONDS) {
    return { phantom: true, reason: 'too-short' }
  }

  if (!LATIN_LETTER.test(text)) return { phantom: true, reason: 'no-latin' }

  // "uh" on its own is a sound, not a turn. Note this only fires when the
  // filler is the ENTIRE transcript — hesitation inside a real sentence is
  // measured by the fast scorer and must survive.
  if (FILLER_ONLY.test(text)) return { phantom: true, reason: 'filler-only' }

  return { phantom: false, reason: null }
}

export function isPhantomTurn(input: PhantomInput): boolean {
  return classifyPhantom(input).phantom
}

/* ------------------------------------------------------------------ *
 * Acoustic echo
 * ------------------------------------------------------------------ */

/**
 * Her own voice, coming back in through the microphone.
 *
 * A separate problem from the phantoms above, and the rules there cannot see
 * it: an echo of a real English sentence is long enough, Latin enough and
 * wordy enough to pass every one of them. It then lands as a USER turn, and
 * `docs/M0.md`'s fifth finding records a 42.3s rep where that happened six times
 * and voided every number in it — the warmth engine scored her lines as his
 * dead ends, and the overreach detector fired on her "Yours?" as him demanding
 * contact details.
 *
 * The root cause is the audio routing (see `attachRemote`), and that is fixed
 * separately. This exists because echo cancellation is a browser behaviour we
 * do not control: it varies by platform, it degrades with cheap hardware, and
 * a user on speakers in a hard room can defeat any of it. A transcript-level
 * check costs nothing and cannot be defeated by a laptop.
 */

/** Words too common to carry evidence of an echo on their own. */
const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'i',
  'if', 'in', 'is', 'it', 'its', 'me', 'my', 'no', 'not', 'of', 'on', 'or',
  'so', 'that', 'the', 'to', 'up', 'was', 'we', 'yeah', 'yes', 'you', 'your',
])

function contentTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s']/gu, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 1 && !STOPWORDS.has(word))
}

/**
 * Share of the candidate's content words that also appear in hers.
 *
 * Asymmetric on purpose. The microphone hears a FRAGMENT of what she said —
 * clipped by VAD at both ends — so the echo is a subset of her turn, not a
 * match for it. Scoring it as a symmetric similarity would divide by her full
 * length and miss almost every real case.
 */
export function echoOverlap(candidate: string, agentText: string): number {
  const words = contentTokens(candidate)
  if (words.length === 0) return 0
  const hers = new Set(contentTokens(agentText))
  if (hers.size === 0) return 0
  const shared = words.filter((word) => hers.has(word)).length
  return shared / words.length
}

/**
 * Two thresholds, because the timing evidence is worth a lot.
 *
 * Speech that VAD detected entirely INSIDE her playback window is already
 * suspicious — at levels 1-4 she cannot be interrupted, so nothing the user
 * says there changes her current reply anyway. A bare majority of shared
 * content words settles it.
 *
 * Speech outside that window needs to be near-identical, because a user
 * genuinely repeating her phrasing back at her ("non-fiction, huh?") is a real
 * turn, and a good one — that is a callback, which the fast scorer rewards.
 */
const ECHO_DURING_PLAYBACK = 0.6
const ECHO_AFTER_PLAYBACK = 0.85

export interface EchoInput {
  text: string
  /** Her most recent spoken turn, or null when she has not spoken yet. */
  agentText: string | null
  /** Did the whole VAD segment fall inside her playback? */
  duringAgentSpeech: boolean
}

export function isAgentEcho(input: EchoInput): boolean {
  if (!input.agentText) return false
  const threshold = input.duringAgentSpeech ? ECHO_DURING_PLAYBACK : ECHO_AFTER_PLAYBACK
  return echoOverlap(input.text, input.agentText) >= threshold
}
