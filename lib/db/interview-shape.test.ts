/**
 * The `interview_setups` row, read back — and one property above all others.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────
 *
 * `setupFromRow` clamped a null `round_type` to `DEFAULT_ROUND`, which is the
 * ten-minute recruiter screen and costs a credit. Every screen in the interview
 * track guards that read with `setup?.round ?? openingRound(hasScreener)` — the
 * function that knows a free screener credit buys the five-minute screener and
 * nothing else — and the clamp made every one of those fallbacks unreachable.
 * They only ever fired when there was no ROW, so the bug was invisible for as
 * long as a brand-new account had none.
 *
 * Two things then created one. `/interview/setup/role` upserts without a round,
 * and since `LAUNCH-GAP.md` D24 sign-up seeds a row carrying the role from
 * `/start`. So a brand-new account read **"Recruiter screen · 1 credit"** on the
 * home screen, the run setup and the brief, holding nothing but the free
 * screener — and was refused the interview its own sign-up screen called free.
 *
 * The fix is one line and it is a fix precisely because it cannot be argued
 * with at a call site: **null means never chosen.** These assertions are what
 * stop a future "sensible default" putting it back.
 */

import { describe, expect, it } from 'vitest'
import { setupFromRow, type SetupRow } from './interview-shape'
import { DEFAULT_ROUND, SCREENER_ROUND, roundFor } from '@/lib/data/interview-credits'

const row = (patch: Partial<SetupRow> = {}): SetupRow => ({
  role_title: 'Senior Backend Engineer',
  company: 'Monzo',
  job_description: '',
  field: 'software',
  round_type: null,
  cv_filename: null,
  cv_path: null,
  cv_uploaded_at: null,
  cv_text_chars: null,
  cv_error: null,
  custom_questions: [],
  captions_enabled: false,
  interviewer_slug: null,
  difficulty: null,
  ...patch,
})

describe('the round a setup carries', () => {
  it('is null when nobody has chosen one', () => {
    expect(setupFromRow(row())?.round).toBeNull()
  })

  it('is null for a value the table does not recognise', () => {
    // Also "never chosen": it cannot have come from the picker, and guessing on
    // its behalf is how the last default arrived.
    expect(setupFromRow(row({ round_type: 'panel_of_nine' }))?.round).toBeNull()
  })

  it('is the stored round once one has been chosen', () => {
    expect(setupFromRow(row({ round_type: 'technical' }))?.round).toBe('technical')
  })

  it('never answers the paid default for a row that has never been through the picker', () => {
    /**
     * The assertion the bug would fail. `DEFAULT_ROUND` costs a credit; a
     * brand-new account has a free screener and nothing that can pay for one.
     */
    expect(setupFromRow(row())?.round).not.toBe(DEFAULT_ROUND)
  })

  it('leaves `roundFor` reachable, which is the whole point of the null', () => {
    /**
     * This is the property, stated through the function every call site now
     * asks: the four screens ask it directly, and the token route and the
     * credit hold ask it through `resolveInterviewRound`. While the clamp was
     * in place not one of them could reach the second argument — so the free
     * screener was unbuyable on every one of them.
     */
    const setup = setupFromRow(row())
    expect(roundFor(setup?.round, true)).toBe(SCREENER_ROUND)
    // Once the screener is spent there is nothing free left, and the same
    // function answers the paid default — which is correct, not a regression.
    expect(roundFor(setup?.round, false)).toBe(DEFAULT_ROUND)
    // A chosen round always wins over both.
    const chosen = setupFromRow(row({ round_type: 'deep_technical' }))
    expect(roundFor(chosen?.round, true)).toBe('deep_technical')
  })
})

describe('complete', () => {
  it('is a role title and nothing else (§C4)', () => {
    // The CV is optional by design, which is what lets `/start` ask one text
    // field and land an account on its free screener rather than on a wizard.
    expect(setupFromRow(row())?.complete).toBe(true)
    expect(setupFromRow(row({ role_title: '   ' }))?.complete).toBe(false)
    expect(setupFromRow(row({ role_title: null }))?.complete).toBe(false)
  })
})
