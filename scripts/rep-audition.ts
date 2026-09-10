/**
 * Audition a character — a whole rep, end to end, without a microphone.
 *
 *   npm run rep:audition                      # Tess, struggling player, 1 rep
 *   npm run rep:audition -- tess struggling 5
 *   npm run rep:audition -- nadia median 2
 *   npm run rep:audition -- marcus-vance confidently_wrong 1 technical 4
 *   npm run rep:audition -- aisha-rahman plain_speaker 1 deep_technical 3
 *
 * The fourth and fifth arguments are INTERVIEW ONLY and are the round and the
 * difficulty (INTERVIEW-TECHNICAL-PLAN §9, T11). They default to the reference
 * round and mid, which is what the harness auditioned before this plan.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 *
 * Every defect in `docs/PERSONA-AUDIT.md` was found by reading the assembled
 * prompt, and reading cannot tell you whether a character is any good to talk
 * to. `db:rep` exercises the rep LIFECYCLE without a microphone; nothing
 * exercised the CHARACTER. So the one question the audit could not answer —
 * "is she enjoyable" — had no instrument at all, on the one part of the
 * product that can only be fixed by running it.
 *
 * This drives the real pipeline as far as it goes without audio:
 *
 *   · the system prompt is `compileInstructions`, the exact string the token
 *     route mints — persona, mood roll, derived block, absolute rules
 *   · warmth moves through the real `WarmthSession`, so the fast scorer, the
 *     temperament weighting, the affect axes and the posture are all live
 *   · the bracketed direction is `statelessDirective()` — the band on every
 *     turn, the standing orders only when the direction is genuinely new,
 *     which is the cadence the shipping ElevenLabs arm actually runs. It drove
 *     `directiveIfChanged()` until 5 September, so its numbers described the
 *     retained-instruction path no customer is on (PERSONA-AUDIT §11, "Owed")
 *   · her reply is trimmed by `capToBudget` at `session.replyWordCap` — the
 *     band's ceiling already lowered to mirror his last turn — which is the
 *     number `bindVoiceSteering` hands the live adapter. It read the band alone
 *     until 6 September, so the mirror cap and the silent turn, the two rules
 *     added that day, were the only two the harness could not see
 *   · a turn she stays silent on is a turn with no request, exactly as the
 *     adapter enforces it (`ReplyState.silent`), so a rep that goes quiet here
 *     goes quiet for a customer
 *   · scene beats fire off the rep clock through `dueSceneBeat`, and on the
 *     interview arm the agenda beats that move her off a thread do too
 *   · her turns go through `StabilityMeter`, at HER verbosity ceiling
 *
 * ── WHAT IT IS NOT ───────────────────────────────────────────────────────
 *
 * **It is not the voice model.** A rep runs on `gpt-realtime-mini`
 * speech-to-speech; this runs the character on the chat model, because there
 * is no way to hold a scripted conversation with the realtime API from a
 * terminal. So it tests THE PROMPT, which is what the audit changed, and it
 * cannot tell you how she sounds, how she times a reply, or whether she talks
 * over you. A green run here is a necessary condition for §17's gate and not
 * that gate.
 *
 * **`canEndScene` is false**, because there is no tool channel here. The exit
 * prose differs from a live rep by that one paragraph.
 *
 * IT SPENDS MONEY. Two model calls per turn — hers and the player's — so a
 * five-rep run is a few hundred cheap completions. Run by hand, never from a
 * build, the same rule `hero:audio` follows.
 */

import { loadEnvLocal } from './env'
import { getPersonaEverAuthored } from '../lib/personas'
import { compileInstructions } from '../lib/voice/openai/persona'
import { WarmthSession } from '../lib/warmth/session'
import { bandFor } from '../lib/warmth/bands'
import { capToBudget, sanitiseForSpeech } from '../lib/voice/elevenlabs/truncate'
import { chatApiKey, completeChat, type ChatMessage } from '../lib/voice/chat'
import { StabilityMeter, DEFAULT_VERBOSITY_MEDIAN } from '../lib/metrics/stability'
import { dueSceneBeat, DATING_DURATION_MS, ARM_THRESHOLD, INTERVIEW_THRESHOLD } from '../lib/data/rep-rules'
import type { Persona, TranscriptTurn } from '../lib/voice/types'
import { INTERVIEW_PLAYERS } from './interview-players'
import { dueInterviewBeat, isGrounded } from '../lib/data/interview-agenda'
import { REFERENCE_ROUND } from '../lib/warmth/interview/trajectory'
import { isRoundTypeId, roundType, type RoundTypeId } from '../lib/data/interview-credits'
import { toDifficultyLevel, type DifficultyLevel } from '../lib/data/interview-difficulty'
import { probeLadderEnabled } from '../lib/data/interview-probes'
import { opensOnDesignBrief } from '../lib/data/interview-briefs'
import { compileInterviewBrief } from '../lib/personas/interview/brief'
import { withInterviewBrief } from '../lib/personas/interview/overlay'

const CHARACTER_MODEL = process.env.PIPELINE_LLM_MODEL?.trim() || 'gpt-4.1-mini'
/** The player is a fixture, not a character. A cheaper model is correct here. */
const PLAYER_MODEL = process.env.AUDITION_PLAYER_MODEL?.trim() || 'gpt-4.1-mini'

/** Roughly a three-minute rep. The real cap is the clock, not a turn count. */
const MAX_TURNS = 16
/**
 * An interview is longer and its exchanges are longer (§6: ~22 of them over
 * twenty minutes). Auditioning one at sixteen three-minute turns would report a
 * character who never got past her second question.
 */
const INTERVIEW_MAX_TURNS = 22
/** Seconds a turn takes, for the transcript timings the fast scorer reads. */
const SECONDS_PER_EXCHANGE = 11
const INTERVIEW_SECONDS_PER_EXCHANGE = 55

/**
 * Who is at the microphone.
 *
 * `struggling` is the one that matters and the one nobody plays. It is the
 * case rung 1 exists for, it is the case the audit found broken, and it is the
 * last case a person tests when auditioning their own product — everybody
 * auditions as somebody who knows the mechanic.
 */
const PLAYERS: Record<string, string> = {
  struggling: [
    'You are a nervous man in his late twenties who has never done this before. You have just made yourself say something to a stranger and you are already regretting it.',
    'HARD LIMIT: never more than seven words in a reply. Most of your replies are two or three words.',
    'You never ask a question. You would not know what to ask.',
    'You agree and stop. "yeah", "no, same", "fair enough", "ha, right".',
    'You never tell a story and you never volunteer anything about yourself unless you are asked twice.',
    'Do not use the same filler phrase twice in a row.',
    'You are not rude and you are not weird. You are just out of your depth.',
  ].join(' '),
  median: [
    'You are a man in his late twenties who is a bit nervous but holding it together. This is not easy for you and you are doing it anyway.',
    'Reply in one short sentence, usually eight to fifteen words.',
    'MOST OF YOUR TURNS ARE STATEMENTS, NOT QUESTIONS. Never ask a question two turns running. Aim for roughly one question in every three or four turns — §07 targets three to eight in a whole three-minute rep, not one per turn.',
    'When you do not ask, react to what she said and add one small thing of your own.',
    'You sometimes miss what she is getting at. You do not banter well yet.',
  ].join(' '),
  competent: [
    'You are a man in his late twenties who is good at this without being slick.',
    'Reply in one or two sentences. You pick up on what she actually said and follow it.',
    'You ask open questions, you tease lightly, and you have your own opinions.',
    'You are never a salesman and you never push.',
  ].join(' '),
}

interface RepResult {
  index: number
  finalWarmth: number
  peakWarmth: number
  armed: boolean
  bands: string[]
  agentTurns: string[]
  medianAgentWords: number
  breaks: number
  drifts: number
  breakDetail: string[]
  distinctDirectives: number
  /** Turns the reply ceiling trimmed. See `capToBudget`. */
  cappedTurns: number
  /** Turns she had nothing to say on. See `mayStaySilentFor`. */
  silentTurns: number
  /** Beats that pushed her sideways, and beats that pushed her down (§6.4). */
  agendaBeats: number
  probeBeats: number
}

function words(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2
}

async function say(
  model: string,
  messages: ChatMessage[],
  temperature: number,
  key: string,
): Promise<string | null> {
  const completion = await completeChat({
    apiKey: key,
    model,
    messages,
    temperature,
    maxTokens: 160,
  })
  if (!completion.ok) {
    console.error(`  ! ${completion.error.message}`)
    return null
  }
  return completion.text
}

/**
 * The setup an interview audition runs against.
 *
 * The harness has no user and therefore no `interview_setups` row, so the brief
 * is a FIXTURE — and it is the same `compileInterviewBrief` the token route
 * calls, not a hand-written approximation of it. That distinction is the whole
 * point of the harness: a bench that assembles its own prompt is auditioning a
 * character the product does not ship (`INTERVIEW-PLAN.md` §14 is the note, and
 * it was written about the agenda beats being absent here for a week).
 *
 * `software` because that is the one field with probe domains and design briefs
 * authored (§7.2), and the whole reason T11 exists is to hear them out loud.
 */
const AUDITION_ROLE = 'Senior Backend Engineer'
const AUDITION_FIELD = 'software' as const
const AUDITION_CV = [
  'Backend engineer, six years.',
  'Most recently on a payments team: a service that took card authorisations, wrote them to Postgres and'
  + ' published events for downstream reconciliation. Owned the retry path after a provider outage.',
  'Before that, a customer messaging product — a chat feature with WebSockets, presence, and a read-receipt'
  + ' system that had to survive people going offline on trains.',
  'Comfortable with Postgres, Redis, Go and TypeScript. Has been on call.',
].join('\n')

interface AuditionOptions {
  round: RoundTypeId
  difficulty: DifficultyLevel
}

async function runRep(
  persona: Persona,
  playerBrief: string,
  index: number,
  key: string,
  options: AuditionOptions,
): Promise<RepResult | null> {
  // THE BRIEF THE TOKEN ROUTE WOULD HAVE COMPILED, on the interview arm.
  //
  // Without it the harness auditions an interviewer who has been given no
  // field, no CV, no probe domains and no design problem — which is a
  // character the product does not ship, and is exactly how the agenda beats
  // went un-auditioned for a week. `withInterviewBrief` is a no-op on the
  // dating arm, so Tess compiles the byte-identical prompt she always did.
  const interviewBrief = persona.track === 'interview'
    ? compileInterviewBrief({
      roleTitle: AUDITION_ROLE,
      company: '',
      jobDescription: '',
      field: AUDITION_FIELD,
      round: options.round,
      cvText: AUDITION_CV,
      customQuestions: [],
      difficulty: options.difficulty,
      // Per rep, so a five-rep run of a design round hears more than one
      // problem — which is the only way to notice that one of them is thin.
      seed: `audition-${index}-${Date.now()}`,
    })
    : ''
  const briefed = withInterviewBrief(persona, { interviewBrief })
  // The exact prompt the token route mints, mood roll included.
  const instructions = compileInstructions(briefed, { canEndScene: false })

  const probes = persona.track === 'interview'
    && probeLadderEnabled({ round: options.round, field: AUDITION_FIELD })
  /** She poses the authored design problem on her first turn (§4.3, §6.7). */
  const posesBrief = probes && opensOnDesignBrief({ round: options.round, field: AUDITION_FIELD })

  let clock = 0
  const session = new WarmthSession({
    persona: briefed,
    trajectory: persona.trajectory,
    scorer: null,
    nowSeconds: () => clock,
    // §6.7. Her first turn on a design round poses a sixty-word problem and
    // every interview band tops out at thirty-four; without this the harness
    // would report a brief truncated to a sentence and a half as her writing
    // one.
    ...(posesBrief ? { openingTurnKind: 'brief' as const } : {}),
  })

  const meter = new StabilityMeter({
    // Hers, not the roster's. A character with her own band table is allowed a
    // longer median and must not be scored as broken for using it.
    verbosityMedian: persona.verbosityMedian ?? DEFAULT_VERBOSITY_MEDIAN,
    // And an interviewer asks a question on nearly every turn on purpose. The
    // first audition of one reported 1.34 breaks per five minutes, all of them
    // this rule, on a rep where nothing was wrong.
    questionsAreTheJob: persona.track === 'interview',
  })

  const history: ChatMessage[] = []
  const agentTurns: string[] = []
  const bands: string[] = []
  const directives = new Set<string>()
  const breakDetail: string[] = []
  let peak = session.engine.warmth
  let beatsFired = 0
  /** Agenda beats fired — the ones that move her off a thread. */
  let agendaFired = 0
  /** Probe beats fired — the ones that take her down rather than sideways. */
  let probeFired = 0
  /** The last beat of any kind, in harness seconds. See `dueInterviewBeat`. */
  let lastBeatAt: number | null = null
  /** Every user turn so far, for the grounded gate. */
  const transcript: TranscriptTurn[] = []
  /** Turns the reply ceiling actually trimmed. High is not a fault; it is the
   *  gap between what she wants to say and what she is allowed. */
  let capped = 0
  /** Turns she said nothing at all. */
  let silent = 0

  const maxTurns = persona.track === 'interview' ? INTERVIEW_MAX_TURNS : MAX_TURNS
  const secondsPerExchange = persona.track === 'interview'
    ? INTERVIEW_SECONDS_PER_EXCHANGE
    : SECONDS_PER_EXCHANGE
  // Scene beats fire on a FRACTION of the rep, so the denominator has to be the
  // rep this character actually runs. Against `DATING_DURATION_MS` a
  // twenty-minute interview fires every beat in its first three minutes.
  const repLengthMs = persona.track === 'interview'
    ? maxTurns * (secondsPerExchange + 3) * 1000
    : DATING_DURATION_MS
  const auditionRound = options.round

  for (let turn = 0; turn < maxTurns; turn += 1) {
    // ── his turn ────────────────────────────────────────────────────────
    const playerMessages: ChatMessage[] = [
      { role: 'system', content: playerBrief },
      {
        role: 'system',
        content:
          `You are talking to a woman you do not know, in this situation: ${persona.scene} `
          + 'Write only what you say out loud. No stage directions, no quotation marks, no narration. '
          + (turn === 0 ? 'This is your opening line. You have to start it.' : ''),
      },
      // Her side is the "user" from the player's point of view.
      ...history.map((message) => ({
        role: message.role === 'assistant' ? ('user' as const) : ('assistant' as const),
        content: message.content,
      })),
    ]
    const userText = await say(PLAYER_MODEL, playerMessages, 0.9, key)
    if (!userText) return null

    clock += secondsPerExchange
    const userTurn: TranscriptTurn = {
      speaker: 'user',
      text: userText,
      t_start: clock - 4,
      t_end: clock,
    }
    session.onUserTurn(userTurn)
    transcript.push(userTurn)
    meter.observeUser()
    history.push({ role: 'user', content: userText })

    const warmth = session.engine.warmth
    peak = Math.max(peak, warmth)
    bands.push(bandFor(warmth))

    // ── what she is told, on the shipping cadence ───────────────────────
    //
    // Read in the same order and through the same three members as
    // `bindVoiceSteering`, which is the seam the live adapter uses. Reading
    // them in any other order tests a pipeline nobody is on: `staysSilent`
    // refuses two in a row and so has to be recorded before the next turn, and
    // the ceiling depends on the shape of the turn just scored.
    const saysNothing = session.staysSilent
    session.noteSilence(saysNothing)

    // SHE HAS NOTHING TO SAY. No request, no turn, no cost — the adapter
    // enforces this by making no call at all rather than by asking a model for
    // an empty line. The clock still moves, so the rep can still run out.
    if (saysNothing) {
      silent += 1
      process.stdout.write(
        `\n  ${String(turn + 1).padStart(2)}  warmth ${warmth.toFixed(0)} ${bandFor(warmth)}\n`
          + `      HIM  ${userText}\n`
          + '      HER  (nothing)\n',
      )
      clock += 3
      continue
    }

    const steer: ChatMessage[] = []
    const directive = session.statelessDirective()
    if (directive) {
      directives.add(directive)
      steer.push({ role: 'system', content: directive })
    }
    // The ceiling the live turn is held to: the band's, lowered to mirror what
    // he just gave (`mirrorCapFor`). Read after the directive, for the same
    // reason the adapter reads both out of one `ReplyState`.
    const replyCap = session.replyWordCap
    // THE SENTENCE CEILING TOO, or this instrument measures a path nobody is
    // on — the same defect this file's header records twice already, once for
    // `directiveIfChanged` and once for the mirror cap.
    const replySentences = session.replySentenceCap

    // ── what the room does to her, on its own clock ─────────────────────
    const elapsedFraction = (clock * 1000) / repLengthMs
    const beat = dueSceneBeat({
      beats: persona.sceneBeats,
      elapsedFraction,
      fired: beatsFired,
    })
    if (beat) {
      beatsFired += 1
      steer.push({ role: 'system', content: beat.direction })
    } else if (persona.track === 'interview') {
      // THE SAME BEATS THE LIVE REP FIRES.
      //
      // The harness was firing scene beats and not agenda beats, so it was
      // auditioning a character the product does not ship — and the first
      // audition after the agenda fix showed nothing, because the fix was not
      // in the code path being auditioned. A harness that drives a different
      // pipeline from the one customers are on is a harness that goes green
      // while the thing they use has drifted.
      //
      // The probe ladder joined it on the same rule: one arbitrator, both
      // clocks, at most one direction per turn (`dueInterviewBeat`).
      const due = dueInterviewBeat({
        elapsedFraction,
        round: auditionRound,
        difficulty: options.difficulty,
        agendaFired,
        probeFired,
        ladder: probes,
        grounded: isGrounded(transcript),
        msSinceLastBeat: lastBeatAt === null
          ? Number.POSITIVE_INFINITY
          : (clock - lastBeatAt) * 1000,
      })
      if (due) {
        lastBeatAt = clock
        if (due.kind === 'agenda') agendaFired += 1
        else probeFired += 1
        steer.push({ role: 'system', content: due.beat.direction })
      }
    }

    // ── her turn ────────────────────────────────────────────────────────
    const generated = await say(
      CHARACTER_MODEL,
      [{ role: 'system', content: instructions }, ...history, ...steer],
      0.9,
      key,
    )
    if (!generated) return null
    // The live turn stops synthesising at the flush that reaches the ceiling.
    // Applied here so the transcript she is fed back — and every number this
    // harness prints — is what a customer would actually have heard.
    // Sanitised first, exactly as `combined.ts` does it, so the sentence count
    // is taken on the punctuation that would actually be spoken.
    const agentText = capToBudget(sanitiseForSpeech(generated), replyCap, { sentences: replySentences })
    if (agentText !== generated) capped += 1

    history.push({ role: 'assistant', content: agentText })
    agentTurns.push(agentText)
    session.onAgentTurn({
      speaker: 'agent',
      text: agentText,
      t_start: clock,
      t_end: clock + 3,
    })
    for (const hit of meter.observe(agentText, clock)) {
      breakDetail.push(`${hit.severity} · ${hit.rule} · ${hit.match}`)
    }
    clock += 3

    // Full turns, not truncated. The whole reason this harness exists is that
    // a summary statistic cannot tell you whether somebody is good company.
    process.stdout.write(
      `\n  ${String(turn + 1).padStart(2)}  warmth ${warmth.toFixed(0)} ${bandFor(warmth)}\n`
        + `      HIM  ${userText}\n`
        + `      HER  ${agentText}   [${words(agentText)}w`
        + `${agentText === generated ? '' : `, capped from ${words(generated)}w`}]\n`,
    )
    for (const line of steer) process.stdout.write(`      →    ${line.content}\n`)
  }

  const stats = meter.stats(clock)
  return {
    index,
    finalWarmth: session.engine.warmth,
    peakWarmth: peak,
    // The bar this character is actually judged against. An interviewer never
    // "arms" — a callback is decided afterwards by the grade, not in the room —
    // so on that track this reads "cleared the impression the callback turns
    // on" (`INTERVIEW_THRESHOLD`), which is the number the result screen shows.
    armed: peak >= (persona.track === 'interview' ? INTERVIEW_THRESHOLD : ARM_THRESHOLD),
    bands,
    agentTurns,
    medianAgentWords: median(agentTurns.map(words)),
    breaks: stats.breaks,
    drifts: stats.drifts,
    breakDetail,
    distinctDirectives: directives.size,
    cappedTurns: capped,
    silentTurns: silent,
    agendaBeats: agendaFired,
    probeBeats: probeFired,
  }
}

async function main(): Promise<void> {
  await loadEnvLocal()

  const [slugArg, playerArg, countArg, roundArg, difficultyArg] = process.argv.slice(2)
  const slug = slugArg ?? 'tess'
  const player = playerArg ?? 'struggling'
  const reps = Number(countArg ?? 1)
  // INTERVIEW ONLY, and both default to what the harness auditioned before
  // this plan: the reference round `interviewTrajectory` leaves untouched, and
  // mid. A bad round name is refused rather than silently clamped — a run that
  // says "technical" and quietly auditions a recruiter screen is worse than no
  // run, because its transcript looks like evidence.
  if (roundArg !== undefined && !isRoundTypeId(roundArg)) {
    console.error(`No round "${roundArg}". One of: screener, recruiter, technical, deep_technical, final.`)
    process.exit(1)
  }
  const round: RoundTypeId = isRoundTypeId(roundArg) ? roundArg : REFERENCE_ROUND
  const difficulty = toDifficultyLevel(difficultyArg === undefined ? 3 : Number(difficultyArg))

  const persona = getPersonaEverAuthored(slug)
  if (!persona) {
    console.error(`No persona "${slug}".`)
    process.exit(1)
  }
  // B10. An interviewer auditioned against "a nervous man in a bookshop"
  // produces a transcript that proves nothing about whether she interviews
  // well. The dating archetypes are unchanged and live where they always did;
  // the interview ones are a separate file so tuning one arm cannot edit the
  // other's fixtures.
  const roster = persona.track === 'interview'
    ? { ...INTERVIEW_PLAYERS }
    : { ...PLAYERS }
  const brief = roster[player]
  if (!brief) {
    console.error(`No player "${player}" for the ${persona.track} track. One of: ${Object.keys(roster).join(', ')}`)
    process.exit(1)
  }

  const key = chatApiKey()
  if (!key.ok) {
    console.error(key.error.message)
    process.exit(1)
  }

  console.log(
    `\nAuditioning ${persona.name} (rung ${persona.level}) against a ${player} player.`
      + `\nCharacter: ${CHARACTER_MODEL} · player: ${PLAYER_MODEL} · ${reps} rep(s) of `
      + `${persona.track === 'interview' ? INTERVIEW_MAX_TURNS : MAX_TURNS} turns.`
      + (persona.track === 'interview'
        ? `\nRound: ${roundType(round).label} · ${roundType(round).shape} · difficulty ${difficulty}`
          + ` · field ${AUDITION_FIELD}`
        : '')
      + `\nThis is the prompt, not the voice — see the note at the top of this file.\n`,
  )

  const results: RepResult[] = []
  for (let i = 1; i <= reps; i += 1) {
    console.log(`── rep ${i} ─────────────────────────────────────────────────────`)
    const result = await runRep(persona, brief, i, key.key, { round, difficulty })
    if (!result) {
      console.error('  rep aborted.')
      continue
    }
    results.push(result)
    console.log(
      `  → final ${result.finalWarmth.toFixed(1)} · peak ${result.peakWarmth.toFixed(1)}`
        + ` · ${result.armed ? 'ARMED' : 'not armed'} · median ${result.medianAgentWords} words`
        + ` · ${result.breaks} breaks / ${result.drifts} drifts`
        + ` · ${result.distinctDirectives} distinct directions`
        + ` · ${result.cappedTurns}/${result.agentTurns.length} capped`
        + `${result.silentTurns ? ` · ${result.silentTurns} silent` : ''}`
        + `${persona.track === 'interview' ? ` · ${result.agendaBeats} moved / ${result.probeBeats} probed` : ''}\n`,
    )
    for (const detail of result.breakDetail) console.log(`     ${detail}`)
  }

  if (results.length === 0) {
    console.error('Nothing completed.')
    process.exit(1)
  }

  // The M0 gate is breaks per five minutes; these reps are about three.
  // The rate has to be per five minutes of the rep that ran, not of a rep this
  // character never has. Reported against the dating gate either way, and the
  // gate is a dating number — an interview rung is auditioned against itself
  // over time rather than against < 0.5.
  const turnsPerRep = persona.track === 'interview' ? INTERVIEW_MAX_TURNS : MAX_TURNS
  const perExchange = persona.track === 'interview'
    ? INTERVIEW_SECONDS_PER_EXCHANGE
    : SECONDS_PER_EXCHANGE
  const minutes = (results.length * turnsPerRep * (perExchange + 3)) / 60
  const totalBreaks = results.reduce((sum, result) => sum + result.breaks, 0)
  console.log('══ summary ══════════════════════════════════════════════════════')
  console.log(`  reps                 ${results.length}`)
  console.log(`  armed                ${results.filter((r) => r.armed).length}/${results.length}`)
  console.log(
    `  median agent words   ${median(results.map((r) => r.medianAgentWords))}`,
  )
  console.log(
    `  distinct directions  ${median(results.map((r) => r.distinctDirectives))} per rep (median)`,
  )
  // How often what she wanted to say ran past what she is allowed. Not a
  // fault: it is the size of the gap the ceiling is closing, and it is the
  // number to watch after a retune of `bands.ts` or `reciprocity.ts`.
  console.log(
    `  capped by the ceiling ${results.reduce((sum, r) => sum + r.cappedTurns, 0)}`
    + `/${results.reduce((sum, r) => sum + r.agentTurns.length, 0)} turns`,
  )
  // Zero is not a pass. She is allowed to have nothing to say, and a rep where
  // the player never gives her a reason to withdraw simply will not show one.
  console.log(
    `  said nothing at all  ${results.reduce((sum, r) => sum + r.silentTurns, 0)} turns`,
  )
  console.log(`  breaks / 5 min       ${((totalBreaks / minutes) * 5).toFixed(2)}  (gate < 0.5)`)
  console.log(`  drifts               ${results.reduce((sum, r) => sum + r.drifts, 0)}`)
  console.log(
    `  bands visited        ${[...new Set(results.flatMap((r) => r.bands))].join(', ')}\n`,
  )
}

void main()
