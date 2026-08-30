/**
 * The report reasons, authored here and rendered from here (§16, §10 H).
 *
 * A fixed list rather than a free-text box alone, because the categories are
 * what make a pile of reports readable — and one of them has to be "something
 * else" or the list quietly teaches people that anything not on it does not
 * count.
 *
 * They live beside the other safety rules rather than in `app/safety/actions.ts`
 * because that file is `'use server'`, and a "use server" module may export
 * nothing but async functions. Exporting this array from there compiled clean
 * and threw at render time on the first route that pulled the chunk in.
 */
export const REPORT_REASONS = [
  { value: 'content', label: 'She said something that crossed a line' },
  { value: 'behaviour', label: 'The rep went somewhere it should not have' },
  { value: 'broken', label: 'Something was broken — audio, transcript or score' },
  { value: 'other', label: 'Something else' },
] as const

export type ReportReason = (typeof REPORT_REASONS)[number]['value']
