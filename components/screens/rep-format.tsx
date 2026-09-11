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
    ? [['Time', `${minutes ?? 20}:00`], ['Goal', 'Answer like the person they should call back'], ['It ends', 'When time runs out']]
    : [['Time', '3:00'], ['Goal', 'Have a conversation worth having'], ['She leaves', 'When time runs out']]
  return <div className="rule-block">{rows.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
}
