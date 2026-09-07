import 'server-only'

/**
 * `interview_setups`, for real (INTERVIEW-PLAN C1).
 *
 * The table and the private `cv` bucket have been RLS-correct and entirely
 * unused since 23 August: `useInterviewSetup()` was `useMock`, `CvSetup` ticked
 * a `setInterval` at a progress bar, and nothing in the repo ever called
 * `storage.from('cv')`. This is the module that reads and writes it.
 *
 * ── WHO WRITES WHAT ──────────────────────────────────────────────────────
 *
 * The setup is the user's own document about their own job hunt, so unlike
 * plan, quota and the credit balance it is written **in the user's context**
 * through their own RLS policies. Rule 11 is about things somebody could pay to
 * change; a job description is not one of them.
 *
 * The one field that is read differently is `round_type`. It decides how long
 * the rep runs and therefore what it costs, so the token route reads it **from
 * this table with the service role** rather than accepting it from the request
 * body — the same reason the persona is compiled from an id and never posted.
 * The user still chooses it; the browser just does not get to announce it at
 * the moment money is committed.
 */

import { supabaseAdmin } from './admin'
import { supabaseServer, currentUser } from './server'
// The row shape lives in its own module because the BROWSER reads it too —
// `fetchInterviewSetup` runs client-side, and this file is `server-only`.
import {
  INTERVIEW_SETUP_COLUMNS,
  setupFromRow,
  type InterviewSetupRecord,
  type SetupRow,
} from './interview-shape'

export { INTERVIEW_SETUP_COLUMNS, setupFromRow }
export type { InterviewSetupRecord }
import {
  DEFAULT_ROUND,
  isRoundTypeId,
  roundType,
  type RoundTypeId,
} from '@/lib/data/interview-credits'
import {
  CV_TEXT_LIMIT as CV_LIMIT,
  CUSTOM_QUESTION_CHARS as QUESTION_CHARS,
  CUSTOM_QUESTION_LIMIT as QUESTION_LIMIT,
  JOB_DESCRIPTION_LIMIT as JD_LIMIT,
} from '@/lib/data/interview-limits'
import {
  DEFAULT_FIELD,
  isInterviewFieldId,
  type InterviewFieldId,
} from '@/lib/data/interview-fields'
import { isDifficultyLevel, toDifficultyLevel } from '@/lib/data/interview-difficulty'

// The bounds live in `lib/data/interview-limits.ts` because the FORM needs
// them too and this file is `server-only`: a character counter that disagrees
// with the write is how somebody loses half a job description without being
// told. Re-exported so callers here have one import.
export {
  CV_TEXT_LIMIT,
  CUSTOM_QUESTION_CHARS,
  CUSTOM_QUESTION_LIMIT,
  JOB_DESCRIPTION_LIMIT,
} from '@/lib/data/interview-limits'

/** The signed-in user's own setup, through their own policies. */
export async function readInterviewSetup(): Promise<InterviewSetupRecord | null> {
  const user = await currentUser()
  if (!user) return null
  const supabase = await supabaseServer()
  const { data } = await supabase
    .from('interview_setups')
    .select(INTERVIEW_SETUP_COLUMNS)
    .eq('user_id', user.id)
    .maybeSingle()
  return setupFromRow(data as unknown as SetupRow)
}

/**
 * The same thing, on the service role, for the paths that have a user id and no
 * cookie: the edge token route and the turn pipeline.
 */
export async function readInterviewSetupFor(userId: string): Promise<InterviewSetupRecord | null> {
  try {
    const { data } = await supabaseAdmin()
      .from('interview_setups')
      .select(INTERVIEW_SETUP_COLUMNS)
      .eq('user_id', userId)
      .maybeSingle()
    return setupFromRow(data as unknown as SetupRow)
  } catch {
    return null
  }
}

/**
 * The round this account's next interview runs, resolved server-side.
 *
 * Falls back to the default rather than refusing, because a missing setup is a
 * user who has not been through the flow yet and the screener still has to be
 * runnable. `roundType` clamps anything it does not recognise.
 */
export async function readInterviewRound(userId: string): Promise<RoundTypeId> {
  const setup = await readInterviewSetupFor(userId)
  return roundType(setup?.round).id
}

export interface SetupPatch {
  roleTitle?: string
  company?: string
  jobDescription?: string
  field?: string
  round?: string
  customQuestions?: string[]
  captions?: boolean
  interviewerSlug?: string | null
  /**
   * The hardness slider (§5). `null` clears the choice and goes back to
   * deriving from the role title, which is a state the form can actually
   * reach — "match my title" is an option on the control.
   */
  difficulty?: number | null
}

/**
 * Sanitises whatever the form sent.
 *
 * Every bound here is also stated on screen, because a silent truncation of
 * somebody's job description is worse than a refusal: they cannot see what the
 * interviewer was actually given.
 */
export function sanitisePatch(patch: SetupPatch): Record<string, unknown> {
  const update: Record<string, unknown> = {}
  if (patch.roleTitle !== undefined) update.role_title = patch.roleTitle.trim().slice(0, 120)
  if (patch.company !== undefined) update.company = patch.company.trim().slice(0, 120)
  if (patch.jobDescription !== undefined) {
    update.job_description = patch.jobDescription.slice(0, JD_LIMIT)
  }
  if (patch.field !== undefined) {
    update.field = isInterviewFieldId(patch.field) ? patch.field : DEFAULT_FIELD
  }
  if (patch.round !== undefined) {
    update.round_type = isRoundTypeId(patch.round) ? patch.round : DEFAULT_ROUND
  }
  if (patch.customQuestions !== undefined) {
    update.custom_questions = patch.customQuestions
      .map((question) => question.trim().slice(0, QUESTION_CHARS))
      .filter((question) => question.length > 0)
      .slice(0, QUESTION_LIMIT)
  }
  if (patch.captions !== undefined) update.captions_enabled = patch.captions === true
  if (patch.interviewerSlug !== undefined) update.interviewer_slug = patch.interviewerSlug
  if (patch.difficulty !== undefined) {
    // Clamped into the ladder rather than refused, for the same reason every
    // other bound here is: a value the form cannot produce is a hand-edited row
    // or an old client, and a setup nobody can open is a rep nobody can run.
    update.difficulty = patch.difficulty === null || !isDifficultyLevel(toDifficultyLevel(patch.difficulty))
      ? null
      : toDifficultyLevel(patch.difficulty)
  }
  return update
}

export async function writeInterviewSetup(patch: SetupPatch): Promise<{ ok: boolean; message: string | null }> {
  const user = await currentUser()
  if (!user) return { ok: false, message: 'Not saved — you are signed out.' }
  const update = sanitisePatch(patch)
  if (Object.keys(update).length === 0) return { ok: true, message: null }

  const supabase = await supabaseServer()
  const { error } = await supabase
    .from('interview_setups')
    .upsert({ user_id: user.id, ...update }, { onConflict: 'user_id' })
  if (error) return { ok: false, message: `Not saved — ${error.message}` }
  return { ok: true, message: null }
}

/**
 * The CV pointer and its extracted text, written together.
 *
 * One write rather than two, because a row that names a file and carries the
 * previous file's text is worse than a row that carries neither: the
 * interviewer would be asking about a job the user has just replaced.
 */
export async function writeCvRecord(input: {
  path: string | null
  fileName: string | null
  text: string | null
  error: string | null
}): Promise<{ ok: boolean; message: string | null }> {
  const user = await currentUser()
  if (!user) return { ok: false, message: 'Not saved — you are signed out.' }
  const text = input.text ? capCvText(input.text) : null
  const supabase = await supabaseServer()
  const { error } = await supabase.from('interview_setups').upsert({
    user_id: user.id,
    cv_path: input.path,
    cv_filename: input.fileName,
    cv_uploaded_at: input.path ? new Date().toISOString() : null,
    cv_text: text,
    cv_text_chars: text ? text.length : null,
    cv_error: input.error,
  }, { onConflict: 'user_id' })
  if (error) return { ok: false, message: `Not saved — ${error.message}` }
  return { ok: true, message: null }
}

/**
 * The CV text the prompt is allowed to carry.
 *
 * Cut on a paragraph boundary rather than mid-word, and the cap is stated on
 * screen (`cvTextChars`) so nobody discovers by accident that half their career
 * did not reach the interviewer.
 */
export function capCvText(text: string, limit: number = CV_LIMIT): string {
  const clean = text.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  if (clean.length <= limit) return clean
  const cut = clean.slice(0, limit)
  const boundary = Math.max(cut.lastIndexOf('\n'), cut.lastIndexOf('. '))
  return (boundary > limit * 0.6 ? cut.slice(0, boundary) : cut).trim()
}

/** The extracted CV, for the compiled prompt. Service role; never the browser. */
export async function readCvText(userId: string): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin()
      .from('interview_setups')
      .select('cv_text')
      .eq('user_id', userId)
      .maybeSingle()
    return data?.cv_text ?? null
  } catch {
    return null
  }
}
