/**
 * The turn ticket (PERSONA-REALISM-REPORT L2): a browser can carry one and
 * cannot write one, and it names exactly one turn for a short while.
 */

import { describe, expect, it } from 'vitest'
import { TICKET_TTL_MS, signTurnTicket, ticketsEnabled, verifyTurnTicket, type TurnTicketClaims } from './ticket'

const env = { TURN_TICKET_SECRET: 'unit-test-secret' }
const claims: TurnTicketClaims = {
  userId: 'u1', sessionId: 's1', operationId: 'o1', personaSlug: 'tess',
  maxCostUsd: 0.04, context: { userName: 'Sam', previousOpeners: ['Hey.'] }, expiresAt: 10_000,
}
const expected = { userId: 'u1', sessionId: 's1', operationId: 'o1', personaSlug: 'tess' }

describe('turn tickets', () => {
  it('round-trips the claims, context included', async () => {
    const ticket = (await signTurnTicket(claims, env))!
    expect(await verifyTurnTicket(ticket, expected, { now: 5_000, env })).toEqual(claims)
  })

  it('refuses a ticket for another user, rep, turn or persona', async () => {
    const ticket = (await signTurnTicket(claims, env))!
    for (const key of ['userId', 'sessionId', 'operationId', 'personaSlug'] as const) {
      expect(await verifyTurnTicket(ticket, { ...expected, [key]: 'other' }, { now: 5_000, env }), key).toBeNull()
    }
  })

  it('refuses an expired ticket, a tampered one, and one signed with another secret', async () => {
    const ticket = (await signTurnTicket(claims, env))!
    expect(await verifyTurnTicket(ticket, expected, { now: 10_001, env })).toBeNull()
    const [body, signature] = ticket.split('.')
    const forged = btoa(JSON.stringify({ ...claims, maxCostUsd: 1 })).replace(/=+$/, '')
    expect(await verifyTurnTicket(`${forged}.${signature}`, expected, { now: 5_000, env })).toBeNull()
    expect(await verifyTurnTicket(`${body}.${signature}x`, expected, { now: 5_000, env })).toBeNull()
    expect(await verifyTurnTicket(ticket, expected, { now: 5_000, env: { TURN_TICKET_SECRET: 'another' } })).toBeNull()
    expect(await verifyTurnTicket('not-a-ticket', expected, { now: 5_000, env })).toBeNull()
  })

  it('issues nothing, and accepts nothing, without a secret', async () => {
    expect(ticketsEnabled({})).toBe(false)
    expect(await signTurnTicket(claims, {})).toBeNull()
    expect(await verifyTurnTicket('a.b', expected, { env: {} })).toBeNull()
    expect(TICKET_TTL_MS).toBeLessThanOrEqual(120_000)
  })
})
