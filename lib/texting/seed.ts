/**
 * A thread's identity, as a string.
 *
 * ── THE DEFECT THIS EXISTS FOR ───────────────────────────────────────────
 *
 * `compileInstructions` rolls the character's mood with `options.rng ??
 * Math.random`. The voice arm passes an rng seeded from the rep
 * (`lib/voice/seed.ts`), so her afternoon holds for its whole length. **The old
 * text mode passed nothing**, so the mood was re-rolled on every single
 * message: Nadia has three authored moods, and across three messages in one
 * thread she was a woman whose sister had moved the coffee, then a woman who
 * had slept badly, then a woman who had found the present twenty minutes ago.
 *
 * It lands near the TOP of the compiled prompt, under "# Today, specifically",
 * which the compiler's own comment says the model "treats as something to talk
 * about rather than as an instruction". So she was not merely inconsistent, she
 * was actively bringing up a different evening every reply.
 *
 * It was also a bill. Because the volatile block sits near the front, the
 * prefix eligible for prompt caching collapsed from ~2,665 tokens to ~1,283 —
 * the authored contract alone. Seeding it from the thread roughly halves the
 * cost of a conversation as a side effect of fixing the character.
 *
 * ── WHY THE THREAD AND NOT THE USER ──────────────────────────────────────
 *
 * `started_at` is in the seed, so Start fresh genuinely starts fresh: a new
 * thread against the same character gets a new evening, which is what somebody
 * clicking it is asking for. Without it she would be having the same Wednesday
 * for the life of the account.
 */

/** The identity every seeded draw in a thread is taken from. */
export function threadSeed(input: {
  userId: string
  personaSlug: string
  startedAt: string
}): string {
  return `${input.userId}:${input.personaSlug}:${input.startedAt}`
}

/** The seed for one exchange's presence draw. */
export function exchangeSeed(seed: string, exchangeIndex: number): string {
  return `${seed}#${exchangeIndex}`
}
