/**
 * The `interview_setups` row, and the shape both sides read it in.
 *
 * Its own module because `lib/db/interview.ts` is `server-only` and the browser
 * reads this table too — `fetchInterviewSetup` runs client-side through the
 * user's own RLS policies, which is correct: the setup is the user's own
 * document about their own job hunt (C1). One shape, two callers, no drift.
 */

import {
  isRoundTypeId,
  type RoundTypeId,
} from '@/lib/data/interview-credits'
import {
  DEFAULT_FIELD,
  isInterviewFieldId,
  type InterviewFieldId,
} from '@/lib/data/interview-fields'
import {
  difficultyFor,
  isDifficultyLevel,
  type DifficultyLevel,
} from '@/lib/data/interview-difficulty'

export const INTERVIEW_SETUP_COLUMNS =
  'role_title, company, job_description, field, round_type, cv_filename, cv_path, '
  + 'cv_uploaded_at, cv_text_chars, cv_error, custom_questions, captions_enabled, interviewer_slug, '
  + 'difficulty'

export interface InterviewSetupRecord {
  roleTitle: string
  company: string
  jobDescription: string
  field: InterviewFieldId
  /**
   * The round this account last CHOSE, or null if it never has.
   *
   * ── WHY NULL IS A VALUE HERE AND NOT A DEFAULT ───────────────────────────
   *
   * This clamped a null `round_type` to `DEFAULT_ROUND` — the ten-minute
   * recruiter screen, which costs a credit — and that quietly made dead code of
   * every `roundFor(setup?.round, hasScreener)` call in the product. The
   * fallback only ever fired when there was no ROW at all, so B1 came back the
   * moment anything created one: `/interview/setup/role` upserts without a
   * round, and since D24 sign-up seeds a row with the role on it. A brand-new
   * account then read "Recruiter screen · 1 credit" on the home screen, the run
   * setup and the brief, holding nothing but a free screener credit — and was
   * refused the interview its own sign-up screen had called free.
   *
   * So null means *never chosen*, and every reader answers it with `roundFor`,
   * which knows what a free screener can actually buy. Nothing downstream may
   * re-introduce a default of its own: the four screens call `roundFor`, and
   * the token route and the credit hold reach the same function through
   * `resolveInterviewRound`.
   */
  round: RoundTypeId | null
  cvFileName: string | null
  cvPath: string | null
  cvUploadedAt: string | null
  /** How much of the CV was kept. Null when there is no CV or no extraction. */
  cvTextChars: number | null
  /** Why extraction failed, in a sentence the screen can show. */
  cvError: string | null
  customQuestions: string[]
  captions: boolean
  interviewerSlug: string | null
  /**
   * The stored slider, or null when it has never been touched (§5.2).
   *
   * Null is not "level 3" — it means **follow my title**, so somebody who edits
   * their role from Junior to Senior and never opens the slider gets harder
   * questions, which is what they asked for by editing the title. `difficulty`
   * below is the resolved answer and is what everything downstream reads.
   */
  difficultyChoice: DifficultyLevel | null
  /** What this account's next interview actually runs at. */
  difficulty: DifficultyLevel
  /**
   * Enough to run an interview.
   *
   * **A role, and nothing else.** The CV is optional by design (§C4: a missing
   * CV degrades to field plus role plus job description rather than to a
   * generic interview), and demanding one would put a document upload between
   * a person and the thing they came to practise.
   */
  complete: boolean
}

export type SetupRow = {
  role_title: string | null
  company: string | null
  job_description: string | null
  field: string | null
  round_type: string | null
  cv_filename: string | null
  cv_path: string | null
  cv_uploaded_at: string | null
  cv_text_chars: number | null
  cv_error: string | null
  custom_questions: string[]
  captions_enabled: boolean
  interviewer_slug: string | null
  difficulty: number | null
}

export function setupFromRow(row: SetupRow | null): InterviewSetupRecord | null {
  if (!row) return null
  const roleTitle = (row.role_title ?? '').trim()
  return {
    roleTitle,
    company: (row.company ?? '').trim(),
    jobDescription: row.job_description ?? '',
    field: isInterviewFieldId(row.field) ? row.field : DEFAULT_FIELD,
    // Null rather than a default — see the field's note. A value this table
    // does not recognise is also "never chosen": it cannot have come from the
    // picker, and guessing on its behalf is how the last default got here.
    round: isRoundTypeId(row.round_type) ? row.round_type : null,
    cvFileName: row.cv_filename,
    cvPath: row.cv_path,
    cvUploadedAt: row.cv_uploaded_at,
    cvTextChars: row.cv_text_chars,
    cvError: row.cv_error,
    customQuestions: row.custom_questions ?? [],
    captions: row.captions_enabled === true,
    interviewerSlug: row.interviewer_slug,
    difficultyChoice: isDifficultyLevel(row.difficulty) ? row.difficulty : null,
    difficulty: difficultyFor({ stored: row.difficulty, roleTitle }),
    complete: roleTitle.length > 0,
  }
}

export type { InterviewFieldId, RoundTypeId, DifficultyLevel }
