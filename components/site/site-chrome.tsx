/**
 * The public shell — the half of the product that is readable without an
 * account (§11).
 *
 * Two audiences read these pages and both of them matter. The first is
 * somebody deciding whether to open their microphone and talk to a stranger,
 * which is a harder ask than any signup form. The second is a human at the
 * merchant of record, who reads the landing page, the pricing page and the
 * legal pages during onboarding and decides whether this is a communication
 * skills product or a dating app (§14). The positioning that satisfies the
 * first satisfies the second, which is the whole reason §01 is written the way
 * it is: training, scored sessions, hard-capped, no companionship.
 *
 * Server components with no data dependencies, so every route but `/` renders
 * statically. The one thing the header cannot know is whether you are signed
 * in — and it does not need to: `Start training` points at `/signup`, and
 * `enforceFrontendGuard` sends a signed-in visitor from there to `/train`.
 */

import Link from 'next/link'
import type { ReactNode } from 'react'

/** Every public route, in the order the footer lists them. */
export const SITE_LINKS = {
  howItWorks: '/how-it-works',
  pricing: '/pricing',
  terms: '/legal/terms',
  privacy: '/legal/privacy',
  safety: '/legal/safety',
} as const

/**
 * The one address the product publishes, in one place.
 *
 * On the domain the product actually runs on, which is not a cosmetic point:
 * it was `support@nerve.training` until 30 August, and `nerve.training` had no
 * DNS at all — no A record and no MX — so every message to the address printed
 * in this footer, in all three legal pages and in Settings bounced. A privacy
 * policy naming an undeliverable contact is a compliance problem before it is
 * a support problem, and §14's reviewer reads that policy.
 *
 * Everything that shows an address imports this. `profile-screens.tsx` used to
 * spell it out instead, which is how three of the four copies went stale
 * together.
 */
export const SUPPORT_EMAIL = 'support@hellonerve.com'

export function SiteHeader({ cta = 'Start training' }: { cta?: string }) {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link href="/" className="wordmark" aria-label="Nerve — home">NERVE</Link>
        {/* One set of links, not two. A phone hides the first of them rather
            than being handed a second copy, which is what a screen reader would
            otherwise read out twice. */}
        <nav className="site-header__nav" aria-label="Site">
          <Link href={SITE_LINKS.howItWorks} className="site-header__wide-link">How it works</Link>
          <Link href={SITE_LINKS.pricing}>Pricing</Link>
        </nav>
        <Link href="/signup" className="arena-button arena-button--primary arena-button--sm">{cta}</Link>
      </div>
    </header>
  )
}

/**
 * The footer.
 *
 * The last line is not decoration. 18+, training rather than care, and a
 * PG-13 bound are §16's four load-bearing commitments, and they belong
 * somewhere permanent and unmissable rather than buried three clicks into a
 * policy nobody opens.
 */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__brand">
          <span className="wordmark">NERVE</span>
          <p>A training gym for the conversations you avoid. Timed voice reps, a scorecard that measures how you played, and one small thing to do in the real world.</p>
        </div>
        <nav className="site-footer__cols" aria-label="Footer">
          <div>
            <span className="label">Product</span>
            <Link href={SITE_LINKS.howItWorks}>How it works</Link>
            <Link href={SITE_LINKS.pricing}>Pricing</Link>
            <Link href="/signup">Start training</Link>
            <Link href="/login">Log in</Link>
          </div>
          <div>
            <span className="label">Legal</span>
            <Link href={SITE_LINKS.terms}>Terms of use</Link>
            <Link href={SITE_LINKS.privacy}>Privacy</Link>
            <Link href={SITE_LINKS.safety}>Safety &amp; scope</Link>
          </div>
          <div>
            <span className="label">Contact</span>
            <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          </div>
        </nav>
      </div>
      {/* V15. These are §16's load-bearing commitments and the first thing a
          compliance reviewer scans a footer for — they were a single grey
          run-on sentence. Three pills, so each one is findable. */}
      <div className="site-footer__fine">
        <span className="site-footer__pills">
          <b>18+ only</b>
          <b>Training, not therapy or clinical care</b>
          <b>Sessions bounded at PG-13</b>
        </span>
        <span className="data">© {new Date().getFullYear()} NERVE</span>
      </div>
    </footer>
  )
}

/** The wrapper every public route uses. Header, content, footer, nothing else. */
export function SitePage({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`site${className ? ` ${className}` : ''}`}>
      <SiteHeader />
      <main className="site-main">{children}</main>
      <SiteFooter />
    </div>
  )
}

/** A section with a mono kicker and a display heading. The page's rhythm. */
export function SiteSection({
  id,
  kicker,
  title,
  lede,
  children,
  wide = false,
}: {
  id?: string
  kicker: string
  title: ReactNode
  lede?: ReactNode
  children?: ReactNode
  wide?: boolean
}) {
  return (
    <section id={id} className={`site-section${wide ? ' site-section--wide' : ''}`}>
      <div className="site-section__head">
        <span className="label">{kicker}</span>
        <h2 className="display-lg">{title}</h2>
        {lede ? <p className="site-lede">{lede}</p> : null}
      </div>
      {children}
    </section>
  )
}
