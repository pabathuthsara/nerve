import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { currentUser } from '@/lib/db/server'
import { START_SERVED_STEP, mintRenderId } from '@/lib/analytics/pageview'
import { recordServerStep } from '@/lib/analytics/record'
import { startAnswersFromQuery } from '@/lib/data/start-funnel'
import { startScene } from '@/lib/data/start-scenes'
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
  const query = await searchParams
  const first = (key: string) => {
    const value = query[key]
    return Array.isArray(value) ? value[0] : value
  }
  const asked = TRACKS.find((track) => track === first('track')) ?? null

  /**
   * The run's state in the address bar (3 Oct). Every answer on the first
   * screen is a link to this page with the answer added — see
   * `startQueryWith` — so a tap that lands before hydration is a navigation
   * rather than a lost tap, and this render opens on the screen after it.
   * The query is passed down whole so each link carries everything the
   * visitor arrived with, `?track=` and the UTMs included.
   */
  const fromUrl = startAnswersFromQuery(query)

  /**
   * START-FIRST-SCREEN-PLAN A2: one random id per render, on the `served`
   * row and on every beacon this page sends. The visitor digest joined only
   * 77 of 136 served visitors to their browser rows (1–5 Oct); this joins
   * every one. Minted fresh on every render and held only in a prop — not a
   * cookie, not in storage — so it cannot follow anybody past the page.
   */
  const renderId = mintRenderId()
  const content = first('utm_content') ?? null
  await recordServerStep(START_SERVED_STEP, { source: first('utm_source') ?? null, content, renderId })

  // B1: the ad's scene, when the link names one (`lib/data/start-scenes.ts`).
  return <StartScreen initialTrack={asked} fromUrl={fromUrl} query={flatQuery(query)} renderId={renderId} scene={startScene(content)} />
}

/** The query as plain strings, for the links the client builds from it. */
function flatQuery(query: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(query)) {
    const one = Array.isArray(value) ? value[0] : value
    if (typeof one === 'string' && key !== 's') out[key] = one
  }
  return out
}
