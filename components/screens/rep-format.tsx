/**
 * The three facts about the rep format, on the brief.
 *
 * ── WHY IT IS ITS OWN FILE ───────────────────────────────────────────────
 *
 * It lived in `onboarding-screens.tsx`, beside the run's own ready step, and
 * `rep-screens.tsx` imported it from there. That was free until `/start`
 * needed it too: the funnel is the coldest page in the product — somebody four
 * seconds off a video, often on a phone, on mobile data — and importing eight
 * lines of table from that module pulled the microphone step, the pause
 * calibrator, the sheet and four Server Actions into the bundle with it.
 *
 * Nothing about the component changed in the move.
 */

/**
 * The three facts about the format, on the brief.
 *
 * The interview row used to read `Time 8:00` — a number no round has had since
 * length became a property of the round (§5.7), which runs from five minutes to
 * twenty-five — and `It ends: When they've heard enough`, which is not how it
 * ends. It ends on the clock, like everything else here, and saying otherwise
 * makes a candidate answer as though they can be dismissed early.
 *
 * ── E1: THE GOAL ROW NAMED THE ONE THING WORTH ZERO ──────────────────────
 *
 * It read `Goal · Get her number` on the dating arm and `Goal · Answer well
 * enough to be called back` on the interview one. Rule 2 is the product —
 * **outcome is never scored** — and the landing page argues exactly that:
 * "whether she gave you a number, agreed to anything, or walked away
 * contributes exactly zero". This block is the last thing read before the
 * microphone opens, so it was not a copy inconsistency: it was an instruction,
 * at the moment of highest attention, to play for the result. Close and Signal
 * reading are the two dimensions that collapse when somebody does that, so the
 * screen was priming the failure and the grader was then scoring it.
 *
 * Both rows now name a MANNER rather than a result. The mechanic is untouched —
 * she still decides at the end, and the interview still ends on the clock — and
 * neither `lib/data/mission.ts` nor `lib/data/guided.ts` is edited, because both
 * are Tier 0 under rule 19 and neither is where this sentence lived.
 */
export function RuleBlock({ interview, minutes }: { interview: boolean; minutes?: number }) {
  const rows = interview
    ? [['Time', `${minutes ?? 20}:00`], ['It ends', 'When time runs out']]
    : [['Time', '3:00'], ['She leaves', 'When time runs out']]
  return <div className="rule-block">{rows.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
}

/**
 * THE GOAL, AS A SENTENCE RATHER THAN A TABLE ROW.
 *
 * ── WHY IT LEFT THE TABLE (13 September) ─────────────────────────────────
 *
 * E1 fixed what the goal SAID. This fixes where it sat, which turned out to be
 * the other half of the same problem. A real first-time user finished the
 * eight-screen `/start` run, made an account, arrived on the brief and pressed
 * Start without reading any of it — then sat in silence watching a clock,
 * because he did not know what he was meant to be doing.
 *
 * He was not careless. `/start` is eight screens of copy-then-**Next**, and the
 * brief is a ninth screen of copy-then-button. By the time somebody reaches it
 * they have been trained for two minutes to tap the thing at the bottom. So the
 * goal being present was never the question — it was present, as row two of a
 * three-row data table in the seventh of ten blocks, and a table is scanned
 * rather than read.
 *
 * It is a headline now, the largest thing on the screen after her name, and the
 * table keeps only the facts a table is good at: a duration and an ending.
 *
 * **Still a manner, never a result**, for every reason E1 gives above — the
 * words changed size, not meaning. It also names the STAKE ("she can lose
 * interest and go"), which is the part that makes three minutes read as
 * something to play rather than a form to complete, and which is true: she is
 * modelled to disengage and `resultReading` already owns what that means.
 */
export function repGoal(interview: boolean, minutes?: number): string {
  // The minutes are the ROUND's, never a constant. §5.7 made length a property
  // of the round — five to twenty-five — and the table row this replaced was
  // already reading `${minutes}:00` for exactly that reason. A headline that
  // says "twenty minutes" over a ten-minute screen is the `Time 8:00` bug
  // again, one font size larger.
  return interview
    ? `${minutes ?? 20} minutes. Answer like the person they should call back — they are deciding as you go.`
    : 'Three minutes. Keep her interested — she can lose interest and go.'
}

/**
 * The same goal, cut to what can be read inside a 2.1-second countdown.
 *
 * ── WHY THE COUNTDOWN CARRIES IT AT ALL ──────────────────────────────────
 *
 * Because it is the one moment in the run that cannot be tapped past. Every
 * other surface competes with a button the user has been conditioned to press;
 * `3 · 2 · 1` has no button, lasts 2.1 seconds, and is the only thing moving on
 * the screen, so it is the one place attention is not merely hoped for. It cost
 * nothing to use: the count was bare digits.
 *
 * Deliberately shorter than `repGoal`. This is read in about a second, at a
 * glance, by somebody who is about to speak — so it is the instruction and the
 * stake and nothing else. §05's "no coaching during a live rep" is intact: the
 * count is over before the session opens, and this never appears again.
 */
export function repGoalShort(interview: boolean): string {
  return interview ? 'They are deciding as you go.' : 'Keep her interested. She can leave.'
}
