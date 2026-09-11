import { describe, expect, it } from 'vitest'
import {
  EMPTY_START_ANSWERS,
  START_STEPS,
  decodeStartAnswers,
  encodeStartAnswers,
  firstRepPreview,
  hasStartAnswers,
  startProfileWrite,
  startOpening,
  startResumeIndex,
  startRosterCandidates,
  type StartAnswers,
} from './start-funnel'
import { DATING_PERSONAS } from '@/lib/personas'
import { PRESENTATION } from '@/lib/personas/presentation'
import { ONBOARDING_NAME_FLAG, ONBOARDING_TRACK_FLAG, trackWaitlistFlag } from './ui-flags'
import { FOCUS_PLANS } from './focus'

const answered: StartAnswers = {
  track: 'dating',
  focusArea: 'rejection',
  displayName: 'Sam',
  named: true,
  english: false,
}

describe('the funnel, in order', () => {
  it('opens on the hook, ends on the account, and never runs two claims together', () => {
    // The order is the funnel — PostHog reads `start_step_viewed` as a
    // sequence keyed on this — so a reorder here is a reorder of the chart.
    expect(START_STEPS).toEqual([
      'hook',
      'track',
      'reframe',
      'focus',
      'mechanism',
      'name',
      'build',
      'account',
    ])
  })

  it('never puts two non-questions back to back before the first answer', () => {
    // A stranger's first interaction has to be cheap and theirs. Three claims
    // in a row before they have touched anything is the advertisement they
    // just clicked out of.
    const claims = new Set(['hook', 'reframe', 'mechanism', 'build'])
    const runs = START_STEPS.reduce<number>((longest, step, index) => {
      if (!claims.has(step)) return longest
      let run = 1
      for (let back = index - 1; back >= 0 && claims.has(START_STEPS[back] as string); back -= 1) run += 1
      return Math.max(longest, run)
    }, 0)
    expect(runs).toBe(1)
  })
})

describe('answers crossing an untrusted boundary', () => {
  it('round-trips what the run collected', () => {
    expect(decodeStartAnswers(encodeStartAnswers(answered))).toEqual(answered)
  })

  it('reads nothing out of nothing', () => {
    expect(decodeStartAnswers(null)).toEqual(EMPTY_START_ANSWERS)
    expect(decodeStartAnswers('')).toEqual(EMPTY_START_ANSWERS)
    expect(decodeStartAnswers('not json')).toEqual(EMPTY_START_ANSWERS)
    expect(decodeStartAnswers('[1,2,3]')).toEqual(EMPTY_START_ANSWERS)
    expect(decodeStartAnswers('"a string"')).toEqual(EMPTY_START_ANSWERS)
    expect(decodeStartAnswers('null')).toEqual(EMPTY_START_ANSWERS)
  })

  it('refuses a track or a focus that is not one of the authored answers', () => {
    // This arrives on a form post from a client that can say anything. None of
    // it is an entitlement (rule 11) — all three are changeable from
    // /profile/settings by their owner — so the check is about not writing
    // junk into a column, and it is a whitelist rather than a cast.
    const forged = decodeStartAnswers(JSON.stringify({
      track: 'admin',
      focusArea: 'everything',
      displayName: 'Sam',
      named: true,
    }))
    expect(forged.track).toBeNull()
    expect(forged.focusArea).toBeNull()
    expect(forged.displayName).toBe('Sam')
  })

  it('survives values of the wrong type entirely', () => {
    const nonsense = decodeStartAnswers(JSON.stringify({
      track: { toString: 'dating' },
      focusArea: ['opening'],
      displayName: 42,
      named: 'yes',
      english: 1,
    }))
    expect(nonsense).toEqual(EMPTY_START_ANSWERS)
  })

  it('trims and caps a name at the same 40 characters the profile write applies', () => {
    const long = decodeStartAnswers(JSON.stringify({ displayName: `   ${'a'.repeat(80)}   ` }))
    expect(long.displayName).toHaveLength(40)
    expect(decodeStartAnswers(JSON.stringify({ displayName: '   ' })).displayName).toBeNull()
  })

  it('keeps a skipped name as an answer', () => {
    // The one distinction the whole resume depends on: `displayName: null` with
    // `named: true` is somebody who declined, not somebody who was never asked.
    const skipped = decodeStartAnswers(JSON.stringify({ track: 'dating', named: true }))
    expect(skipped.displayName).toBeNull()
    expect(skipped.named).toBe(true)
  })
})

describe('where a reload lands', () => {
  it('opens on the hook with nothing on file', () => {
    expect(START_STEPS[startResumeIndex(EMPTY_START_ANSWERS)]).toBe('hook')
  })

  it('returns to the first unanswered question, never to an interstitial', () => {
    const stages: [Partial<StartAnswers>, string][] = [
      [{ english: true }, 'track'],
      [{ track: 'dating' }, 'focus'],
      [{ track: 'dating', focusArea: 'opening' }, 'name'],
      [{ track: 'dating', focusArea: 'opening', named: true }, 'build'],
      [{ track: 'dating', focusArea: 'opening', named: true, displayName: 'Sam' }, 'build'],
    ]
    for (const [partial, expected] of stages) {
      expect(START_STEPS[startResumeIndex({ ...EMPTY_START_ANSWERS, ...partial })]).toBe(expected)
    }
  })

  it('counts the English ask as having started', () => {
    // Somebody who asked for a track that does not exist has interacted. Sending
    // them back to the hook would replay the pitch at somebody mid-run.
    expect(hasStartAnswers({ ...EMPTY_START_ANSWERS, english: true })).toBe(true)
    expect(hasStartAnswers(EMPTY_START_ANSWERS)).toBe(false)
  })
})

describe('opening the run', () => {
  const open = (stored: Partial<StartAnswers>, asked: 'dating' | 'interview' | null) =>
    startOpening({ ...EMPTY_START_ANSWERS, ...stored }, asked)

  it('opens on the hook with nothing asked and nothing stored', () => {
    const { answers, index } = open({}, null)
    expect(START_STEPS[index]).toBe('hook')
    expect(answers.track).toBeNull()
  })

  it('skips the hook and the track question when the link already named one', () => {
    // `/interviews` is a page about the interview track. Asking somebody who
    // has just read it what they are training for is asking a question they
    // have spent a page answering.
    const { answers, index } = open({}, 'interview')
    expect(START_STEPS[index]).toBe('reframe')
    expect(answers.track).toBe('interview')
  })

  it('lets an open session win when it agrees', () => {
    const stored = { track: 'dating' as const, focusArea: 'opening' as const }
    const { answers, index } = open(stored, 'dating')
    expect(START_STEPS[index]).toBe('name')
    expect(answers.track).toBe('dating')
  })

  it('lets an explicit track overrule a stale session, and keeps the rest', () => {
    // The E2 problem one layer down: two sources disagree and the tie has to be
    // broken deliberately. Somebody who started a dating run, went back to read
    // /interviews and came in through its button has said something newer —
    // and should not have to give their focus and name again to say it.
    const { answers, index } = open(
      { track: 'dating', focusArea: 'rejection', displayName: 'Sam', named: true },
      'interview',
    )
    expect(answers.track).toBe('interview')
    expect(answers.focusArea).toBe('rejection')
    expect(answers.displayName).toBe('Sam')
    expect(START_STEPS[index]).toBe('build')
  })

  it('moves only the track, never an answer the other arm also collects', () => {
    const stored = { track: 'dating' as const, focusArea: 'flirting' as const }
    const { answers } = open(stored, 'interview')
    expect(answers.focusArea).toBe('flirting')
  })
})

describe('what the account inherits', () => {
  it('stamps both flags, so the resume lands on the microphone and not on question one', () => {
    const { patch, flags } = startProfileWrite(answered)
    expect(patch).toEqual({ active_track: 'dating', focus_area: 'rejection', display_name: 'Sam' })
    expect(flags).toEqual([ONBOARDING_TRACK_FLAG, ONBOARDING_NAME_FLAG])
  })

  it('stamps the name flag for a skip, and writes no name', () => {
    const { patch, flags } = startProfileWrite({ ...answered, displayName: null })
    expect(patch.display_name).toBeUndefined()
    expect(flags).toContain(ONBOARDING_NAME_FLAG)
  })

  it('records the English ask on the same flag the signed-in run uses', () => {
    const { flags } = startProfileWrite({ ...EMPTY_START_ANSWERS, english: true })
    expect(flags).toEqual([trackWaitlistFlag('english')])
  })

  it('writes nothing at all for a funnel nobody answered', () => {
    expect(startProfileWrite(EMPTY_START_ANSWERS)).toEqual({ patch: {}, flags: [] })
  })

  it('never writes a track without the flag that says it was chosen', () => {
    // `active_track` carries a column default, so the column alone cannot tell
    // an answer from an absence — which is the whole reason the flag exists.
    for (const track of ['dating', 'interview'] as const) {
      const { patch, flags } = startProfileWrite({ ...EMPTY_START_ANSWERS, track })
      expect(patch.active_track).toBe(track)
      expect(flags).toContain(ONBOARDING_TRACK_FLAG)
    }
  })
})

describe('the character named before the account exists', () => {
  it('is the same one the account then meets', () => {
    /**
     * The preview is derived from `lib/personas/`, because `personas` is
     * readable only by `authenticated` and a stranger cannot read it. That is
     * sound only while the repo and the table say the same thing — which they
     * do, because `scripts/seed-personas.ts` publishes exactly this record from
     * exactly these two files. This is the assertion holding those together.
     */
    const candidates = startRosterCandidates()
    expect(candidates.map((candidate) => candidate.id).sort()).toEqual(Object.keys(DATING_PERSONAS).sort())
    for (const candidate of candidates) {
      const shown = PRESENTATION[candidate.id]
      expect(shown).toBeDefined()
      expect(candidate.name).toBe(shown?.name)
      expect(candidate.setting).toBe(shown?.setting)
      expect(candidate.hook).toBe(shown?.hook)
    }
  })

  it('resolves a real, unlocked, level-one character for every focus answer', () => {
    for (const focus of Object.keys(FOCUS_PLANS) as (keyof typeof FOCUS_PLANS)[]) {
      const first = firstRepPreview(focus)
      expect(first).not.toBeNull()
      expect(first?.locked).toBe(false)
      // A new account is level 1 and `chooseTodayPersona` filters on it. A
      // preview naming somebody the account cannot reach would be the funnel
      // promising a character it then locks.
      expect(first?.level).toBe(1)
      expect(DATING_PERSONAS[first?.id ?? '']).toBeDefined()
    }
  })

  it('names her, with a setting and a hook to put on the screen', () => {
    const first = firstRepPreview(null)
    expect(first?.name).toBeTruthy()
    expect(first?.setting).toBeTruthy()
    expect(first?.hook).toBeTruthy()
  })
})
