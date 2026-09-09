'use client'

/**
 * The interview credit balance and the three packs, in one place.
 *
 * ── WHY THIS IS ITS OWN FILE (LAUNCH-GAP A4, B2) ─────────────────────────
 *
 * It was two components inside `interview-screens.tsx`, which made the only
 * place in the entire product where a credit can be bought a secondary button
 * inside a sidebar card on `/interview` — a screen you can only reach on the
 * interview track. Two surfaces needed the same thing and could not have it:
 *
 *   `/profile/subscription` is where people go when they want to give us money,
 *   and it printed "Practice interviews · 1 / month" on every plan card while
 *   offering no way to buy one (A4).
 *
 *   `PaywallSheet` is the interview track's single monetisation moment, and it
 *   was showing the dating sheet — a daily reset that does not apply, a rep
 *   count that is the wrong meter, and a button to a subscription page that
 *   sells no credits (B2).
 *
 * `interview-screens.tsx` cannot be imported by `modals.tsx`: modals is already
 * imported *by* interview-screens for the CV sheet, and the cycle would be real.
 * So the shared part moved here and all three read it.
 *
 * ── AND WHY THE BUTTONS ARE ALWAYS SECONDARY ─────────────────────────────
 *
 * Volt appears once per screen. On `/interview` it is **Start interview**; on
 * `/profile/subscription` it is the recommended plan's action. A buy button in
 * volt beside either would make the account's own money the loudest object on
 * a training screen, which is the shape §14 says a merchant-of-record reviewer
 * reads badly and `RETENTION-AUDIT.md` §4 refuses anyway.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui'
import { startPackCheckout } from '@/app/interview/actions'
import { useCreditHistory } from '@/lib/data'
import { ROUND_COST_ROWS, roundCostLabel } from '@/lib/data/interview-credits'
import { creditAmountLabel, creditEntryDay, creditEntryLine } from '@/lib/data/credit-history'
import {
  CREDIT_EXPIRY_NOTE,
  INTERVIEW_PACKS,
  perCredit,
  type InterviewPack,
} from '@/lib/site/plans'

/**
 * What one credit costs on this pack.
 *
 * A credit rather than an interview since B3: rounds are priced by length, so
 * five credits is between two and five interviews depending on what they are
 * spent on. `ROUND_COST_NOTE` beneath the list is what makes the number legible.
 */
export function packRate(pack: InterviewPack): string {
  if (pack.credits === 1) return 'One recruiter screen, graded'
  return `$${perCredit(pack).toFixed(2)} a credit`
}

/**
 * The three packs, from the one authored record.
 *
 * Never a hardcoded price. `lib/site/plans.ts` is what `/pricing` prints, what
 * `npm run whop:setup` creates the plans at and what `npm run whop:verify`
 * asserts against the provider — so a price changed there moves the page, the
 * vendor and the preflight together. Two numbers for one product is the failure
 * that file exists to prevent (§14).
 */
export function PackButtons({ compact = false }: { compact?: boolean }) {
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  return (
    <>
      <ul className="pack-list">
        {INTERVIEW_PACKS.map((pack) => (
          <li key={pack.id}>
            <button
              type="button"
              className="arena-button arena-button--secondary arena-button--full"
              disabled={pending !== null}
              onClick={() => {
                setError(null)
                setPending(pack.id)
                void startPackCheckout(pack.id).then((result) => {
                  if (result.ok && result.url) {
                    // A full navigation rather than a router push: the checkout
                    // is the provider's own page on their own origin.
                    window.location.href = result.url
                    return
                  }
                  setPending(null)
                  setError(result.message ?? 'Could not open checkout.')
                })
              }}
            >
              <span>{pack.name}</span>
              <span className="data">{pending === pack.id ? 'Opening…' : pack.price}</span>
            </button>
            {compact ? null : <span className="label mute">{packRate(pack)}</span>}
          </li>
        ))}
      </ul>
      {error ? <p className="label" role="status">{error}</p> : null}
    </>
  )
}

/**
 * The buy list, or the honest sentence when this deployment cannot open a
 * checkout.
 *
 * `packsOpen` is `packsConfigured()`, read on the server — a buy button that
 * errors on somebody trying to give us money is worse than no button, and rule
 * 15 guarantees a window where this is false: a Vercel variable added after a
 * build started is not in that build.
 */
export function PackOffer({ packsOpen, compact = false }: { packsOpen: boolean; compact?: boolean }) {
  if (!packsOpen) {
    return <p className="label mute">Interview credits are not on sale from this deployment yet.</p>
  }
  return <PackButtons compact={compact} />
}

/**
 * The seconds between paying and the credits appearing.
 *
 * The buyer comes back from Whop's checkout to `/interview/credits?bought=1`
 * (or to whichever surface sent them) while the
 * `payment.succeeded` webhook is still in flight — usually under a second, and
 * occasionally longer if Whop is retrying. Without this, somebody who has just
 * paid $20 lands on a screen showing the balance they had before, which reads
 * as a failed purchase and is the exact moment a support ticket or a chargeback
 * gets written.
 *
 * It says what is true rather than pretending to know: the payment went
 * through, the credits are moments away, and here is the button that looks
 * again. One deliberate action beats a poll that might never resolve, and
 * §02's no-spinners rule is about exactly this kind of indefinite wait.
 *
 * **A full navigation, not `router.refresh()`.** The balance comes from
 * `useUserState`, which is `useAsync(fetchUserState, null, [])` — a browser
 * fetch on an empty dependency array. Refreshing the server tree re-renders
 * around it and leaves the number exactly where it was, so the button would
 * have looked like it did nothing on the one screen where that reads as a lost
 * payment. Going to the same path without the query drops the banner too, so a
 * balance that has arrived stops being announced.
 *
 * Read off `window.location` rather than `useSearchParams`, which would need a
 * Suspense boundary around a card that is not the reason this page renders.
 */
export function JustBought({ returnTo }: { returnTo: string }) {
  const [bought, setBought] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    setBought(new URLSearchParams(window.location.search).get('bought') === '1')
  }, [])
  if (!bought) return null
  return (
    <div className="credits-bought" role="status">
      <strong>Payment received.</strong>
      <p>Credits usually land within a few seconds of the receipt.</p>
      <button type="button" className="arena-button arena-button--secondary" onClick={() => { window.location.href = returnTo }}>
        Check again
      </button>
    </div>
  )
}

/**
 * The balance, and nothing else, for a rail that is not about money.
 *
 * ── WHY THE PACKS LEFT THE INTERVIEW HOME ────────────────────────────────
 *
 * `CreditsPanel` is four things at once — a balance, what a round costs, three
 * buy buttons and a ledger — and it sat at the top of `/interview`'s sidebar,
 * beside the role, the company, the CV and the next interview. So the pill in
 * the chrome, which is the most-tapped affordance in any credit product, landed
 * somebody on a screen where the store and the profile were the same screen.
 * The dating arm has never done that: its store is `/profile/subscription` and
 * the pill goes there.
 *
 * So the store moved to `/interview/credits` and this is what stays behind: the
 * number, and one way to go and change it. The link is secondary — volt on
 * `/interview` is **Start an interview**, and a buy button drawn at the same
 * weight as the primary action makes the account's own money the loudest thing
 * on a training screen.
 */
export function CreditsSummary({ credits, screener }: { credits: number; screener: number }) {
  return (
    <Card className="interview-credits">
      <span className="label">Interview credits</span>
      <div className="interview-last">
        <span><strong>Available</strong>{screener > 0 ? <small>including one free screener</small> : null}</span>
        <span className="data">{credits}</span>
      </div>
      <Link className="arena-button arena-button--secondary arena-button--full" href="/interview/credits">
        {credits === 0 ? 'Get credits' : 'Credits and packs'}
      </Link>
    </Card>
  )
}

/**
 * What a round costs, as rows rather than as a wrapped tag.
 *
 * `ROUND_COST_NOTE` says the same thing in one sentence and still does on the
 * paywall sheet, the scorecard's low-balance line and the two public pages —
 * places with room for a sentence and no room for a table. Here there is room,
 * and this is the number a buyer choosing between eight credits and twenty has
 * to reason with, so it gets a shape: name, length, price, one row each.
 *
 * Derived from `ROUND_COST_ROWS`, which is derived from `ROUND_TYPES`. Nothing
 * about a round is retyped in this file, so a repriced round moves this list
 * with it.
 *
 * No volt. Arena allows it once a screen and this is reference material, not
 * the action — the price is emphasised by being the only thing in full-strength
 * ink on its row, which is the same device `.interview-dimensions` uses.
 */
function RoundCosts() {
  return (
    <div className="round-costs">
      <span className="label">What a round costs</span>
      <ul>
        {ROUND_COST_ROWS.map((row) => (
          <li key={row.id}>
            <span className="round-costs__name">{row.label}<small>{row.minutes} min</small></span>
            <span className="data">{roundCostLabel(row)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * What is in the balance, and what it costs to fill it (INTERVIEW-PLAN D3, E1).
 *
 * ── WHY THE TWO EXPIRY RULES ARE ON THIS CARD ────────────────────────────
 *
 * §5.5 splits credits in two: bought ones never expire and survive a
 * cancellation, granted ones die with the month that handed them out. That is a
 * sentence a disputing customer quotes, so it is stated where the money is
 * spent as well as in the terms — `CREDIT_EXPIRY_NOTE` is the one string, read
 * by this card, `/pricing` and `RefundDocument`, so the three cannot drift.
 *
 * `ROUND_COST_NOTE` joined it on 8 September, because B3 made "five credits"
 * ambiguous on its own: a reader has to know a recruiter screen is one and a
 * deep technical is two before a balance means anything. On 9 September it
 * became `RoundCosts` — the same fact, from the same authored table, in rows a
 * reader can scan rather than a sentence set in a tag typeface.
 */
export function CreditsPanel({
  credits,
  screener,
  packsOpen,
  returnTo = '/interview',
  heading = 'Interview credits',
}: {
  credits: number
  screener: number
  packsOpen: boolean
  /** Where "Check again" goes after a purchase lands. */
  returnTo?: string
  heading?: string
}) {
  const paid = Math.max(0, credits - screener)
  return (
    <Card className="interview-credits">
      <span className="label">{heading}</span>
      <JustBought returnTo={returnTo} />
      <div className="interview-last">
        <span><strong>Available</strong>{screener > 0 ? <small>including one free screener</small> : null}</span>
        <span className="data">{credits}</span>
      </div>
      {paid === 0 && screener > 0
        ? <p className="credits-note">The free screener pays for the five-minute round and nothing else. The longer rounds need a credit.</p>
        : null}
      <RoundCosts />
      <PackOffer packsOpen={packsOpen} />
      {/* Sentence case, not `.label`. This is two lines of prose quoted almost
          verbatim in terms clause 07, and 11px uppercase mono is a tag style —
          it made the one promise a disputing customer reads the hardest thing
          on the card to read. The string is untouched; only its typeface is. */}
      <p className="credits-note">{CREDIT_EXPIRY_NOTE}</p>
      <CreditHistory />
    </Card>
  )
}

/**
 * "Where your credits went", behind a disclosure.
 *
 * ── WHY THIS IS THE CHEAPEST SUPPORT TICKET TO PREVENT ───────────────────
 *
 * The ledger is append-only and has always held every movement; nothing in the
 * product ever showed one. "I bought five and I have three" is the standard
 * question in a credit product, and it is asked by somebody who ran two
 * interviews and could not see that they had. The rows already exist.
 *
 * A `<details>` and not a tab or a route: it is reference material, wanted
 * rarely and urgently, and it must not push the buy buttons below the fold on a
 * phone (B6's lesson). Closed by default, so the card is the same height it was
 * for everybody who is not asking.
 *
 * The hook runs regardless of whether the disclosure is open — one small
 * read-own select, and loading it on the toggle would put a wait between a tap
 * and an answer on the one card whose job is to remove doubt. Nothing renders
 * until it has an answer, which is §02's rule against spinners: an empty
 * disclosure is not a skeleton of anything.
 */
function CreditHistory() {
  const { data: entries, loading } = useCreditHistory()
  if (loading || entries.length === 0) return null
  return (
    <details className="credit-history">
      <summary className="label">Where your credits went</summary>
      <ul>
        {entries.map((entry) => (
          <li key={entry.id}>
            <span>{creditEntryLine(entry)}<small>{creditEntryDay(entry.at)}</small></span>
            <span className="data">{creditAmountLabel(entry.amount)}</span>
          </li>
        ))}
      </ul>
    </details>
  )
}
