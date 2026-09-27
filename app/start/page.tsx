import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { after } from 'next/server'
import { currentUser } from '@/lib/db/server'
import { usageProof } from '@/lib/db/founding'
import { isBot, normaliseTag, START_SERVED_STEP } from '@/lib/analytics/pageview'
import { insertView, visitorDigest } from '@/lib/analytics/record'
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

const ROBOTS = { index: false, follow: true }

/**
 * The link preview under a post, per room (START-AUDIT §1.3).
 *
 * It said both products under every post, which made the preview under a
 * dating video an advertisement for interview practice as well. A link that
 * names the track gets a description of that track; a bare `/start` keeps the
 * sentence that is true of both. Crawlable, not indexable: `noindex` keeps
 * this from competing with `/`, and `follow` keeps the ad platforms' own
 * scrapers able to fetch it, which is what renders the preview at all.
 */
export async function generateMetadata({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}): Promise<Metadata> {
  const raw = await searchParams
  const track = Array.isArray(raw['track']) ? raw['track'][0] : raw['track']
  const description = track === 'dating'
    ? 'Talk out loud to an AI character for three minutes. She can get bored and walk away. Scored on how you handled it, never on whether it worked. Your first rep is free.'
    : track === 'interview'
      ? 'A five-minute interview, out loud, with an interviewer who follows up on what you skip. Scored on how you answered, never on whether you got the job. Free on every account.'
      : 'Timed voice reps against someone who is deciding — a stranger you want to talk to, or an interviewer you want to impress. Scored on how you talked, never on whether it worked. Set yours up in under a minute.'
  return { title: 'Start — NERVE', description, robots: ROBOTS }
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
  const first = (key: string) => {
    const value = raw[key]
    return Array.isArray(value) ? value[0] : value
  }
  const asked = TRACKS.find((track) => track === first('track')) ?? null

  /**
   * The hook's button as a plain link (START-AUDIT §1.1). Everything the
   * visitor arrived with is carried — `?track=` and the UTMs — plus `s=1`,
   * which opens the run on the screen that tap was for. Built here because
   * this is where the query string is known on the first render, which is
   * the only render the link exists for.
   */
  const carried = new URLSearchParams()
  for (const [key, value] of Object.entries(raw)) {
    if (key === 's') continue
    const one = Array.isArray(value) ? value[0] : value
    if (typeof one === 'string') carried.set(key, one)
  }
  carried.set('s', '1')

  await countServed(first('utm_source'), first('utm_content'))

  return (
    <StartScreen
      initialTrack={asked}
      begun={first('s') === '1'}
      continueHref={`/start?${carried.toString()}`}
      proof={await usageProof()}
    />
  )
}

/**
 * The render, counted server-side (START-AUDIT §1.6).
 *
 * Every other funnel row is a beacon that fires after hydration, so the
 * visitor who left in the first two seconds — the one the audit was about —
 * was never recorded. `served` is written here, after the response, with the
 * same digest the beacon computes, so `served → hook` is that loss.
 *
 * Only for a real document load: a router prefetch is not a visit, and a
 * client-side navigation (`RSC: 1`) arrives from a page that is already
 * hydrated, so its beacon will count it. Bots and Do Not Track are refused
 * the same way the beacon refuses them, and a local dev server is refused
 * because it talks to the production table.
 */
async function countServed(source: string | undefined, content: string | undefined): Promise<void> {
  const bag = await headers()
  const userAgent = bag.get('user-agent') ?? ''
  const host = bag.get('host') ?? ''
  if (bag.get('rsc') || bag.get('next-router-prefetch') || /prefetch/i.test(bag.get('purpose') ?? bag.get('sec-purpose') ?? '')) return
  if (bag.get('dnt') === '1' || isBot(userAgent)) return
  if (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) return
  const snapshot = new Map([...bag.entries()])
  const view = { get: (name: string) => snapshot.get(name.toLowerCase()) ?? null }
  after(() => insertView(view, userAgent, visitorDigest(view, userAgent), {
    path: '/start',
    step: START_SERVED_STEP,
    ref: view.get('referer'),
    selfHost: host.split(':')[0] ?? null,
    source: normaliseTag(source),
    content: normaliseTag(content),
    userId: null,
  }))
}
