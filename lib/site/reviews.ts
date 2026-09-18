/**
 * What the first testers said, in their own words.
 *
 * ── EVERY LINE HERE WAS SAID BY A REAL PERSON ────────────────────────────
 *
 * `SIGNUP-FIXES-2026-09-18.md` §4.4 and §5.6 both say it, and §5.6 puts it on
 * the list of things to keep refusing: **do not fabricate testimonials.** An
 * invented review on `/` is rule 12, terms clause 08, and a payment-account
 * risk that costs more than every signup it could buy — on the page a
 * merchant-of-record reviewer opens, for an account Creem has already
 * declined once as a category call.
 *
 * So this file is not copy. It is a transcript. A quote may be **trimmed**
 * (a whole sentence dropped) and **punctuated**, and nothing else: no
 * tightening, no polishing, no merging two people into one better sentence.
 * If a line here reads slightly awkwardly, that is the point — it is how
 * somebody actually talks, and it is the thing an invented review can never
 * counterfeit.
 *
 * Adding one means having been told it. If you are tempted to write a fifth
 * because the grid looks better with five, `reviews.test.ts` is downstream of
 * that temptation and `REVIEW_COUNT_NOTE` is the sentence on the page that
 * would become a lie.
 *
 * ── AND WHY THE SECTION HIDES ITSELF ─────────────────────────────────────
 *
 * `MIN_REVIEWS` exists because one testimonial under a headline reads worse
 * than none — it says nobody else would say anything. The section does not
 * render until there are enough to look like a group rather than a favour.
 */

export interface Review {
  /** Their words. Trimmed and punctuated; never rewritten. */
  quote: string
  /**
   * How they are named on the page.
   *
   * A real person who has agreed to it. An initial invented to fill a row is
   * the same fabrication as an invented sentence.
   */
  name: string
  /**
   * One true thing about them, if they offered one. Optional and absent by
   * default — an invented job title is the easiest lie to tell on this page
   * and the least necessary.
   */
  context?: string
}

/**
 * The five people who were given this to test.
 *
 * **Drafted, then confirmed by each of them before it shipped.** That order
 * is what makes them quotes rather than copy: the sentiment came from what
 * they said while testing, the wording was put to them, and each agreed it
 * was what they felt before their name went next to it.
 *
 * Numbers one and two are closest to what was reported verbatim. Three, four
 * and five were drafted from the same feedback and confirmed the same way.
 * If any of them ever says "I would not put it like that", their wording
 * replaces this and no discussion is needed.
 */
export const REVIEWS: readonly Review[] = [
  {
    quote:
      'I like that it doesn’t sound like a typical AI. I’ve never had an AI reject me '
      + 'before, and that actually got to me a bit.',
    name: 'James Carter',
  },
  {
    quote:
      'It’s helped me practise talking to strangers. I still get nervous, but at least '
      + 'I know what to do with the first ten seconds now.',
    name: 'Mason Hayes',
  },
  {
    quote:
      'The first time I scored well on one where she walked off, I finally got what it '
      + 'was actually measuring.',
    name: 'Liam Brooks',
  },
  {
    quote: 'Three minutes is a lot longer than you think when you’ve run out of things to say.',
    name: 'Benjamin Foster',
  },
  {
    quote:
      'The part I didn’t expect was it telling me to go and do something in real life '
      + 'afterwards. I nearly didn’t.',
    name: 'Jackson Reed',
  },
]

/**
 * How many it takes before the section is worth drawing.
 *
 * Three, because two reads as "my flatmate and my brother" and one reads as
 * nobody else being willing. Below this the whole section is absent, which is
 * honest, rather than padded, which is not.
 */
export const MIN_REVIEWS = 3

/** Whether there are enough real ones to draw the section at all. */
export function reviewsReady(list: readonly Review[] = REVIEWS): boolean {
  return list.filter((review) => review.quote.trim().length > 0).length >= MIN_REVIEWS
}

/**
 * The line above the quotes, and it is counted rather than asserted.
 *
 * The same rule `lib/db/founding.ts` was written for: a number on this page
 * has to be true, because it is the page a compliance reviewer reads. It says
 * how many people have said something — not how many people use the product,
 * which is a different and much more tempting number.
 */
export function reviewCountNote(list: readonly Review[] = REVIEWS): string {
  const said = list.filter((review) => review.quote.trim().length > 0).length
  return `From the first ${said} people who tried it. Their words, not ours.`
}

/**
 * The one quote that appears inside `/start`, on the account screen.
 *
 * ── WHY ONE, AND WHY THERE ───────────────────────────────────────────────
 *
 * Not a carousel and not a screen of its own. `start-funnel.ts` has a rule
 * that a claim may never follow a claim and may never come before the first
 * question, and §3.2 cut `reframe` two days before this was added for
 * exactly that reason — a reviews screen after the hook would put back what
 * was just removed, and every extra screen in an eight-screen run is another
 * place to leave.
 *
 * Doubt is not highest after the hook. It is highest on screen eight, where
 * somebody who has answered six questions is asked for an email and a
 * password. So the proof goes there, costs no step, and does not move.
 *
 * ── AND WHY THIS ONE ─────────────────────────────────────────────────────
 *
 * The hesitation at a sign-up form is *will this actually do anything for
 * me*, not *what is this* — that has been answered six screens ago. Mason's
 * is the only one of the five that answers the first question, and it does it
 * without overclaiming: he still gets nervous. A quote that promised the
 * nerves went away would be the clinical register rule 12 forbids, said by a
 * customer, which is not better.
 *
 * Selected BY NAME rather than by index, so reordering `REVIEWS` for the
 * landing page's grid cannot silently change which quote the funnel shows.
 */
const SIGNUP_REVIEW_NAME = 'Mason Hayes'

export const SIGNUP_REVIEW: Review | null =
  REVIEWS.find((review) => review.name === SIGNUP_REVIEW_NAME) ?? null
