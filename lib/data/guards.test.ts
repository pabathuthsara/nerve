/**
 * Where an unfinished onboarding run resumes.
 *
 * `onboardingResumePath` is the only pure thing in `guards.ts` and it decides
 * two separate questions: which step somebody comes back to, and — since the
 * run became one component — how far into it a typed URL is allowed to reach.
 * A wrong answer here is either a question asked twice or a Start button over
 * a run nobody went through.
 *
 * The markers are the interesting part. Neither of the two columns that look
 * like they should carry the answer can: `active_track` has a default, so it
 * is set before anybody has chosen anything, and `display_name` can be
 * legitimately empty because the name step is skippable. Both are asserted
 * below, because both were the original bug.
 */

import { describe, expect, it } from 'vitest'
import {
  ONBOARDING_CV_FLAG,
  ONBOARDING_NAME_FLAG,
  ONBOARDING_ROLE_FLAG,
  ONBOARDING_TRACK_FLAG,
  onboardingResumePath,
} from './guards'

const stamp = '2026-08-30T00:00:00.000Z'

const profile = (flags: Record<string, string>, focus: string | null = null) => ({
  focus_area: focus,
  ui_flags: flags,
})

/** The same row on the other arm. `active_track` is the only difference. */
const interview = (flags: Record<string, string>) => ({
  focus_area: null,
  active_track: 'interview',
  ui_flags: flags,
})

describe('onboardingResumePath', () => {
  it('starts a missing profile at the first question', () => {
    // The sign-up trigger has not landed yet. Onboarding, not a rep against
    // nothing.
    expect(onboardingResumePath(null)).toBe('/onboarding/track')
  })

  it('starts an untouched profile at the first question', () => {
    expect(onboardingResumePath(profile({}))).toBe('/onboarding/track')
  })

  it('does not treat the default track as an answer', () => {
    // `active_track` is not in the argument at all, which is the fix: it
    // carries a database default and was therefore true for everybody before
    // anybody had chosen. The flag is the marker.
    expect(onboardingResumePath(profile({}, 'opening'))).toBe('/onboarding/track')
  })

  it('moves to focus once the track is stamped', () => {
    expect(onboardingResumePath(profile({ [ONBOARDING_TRACK_FLAG]: stamp }))).toBe('/onboarding/focus')
  })

  it('moves to the name once focus is answered', () => {
    expect(onboardingResumePath(profile({ [ONBOARDING_TRACK_FLAG]: stamp }, 'rejection'))).toBe('/onboarding/name')
  })

  it('treats a skipped name as answered', () => {
    // The whole reason the name step stamps a flag. Reading an empty
    // `display_name` as "not asked yet" put somebody who declined back on the
    // same screen every time they reloaded.
    const flags = { [ONBOARDING_TRACK_FLAG]: stamp, [ONBOARDING_NAME_FLAG]: stamp }
    expect(onboardingResumePath(profile(flags, 'flirting'))).toBe('/onboarding/mic')
  })

  /**
   * ── THE FORK (LAUNCH-GAP D22) ──────────────────────────────────────────
   *
   * Past the track question the two arms need different things before a first
   * rep can exist, and the interview arm used to be walked through the dating
   * one: an account that answered "job interviews" was asked what it found
   * hard about flirting, and then handed to a dashboard and a three-step
   * wizard. These four assertions are the fork.
   */
  describe('the interview arm', () => {
    const tracked = { [ONBOARDING_TRACK_FLAG]: stamp }

    it('asks for the role where the dating arm asks for the focus', () => {
      expect(onboardingResumePath(interview(tracked))).toBe('/onboarding/role')
    })

    it('asks for the CV next, before the name and the microphone', () => {
      // Deliberately ahead of the two steps that are not optional: an optional
      // step placed last is a step nobody does.
      expect(onboardingResumePath(interview({ ...tracked, [ONBOARDING_ROLE_FLAG]: stamp })))
        .toBe('/onboarding/cv')
    })

    it('treats a skipped CV as answered', () => {
      // §C4: a missing CV degrades to the field, the role and the job
      // description. Declining is a finished answer, not a step to return to.
      const flags = { ...tracked, [ONBOARDING_ROLE_FLAG]: stamp, [ONBOARDING_CV_FLAG]: stamp }
      expect(onboardingResumePath(interview(flags))).toBe('/onboarding/name')
      expect(onboardingResumePath(interview({ ...flags, [ONBOARDING_NAME_FLAG]: stamp })))
        .toBe('/onboarding/mic')
    })

    it('never asks an interview account for a dating focus area', () => {
      const walked = [
        tracked,
        { ...tracked, [ONBOARDING_ROLE_FLAG]: stamp },
        { ...tracked, [ONBOARDING_ROLE_FLAG]: stamp, [ONBOARDING_CV_FLAG]: stamp },
        { ...tracked, [ONBOARDING_ROLE_FLAG]: stamp, [ONBOARDING_CV_FLAG]: stamp, [ONBOARDING_NAME_FLAG]: stamp },
      ]
      for (const flags of walked) {
        expect(onboardingResumePath(interview(flags))).not.toBe('/onboarding/focus')
      }
    })

    it('never asks a dating account for a role or a CV', () => {
      // The other half of the same rule, and the one that would break the arm
      // that has every customer on it.
      const walked = [
        profile(tracked),
        profile(tracked, 'opening'),
        profile({ ...tracked, [ONBOARDING_NAME_FLAG]: stamp }, 'opening'),
      ]
      for (const row of walked) {
        expect(['/onboarding/role', '/onboarding/cv']).not.toContain(onboardingResumePath(row))
      }
    })

    it('does not read the track above the flag that says it was chosen', () => {
      // `active_track` carries a database default, so it is set for everybody
      // before anybody has chosen. An unflagged row goes to question one
      // whatever the column happens to say.
      expect(onboardingResumePath({ focus_area: null, active_track: 'interview', ui_flags: {} }))
        .toBe('/onboarding/track')
    })
  })

  it('never returns the step that was cut', () => {
    // `/onboarding/experience` wrote a column nothing read and is gone. The
    // guard redirects the stale URL; nothing should ever produce it again.
    const states = [
      null,
      profile({}),
      profile({ [ONBOARDING_TRACK_FLAG]: stamp }),
      profile({ [ONBOARDING_TRACK_FLAG]: stamp }, 'opening'),
      profile({ [ONBOARDING_TRACK_FLAG]: stamp, [ONBOARDING_NAME_FLAG]: stamp }, 'opening'),
    ]
    for (const state of states) expect(onboardingResumePath(state)).not.toBe('/onboarding/experience')
  })

  it('survives a ui_flags column holding something that is not an object', () => {
    // `jsonb`. An array, a string or a null are all things that column can
    // legally contain, and none of them may throw on a route guard.
    for (const flags of [null, undefined, [], 'nope', 7]) {
      expect(onboardingResumePath({ focus_area: null, ui_flags: flags })).toBe('/onboarding/track')
    }
  })

  it('walks the run in order and reaches the end exactly once', () => {
    // The clamp on a typed URL is `min(requested, resume)`, so this order is
    // load-bearing beyond the redirect: it is what stops somebody landing on
    // the Start button with nothing answered behind it.
    const seen: string[] = []
    let flags: Record<string, string> = {}
    let focus: string | null = null

    seen.push(onboardingResumePath(profile(flags, focus)))
    flags = { ...flags, [ONBOARDING_TRACK_FLAG]: stamp }
    seen.push(onboardingResumePath(profile(flags, focus)))
    focus = 'sustaining'
    seen.push(onboardingResumePath(profile(flags, focus)))
    flags = { ...flags, [ONBOARDING_NAME_FLAG]: stamp }
    seen.push(onboardingResumePath(profile(flags, focus)))

    expect(seen).toEqual(['/onboarding/track', '/onboarding/focus', '/onboarding/name', '/onboarding/mic'])
    expect(new Set(seen).size).toBe(seen.length)
  })
})
