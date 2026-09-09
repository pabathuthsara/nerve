import type { Metadata } from 'next'
import { SitePage } from '@/components/site/site-chrome'
import { PricingPage } from '@/components/site/pricing-page'
import { currentUser } from '@/lib/db/server'
import { packsConfigured } from '@/lib/billing/plans'
import { foundingAccountsTaken } from '@/lib/db/founding'
import { foundingPlacesLeft } from '@/lib/site/plans'

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'One voice rep when you sign up, no card. Pro is $19 for three voice reps a day after a seven-day free trial. Field challenges, text mode and your streak are unlimited on every plan, forever.',
  alternates: { canonical: '/pricing' },
}

/**
 * Two things the pack cards cannot answer for themselves (LAUNCH-GAP C1).
 *
 * Whether there is an account to charge, and whether this deployment can open a
 * checkout at all — the second is `packsConfigured()`, which reads secrets that
 * must not reach a client bundle. Both decide what the buy button on a pack card
 * says and does, and both are server facts. It is the same division of labour
 * `BillingContext` already makes for `/profile/subscription`.
 */
export default async function Pricing() {
  const [user, accounts] = await Promise.all([currentUser(), foundingAccountsTaken()])
  return <SitePage>
    <PricingPage
      signedIn={!!user}
      packsOpen={packsConfigured()}
      /* S3. The count is the server's, or there is no count. `null` prints the
         founding promise with no number in it — a "places left" figure nobody
         verified is exactly what §14 says not to publish here. */
      foundingPlacesLeft={accounts === null ? null : foundingPlacesLeft(accounts)}
    />
  </SitePage>
}
