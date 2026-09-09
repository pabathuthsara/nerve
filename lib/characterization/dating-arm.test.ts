/**
 * THE DATING ARM, PINNED.
 *
 * **The only job of this file is to fail when an interview change reaches the
 * dating arm.** It asserts nothing about whether the dating behaviour is good;
 * it asserts that it is exactly what it was on 7 September 2026, before the
 * first line of interview code existed. `INTERVIEW-PLAN.md` §0 is the argument
 * and this is the enforcement — a second track gets new files beside the old
 * ones, and if one of those edits moves a dating number, the suite says so on
 * the commit that did it rather than on the evening somebody notices a
 * character reading differently.
 *
 * **Do not delete it as redundant.** The suites in `lib/warmth/`, `lib/grade/`
 * and `lib/data/` test that each piece is CORRECT, and they pass happily
 * through a deliberate retune. This one tests that nothing MOVED, which is a
 * different question and the one §0 asks.
 *
 * ── HOW TO READ A FAILURE ────────────────────────────────────────────────
 *
 * A digest mismatch on a compiled prompt means the string a character is given
 * changed. Print it — `console.log(compileInstructions(nadia, { rng }))` — and
 * diff against the previous commit. A literal mismatch anywhere else names the
 * number that moved.
 *
 * If the move was a deliberate DATING retune signed off in `PERSONA-AUDIT.md`,
 * update the expectation in the same commit and say so in the message. If it
 * was not deliberate, it is the bug this file exists to catch, and the fix
 * belongs in the interview arm.
 *
 * ── WHY DIGESTS FOR THE PROMPTS ──────────────────────────────────────────
 *
 * `compileInstructions` produces eight to nine thousand characters per
 * character and nine of them is seventy kilobytes of literal. A SHA-256 over
 * the exact string is byte-identical enforcement in one line, and the length is
 * carried alongside so a failure says how much moved. Everything short enough
 * to read is asserted as a literal instead, because a diff you can read beats a
 * hash you cannot.
 */

import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { DATING_PERSONAS, PERSONAS, RETIRED_PERSONAS } from '@/lib/personas'
import { compileInstructions } from '@/lib/voice/openai/persona'
import { ElevenLabsPersonaCompiler, deliveryFor } from '@/lib/voice/elevenlabs/persona'
import { resolvePipelineConfig, type PipelineEnv } from '@/lib/voice/elevenlabs/config'
import { seededRandom } from '@/lib/voice/seed'
import { DEFAULT_CALIBRATION, type TranscriptTurn } from '@/lib/voice/types'
import {
  BANDS,
  MAX_BAND_WORDS,
  UNSTEERED_WORD_CAP,
  bandDirective,
  bandFor,
  wordCapFor,
} from '@/lib/warmth/bands'
import { capToBudget, spokenWordCount } from '@/lib/voice/elevenlabs/truncate'
import {
  mayAskFor,
  mayStaySilentFor,
  mayVolunteerFor,
  mirrorCapFor,
  reciprocityClauses,
  type UserTurnShape,
} from '@/lib/warmth/reciprocity'
import { scoreFast } from '@/lib/warmth/fast'
import { composeSteering } from '@/lib/warmth/steering'
import {
  ARM_THRESHOLD,
  CLOSING_GRACE_MS,
  CLOSING_IDLE_MS,
  DATING_DURATION_MS,
  KEEP_THRESHOLD,
  NEAR_MISS_POINTS,
  WRAP_UP_MS,
  dueSceneBeat,
  givesNumber,
  isClosingOver,
  isTimeUp,
  repDurationMs,
  repThreshold,
  resultReading,
  shouldArm,
  shouldWrapUp,
} from '@/lib/data/rep-rules'
import { RUBRIC, buildGradeSystemPrompt, renderMetrics } from '@/lib/grade/prompt'
import { METRIC_BANDS } from '@/lib/grade/metrics'
import { rubricForPersonaName } from '@/lib/grade/track'
import { DETERMINISTIC_WEIGHT, JUDGEMENT_WEIGHT, composeScorecard, judgementMeanOf } from '@/lib/grade'
import { INTIMACY_ANCHORS, buildSystemPrompt } from '@/lib/warmth/prompt'
import { turnReservation } from '@/lib/voice/elevenlabs/combined'

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 16)
}

/**
 * Every DATING character ever authored, shipped or retired, in a stable order.
 *
 * `DATING_PERSONAS` rather than `PERSONAS`: this file's only job is to fail
 * when an interview change reaches the dating arm, so pinning the interviewers
 * here would be pinning the thing that is allowed to move. The interview
 * roster has its own suite — `lib/personas/interview/roster.test.ts` — and the
 * guard below asserts that no dating character has quietly left this list.
 */
const ROSTER = [...Object.values(DATING_PERSONAS), ...Object.values(RETIRED_PERSONAS)]
  .slice()
  .sort((a, b) => a.slug.localeCompare(b.slug))

/**
 * A FIXED SEED, because `moodFor` rolls one of three authored afternoons and an
 * unseeded compile is three different prompts. A string, because that is what
 * the pipeline really passes — the rep's own session id.
 */
const seed = () => seededRandom('characterization-seed')

describe('characterization · compiled contracts', () => {
  const EXPECTED: Record<string, { canEndScene: string; stateless: string; length: number }> = {
    alex: { canEndScene: 'e2050268400c4895', stateless: '9eebec23daa98e98', length: 7483 },
    erin: { canEndScene: '54bba64d7861b89e', stateless: 'f1d4a8f83cd32715', length: 8215 },
    jules: { canEndScene: '38f419d8139c9675', stateless: '070b0e016f4f35b4', length: 8650 },
    maya: { canEndScene: '9908e2fe96fe0879', stateless: 'e94c2c98036a87e1', length: 8565 },
    nadia: { canEndScene: '0bd36e1eed125365', stateless: 'ec287060a12b031f', length: 9210 },
    priya: { canEndScene: '98f0ca17ba372435', stateless: 'ab6ba369f7dde05a', length: 8595 },
    robin: { canEndScene: '3cb79dedb0c18fe6', stateless: '1512fc7e42cc5f1f', length: 8768 },
    sam: { canEndScene: 'b3de10df7c66e0a7', stateless: '2c0272ea79cee6d0', length: 8357 },
    tess: { canEndScene: '349aca6ed554d984', stateless: 'da4df735a50f3e59', length: 9310 },
  }

  it('covers every authored character, so a new one cannot slip past unpinned', () => {
    expect(ROSTER.map((persona) => persona.slug)).toEqual(Object.keys(EXPECTED).sort())
  })

  it.each(ROSTER.map((persona) => [persona.slug, persona] as const))(
    '%s compiles byte-identically',
    (slug, persona) => {
      const withTool = compileInstructions(persona, { canEndScene: true, rng: seed() })
      const stateless = compileInstructions(persona, { canEndScene: false, rng: seed() })
      const expected = EXPECTED[slug]!
      expect({ slug, digest: digest(withTool), length: withTool.length }).toEqual({
        slug,
        digest: expected.canEndScene,
        length: expected.length,
      })
      expect({ slug, digest: digest(stateless) }).toEqual({ slug, digest: expected.stateless })
    },
  )

  it('gives the number clause to the dating characters and to nobody else', () => {
    // Walks the WHOLE registry, interviewers included: the claim is about who
    // does not get it, so it has to see the ones that must not.
    for (const persona of [...Object.values(PERSONAS), ...Object.values(RETIRED_PERSONAS)]) {
      const compiled = compileInstructions(persona, { rng: seed() })
      expect([persona.slug, compiled.includes('# If they ask for your number')])
        .toEqual([persona.slug, persona.track === 'dating'])
    }
  })
})

describe('characterization · the pipeline arm', () => {
  /**
   * THE ENV IS INJECTED, NEVER READ.
   *
   * `resolvePipelineConfig` reads `process.env`, and `npm test` runs with none
   * of it set while production sets three keys — so a test that read the
   * ambient environment would pin whatever the machine happened to have and
   * pass or fail by accident. Both shapes are pinned explicitly instead: the
   * defaults, and the three keys the deployment actually sets. The second is
   * the one customers hear, and it is the reason `deliveryTags` is non-empty in
   * one table and empty in the other — only the v3 model takes audio markers.
   */
  const ENVS = {
    defaults: {} as PipelineEnv,
    shipped: {
      ELEVENLABS_TTS_MODEL: 'eleven_v3_conversational',
      ELEVENLABS_STABILITY: '0.85',
      PIPELINE_STT_MODEL: 'gpt-4o-transcribe',
    } as PipelineEnv,
  }

  const compile = (slug: string, env: PipelineEnv) =>
    new ElevenLabsPersonaCompiler(resolvePipelineConfig(env))
      .compile(ROSTER.find((persona) => persona.slug === slug)!, DEFAULT_CALIBRATION, { rng: seed() })

  const EXPECTED: Record<keyof typeof ENVS, Record<string, { prompt: string; tts: string; turn: string }>> = {
    defaults: {
      alex: { prompt: '6323980c56a7f928', tts: '24db3ed2807bb4d4', turn: 'f6acbfc49fa3d135' },
      erin: { prompt: '4ad1f43c242d6efc', tts: '4ee49a964282f2b6', turn: 'f6acbfc49fa3d135' },
      jules: { prompt: 'b10678e71edc9f86', tts: 'dbb369318facdfdd', turn: 'f5b2229cc620b177' },
      maya: { prompt: 'dee30cbfed14384c', tts: 'cfe6e672a4864594', turn: 'f5b2229cc620b177' },
      nadia: { prompt: '60950be998aff932', tts: 'adafe2068533ead8', turn: 'f5b2229cc620b177' },
      priya: { prompt: '3210233d94e5ffa1', tts: '870c50002ec89bb0', turn: 'f5b2229cc620b177' },
      robin: { prompt: '384f43c5996f004d', tts: '04d5e936f442ce7f', turn: 'f5b2229cc620b177' },
      sam: { prompt: '41a2c5d1fef82c67', tts: '61d52974a0e6f66a', turn: 'f6acbfc49fa3d135' },
      tess: { prompt: 'f8be2e602f2783a8', tts: 'c7244037bea4bcd6', turn: 'f5b2229cc620b177' },
    },
    shipped: {
      alex: { prompt: 'ca6b190949aebbf0', tts: '68cb66a0513de355', turn: 'f6acbfc49fa3d135' },
      erin: { prompt: 'addfc8742bff34ab', tts: '15abd07e819da5b5', turn: 'f6acbfc49fa3d135' },
      jules: { prompt: 'de1937539e2a5e77', tts: 'e4ce4f2d3895289b', turn: 'f5b2229cc620b177' },
      maya: { prompt: '32f888b2bca54f1f', tts: '6ec90fd2c54b374b', turn: 'f5b2229cc620b177' },
      nadia: { prompt: 'f315c6cd05d65c27', tts: 'bc0ec26ebfa66ab8', turn: 'f5b2229cc620b177' },
      priya: { prompt: '4911383c8844740a', tts: 'eaf47d8ed9daad75', turn: 'f5b2229cc620b177' },
      robin: { prompt: '65f30ed3f217c79c', tts: 'f0da90696682069a', turn: 'f5b2229cc620b177' },
      sam: { prompt: '9a19c8320f30880c', tts: '63159e2880527025', turn: 'f6acbfc49fa3d135' },
      tess: { prompt: 'b15c97397256c561', tts: 'fa9fbd31881dd6fb', turn: 'f5b2229cc620b177' },
    },
  }

  const CASES = (Object.keys(ENVS) as Array<keyof typeof ENVS>)
    .flatMap((key) => ROSTER.map((persona) => [key, persona.slug] as const))

  it.each(CASES)('%s · %s compiles to the same pipeline config', (key, slug) => {
    const compiled = compile(slug, ENVS[key])
    expect({
      slug,
      prompt: digest(compiled.llm.systemPrompt),
      tts: digest(JSON.stringify(compiled.tts)),
      turn: digest(JSON.stringify(compiled.turn)),
    }).toEqual({ slug, ...EXPECTED[key][slug]! })
  })

  it('holds the models, the temperature and the output ceiling', () => {
    expect({ ...compile('nadia', ENVS.defaults).llm, systemPrompt: undefined })
      .toEqual({ model: 'gpt-4.1-mini', temperature: 0.9, maxTokens: 120, systemPrompt: undefined })
    expect(compile('nadia', ENVS.defaults).stt.model).toBe('gpt-4o-mini-transcribe')
    expect(compile('nadia', ENVS.shipped).stt.model).toBe('gpt-4o-transcribe')
  })

  it('renders delivery the same way across the ladder', () => {
    const nadia = PERSONAS.nadia!
    const shipped = compile('nadia', ENVS.shipped)
    expect([10, 41, 66, 84].map((warmth) => deliveryFor(nadia, shipped, warmth))).toEqual([
      { settings: { stability: 0.85, similarity_boost: 0.75, speed: 0.9791666666666666 }, deliveryTags: ['[playful]'] },
      { settings: { stability: 0.85, similarity_boost: 0.75, speed: 1 }, deliveryTags: ['[playful]'] },
      { settings: { stability: 0.85, similarity_boost: 0.75, speed: 1.025 }, deliveryTags: ['[playful]'] },
      { settings: { stability: 0.85, similarity_boost: 0.75, speed: 1.025 }, deliveryTags: ['[playful]'] },
    ])
    // The flash model takes no audio markers, so the same character renders
    // with none. That difference is a property of the model, not of her.
    expect(deliveryFor(nadia, compile('nadia', ENVS.defaults), 41))
      .toEqual({ settings: { stability: 0.4, similarity_boost: 0.75, speed: 1 }, deliveryTags: [] })
  })
})

describe('characterization · the band table', () => {
  it('is six bands, in this order, with these numbers', () => {
    expect(BANDS.map((spec) => [spec.band, spec.min, spec.max, spec.typicalWords, spec.maxWords]))
      .toEqual([
        ['HOSTILE', -20, -1, 3, 6],
        ['CLOSED', 0, 19, 4, 8],
        ['GUARDED', 20, 39, 6, 10],
        ['OPEN', 40, 59, 7, 12],
        ['ENGAGED', 60, 79, 8, 14],
        ['INVESTED', 80, 100, 9, 15],
      ])
    expect(MAX_BAND_WORDS).toBe(15)
    expect(UNSTEERED_WORD_CAP).toBe(40)
    expect(digest(BANDS.map((spec) => `${spec.band} ${spec.directive} ${spec.permission ?? ''}`).join('')))
      // Re-baselined 8 September: the length clause of all six directives asks
      // for a fragment or a capped sentence count instead of "One sentence, N
      // words", which was a specification for prose. Every number in the table
      // above is untouched — see `bands.ts`, "A SENTENCE IS A REGISTER".
      .toBe('58c14b7c2c1cd1c4')
  })

  it('selects the same band at every seam', () => {
    // Fractional values in a seam reported OPEN for a day, which handed a
    // character at 19.5 the OPEN directive. Kept as the regression it is.
    expect([-0.5, 19.5, 39.5, 59.5, 79.5].map(bandFor))
      .toEqual(['HOSTILE', 'CLOSED', 'GUARDED', 'OPEN', 'ENGAGED'])
  })

  it('renders the same directive with and without the standing orders', () => {
    expect(bandDirective(41)).toBe(
      '[Seven or eight words. Twelve at the very most. One sentence, never two. Do not ask a question this turn unless he asked you one first. You may volunteer one small thing.]',
    )
    expect(bandDirective(41, { includeStanding: false })).toBe(
      '[Seven or eight words. Twelve at the very most. One sentence, never two. Do not ask a question this turn unless he asked you one first.]',
    )
    expect(bandDirective(65, { suppressQuestion: true, includeStanding: false })).toBe(
      '[Eight or nine words. Fourteen at the very most. One sentence, never two. No filler, no reassurance, never "take your time" or "no rush". Do not ask him anything this turn.]',
    )
  })

  it('caps at the same warmth it always has', () => {
    expect([-5, 0, 12, 20, 33, 40, 55, 60, 72, 80, 99].map(wordCapFor))
      .toEqual([6, 8, 8, 10, 10, 12, 12, 14, 14, 15, 15])
  })
})

describe('characterization · capToBudget', () => {
  const REPLY = 'Pretty much. Saturdays especially, when nobody comes in. I like it that way, honestly.'

  it('keeps whole sentences to the first boundary at or past the cap', () => {
    expect(capToBudget(REPLY, 4)).toBe('Pretty much. Saturdays especially, when nobody comes in.')
    expect(capToBudget(REPLY, 8)).toBe('Pretty much. Saturdays especially, when nobody comes in.')
    expect(capToBudget(REPLY, 15)).toBe(REPLY)
    expect(capToBudget(REPLY, 40)).toBe(REPLY)
  })

  it('always spends one sentence, so a cold band can never produce silence', () => {
    expect(capToBudget(REPLY, 1)).toBe('Pretty much.')
    expect(capToBudget('One very long sentence that runs well past any band ceiling this table has ever carried', 3))
      .toBe('One very long sentence that runs well past any band ceiling this table has ever carried')
  })

  it('counts words the way the band does, tags excluded', () => {
    expect(spokenWordCount('[warmly] Pretty much. Saturdays especially.')).toBe(4)
  })
})

describe('characterization · reciprocity', () => {
  const SHAPES: Array<[label: string, warmth: number, his: UserTurnShape | null]> = [
    ['opening turn', 28, null],
    ['grunt at GUARDED', 28, { words: 1, askedQuestion: false, disclosed: false, deadEnd: true }],
    ['grunt at OPEN', 41, { words: 1, askedQuestion: false, disclosed: false, deadEnd: true }],
    ['short answer at OPEN', 41, { words: 3, askedQuestion: false, disclosed: false, deadEnd: false }],
    ['question at CLOSED', 12, { words: 5, askedQuestion: true, disclosed: false, deadEnd: false }],
    ['question at OPEN', 41, { words: 5, askedQuestion: true, disclosed: false, deadEnd: false }],
    ['disclosure at OPEN', 41, { words: 12, askedQuestion: false, disclosed: true, deadEnd: false }],
    ['disclosure at ENGAGED', 66, { words: 12, askedQuestion: false, disclosed: true, deadEnd: false }],
    ['long turn at INVESTED', 84, { words: 30, askedQuestion: false, disclosed: true, deadEnd: false }],
  ]

  const DEAD_END_CLAUSE = 'He gave you almost nothing. Match it. Do not fill the gap for him.'

  it('decides the same way on every shape we have ever measured', () => {
    expect(SHAPES.map(([label, warmth, his]) => [
      label,
      mirrorCapFor(warmth, his),
      mayAskFor(warmth, his),
      mayVolunteerFor(warmth, his),
      mayStaySilentFor(warmth, his),
      mayStaySilentFor(warmth, his, { silentLastTurn: true }),
      reciprocityClauses(warmth, his),
    ])).toEqual([
      ['opening turn', 10, false, false, false, false, []],
      ['grunt at GUARDED', 2, false, false, true, false, [DEAD_END_CLAUSE]],
      ['grunt at OPEN', 2, false, false, false, false, [DEAD_END_CLAUSE]],
      ['short answer at OPEN', 7, false, true, false, false, []],
      ['question at CLOSED', 8, false, false, false, false, []],
      ['question at OPEN', 12, true, true, false, false, []],
      ['disclosure at OPEN', 12, true, true, false, false, []],
      ['disclosure at ENGAGED', 14, true, true, false, false, []],
      ['long turn at INVESTED', 15, true, true, false, false, []],
    ])
  })
})

describe('characterization · the fast scorer', () => {
  const turn = (text: string): TranscriptTurn => ({ speaker: 'user', text, t_start: 10, t_end: 14 })

  const HER: TranscriptTurn[] = [
    { speaker: 'agent', text: 'Tana French. Third time through.', t_start: 4, t_end: 6 },
    { speaker: 'agent', text: 'Bit of both, honestly.', t_start: 12, t_end: 13 },
    { speaker: 'agent', text: 'Logistics. It is as dull as it sounds.', t_start: 20, t_end: 22 },
    { speaker: 'agent', text: 'Sort of. Twenty minutes that way.', t_start: 30, t_end: 32 },
  ]

  const FIXTURE: Array<[label: string, text: string, deadEnds: number, opening: boolean]> = [
    ['opener', 'Hey there.', 0, true],
    ['open question', 'What made you pick that one?', 0, false],
    ['closed question', 'Do you like it?', 0, false],
    ['engaged length', 'I read the first one on a train and never finished it', 0, false],
    ['callback', 'You said logistics, is that as boring as it sounds', 0, false],
    ['dead end', 'Ok.', 0, false],
    ['dead-end streak', 'Mm.', 1, false],
    ['filler', 'um, uh, I mean, I sort of like it', 0, false],
  ]

  it('scores a fixed transcript to the same numbers with no personality', () => {
    expect(FIXTURE.map(([label, text, precedingDeadEnds, openingTurn]) => {
      const score = scoreFast(turn(text), {
        level: 2,
        agentTurns: HER,
        precedingDeadEnds,
        openingTurn,
        gapSeconds: 1.2,
      })
      return [label, score.raw, score.reasons.map((reason) => [reason.code, reason.points]), score.deadEnd]
    })).toEqual([
      ['opener', 0, [], false],
      ['open question', 3, [['open-question', 3]], false],
      ['closed question', 0, [], false],
      ['engaged length', 2, [['engaged-length', 2]], false],
      ['callback', 4, [['engaged-length', 2], ['callback', 2]], false],
      ['dead end', -6, [['dead-end', -6]], true],
      ['dead-end streak', -14, [['dead-end', -6], ['dead-end-streak', -8]], true],
      ['filler', 2, [['engaged-length', 2], ['callback', 2], ['filler-rate', -2]], false],
    ])
  })

  it('applies Nadia’s temperament to the same transcript identically', () => {
    const nadia = PERSONAS.nadia!
    expect(FIXTURE.map(([label, text, precedingDeadEnds, openingTurn]) => [
      label,
      scoreFast(turn(text), {
        level: nadia.level,
        personality: nadia.personality,
        agentTurns: HER,
        precedingDeadEnds,
        openingTurn,
        gapSeconds: 1.2,
      }).raw,
    ])).toEqual([
      ['opener', 0],
      ['open question', 3.4],
      ['closed question', 0],
      ['engaged length', 2.3],
      ['callback', 4],
      ['dead end', -5.2],
      ['dead-end streak', -12],
      ['filler', 2.3],
    ])
  })
})

describe('characterization · the steering line', () => {
  const nadia = PERSONAS.nadia!
  const REAL_TURN: UserTurnShape = { words: 12, askedQuestion: false, disclosed: true, deadEnd: false }

  it('composes identically for Nadia across the ladder', () => {
    const lines = [10, 28, 41, 55, 66, 84].map((warmth) =>
      composeSteering({ persona: nadia, warmth, his: REAL_TURN }))
    // Re-baselined 8 September with the band table above, and for that reason
    // alone: the want, personality, gate and reciprocity clauses are byte for
    // byte what they were at every rung.
    expect(digest(lines.join(''))).toBe('724e6fa811f86965')
    expect(lines[2]).toBe(
      '[Seven or eight words. Twelve at the very most. One sentence, never two. Do not ask a question this turn unless he asked you one first. You may volunteer one small thing. You would still rather be left alone with the shelf you are halfway through. You are not going yet. Light. You may say something real about your life.]',
    )
  })

  it('drops the invitation and the gates on a dead end, and keeps the band', () => {
    expect(composeSteering({
      persona: nadia,
      warmth: 41,
      his: { words: 1, askedQuestion: false, disclosed: false, deadEnd: true },
    })).toBe(
      '[Seven or eight words. Twelve at the very most. One sentence, never two. Do not ask a question this turn unless he asked you one first. He gave you almost nothing. Match it. Do not fill the gap for him. You would still rather be left alone with the shelf you are halfway through. You are not going yet. Light.]',
    )
  })

  /**
   * 8 September. His opening turn is exempt from `deadEnd` so that a two-word
   * hello costs him no warmth — and the invitation gate was reading that
   * exemption as an offer, so the free sign-up rep answered "Hey there." with
   * the band's invitation and two gates open at once.
   *
   * Pinned in the characterization file rather than only in `steering.test.ts`
   * because the thing that must not move is the SHAPE of the first line of the
   * product, and this is the file that notices shape moving.
   */
  it('withholds the invitation on a bare hello and grants it on a real opener', () => {
    const hello = { words: 2, askedQuestion: false, disclosed: false, deadEnd: false }
    const opener = { words: 13, askedQuestion: false, disclosed: true, deadEnd: false }

    const toHello = composeSteering({ persona: nadia, warmth: 41, his: hello, firstExchange: true })
    expect(toHello).not.toContain('You may')
    expect(toHello).not.toContain('Ask about him')

    // A substantive opener is a real offer and is still answered as one.
    expect(composeSteering({ persona: nadia, warmth: 41, his: opener, firstExchange: true }))
      .toContain('You may volunteer one small thing.')

    // And the same hello on any later turn is unchanged — this is the first
    // exchange only, never a new warmth opinion.
    expect(composeSteering({ persona: nadia, warmth: 41, his: hello }))
      .toContain('You may volunteer one small thing.')
  })
})

describe('characterization · rep timing', () => {
  it('holds every constant the format is made of', () => {
    expect({
      DATING_DURATION_MS,
      ARM_THRESHOLD,
      KEEP_THRESHOLD,
      WRAP_UP_MS,
      CLOSING_GRACE_MS,
      CLOSING_IDLE_MS,
      NEAR_MISS_POINTS,
    }).toEqual({
      DATING_DURATION_MS: 180_000,
      ARM_THRESHOLD: 65,
      KEEP_THRESHOLD: 55,
      WRAP_UP_MS: 30_000,
      CLOSING_GRACE_MS: 20_000,
      CLOSING_IDLE_MS: 4_000,
      NEAR_MISS_POINTS: 8,
    })
    expect(repDurationMs(false)).toBe(180_000)
    expect(repThreshold(false)).toBe(65)
  })

  it('arms, keeps and wraps at the same moments', () => {
    expect(shouldArm({ warmth: 64.9, armed: false, interview: false })).toBe(false)
    expect(shouldArm({ warmth: 65, armed: false, interview: false })).toBe(true)
    expect(shouldArm({ warmth: 90, armed: true, interview: false })).toBe(false)
    expect(givesNumber({ armed: true, warmth: 55, interview: false })).toBe(true)
    expect(givesNumber({ armed: true, warmth: 54.9, interview: false })).toBe(false)
    expect(givesNumber({ armed: false, warmth: 99, interview: false })).toBe(false)
    expect(givesNumber({ armed: true, warmth: 99, interview: false, boundaryCrossed: true })).toBe(false)
    expect(shouldWrapUp({ msRemaining: 30_001, alreadyWrapped: false })).toBe(false)
    expect(shouldWrapUp({ msRemaining: 30_000, alreadyWrapped: false })).toBe(true)
    expect(shouldWrapUp({ msRemaining: 0, alreadyWrapped: true })).toBe(false)
    expect(isTimeUp(1)).toBe(false)
    expect(isTimeUp(0)).toBe(true)
    expect(isClosingOver({ msSinceTimeUp: 3_999, agentSpeaking: false })).toBe(false)
    expect(isClosingOver({ msSinceTimeUp: 4_000, agentSpeaking: false })).toBe(true)
    expect(isClosingOver({ msSinceTimeUp: 19_999, agentSpeaking: true })).toBe(false)
    expect(isClosingOver({ msSinceTimeUp: 20_000, agentSpeaking: true })).toBe(true)
  })

  it('reads a result the same way', () => {
    expect(resultReading({ decisionWarmth: 61, finalWarmth: 71, interview: false, won: false }))
      .toEqual({ warmth: 61, threshold: 65, fallback: false, lateSurge: true, close: 4, nearMiss: true })
    expect(resultReading({ decisionWarmth: 30, finalWarmth: 31, interview: false, won: false }))
      .toEqual({ warmth: 30, threshold: 65, fallback: false, lateSurge: false, close: 35, nearMiss: false })
    expect(resultReading({ decisionWarmth: 70, finalWarmth: 72, interview: false, won: true }))
      .toEqual({ warmth: 70, threshold: 65, fallback: false, lateSurge: false, close: -5, nearMiss: false })
    expect(resultReading({ decisionWarmth: null, finalWarmth: 71, interview: false, won: false }))
      .toEqual({ warmth: 71, threshold: 65, fallback: true, lateSurge: true, close: -6, nearMiss: true })
  })

  it('fires scene beats on the same clock', () => {
    const beats = PERSONAS.nadia!.sceneBeats!
    expect(dueSceneBeat({ beats, elapsedFraction: 0.27, fired: 0 })).toBeNull()
    expect(dueSceneBeat({ beats, elapsedFraction: 0.28, fired: 0 })).toBe(beats[0])
    expect(dueSceneBeat({ beats, elapsedFraction: 0.99, fired: 1 })).toBe(beats[1])
    expect(dueSceneBeat({ beats, elapsedFraction: 0.99, fired: 2 })).toBeNull()
    expect(dueSceneBeat({ beats: [{ at: 0.8, direction: 'x' }], elapsedFraction: 1, fired: 0 })).toBeNull()
  })
})

describe('characterization · the judgement prompts', () => {
  it('the rubric is unchanged', () => {
    expect(digest(RUBRIC)).toBe('84c81f28f10db5c6')
    expect(digest(buildGradeSystemPrompt())).toBe('8abb02957e79074e')
    expect(RUBRIC).toContain('SCORE THE PROCESS, NEVER THE OUTCOME.')
    expect(RUBRIC).toContain('A clean rep that ends in rejection can score 92.')
  })

  it('the live scorer’s anchors are unchanged', () => {
    expect(digest(INTIMACY_ANCHORS)).toBe('66a19739d8d178b5')
    expect(digest(buildSystemPrompt('Nadia', 'a second-hand bookshop'))).toBe('bbbda88f48f3bf28')
  })

  /**
   * THE BAND TABLE, AND THE MEASURED BLOCK THAT DESCRIBES IT.
   *
   * `INTERVIEW-TECHNICAL-PLAN.md`'s UI pass gave the interview arm its own
   * deterministic bands, because four of these eight score correct interview
   * behaviour at zero. That is sixty percent of the composite, so this is where
   * it says so if the dating table ever moves with it — the numbers below are
   * every target a dating rep has ever been graded against.
   */
  it('the deterministic bands are unchanged', () => {
    expect(METRIC_BANDS.map((band) => [band.key, band.min ?? null, band.max ?? null, band.tolerance]))
      .toEqual([
        ['talkRatio', 0.4, 0.55, 0.12],
        ['questionsPer3Min', 3, 8, 3],
        ['openClosedRatio', 2, null, 1],
        ['fillerRate', null, 4, 4],
        ['longestMonologue', null, 22, 15],
        ['meanResponseLatency', null, 1.8, 1.5],
        ['planQuality', 1, null, 1],
        ['exitQuality', 1, null, 1],
      ])
    // And the default argument is still the dating table, which is what keeps
    // every existing caller on the numbers it has always produced.
    expect(rubricForPersonaName('Nadia').metricBands).toBe(METRIC_BANDS)
    expect(rubricForPersonaName('Nadia').renderMetrics).toBe(renderMetrics)
  })

  it('renders the deterministic metrics block identically', () => {
    expect(renderMetrics({
      talkRatio: 0.46,
      questionsAsked: 5,
      questionsPer3Min: 5,
      openQuestions: 3,
      closedQuestions: 2,
      openClosedRatio: 1.5,
      fillerRate: 2.4,
      longestMonologue: 14.2,
      meanResponseLatency: 1.1,
      specificPlanOffered: false,
      planQuality: null,
      cleanExit: true,
      exitQuality: 1,
      userTurns: 14,
      agentTurns: 14,
      sessionSeconds: 172,
    })).toBe([
      'talk ratio 46% (target 40-55%)',
      'questions 5 (3 open / 2 closed)',
      'filler 2.4/min (target < 4)',
      'longest monologue 14.2s (target < 22)',
      'mean response latency 1.1s (target < 1.8)',
      'specific plan offered: false',
      'clean exit: true',
      '',
      'These are already measured. Use them as context; do not re-score them.',
    ].join('\n'))
  })
})

/**
 * THE COMPOSITE, AND THE SEVENTH SLOT THAT IS NOT ON THIS PATH.
 *
 * `INTERVIEW-TECHNICAL-PLAN.md` §8.4 adds a seventh scored dimension —
 * technical accuracy — and it is the one place that plan touches shared
 * judgement. It touches it by BRANCHING: no accuracy layer means the mean of
 * the six, which is the arithmetic this file exists to hold still.
 *
 * So two things are pinned here rather than one. The number, which is what a
 * customer sees; and the ABSENCE of the seventh key on a dating scorecard,
 * which is what makes "the dating branch reaches the identical arithmetic"
 * assertable rather than merely true. If a later change ever populates that
 * key on this path, the composite moves for every dating rep ever run and this
 * is where it says so.
 */
describe('characterization · the composite', () => {
  const JUDGEMENT = {
    scores: { opening: 80, curiosity: 70, listening: 60, signalReading: 40, composure: 90, close: 50 },
    evidence: {},
    wentWell: 'He opened without hedging.',
    memoryLine: null,
  }
  const TRANSCRIPT: TranscriptTurn[] = [
    { speaker: 'user', text: 'Sorry, is this place always this quiet?', t_start: 0, t_end: 3 },
    { speaker: 'agent', text: 'Pretty much. It is why I come.', t_start: 3.5, t_end: 6 },
    { speaker: 'user', text: 'What made you pick this one over the big shop up the road?', t_start: 6.5, t_end: 10 },
    { speaker: 'agent', text: 'They actually keep the poetry.', t_start: 10.4, t_end: 12 },
  ]

  it('weights the six the way it always has, with no seventh slot in sight', () => {
    const card = composeScorecard({
      transcript: TRANSCRIPT, sessionSeconds: 30, judgement: JUDGEMENT,
      outcome: 'rejecting', model: 'test',
    })
    expect(judgementMeanOf(JUDGEMENT.scores)).toBe((80 + 70 + 60 + 40 + 90 + 50) / 6)
    expect(card.composite).toBe(
      Math.round(card.deterministicScore * DETERMINISTIC_WEIGHT
        + ((80 + 70 + 60 + 40 + 90 + 50) / 6) * JUDGEMENT_WEIGHT),
    )
    expect(card).not.toHaveProperty('accuracy')
    expect(card.focus).toEqual(['signalReading', 'close'])
    expect([DETERMINISTIC_WEIGHT, JUDGEMENT_WEIGHT]).toEqual([0.6, 0.4])
  })

  it('has no dating character that could ever produce one', () => {
    // The mark itself is track-neutral and resolves on both arms — a glyph that
    // appeared for some users and not others would be a hole in a scorecard.
    // What is dating-only is that nothing on this arm ever fills the number.
    for (const persona of ROSTER) expect(persona.track, persona.slug).toBe('dating')
  })
})

describe('characterization · the turn reservation', () => {
  /**
   * The ARITHMETIC, not the environment.
   *
   * `turnReservation` reads `process.env` and cannot be injected, so the token
   * count it produces moves with whichever pipeline model the machine has
   * configured. What must never move is the shape of the bound: the whole
   * compiled prompt plus the history plus the steering line, as UTF-8 bytes,
   * plus one flat 4096-token allowance for message framing — and a ceiling that
   * prices the model's own maximum output plus the turn's whole TTS allowance.
   * Every one of those inputs is pinned above; this pins the sum.
   */
  const REQUEST = {
    sessionId: '11111111-2222-4333-8444-555555555555',
    turnId: '66666666-7777-4888-8999-aaaaaaaaaaaa',
    personaId: 'nadia',
    history: [
      { role: 'assistant' as const, content: 'Tana French. Third time through.' },
      { role: 'user' as const, content: 'What made you pick that one?' },
    ],
    steering: '[One sentence, seven or eight words.]',
    warmth: 41,
  }

  it('bounds a dating turn by the same arithmetic', () => {
    const reservation = turnReservation(REQUEST)
    const compiled = new ElevenLabsPersonaCompiler(resolvePipelineConfig(process.env as PipelineEnv))
      .compile(PERSONAS.nadia!, DEFAULT_CALIBRATION, { rng: seededRandom(REQUEST.sessionId) })

    const envelope = new TextEncoder().encode(
      compiled.llm.systemPrompt
        + REQUEST.history.map((message) => message.content).join('\n')
        + REQUEST.steering,
    ).length

    expect(reservation.model).toBe(compiled.llm.model)
    expect(reservation.resources).toEqual({
      llmInputTokens: envelope + 4096,
      llmOutputTokens: 120,
      ttsCharacters: 600,
    })
    // A bound is never null on a model we price. Rule 18: an uncertain cost is
    // bounded, never unknown.
    expect(reservation.maxCostUsd).not.toBeNull()
    expect(reservation.maxCostUsd!).toBeGreaterThan(0)
  })

  it('bounds the same turn identically on a second call', () => {
    expect(turnReservation(REQUEST)).toEqual(turnReservation(REQUEST))
  })
})
