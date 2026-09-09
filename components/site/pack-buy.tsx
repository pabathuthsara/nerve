'use client'

/**
 * The buy button on a pack card (LAUNCH-GAP C1).
 *
 * ── THE DEAD END THIS CLOSES ─────────────────────────────────────────────
 *
 * "Bought one at a time, not by the month" rendered three `<article>` elements
 * — name, price, per-credit rate, tagline, "never expires" — and stopped. No
 * call to action on any of them, on the highest-intent block on the site, while
 * every other card on the page ended in a button. Somebody reading "$5.80 a
 * credit · a week of preparation" had qualified themselves completely and was
 * given nowhere to go. It also read as unfinished next to the plan board
 * directly above it, which is the wrong impression on the page a
 * merchant-of-record reviewer opens.
 *
 * ── AND WHY IT IS THE ONLY BUY BUTTON ON A PUBLIC PAGE ───────────────────
 *
 * `/pricing`'s rule is that every plan button goes to sign-up: the trial is
 * started from inside the account, after the sign-up rep, because that is the
 * rep the decision is made on. A pack is not a trial. It is a one-off purchase
 * by somebody who already knows what they want, and there is no rep that makes
 * the decision for them — so a signed-in reader gets a real checkout and a
 * signed-out one gets sign-up, labelled honestly rather than pretending to be
 * a checkout.
 *
 * The pack rides in the query so the sign-up screen can name what they came for.
 * Carrying it all the way through to an automatic checkout is a separate piece
 * of work and is recorded as such; an extra step beats a dead end.
 */

import Link from 'next/link'
import { useState } from 'react'
import { startPackCheckout } from '@/app/interview/actions'
import type { InterviewPack } from '@/lib/site/plans'

export function PackBuy({
  pack,
  signedIn,
  packsOpen,
}: {
  pack: InterviewPack
  signedIn: boolean
  packsOpen: boolean
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Nothing to sell from this deployment. Says so rather than drawing a button
   * that errors on somebody trying to give us money — rule 15 guarantees a
   * window where this is false, because a Vercel variable added after a build
   * started is not in that build.
   */
  if (!packsOpen) {
    return <p className="pack-board__cta label mute">Not on sale from this deployment yet.</p>
  }

  if (!signedIn) {
    return (
      <Link
        href={`/signup?pack=${pack.id}`}
        className="arena-button arena-button--secondary arena-button--full"
      >
        Create an account to buy
      </Link>
    )
  }

  return (
    <>
      <button
        type="button"
        className="arena-button arena-button--secondary arena-button--full"
        disabled={pending}
        onClick={() => {
          setError(null)
          setPending(true)
          void startPackCheckout(pack.id).then((result) => {
            if (result.ok && result.url) {
              // A full navigation: the checkout is the provider's own page on
              // their own origin.
              window.location.href = result.url
              return
            }
            setPending(false)
            setError(result.message ?? 'Could not open checkout.')
          })
        }}
      >
        {pending ? 'Opening…' : `Buy ${pack.name.toLowerCase()}`}
      </button>
      {error ? <p className="pack-board__cta label" role="status">{error}</p> : null}
    </>
  )
}
