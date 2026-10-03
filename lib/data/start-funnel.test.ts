import { describe, expect, it } from 'vitest'
import {
  EMPTY_START_ANSWERS,
  INTERVIEW_STEPS,
  START_STEPS,
  birthDateFromYear,
  decodeStartAnswers,
  encodeStartAnswers,
  firstRepPreview,
  hasStartAnswers,
  AI_ACCOUNT_LINE,
  FOCUS_ACCOUNT_LINE,
  FOCUS_ACCOUNT_LINE_PERSONA,
  START_ANSWER_PARAMS,
  startAdvance,
  startAnswersFromQuery,
  startFirstIndex,
  startProfileWrite,
  startOpening,
  startQueryWith,
  startRail,
  startResumeIndex,
  startInterviewSetup,
  startRosterCandidates,
  startSteps,
  type StartAnswers,
} from './start-funnel'
import { DATING_PERSONAS } from '@/lib/personas'
import { PRESENTATION } from '@/lib/personas/presentation'
import { ONBOARDING_NAME_FLAG, ONBOARDING_ROLE_FLAG, ONBOARDING_TRACK_FLAG, trackWaitlistFlag } from './ui-flags'
import { FOCUS_PLANS } from './focus'
import { checkAge } from '@/lib/safety/age'

const answered: StartAnswers = {
  birthYear: 2001,
  track: 'dating',
  focusArea: 'rejection',
  roleTitle: null,
  company: null,
  roleAsked: false,
  displayName: 'Sam',
  named: true,
  english: false,
  timezone: null,
  source: null,
  content: null,
}

const interviewAnswered: StartAnswers = {
  birthYear: 1998,
  track: 'interview',
  focusArea: null,
  roleTitle: 'Senior Backend Engineer',
  company: 'Monzo',
  roleAsked: true,
  displayName: 'Sam',
  named: true,
  english: false,
  timezone: null,
  source: null,
  content: null,
}

describe('the funnel, in order', () => {
  it('opens on a question, ends on the account, and has nothing that is not a question (3 Oct)', () => {
    // The order is the funnel — PostHog reads `start_step_viewed` as a
    // sequence keyed on this — so a reorder here is a reorder of the chart.
    expect(START_STEPS).toEqual(['track', 'focus', 'name', 'account'])
    // The hook and the Cass reveal are gone: 0 of 6 paid visitors tapped
    // through the hook, and the reveal introduced her a second time.
    for (const steps of [START_STEPS, INTERVIEW_STEPS]) {
      expect(steps).not.toContain('hook')
      expect(steps).not.toContain('build')
    }
  })

  it('asks nothing about the person before it asks about the conversation (27 Sep)', () => {
    /**
     * START-AUDIT §1.2. The year is a FIELD on the account screen, so no
     * screen before the account asks for anything but what the reps should
     * be about. §16.4 is held by `signInWithGoogle` and `signUpWithPassword`,
     * both of which check the year before anything is created.
     */
    for (const steps of [START_STEPS, INTERVIEW_STEPS]) {
      expect(steps).not.toContain('age')
      expect(steps.at(-1)).toBe('account')
      expect(steps[0]).toBe('track')
    }
  })

  it('opens a tagged link on question two, with nothing behind it', () => {
    expect(startFirstIndex(true)).toBe(1)
    expect(startFirstIndex(false)).toBe(0)
    expect(START_STEPS[startFirstIndex(true)]).toBe('focus')
    expect(INTERVIEW_STEPS[startFirstIndex(true)]).toBe('role')
  })
})

describe('the two arms', () => {
  it('are the same length and differ at exactly one index', () => {
    /**
     * The run holds the step as an INDEX. Somebody who goes back to the track
     * question and changes their answer has to stay on the screen they are on
     * rather than being teleported forward or bounced to the end — which is
     * what any other shape of these two lists would do.
     */
    expect(INTERVIEW_STEPS).toHaveLength(START_STEPS.length)
    const differences = START_STEPS
      .map((step, index) => (step === INTERVIEW_STEPS[index] ? null : index))
      .filter((index): index is number => index !== null)
    expect(differences).toEqual([START_STEPS.indexOf('focus')])
    expect(INTERVIEW_STEPS[START_STEPS.indexOf('focus')]).toBe('role')
  })

  it('never asks the other arm its question', () => {
    // The bug this fork exists for: an interview answer was followed by
    // "Making it flirty without being weird".
    expect(startSteps('interview')).not.toContain('focus')
    expect(startSteps('dating')).not.toContain('role')
    // Unanswered is the dating list, because every screen before the track
    // question is the same on both and the answer arrives before the first one
    // that is not.
    expect(startSteps(null)).toEqual(START_STEPS)
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

describe('the birth year, and the direction it is allowed to be wrong in', () => {
  it('derives 31 December, so a year is read as the YOUNGEST it could be', () => {
    /**
     * The whole point, and the opposite of what `SIGNUP-FIXES.md` §2.2
     * literally prescribes (it says 1 January and then states this intent).
     *
     * 1 January treats everybody born in that year as the OLDEST they could
     * be, which admits a real seventeen-year-old born in November for eleven
     * months. 31 December treats them as the youngest, so the only people it
     * is wrong about are refused a few months early — the direction §16.4
     * requires an imprecise gate to be wrong in.
     */
    expect(birthDateFromYear(2001)).toBe('2001-12-31')
    expect(birthDateFromYear(null)).toBe('')
  })

  it('refuses the borderline year rather than admitting it', () => {
    const today = new Date('2026-09-18T00:00:00Z')
    // Born some time in 2008: 18 already if born before 18 September, not yet
    // if born after. The gate takes the cautious reading.
    expect(checkAge(birthDateFromYear(2008), today).ok).toBe(false)
    expect(checkAge(birthDateFromYear(2007), today).ok).toBe(true)
  })

  it('pads a short year into a date nobody was born on, which is why the screen guards first', () => {
    /**
     * The hazard `AgeStep`'s four-digit test exists for, pinned here so a
     * future simplification cannot quietly reintroduce it.
     *
     * `birthDateFromYear` pads, so a half-typed `19` becomes `0019-12-31` —
     * a well-formed ISO string that gets past `checkAge`'s regex and into
     * `Date.UTC`, which maps years 0–99 onto 1900–1999. The roll-over check
     * then fires and the honest answer is "that is not a real date", which
     * is a terrible thing to say to somebody who is still typing.
     *
     * `checkAge` is not wrong here. The SCREEN is wrong if it manufactures a
     * date out of an unfinished field and reports the result as a verdict
     * about a person.
     */
    expect(birthDateFromYear(19)).toBe('0019-12-31')
    const verdict = checkAge(birthDateFromYear(19), new Date('2026-09-18T00:00:00Z'))
    expect(verdict.ok).toBe(false)
    expect(verdict.ok === false && verdict.reason).toBe('malformed')
  })

  it('reads a year off the wire whatever type it arrives as', () => {
    // sessionStorage keeps a number, a form post makes it a string, and the
    // OAuth cookie is JSON again. One parser reads all three.
    expect(decodeStartAnswers(JSON.stringify({ birthYear: 2001 })).birthYear).toBe(2001)
    expect(decodeStartAnswers(JSON.stringify({ birthYear: '2001' })).birthYear).toBe(2001)
  })

  it('refuses a typo without pretending to be the age gate', () => {
    // Loose bounds on purpose: these catch a mistyped year, and `checkAge` is
    // the only thing allowed to return a verdict about a person.
    for (const forged of [0, 42, 20010, -2001, 1.5, '20o1', null, {}, []]) {
      expect(decodeStartAnswers(JSON.stringify({ birthYear: forged })).birthYear).toBeNull()
    }
  })
})

describe('where a reload lands', () => {
  it('opens on the track question with nothing on file', () => {
    expect(START_STEPS[startResumeIndex(EMPTY_START_ANSWERS)]).toBe('track')
  })

  it('returns to the first unanswered question, never to an interstitial', () => {
    const stages: [Partial<StartAnswers>, string][] = [
      // The year is no longer a screen (27 Sep): it is the first field of
      // the account, so a run with answers and no year simply carries on.
      [{ english: true }, 'track'],
      [{ track: 'dating' }, 'focus'],
      [{ birthYear: 2001 }, 'track'],
      [{ birthYear: 2001, track: 'dating' }, 'focus'],
      [{ birthYear: 2001, track: 'dating', focusArea: 'opening' }, 'name'],
      [{ birthYear: 2001, track: 'dating', focusArea: 'opening', named: true }, 'account'],
      [{ birthYear: 2001, track: 'dating', focusArea: 'opening', named: true, displayName: 'Sam' }, 'account'],
    ]
    for (const [partial, expected] of stages) {
      expect(START_STEPS[startResumeIndex({ ...EMPTY_START_ANSWERS, ...partial })]).toBe(expected)
    }
  })

  it('returns an interview run to the role, never to the focus question', () => {
    const stages: [Partial<StartAnswers>, string][] = [
      [{ birthYear: 1998, track: 'interview' }, 'role'],
      // The skip. `roleAsked` without a title is a finished step — the same
      // distinction `named` draws, and the reason neither can be the title.
      [{ birthYear: 1998, track: 'interview', roleAsked: true }, 'name'],
      [{ birthYear: 1998, track: 'interview', roleAsked: true, roleTitle: 'SRE' }, 'name'],
      [{ birthYear: 1998, track: 'interview', roleAsked: true, named: true }, 'account'],
    ]
    for (const [partial, expected] of stages) {
      const answers = { ...EMPTY_START_ANSWERS, ...partial }
      expect(startSteps(answers.track)[startResumeIndex(answers)]).toBe(expected)
    }
  })

  it('counts a role that was asked as having started', () => {
    expect(hasStartAnswers({ ...EMPTY_START_ANSWERS, roleAsked: true })).toBe(true)
    expect(hasStartAnswers({ ...EMPTY_START_ANSWERS, birthYear: 2001 })).toBe(true)
  })

  it('counts the English ask as having started', () => {
    // Somebody who asked for a track that does not exist has interacted. Sending
    // them back to the hook would replay the pitch at somebody mid-run.
    expect(hasStartAnswers({ ...EMPTY_START_ANSWERS, english: true })).toBe(true)
    expect(hasStartAnswers(EMPTY_START_ANSWERS)).toBe(false)
  })
})

describe('opening the run', () => {
  const open = (stored: Partial<StartAnswers>, asked: 'dating' | 'interview' | null, fromUrl: Partial<StartAnswers> = {}) =>
    startOpening({ ...EMPTY_START_ANSWERS, ...stored }, asked, fromUrl)

  it('opens a bare link on the track question', () => {
    const { answers, index } = open({}, null)
    expect(START_STEPS[index]).toBe('track')
    expect(answers.track).toBeNull()
  })

  it('opens a tagged link straight on its question two (3 Oct)', () => {
    // Every ad says `?track=dating`. The first screen is the first question
    // about them — not a pitch, and not the product question the link has
    // already answered.
    const dating = open({}, 'dating')
    expect(START_STEPS[dating.index]).toBe('focus')
    expect(dating.answers.track).toBe('dating')
    const interview = open({}, 'interview')
    expect(INTERVIEW_STEPS[interview.index]).toBe('role')
  })

  it('opens on the screen after an answer that arrived as a link', () => {
    // START-AUDIT §1.1, again: a tap before hydration is a navigation that
    // carries the answer, and the page it loads opens on the next question.
    const tapped = open({}, 'dating', { focusArea: 'sustaining' })
    expect(tapped.answers.focusArea).toBe('sustaining')
    expect(START_STEPS[tapped.index]).toBe('name')
    const chose = open({}, null, { track: 'interview' })
    expect(INTERVIEW_STEPS[chose.index]).toBe('role')
    const skipped = open({}, 'interview', { roleAsked: true })
    expect(INTERVIEW_STEPS[skipped.index]).toBe('name')
  })

  it('lays a link-carried answer over a stored run, and keeps the rest', () => {
    const { answers, index } = open({ track: 'dating', focusArea: 'opening', displayName: 'Sam', named: true }, 'dating', { focusArea: 'rejection' })
    expect(answers.focusArea).toBe('rejection')
    expect(answers.displayName).toBe('Sam')
    expect(START_STEPS[index]).toBe('account')
  })

  it('lets an open session win when it agrees', () => {
    const stored = { birthYear: 2001, track: 'dating' as const, focusArea: 'opening' as const }
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
      { birthYear: 2001, track: 'dating', focusArea: 'rejection', displayName: 'Sam', named: true },
      'interview',
    )
    expect(answers.track).toBe('interview')
    expect(answers.focusArea).toBe('rejection')
    expect(answers.displayName).toBe('Sam')
    expect(INTERVIEW_STEPS[index]).toBe('role')
  })

  it('takes a switched-back run to the account once both question-twos are in', () => {
    const { answers, index } = open(
      { birthYear: 2001, track: 'interview', focusArea: 'rejection', roleAsked: true, roleTitle: 'SRE', displayName: 'Sam', named: true },
      'dating',
    )
    expect(answers.track).toBe('dating')
    expect(answers.roleTitle).toBe('SRE')
    expect(START_STEPS[index]).toBe('account')
  })

  it('moves only the track, never an answer the other arm also collects', () => {
    const stored = { track: 'dating' as const, focusArea: 'flirting' as const }
    const { answers } = open(stored, 'interview')
    expect(answers.focusArea).toBe('flirting')
  })
})

describe('the one skip the run allows', () => {
  it('jumps the track question forward when the link answered it, and only then', () => {
    expect(START_STEPS[startAdvance(START_STEPS, 0, false)]).toBe('focus')
    // Every other step is a plain +1 whatever the link said.
    const focus = START_STEPS.indexOf('focus')
    expect(START_STEPS[startAdvance(START_STEPS, focus, true)]).toBe('name')
    expect(START_STEPS[startAdvance(START_STEPS, focus, false)]).toBe('name')
  })

  it('never runs past the account', () => {
    const last = START_STEPS.length - 1
    expect(startAdvance(START_STEPS, last, true)).toBe(last)
  })

  it('counts three screens on both arms, whichever way they arrived', () => {
    expect(startRail(START_STEPS)).toEqual(['focus', 'name', 'account'])
    expect(startRail(INTERVIEW_STEPS)).toEqual(['role', 'name', 'account'])
  })
})

describe('the run in the address bar', () => {
  it('reads answers off a link through the same whitelist as every carrier', () => {
    expect(startAnswersFromQuery({ t: 'dating', focus: 'opening' })).toEqual({ track: 'dating', focusArea: 'opening' })
    expect(startAnswersFromQuery({ focus: 'everything', t: 'admin' })).toEqual({})
    expect(startAnswersFromQuery({ role: '  Staff Engineer ', company: 'Acme' })).toEqual({ roleAsked: true, roleTitle: 'Staff Engineer', company: 'Acme' })
    expect(startAnswersFromQuery({ role_asked: '1' })).toEqual({ roleAsked: true })
    // A submitted empty title is the skip it would have been.
    expect(startAnswersFromQuery({ role: '', role_asked: '1' })).toEqual({ roleAsked: true })
    // The link's `?track=` is not an answer.
    expect(startAnswersFromQuery({ track: 'dating' })).toEqual({})
  })

  it('carries the live ad link byte for byte into every answer', () => {
    // The two running Meta ads (3 Oct). An answer adds to the link; nothing
    // the ad put there is lost, so the UTMs ride every server render.
    const ad = { track: 'dating', utm_source: 'meta', utm_content: 'gaming' }
    expect(startQueryWith(ad, { focus: 'opening' })).toBe('/start?track=dating&utm_source=meta&utm_content=gaming&focus=opening')
    // The 27 September hook's `s` is dropped; a later answer replaces, never repeats.
    expect(startQueryWith({ ...ad, s: '1', focus: 'opening' }, { focus: 'flirting' })).toBe('/start?track=dating&utm_source=meta&utm_content=gaming&focus=flirting')
    expect(startQueryWith({}, { t: 'interview' })).toBe('/start?t=interview')
  })

  it('never names a first name as a link parameter', () => {
    expect(START_ANSWER_PARAMS).not.toContain('name' as never)
    expect(START_ANSWER_PARAMS).not.toContain('displayName' as never)
  })
})

describe('the context a sign-up carries that is not an answer', () => {
  it('round-trips a timezone and a campaign tag, and refuses anything else', () => {
    const carried = decodeStartAnswers(JSON.stringify({ timezone: 'America/New_York', source: 'Meta', content: 'gaming' }))
    expect(carried.timezone).toBe('America/New_York')
    expect(carried.source).toBe('meta')
    expect(carried.content).toBe('gaming')
    const forged = decodeStartAnswers(JSON.stringify({ timezone: 'DROP TABLE', source: 'a b', content: 'x'.repeat(41) }))
    expect([forged.timezone, forged.source, forged.content]).toEqual([null, null, null])
  })

  it('is not an answer: a run that carries only context was never started', () => {
    expect(hasStartAnswers({ ...EMPTY_START_ANSWERS, timezone: 'Europe/London', source: 'meta' })).toBe(false)
  })

  it('writes the zone onto the profile in the one crossing write', () => {
    expect(startProfileWrite({ ...answered, timezone: 'America/Chicago' }).patch.timezone).toBe('America/Chicago')
    expect(startProfileWrite(answered).patch.timezone).toBeUndefined()
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

  it('stamps the role flag for the interview arm, and the title goes to the other table', () => {
    const { patch, flags } = startProfileWrite(interviewAnswered)
    // A role title is not a profile column and never becomes one.
    expect(patch).toEqual({ active_track: 'interview', display_name: 'Sam' })
    expect(flags).toEqual([ONBOARDING_TRACK_FLAG, ONBOARDING_ROLE_FLAG, ONBOARDING_NAME_FLAG])
    expect(startInterviewSetup(interviewAnswered)).toEqual({
      roleTitle: 'Senior Backend Engineer',
      company: 'Monzo',
    })
  })

  it('stamps the role flag for a skip, and writes no setup row at all', () => {
    const skipped = { ...interviewAnswered, roleTitle: null, company: null }
    expect(startProfileWrite(skipped).flags).toContain(ONBOARDING_ROLE_FLAG)
    // An empty row is a row the user never created, and `complete` would read
    // false off it either way.
    expect(startInterviewSetup(skipped)).toBeNull()
  })

  it('never stamps the role flag or seeds a setup on the dating arm', () => {
    /**
     * Somebody who answered the role question, went back and switched to
     * dating keeps the answer in the funnel — but the interview run never
     * happened for them, and flagging a step that was never shown would skip
     * it if they opened the track later.
     */
    const switched = { ...interviewAnswered, track: 'dating' as const }
    expect(startProfileWrite(switched).flags).not.toContain(ONBOARDING_ROLE_FLAG)
    expect(startInterviewSetup(switched)).toBeNull()
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

describe('the account screen\'s line about her (3 Oct)', () => {
  it('is authored for every focus answer, about the character every focus answer meets', () => {
    /**
     * The lines are drawn from rung 1's own file (`PRESENTATION.tess`). If
     * the first rep for any focus stops being her, these sentences would be
     * describing somebody the account is not about to meet — so the screen
     * refuses to show them (`AccountStep`) and this fails to say so.
     */
    for (const focus of Object.keys(FOCUS_PLANS) as (keyof typeof FOCUS_PLANS)[]) {
      expect(FOCUS_ACCOUNT_LINE[focus]).toBeTruthy()
      expect(firstRepPreview(focus)?.id).toBe(FOCUS_ACCOUNT_LINE_PERSONA)
    }
  })

  it('makes no number claim and no clinical one', () => {
    for (const line of Object.values(FOCUS_ACCOUNT_LINE)) {
      expect(line).not.toMatch(/\d/)
      expect(line).not.toMatch(/anxiety|therapy|treat|cure|disorder/i)
    }
  })
})

describe('the account screen says she is an AI (3 Oct)', () => {
  it('says so in words, on both arms, and makes no privacy claim', () => {
    // Owner's call: "AI" and "no real person", and nothing about who hears
    // or what is recorded — the sub-line under it already carries the 30-day
    // deletion promise, and a second sentence would be a second place for it
    // to drift.
    for (const line of Object.values(AI_ACCOUNT_LINE)) {
      expect(line).toMatch(/\bAI\b/)
      expect(line).toMatch(/no real person/i)
      expect(line).not.toMatch(/record|nobody hears|no one hears|private|secret|stored|delete/i)
    }
  })

  it('leaves her room to the brief', () => {
    for (const line of Object.values(FOCUS_ACCOUNT_LINE)) expect(line).not.toMatch(/galler|painting|\bart\b/i)
  })
})
