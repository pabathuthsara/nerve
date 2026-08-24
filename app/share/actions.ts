'use server'

/**
 * Making and revoking share cards (§18).
 *
 * **Opt-in per card, and never generated automatically** (§08). Nothing here
 * runs off the back of a rep or a milestone — a user asks for a card, and only
 * then does one exist. An artefact that appeared without being asked for is an
 * artefact somebody did not agree to publish.
 *
 * The payload is assembled HERE, from data read server-side, rather than being
 * accepted from the client. A card whose numbers came from the browser is a
 * card claiming whatever the browser felt like claiming.
 */

import { currentUser, supabaseServer } from '@/lib/db/server'
import { supabaseAdmin } from '@/lib/db/admin'
import { createShareCard, revokeShareCard, type StoredCard } from '@/lib/db/share'
import { anxietySeries } from '@/lib/field/anxiety'
import { uiLevel } from '@/lib/data/progression'
import {
  baselineCard,
  rejectionsCard,
  repWinCard,
  streakCard,
  weeklyCard,
  type ShareCardKind,
} from '@/lib/share/cards'

export interface ShareResult {
  ok: boolean
  message: string | null
  /** The path the card lives at, once it exists. */
  href: string | null
}

const SIGNED_OUT: ShareResult = { ok: false, message: 'Not shared — you are signed out.', href: null }
const REFUSED: ShareResult = {
  ok: false,
  message: 'That card could not be made. Nothing was published.',
  href: null,
}

/**
 * Create a card of one kind.
 *
 * `sessionId` is only read for `rep_win`; every other kind is assembled from
 * the account's own counters.
 */
export async function shareCard(input: {
  kind: ShareCardKind
  sessionId?: string
}): Promise<ShareResult> {
  const user = await currentUser()
  if (!user) return SIGNED_OUT

  const supabase = await supabaseServer()

  try {
    const card = await assemble(input, user.id, supabase)
    if (!card) return REFUSED

    const stored = await createShareCard(user.id, card)
    if (!stored) return REFUSED
    return { ok: true, message: null, href: `/share/${stored.token}` }
  } catch {
    return REFUSED
  }
}

type ServerClient = Awaited<ReturnType<typeof supabaseServer>>

async function assemble(
  input: { kind: ShareCardKind; sessionId?: string },
  userId: string,
  supabase: ServerClient,
) {
  if (input.kind === 'rejections') {
    const { data: logs } = await supabase
      .from('field_logs')
      .select('outcome, anxiety_pre, anxiety_post, logged_on')
    const rows = logs ?? []
    const series = anxietySeries(rows.map((row) => ({
      anxietyPre: row.anxiety_pre, anxietyPost: row.anxiety_post, loggedOn: row.logged_on,
    })))
    return rejectionsCard({
      count: rows.filter((row) => row.outcome === 'declined').length,
      meanPredicted: series.meanPredicted,
      meanActual: series.meanActual,
    })
  }

  if (input.kind === 'weekly') {
    const { data: review } = await supabase
      .from('weekly_reviews')
      .select('stats')
      .order('week_start', { ascending: false })
      .limit(1)
      .maybeSingle()
    const stats = (review?.stats ?? {}) as { reps?: number; asksMade?: number; rejections?: number }
    if (!review) return null
    return weeklyCard({
      reps: stats.reps ?? 0,
      asksMade: stats.asksMade ?? 0,
      rejections: stats.rejections ?? 0,
    })
  }

  if (input.kind === 'streak') {
    const { data: streak } = await supabase
      .from('streaks').select('current').eq('user_id', userId).maybeSingle()
    const days = streak?.current ?? 0
    if (days < 1) return null
    return streakCard({ days })
  }

  if (input.kind === 'baseline') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('baseline_score, baseline_session_id')
      .eq('id', userId)
      .maybeSingle()
    if (!profile?.baseline_score || !profile.baseline_session_id) return null

    const { data: latest } = await supabase
      .from('scores')
      .select('composite, graded_at')
      .order('graded_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!latest) return null

    const { data: first } = await supabase
      .from('sessions').select('started_at').eq('id', profile.baseline_session_id).maybeSingle()
    const days = first
      ? Math.max(1, Math.round((Date.now() - Date.parse(first.started_at)) / 86_400_000))
      : 28

    return baselineCard({ then: profile.baseline_score, now: latest.composite, days })
  }

  // rep_win. The one card §08 flags as carrying real positioning risk, so it
  // is assembled from the score rather than from the outcome: the hero figure
  // is the composite, and the framing is a level cleared (§07, §14).
  if (!input.sessionId) return null

  const { data: session } = await supabase
    .from('sessions')
    .select('persona_slug, duration_s, won')
    .eq('id', input.sessionId)
    .maybeSingle()
  if (!session?.won) return null

  const { data: score } = await supabase
    .from('scores')
    .select('composite, opening, curiosity, listening, signal_reading, composure, close')
    .eq('session_id', input.sessionId)
    .maybeSingle()
  if (!score) return null

  // Service role only to read the character's own row — a name and a level are
  // content, not user data, and this avoids a second policy just for a join.
  const { data: persona } = await supabaseAdmin()
    .from('personas')
    .select('name, level')
    .eq('slug', session.persona_slug)
    .maybeSingle()
  if (!persona) return null

  const strongest = [
    ['Opening', score.opening], ['Curiosity', score.curiosity], ['Listening', score.listening],
    ['Signal reading', score.signal_reading], ['Composure', score.composure], ['Close', score.close],
  ].filter((entry): entry is [string, number] => typeof entry[1] === 'number')
    .sort((a, b) => b[1] - a[1])[0]
  if (!strongest) return null

  return repWinCard({
    level: uiLevel(persona.level),
    personaFirstName: persona.name,
    durationMs: (session.duration_s ?? 0) * 1000,
    composite: score.composite,
    strongestLabel: strongest[0],
    strongestValue: strongest[1],
  })
}

/** Everything this account has ever published, newest first. */
export async function listShareCards(): Promise<StoredCard[]> {
  const user = await currentUser()
  if (!user) return []

  const supabase = await supabaseServer()
  const { data } = await supabase
    .from('share_cards')
    .select('token, kind, payload, created_at, revoked_at')
    .order('created_at', { ascending: false })

  return (data ?? []).map((row) => ({
    token: row.token,
    kind: row.kind as ShareCardKind,
    card: row.payload as unknown as StoredCard['card'],
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
  }))
}

/** Kill a page. The card stays in the list, marked revoked. */
export async function revokeCard(token: string): Promise<{ ok: boolean }> {
  const user = await currentUser()
  if (!user) return { ok: false }
  return { ok: await revokeShareCard(user.id, token) }
}
