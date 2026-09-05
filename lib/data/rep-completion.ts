/** Persist first, then let grading and the audio archive finish independently. */
export async function completeRep(tasks: {
  save: () => Promise<unknown>
  upload: () => Promise<unknown>
  grade: () => Promise<unknown>
}): Promise<void> {
  await tasks.save().catch(() => undefined)
  await Promise.allSettled([tasks.upload(), tasks.grade()])
}
