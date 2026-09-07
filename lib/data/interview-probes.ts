/**
 * Probe domains — what an interviewer may test that the candidate KNOWS.
 *
 * ── THE DOMAIN IS AUTHORED. THE QUESTION IS HERS. ────────────────────────
 *
 * Rule 10 says content is authored in the repo and seeded, never generated at
 * runtime, and that rule has to survive a feature whose entire point is that
 * the question emerges from the conversation. This file is the resolution
 * (INTERVIEW-TECHNICAL-PLAN §6.1).
 *
 * What is authored: the domain, what a good answer touches at each of the five
 * difficulty levels, what a vague answer sounds like, and the kinds of thing a
 * candidate might say that open onto it. What is NEVER authored: a question
 * string. There is not one in this file and there must not be — a directive
 * that names the question is a script, and §05 and §11 both refuse one.
 *
 * This is the same shape as `lib/data/interview-fields.ts` and deliberately so:
 * a stem is a question an interviewer would really ask, given to her as context
 * and never read out. A probe domain is the same thing one rung deeper — it is
 * the SUBJECT, and she finds the sentence.
 *
 * ── AND THE HOOK IS THE MODEL'S JOB, NOT A REGEX ─────────────────────────
 *
 * A **hook** is a technical noun the candidate said out loud that opens onto a
 * domain: "we used WebSockets" hooks transport, "I stored the tokens in
 * localStorage" hooks authentication, "it got slow" hooks caching. Extraction
 * is hers. `opensFrom` below is GUIDANCE she reads, never a matcher this file
 * runs — a keyword scan over `vocabulary` would fire on "service" inside
 * "customer service" and would ask about database sharding on a static site,
 * which is worse than asking nothing because it teaches the candidate that the
 * interviewer is not listening (§6.2).
 *
 * ── SOFTWARE FIRST, AND ONLY SOFTWARE (§7.2) ─────────────────────────────
 *
 * Twelve fields × eight domains × five levels is a lot of authored prose, and
 * authoring it all before any of it has been heard out loud is exactly how the
 * field stems ended up all-experiential without anybody noticing. So `software`
 * is authored fully and the other eleven fields keep behaving exactly as they
 * do today: `probeDomainsFor` returns an empty list for them, `dueProbeBeat`
 * fires nothing, and the round is the working interview it already was.
 *
 * The generalisation does hold and is recorded rather than built — healthcare
 * probes differential diagnosis, escalation criteria and consent; finance
 * probes accrual versus cash, revenue recognition and controls; teaching probes
 * assessment design and differentiation. The machinery is field-general even
 * though the content is not written yet.
 */

import type { DifficultyLevel } from './interview-difficulty'
import type { InterviewFieldId } from './interview-fields'
import { roundType, type RoundTypeId } from './interview-credits'
import { designBriefsFor } from './interview-briefs'

export interface ProbeDomain {
  id: string
  label: string
  /**
   * What a good answer touches, per difficulty level. **Never a question.**
   *
   * Written as the substance she is listening for, so she can tell a real
   * answer from a fluent one at the level she is pitching at.
   */
  substance: Record<DifficultyLevel, string>
  /** What a vague answer sounds like here. What to push on. */
  vagueness: string
  /** Hooks that open onto this domain, as guidance for her, not a matcher. */
  opensFrom: string[]
}

/**
 * Software, authored at all five levels.
 *
 * Eight domains rather than seven: §6.1 names seven and §6.2's worked example
 * — *"if it is a chat service, ask whether they used WebSockets or REST, then
 * ask them to explain the difference"* — is a transport question rather than an
 * API design one, so transport is its own domain. It is the specification's own
 * example and folding it into another domain would blur the thing the plan is
 * clearest about.
 */
export const SOFTWARE_PROBE_DOMAINS: readonly ProbeDomain[] = [
  {
    id: 'authentication',
    label: 'Authentication and sessions',
    substance: {
      1: 'that authentication is proving who you are and authorisation is what you may then do; that a request carries something proving it',
      2: 'the actual sequence — credentials in, something back, that something attached to later requests, and where it is kept',
      3: 'why a token rather than a server session, or the reverse: what each costs in storage, revocation and horizontal scale',
      4: 'expiry mid-flight, refresh, what a client does with a 401 it did not expect, and what the person in front of the screen sees',
      5: 'trust with a piece of the usual machinery removed — no shared clock, no shared store, a revocation that has to be immediate',
    },
    vagueness: 'naming a library or a standard and stopping there, with no account of what it does on the wire',
    opensFrom: [
      'login, sign-in or sign-up',
      'tokens, JWTs, cookies or sessions',
      'storing credentials anywhere, localStorage especially',
      'roles, permissions or "admin only"',
      'OAuth, SSO or a third-party identity provider',
    ],
  },
  {
    id: 'transport',
    label: 'Transport and protocols',
    substance: {
      1: 'that a request goes out and a response comes back, and that some things stay connected instead',
      2: 'which one they used and what it looked like — a call per action, or an open connection carrying messages',
      3: 'why that one and not the obvious alternative: connection cost, server state, ordering, who can start a message',
      4: 'the connection drops, or the network is bad — reconnection, missed messages, duplicates, what the user sees while it is down',
      5: 'the guarantee they are assuming is not available: no ordering, no delivery receipt, a proxy that buffers',
    },
    vagueness: 'naming the protocol as a brand rather than describing what it does differently',
    opensFrom: [
      'chat, messaging or anything live',
      'WebSockets, polling, long-polling, SSE or REST',
      'notifications or "it updates in real time"',
      'webhooks, or one service calling another',
    ],
  },
  {
    id: 'api_design',
    label: 'API design',
    substance: {
      1: 'that an API is a contract another program calls, and that it has inputs and outputs somebody has to agree on',
      2: 'what the endpoints were, what they took, what they gave back, and how an error was reported',
      3: 'why the shape they chose — one call or three, what belongs in the path, when a response is worth denormalising',
      4: 'a caller retrying, a partial failure, a field that has to change without breaking anybody already using it',
      5: 'designing the contract before the consumer exists, or with two consumers who want different shapes',
    },
    vagueness: 'describing the framework rather than the contract, or "we used REST" as if that were a design',
    opensFrom: [
      'an endpoint, a route or a controller',
      'integrating with somebody else\'s service',
      'versioning, or "we had to not break the app"',
      'GraphQL, gRPC or "we return JSON"',
    ],
  },
  {
    id: 'data_modelling',
    label: 'Data modelling',
    substance: {
      1: 'what a table or a collection is, and that things in one relate to things in another',
      2: 'the actual entities they had and how they were joined; what the primary key was',
      3: 'why that shape — normalising against read cost, where they denormalised and what it bought',
      4: 'a migration on live data, a constraint that turned out to be wrong, a query that fell off a cliff as rows grew',
      5: 'a model with a requirement that has not been decided yet, or one that has to serve two access patterns at once',
    },
    vagueness: 'listing the tables without saying why they are separate tables',
    opensFrom: [
      'a database, Postgres, Mongo or "the schema"',
      'a migration',
      'a join, an index or a slow query',
      'users having many of something',
    ],
  },
  {
    id: 'concurrency',
    label: 'Concurrency and consistency',
    substance: {
      1: 'that two things can happen at the same time, and that this is sometimes a problem',
      2: 'where in their own system two things could overlap, and what they did about it if anything',
      3: 'why the mechanism they chose — a transaction, a lock, a queue — and what it costs in throughput or latency',
      4: 'the failure they have actually seen or can describe: a double write, a lost update, a job that ran twice',
      5: 'correctness with no single place to serialise through, or where the operation must be safe to retry',
    },
    vagueness: 'saying "we used async" or "we added a queue" without naming what was being protected',
    opensFrom: [
      'a background job, a worker or a cron',
      'a queue, a lock or a transaction',
      'a race condition or a duplicate',
      '"two people could both..." anything',
    ],
  },
  {
    id: 'caching',
    label: 'Caching and performance',
    substance: {
      1: 'that a cache keeps an answer so it does not have to be worked out again',
      2: 'what they cached, where it lived, and how long they kept it',
      3: 'why that layer and not another — what it saved, and what it cost in staleness',
      4: 'invalidation: the write that has to be seen immediately, the stale read a user notices, the stampede on a cold cache',
      5: 'a cache with no reliable invalidation signal, or one shared across places that cannot coordinate',
    },
    vagueness: 'saying it was made faster without naming what was slow or how the improvement was measured',
    opensFrom: [
      '"it got slow" or "we had to speed it up"',
      'Redis, a CDN or an in-memory cache',
      'a page load time, a p99 or a latency number',
      'an N+1, a hot endpoint or a heavy query',
    ],
  },
  {
    id: 'error_handling',
    label: 'Errors and failure',
    substance: {
      1: 'that things fail, and that something has to happen when they do',
      2: 'what they did when a call failed — caught it, logged it, showed something, retried',
      3: 'which failures are worth retrying and which are not, and where the decision belongs',
      4: 'a dependency that is down rather than broken: timeouts, backoff, partial degradation, what the user is told',
      5: 'a failure they cannot detect directly, or one where retrying is itself dangerous',
    },
    vagueness: 'describing a try/catch as an error strategy, or "we logged it" with nothing reading the logs',
    opensFrom: [
      'an outage, an incident or "production broke"',
      'a retry, a timeout or a fallback',
      'logging, alerting or monitoring',
      '"the third-party API went down"',
    ],
  },
  {
    id: 'testing',
    label: 'Testing',
    substance: {
      1: 'that a test checks the code does what it should, without a person clicking through it',
      2: 'what they actually wrote tests for, and what running them looked like',
      3: 'what they test at which level and why — what a unit test buys that an end-to-end one does not',
      4: 'a bug that got through, and what kind of test would have caught it; a test that was flaky and what they did',
      5: 'testing something with no deterministic output, or where the expensive part cannot be run in the test',
    },
    vagueness: 'quoting a coverage percentage instead of naming what the tests protect',
    opensFrom: [
      'a bug that reached production',
      'CI, a pipeline or "the build"',
      'a refactor, or "we were afraid to change it"',
      'unit, integration or end-to-end tests',
    ],
  },
]

/**
 * The authored domains for a field.
 *
 * Empty for eleven of the twelve, and that is the shipping state (§7.2): a
 * field with no probe domains falls back to the current behaviour, which is a
 * working interview.
 */
const PROBE_DOMAINS: Partial<Record<InterviewFieldId, readonly ProbeDomain[]>> = {
  software: SOFTWARE_PROBE_DOMAINS,
}

export function probeDomainsFor(field: InterviewFieldId | string | null | undefined): readonly ProbeDomain[] {
  return PROBE_DOMAINS[field as InterviewFieldId] ?? []
}

/** Does this field have anything to probe with yet? */
export function fieldHasProbes(field: InterviewFieldId | string | null | undefined): boolean {
  return probeDomainsFor(field).length > 0
}

/**
 * The probe domains, rendered for the character contract.
 *
 * One block, appended to the brief, identical for every turn of a rep — which
 * is what keeps it inside the cached system-prompt prefix rather than being
 * paid for on every turn (C5, and the same reason the CV goes there).
 *
 * Only the substance for THIS rep's difficulty is rendered. Handing her all
 * five rungs and asking her to pick one is two decisions where there should be
 * one, and the level is already settled before the session opens.
 */
export function renderProbeDomains(
  domains: readonly ProbeDomain[],
  difficulty: DifficultyLevel,
): string {
  if (domains.length === 0) return ''
  return domains
    .map((domain) => [
      `- ${domain.label}. A real answer here touches ${domain.substance[difficulty]}.`,
      `  Vague sounds like: ${domain.vagueness}.`,
      `  They open onto it when they mention ${domain.opensFrom.join('; ')}.`,
    ].join('\n'))
    .join('\n')
}

/**
 * Does the probe ladder run at all on this rep?
 *
 * Three things have to be true and the third is easy to forget: the round has
 * to probe, and the field has to have the material the ladder climbs. A
 * `deep_technical` round in marketing is a real thing somebody may have bought
 * — the picker offers every round to every field — and running the design
 * ladder with no problem posed would be five directions about a brief that was
 * never given.
 *
 * When this is false the rep is the interview it was before this plan: the
 * agenda beat still moves her along, the field stems still supply the
 * questions, and nothing is broken.
 */
export function probeLadderEnabled(input: {
  round: RoundTypeId
  field: InterviewFieldId | string | null | undefined
}): boolean {
  const spec = roundType(input.round)
  if (spec.probeShare <= 0) return false
  return spec.shape === 'system_design'
    ? designBriefsFor(input.field).length > 0
    : fieldHasProbes(input.field)
}
