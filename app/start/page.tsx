import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/db/server'
import { StartScreen } from '@/components/screens/start-screens'

/**
 * The paid-traffic door.
 *
 * A route of its own rather than another entry in the `[...slug]` table, for
 * two reasons that both come down to what this page is. It is the coldest page
 * in the product — somebody four seconds off a TikTok video — and the catch-all
 * spends a `profiles` select in `enforceFrontendGuard` on every request, for a
 * screen that has no profile to read. And it is the only public route that is
 * not part of the site chrome: no header, no footer, no way out but forward or
 * back, which is the whole point of a funnel and the opposite of what
 * `SitePage` is for.
 *
 * `hellonerve.com` is unchanged and stays the page a merchant-of-record
 * reviewer opens (`LAUNCH-GAP.md` B1 is what happens when it is not). What
 * changed is that its primary action now points here instead of at `/signup`,
 * so there is one door to an account and one conversion rate to read, rather
 * than two of each.
 *
 * Deliberately NOT served from `/` behind a UTM check. A page that shows ad
 * traffic something different from what it shows everybody else is cloaking:
 * the ad platforms' own policy teams treat it as such, and it would make the
 * compliance review non-deterministic — a reviewer who clicks the ad and a
 * reviewer who types the domain would be reviewing different products.
 */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Start — NERVE',
  description:
    'Three minutes of voice against someone who can lose interest and say no, scored on how you talked rather than on whether it worked. Set yours up in under a minute.',
  /**
   * Crawlable, not indexable. `noindex` keeps this from competing with `/` for
   * the same terms; `follow` and the absence of a `robots.txt` rule keep the
   * ad platforms' own scrapers able to fetch it, which is what renders the
   * link preview under a paid post.
   */
  robots: { index: false, follow: true },
}

const TRACKS = ['dating', 'interview'] as const

export default async function StartPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  /**
   * Signed in, this page has nothing to offer: the answers it collects are
   * already on the profile and the account it ends in already exists. `/` is
   * the one place that decides where a signed-in person belongs — onboarding
   * resume, the age gate, or `/train` — so it makes that decision here too
   * rather than guessing a second time.
   */
  if (await currentUser()) redirect('/')
  const raw = await searchParams
  const asked = Array.isArray(raw['track']) ? raw['track'][0] : raw['track']
  return <StartScreen initialTrack={TRACKS.find((track) => track === asked) ?? null} />
}
