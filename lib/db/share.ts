import 'server-only'

/**
 * Minting, resolving and revoking a share card (§18).
 *
 * **The token is the capability, so it is the only thing protecting the card.**
 * 32 hex characters from `crypto.randomBytes` — 128 bits, which is not
 * guessable and, unlike a sequential id, not enumerable either. The public
 * page resolves it with the service role, which is what lets `share_cards`
 * keep a single owner-read policy and no anonymous policy at all.
 *
 * Revocation sets a timestamp rather than deleting the row. A revoked card
 * must stop resolving while staying visible in the user's own list of what
 * they once shared — "I revoked that" is information they are entitled to.
 */

import { randomBytes } from 'node:crypto'
import { supabaseAdmin } from './admin'
import { assertPublishable, UnpublishableCard, type ShareCard, type ShareCardKind } from '@/lib/share/cards'

export function mintToken(): string {
  return randomBytes(16).toString('hex')
}

export interface StoredCard {
  token: string
  kind: ShareCardKind
  card: ShareCard
  createdAt: string
  revokedAt: string | null
}

/**
 * Create a card.
 *
 * The payload is assembled by the caller from data it read server-side, and
 * checked here one last time before it becomes public. `assertPublishable`
 * throws, and that is deliberate: everywhere else in this codebase a failed
 * write returns a result and the rep carries on, but the failure mode here is
 * a public artefact and not publishing is always recoverable (§14).
 */
export async function createShareCard(userId: string, card: ShareCard): Promise<StoredCard | null> {
  try {
    assertPublishable(card)
  } catch (error) {
    if (error instanceof UnpublishableCard) return null
    throw error
  }

  const token = mintToken()
  const { data, error } = await supabaseAdmin()
    .from('share_cards')
    .insert({ user_id: userId, token, kind: card.kind, payload: card as unknown as never })
    .select('token, kind, payload, created_at, revoked_at')
    .single()

  if (error || !data) return null
  return toStored(data)
}

/** Resolve a token for the public page. Null for unknown or revoked. */
export async function resolveShareCard(token: string): Promise<StoredCard | null> {
  if (!/^[0-9a-f]{32}$/.test(token)) return null

  const { data } = await supabaseAdmin()
    .from('share_cards')
    .select('token, kind, payload, created_at, revoked_at')
    .eq('token', token)
    .is('revoked_at', null)
    .maybeSingle()

  return data ? toStored(data) : null
}

/** Kill the page. Filtered on the owner, so a token alone cannot revoke. */
export async function revokeShareCard(userId: string, token: string): Promise<boolean> {
  const { error } = await supabaseAdmin()
    .from('share_cards')
    .update({ revoked_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('token', token)
    .is('revoked_at', null)
  return !error
}

function toStored(row: {
  token: string
  kind: string
  payload: unknown
  created_at: string
  revoked_at: string | null
}): StoredCard {
  return {
    token: row.token,
    kind: row.kind as ShareCardKind,
    card: row.payload as ShareCard,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
  }
}
