/**
 * The bounds the interview setup states on screen and enforces on write.
 *
 * Its own module because both sides need them and `lib/db/interview.ts` is
 * `server-only`: the form has to render the character counter the write is
 * going to apply, and a counter that disagrees with the limit is how somebody
 * discovers by accident that half their job description did not reach the
 * interviewer.
 */

/** What a job description may be. Stated beside the field, not silently cut. */
export const JOB_DESCRIPTION_LIMIT = 6_000

/** How many questions somebody may ask to be asked. */
export const CUSTOM_QUESTION_LIMIT = 10
export const CUSTOM_QUESTION_CHARS = 240

/** How much CV text reaches the compiled prompt (C3). */
export const CV_TEXT_LIMIT = 12_000
