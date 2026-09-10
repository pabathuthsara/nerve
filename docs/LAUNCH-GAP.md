# Launch gap

The built app measured against `NERVE-SPEC.md`, and what is missing that would
stop an MVP going out. Model tuning is deliberately excluded — that work is
known and owned.

**Method.** Every claim below was checked in the code, not recalled. Where the
answer is "partly", the entry says which part. Where the spec and the build
disagree on purpose, it is filed as drift rather than as a gap, because those
need a decision rather than a ticket.

**Date** 23 August 2026 · **Against** spec v1.0 (21 Aug 2026)

> **Updated after the M3 database pass.** Every table §13 names now exists, with
> RLS proven from a second account, and the two content libraries are authored
> and seeded. Entries below carry a `DB done` marker where the schema half has
> landed and only the app half is left; the sizes have been cut to match.

> **Voice pipeline implementation — 5 September 2026.** The non-WebSocket latency/accounting work now has a combined server HTTP stream, owned rep reservations, reliable interruption/startup cleanup and measured full-rep verification. See [the implementation record](VOICE-IMPROVEMENTS-2026-09-05.md) for current release status and limits. This does not close the human voice A/B or twenty hand-scored transcript gates.

---

## 1. Where the build actually is

| Milestone (§17) | State |
|---|---|
| M0 — the spike | **Passed.** 178–339ms median model response, RTT stable from Colombo, character stability measured over five minutes. Both adapters exist behind one interface; the blind A/B has not been run |
| M1 — the loop | **Done.** Auth, eight-table schema with RLS, brief → live → scorecard → transcript, deterministic + judgement scoring |
| M2 — progression & field | **Built.** All nine plan items: the three-minute format, the field end to end, the predicted-versus-actual chart, character memory, the §08 unlock rule with its once-ever moment, adaptive difficulty, the baseline and week-four re-test, share cards and the Sunday review. **Not closed:** §17's gate is twenty hand-scored transcripts and none are scored — the harness is built and ten are collected |
| M3 — the premium layer | **Half.** Arena visual system, skeletons, real analysers, reduced motion. No sound kit, haptics, PWA, score choreography |
| M4 — billing & safety | **Safety done; billing wired, unsold.** The whole of §16's app layer shipped 28 Aug — moderation on both streams, the age gate, the boundary sequence, the distress path and the report control (B3) — on top of the schema and the spend ceiling (B9, cleared 24 Aug). The pipe shipped 31 Aug on Creem: signed webhook, provider-neutral event mapping, service-role entitlement writes, checkout carrying the user id (B2). Creem declined on 1 Sep and the pipe was ported to Whop the same day — the adapter changed and nothing downstream of it did, which is the §14 abstraction doing its job. What is left is not code — no configured Whop product or plans yet, so nothing can be sold |
| M5 — private beta | Blocked by M4, and by having nothing instrumented to learn from |

Feature inventory (§10), counted honestly against the 69 MVP features:

| Group | Done | Partial | Missing |
|---|---|---|---|
| A · Training loop (12) | 8 | 2 | 2 |
| B · Progression (8) | 8 | 0 | 0 |
| C · The field (9) | 7 | 0 | 2 |
| D · Coaching content (7) | 6 | 0 | 1 |
| E · Insight & data (7) | 6 | 0 | 1 |
| F · Premium craft (12) | 5 | 2 | 5 |
| G · Account & billing (8) | 2 | 1 | 5 |
| H · Safety (6) | 6 | 0 | 0 |
| **Total** | **48** | **5** | **16** |

27 August adds the public half of §11 — six routes that were the only thing
standing between the build and a merchant-of-record application (B1, B4). It
changes none of the numbers above, because none of the 69 MVP features is a
marketing page: what it changes is that the application can now be made.

The shape of that table is the finding, and 24 August moved it for the first
time: groups D and E — the coaching content and the insight surface, which §17
never scheduled into any milestone — went from 5 of 14 to 12 of 14. What
remains missing in both is one `[V2]` feature each.

The product is real: the training loop, the field, progression, memory,
adaptive difficulty, the library, the trends, the retention hooks and the
artefacts that carry organic distribution. What is still not built is everything
that makes it a *business* — billing, safety, legal, instrumentation. **Group G is 2 done out of 8**, and
that is where the remaining launch risk lives. Group H was 0 of 6 until 28
August and is now 6 of 6, which moves the risk from "two empty groups" to one:
billing.

---

## 2. Blockers — cannot launch without these

Ordered by what stops what. Sizes are working days for one person who knows
this codebase.

### B1 · The public site  ·  **cleared 27 Aug**
**Spec:** §11 lists six public routes — landing with a live demo rep,
`/how-it-works`, `/pricing`, and three legal pages.
**Built:** all six, plus `sitemap.xml`, `robots.txt` and permanent redirects
from the old `/terms` and `/privacy` addresses. `/` renders the landing for a
signed-out visitor and still routes a signed-in one to where they left off,
which is what it was doing before. Everything but `/` prerenders static.

**What is on them.** The landing opens on the rep format, plays a rep, and
states the §07 law immediately after it; then the loop, the roster, the four
things Nerve is not, a pricing summary and a FAQ. `/how-it-works` is the method
end to end — the anatomy of the three minutes, the 60/40 split of the composite,
why the ending is worth nothing, the memory rule with the line the code refuses,
the four field tiers, the rejection milestones and the four ranks. `/pricing`
quotes `lib/site/plans.ts`.

**The auth doors were carrying a second copy of the landing page, and it is
gone (30 Aug).** `/login` and `/signup` each rendered an `AuthPitch` block whose
own comment justified it with *"There is no marketing site and there does not
need to be one"* — written before this blocker was cleared. Its headline was
character-for-character the landing hero's, so anybody arriving from the landing
CTA read the same three lines twice, and on a phone the pitch stacked above the
form: six blocks to scroll past before the email field on `/login`, a screen
only people who already have an account ever see. Both doors are now the door
and nothing else. The landing page is the only place the pitch lives.

**The hero rep was removed on 10 September 2026, and everything below it about
the hero is now history.** It did not work properly on the page, so `RepReplay`,
its whole `.replay` / `.stage` block in `globals.css`, and the two-column hero
grid that existed only to seat it are gone; `/` opens on one column of copy, the
two CTAs and the rules block, and the §07 proof stays where it moved to — the
static scorecard, which was always the part that argued rather than demonstrated.
What is left over and unread: `scripts/hero-audio.ts`, `npm run hero:audio` and
the twelve files in `public/hero/`. They are kept rather than deleted because the
capture was expensive and the two rules underneath it are the ones a future demo
has to obey — read the paragraphs below for those, not for what the page does
now.

**The hero is the live rep screen, not a transcript.** §11 asks for "a live
30-second demo rep with no sign-up", and that cannot be built: it needs a
microphone, a WebRTC session, and an unauthenticated route that spends money on
a stranger — which is the thing `maySpend` exists to prevent. So it is a rep
played back, on the real clock.

**The first attempt got this wrong and it is worth recording why.** It rendered
the rep as a scrolling column of chat bubbles, and the result was that the first
thing a stranger understood about a *voice* product was that it was a messaging
app. The mistake was not styling. It was that `/rep/[persona]/live` has no
thread at all — it is the orb, a clock and one caption at a time — so the hero
was showing an interface that does not exist. It now matches the real screen:
orb centre, `rep-caption` one line at a time, a turn meter for each side, and
the warmth band underneath. Crossing 65 is silent on it, because arming is
silent (§05) and a demo that announced it would teach the wrong thing on the one
screen where somebody is deciding.

**The voices are the point, and there is a script for it.** `npm run hero:audio`
records both sides into `public/hero/manifest.json` plus one mp3 per turn. With
that file present the hero plays them and both meters are real `AnalyserNode`
readings over the audio — §02 rule 3 satisfied rather than dodged — and the stamp
prints each side's provenance from the manifest rather than from a hardcoded
string, so the page can never name a model that did not speak. Without it the
hero runs silently on the authored script and says `muted preview · demo script`.

**The two sides are captured differently, and that asymmetry is the argument.**
Her replies are generated: his lines go into the real provider as real turns
against the real compiled persona in her real voice (`marin`), and whatever comes
back is what ships. His are read: they are authored, so there is nothing for a
conversational model to decide and improvising them would only risk it departing
from the script the page is built around. His half goes through `gpt-4o-mini-tts`
in `ash` — the same voice `VOICE_BY_TIMBRE.masculine` already picks inside the
product — with delivery direction that pushes away from performance, because a
voice that sounds like an advertisement is the one thing this page cannot have.
The stamp says which is which: `her gpt-realtime, unscripted · his
gpt-4o-mini-tts, read`.

**Both captures are run and a take is kept** (28 Aug 2026, five exchanges,
47.9s). What is deployed is real audio on both sides. Her side was recorded
first — the expensive half fails before the cheap half has been paid for. Three
things had to be fixed to get there:

- **The beta subprotocol is dead.** The socket opened with
  `openai-beta.realtime-v1`, and OpenAI now refuses it outright — *"The Realtime
  Beta API is no longer supported."* GA is the bare endpoint with no beta
  subprotocol; the session shape `OpenAIPersonaCompiler` already emits
  (`type: 'realtime'`) is the GA one, so nothing else moved.
- **`end_scene` produced a silent turn.** Her contract tells her to speak a
  final line *and* invoke the tool in the same response; on the goodbye she
  invoked it and skipped the line, which is a legal reading and a useless
  recording. The capture drives its own turns and ends when the authored lines
  run out, so the tool has nothing to decide — it is removed for the capture
  only, with the contract recompiled identically minus that one paragraph. This
  is not a softer Nadia.
- **A streamed WAV lies about its own length.** The speech endpoint returns a
  `data` chunk declaring `0xFFFFFFFF` bytes, because the length was not known
  when the header went out. Trusting it put every one of his turns on screen for
  eighty-nine thousand seconds. The bytes actually present now win over the
  declaration.

**And the hero was silent on every desktop load, twice.** The auto-start effect
exists so that a hero with no capture still moves; it is gated on `hasAudio`.
But the manifest arrives over the network, so on the first pass `hasAudio` is
false whether or not a capture exists — and the effect runs long before the
fetch settles. On any viewport where the hero is on screen at load, which is
every desktop one, it won the race, started the *muted* fallback, and left
`phase` at `playing`, so "Hear a rep" never rendered. A whole silent rep, no
control to hear it, and the stamp reading `Recorded` throughout. It is now
gated on a `probed` flag set when the fetch settles either way: wait for the
answer before assuming there is none. This is also why it survived review twice
— a headless viewport of 800×600 puts the button below the fold, so the bug
disappears exactly where it was being looked for.

The script also transcodes to mp3 itself and writes the manifest pointing at the
result — 176KB of audio rather than 973KB of WAV. Without ffmpeg on PATH it
leaves the WAVs and says so: a heavy hero, never a broken one.

Two rules are load-bearing in that script. His five lines are authored, because
he is the demo and the arc has to build. **Hers are not, and must not be** — what
she says is the product, and a hand-written version of it would be advertising
prose instead of the thing being sold. And it is run by hand, never from a
build: it is the one script in the repo that spends money without a user asking
it to. Budget by the model actually configured — `.env.local` sets
`OPENAI_REALTIME_MODEL=gpt-realtime` at $0.16/minute, not the mini's $0.065
(`lib/voice/rates.ts`), so a take is tens of cents, not six.

**The §07 proof moved down.** The rep that ends in her leaving and scores 87 is
still the sharpest statement of "outcome is never scored" available, but it is a
document rather than a demonstration — so it is now a static scorecard in the
`/` scoring section, which costs no JavaScript and reads better there. The
hero's job is *this sounds like a person*; the scorecard's job is *and here is
what we measure*.

**Text mode got its own section**, with the bubbles it is actually entitled to.
Sold honestly as the lesser mode: same characters, no microphone, no quota, and
warmth capped below `ARM_THRESHOLD` so it can never produce the ending a voice
rep can (`TEXT_WARMTH_CEILING`, enforced in code).

**Three things it deliberately does not claim.** Every sentence on the site is a
rule the code enforces: no user counts, no success rates, no testimonials, and
no control that is not built. The PG-13 paragraph said characters are written to
decline and that steering a rep there breaches the terms, and deliberately
claimed nothing about automated moderation — **which shipped on 28 August**, so
that paragraph now states the control in the present tense. The rule is
unchanged: what the site claims is what the code does.

**Also fixed on the way past.** The sign-up and log-in screens are public pages
and their pitch block led with `Goal — get her number`, which is close to the
exact sentence §14 says gets an application declined. It now reads the format
and the scoring law. And the in-app plan comparison advertised "Level 1 personas"
on Free and "every persona" above it, a gate that has never existed in this
codebase — `unlockedLevels` counts reps scoring 70+ and has never read a plan.
Both surfaces now read `lib/site/plans.ts`, so the public price and the in-app
price cannot drift.

**Still owed:** a real `og.png` for the new pages (the existing one predates
them). **D2 is closed as of 31 Aug** — the site quotes $19 and $49, free is
voice-less, and both surfaces still read `lib/site/plans.ts`.

### B2 · No billing exists  ·  review lead time only  ·  `DB done` `pipe done` `screens done`
**Spec:** §14, and §10 G.
**Built (database):** `entitlements` with plan, quota and renewal date, plus
`subscriptions` — the mirror of the merchant of record, with deliberately
abstract provider identifiers so that being declined by one provider costs a
migration rather than a rewrite (§14). Both read-only to the user; a user
cannot write themselves a subscription, and that is asserted.
**Built (the pipe, 31 Aug on Creem; ported to Whop 1 Sep):** the billing loop, end to end and provider-neutral.
`lib/billing/signature.ts` verifies the webhook HMAC — both the Standard
Webhooks and legacy schemes — with no provider SDK in the app layer, for the
same reason §14 keeps the identifiers abstract. `lib/billing/events.ts`
normalises the vendor's twelve event names into `grant` / `revoke` / `record`,
so the entitlement logic never learns a provider's vocabulary.
`lib/billing/apply.ts` writes the mirror first and the plan second, on the
service role, and `app/api/webhooks/whop/route.ts` is the only thing in the
codebase that moves an account onto a paid plan. `lib/billing/checkout.ts`
stamps `metadata.user_id` on every session — the sole link between a payment
and an account. Vendor plan ids map to plans through `WHOP_PLAN_*`, because they
differ between test and live; an unrecognised product records the money and
grants nothing.
Three decisions are asserted rather than assumed: `past_due` keeps access
because the provider is still retrying, a scheduled cancel keeps it until the
period ends, and a dispute revokes on sight. 51 unit assertions plus
`npm run db:billing` — 31 checks against the real database, including that a
late retry cannot resurrect a plan a later event revoked, and that the owner can
read their subscription and cannot write it.
**Built (the model and the screens, 31 Aug):** voice is sold by the account
rather than by the day — see `PAYMENTS-NEW-INTEGRATION.md`, which is the plan of
record for it. `entitlements.reps_per_day` is **0 on free**, which is the entire
voice lock: `consumeRep` and `mayOpenSession` already refused at zero, so no new
gate was added anywhere. The day-one grant of three reps is replaced by a single
sign-up rep held on `entitlements.onboarding_rep_used_at`, a column with no user
write path, so abandoning and resuming onboarding cannot mint a second one.
`/profile/subscription` is a real screen: a buy button behind `startCheckout`, a
trial countdown that names the day the card is charged, and a Manage button that
opens the provider's own portal so cancelling never requires emailing us — the
three §8 mitigations for the dispute risk a card-required trial carries. The
refusal is a distinct `kind` from `consumeRep` all the way to the sheet, because
"out of reps for today" is a lie to somebody whose reps do not reset.
`checkoutConfigured()` keeps the buy button off a deployment with no
merchant-of-record variables, so the screen falls back to the notify-me list
rather than showing a button that errors.
**Proven on 1 Sep:** a real checkout on the production domain, in test mode
behind `CREEM_TEST_MODE_IN_PRODUCTION` (now `WHOP_TEST_MODE_IN_PRODUCTION`), delivered a signed webhook Creem sent
itself and moved the account to Pro with no hand at the database. The trial is
switched on at the product (seven days, card captured) — so of the list below,
the products and the environment variables are done in test mode and owed again
in live. It also found the sign-up rep being subtracted from the plan the buyer
had just paid for, now fixed read-side; both are recorded in
`PAYMENTS-NEW-INTEGRATION.md` §12.
**Still missing:** the merchant-of-record account itself (the real blocker, and
not code — `PAYMENTS-APPROVAL.md`), the live-mode products and the four live
environment variables, the pre-charge email, and the six money overlays in §12.
What the trial-end charge does is unproven and not rehearsable: test mode has no
clock control. Plans can still be granted from a terminal by `npm run db:plan`, which
stays as the manual override.
**Why it blocks:** no revenue, obviously — but the real risk is lead time.
§17 says apply at the *start* of M4 because approval takes days and can fail,
and it can only be applied for once B1 exists. **B1 exists as of 27 Aug**, so
the application is no longer waiting on anything in this repo — what a reviewer
would now open is a landing page, a pricing page and three real policies.

**The application itself is tracked in [`PAYMENTS-APPROVAL.md`](PAYMENTS-APPROVAL.md)**,
because it is not code and nobody in this repo can finish it. **B3's moderation
shipped on 28 August**, which was the last of its three blockers that was a build
task; what remains is a support mailbox that actually receives mail, and an
entity with a bank account to be paid into. That page is also where the log of what we told a provider, and when,
belongs. Everything in *this* entry is what happens after they say yes.

### B3 · The safety layer  ·  **shipped 28 Aug**
**Spec:** §16, and §10 H — six MVP features.
**Built (database, 23 Aug):** `safety_events` with the five kinds,
`profiles.date_of_birth` and `age_confirmed_at` for the gate, and
`profiles.keep_recordings` for the retention toggle. A user can file a report
and read what was recorded about them; a user cannot forge a moderation event,
which is asserted from a second account.

**Built (app, 28 Aug).** Five of the six §10 H features; the sixth — the
challenge library review workflow — was already the rule the library shipped
under (§16.5, and rule 8 in `CLAUDE.md`). **No migration was needed**, which is
the good news the database pass bought: every column and every event kind this
uses was already there.

- **Moderation on both streams.** `lib/safety/` — a classifier verdict mapped
  onto four outcomes (`moderation.ts`), the escalation sequence as a pure state
  machine (`escalation.ts`), the server call and the record it leaves
  (`assess.ts`), and a client queue that never blocks a rep (`monitor.ts`).
  `/api/safety` is called once per committed turn from either side, behind
  `requireUser` **and** `maySpend` with its own bucket. The vendor call is free
  today; the gate is there so the kill switches reach the route at all.
- **Content-boundary intervention.** First strike is an in-frame decline: she is
  handed a direction and declines in her own words, and the rep continues. A
  second ends it, and she is given a bounded moment to close the scene on the
  same `isClosingOver` rule the clock uses. A rep the safety layer ended can
  never be a win, whatever the meter said — checked ahead of `givesNumber`
  rather than folded into it.
- **The one category that gets no first chance.** Sexual content involving
  minors ends a rep on sight, from either stream, with no strike and no
  in-character answer. It is a separate verdict at the *classification* so that
  no state machine downstream can be the thing that gets it wrong.
- **Distress detection.** Read only off the user's stream — the same words from
  the character are a break, not a person in trouble, and a helpline offered for
  a model's mistake is the product diagnosing its user. It ends the rep with no
  goodbye, drops the frame, and shows `DistressModal`: no persona, no score, no
  "run it back", and a list of real helplines authored in
  `lib/safety/resources.ts` rather than written in a component.
- **Age gate at sign-up.** A date of birth on the sign-up form, checked by
  `checkAge` on the server *before* the account is created. Accounts that
  predate the gate have no date, so they are caught by `/onboarding/age`, which
  the route guard puts ahead of everything including a finished onboarding.
  **Narrowed 30 Aug:** Google's button had no fields on it and was the other way
  to reach the product without a date. It is gone — the provider was never
  configured, so it only ever produced an error — which leaves one
  account-creation path, and it asks for the date first. The gate stays, and is
  written so that reopening OAuth changes nothing about it.
  **Corrected 30 Aug**: that screen was unreachable for exactly the accounts it
  exists for. The guard exempted every onboarding route *except* the age gate
  from the rule that sends an unfinished run to its resume step — deliberately,
  to stop a user who had finished onboarding and had no date from being bounced
  to `/train` and back forever — and in doing so sent every new Google account
  from the gate to `/onboarding/track`, which had no date either and sent it
  back. An infinite redirect, on the only door that does not collect a date of
  birth. The guard now returns on the age route, because past its two rules the
  date is missing and this screen is the only thing allowed to render. Found by
  walking the deployed run as a cold user; recorded in `ONBOARDING-AUDIT.md`
  §7.1 N1. `checkAge` also says *why* it refused now, so the gate can offer a
  retry on a mis-scrolled wheel and refuse one on a verdict — the behaviour its
  own comment had been describing without implementing.
- **Report-a-problem.** On the result, scorecard and transcript screens of every
  rep. Written through the user's own client, because `safety_events` grants
  exactly one insert policy — your own row, `kind = 'report'` — so RLS is the
  authorisation rather than a check in application code.
- **Text mode too**, which §16.3 does not mention because text mode did not
  exist when it was written. Same function, called from the Server Action: his
  message is classified before she is asked for a reply, and her reply is
  classified before it is stored, so nothing that trips moderation is ever
  written into a thread.
- **The §16.2 signpost** now sits in settings as well as on `/legal/safety`.

**The uncomfortable decision, recorded.** Moderation **fails open**: an
unreachable classifier returns `ok` and the rep carries on. The alternative
converts a vendor blip into every live conversation in the product being cut off
mid-sentence, which §05 forbids outright — and a safety layer that reads as
"the thing that breaks reps" is one somebody eventually switches off. The
exposure is bounded by the character contract, the PG-13 instruction in every
persona prompt, and the report control. It is asserted in `assess.test.ts` with
the reasoning attached, so reversing it is a decision rather than an edit.

**Also: the three legal pages now describe controls that exist.** They were
written honestly in the future tense — "an age confirmation is being added",
"automated moderation is being added", "a report control is being built" — and
every one of those sentences is now present tense. Privacy gains the date of
birth, the safety record and the classifier as a named use of OpenAI. That is
B4's other half and it is the thing a merchant-of-record reviewer checks the
product against.

**Still owed by hand:**
- **Verify the helpline numbers in `lib/safety/resources.ts` before launch.** A
  stale number is worse than no number. They are checked into the repo so that
  checking them is a reviewable task rather than an assumption.
- **Watch the thresholds.** `THRESHOLDS` in `moderation.ts` sits deliberately
  above the provider's own `flagged`, and the flags that fall under our floors
  are written down as `kind = 'moderation'` precisely so the gap can be read off
  the table rather than argued about. Nobody has looked at that table yet
  because nothing has run.
- **`keep_recordings` still has no UI.** That is B6, not this.

### B4 · The legal pages  ·  **written 27 Aug** · `lawyer's eye still owed`
**Was:** `/terms` and `/privacy` rendered three short sections each, and the
privacy page said *"Production retention is not enabled by this frontend
preview"* — text written for a mock that is now shipping real audio to real
storage. `/legal/safety` did not exist.
**Built:** three real documents at the §11 addresses, written against what the
build actually does. Terms cover eligibility, acceptable use, content standards,
the merchant-of-record arrangement, refunds and Sri Lankan governing law.
Privacy names every processor, states the thirty-day audio window and the fact
that the expiry is stamped at upload, and describes RLS as the thing enforcing
who can read a rep. Safety carries the §16.2 not-therapy signposting, the 18+
line, the PG-13 bound and the rule every field challenge is written against.
**Where a commitment existed but the code did not**, all three said so in those
words rather than in the present tense: automated moderation, the age gate and
the in-product report control were each described as being added, with the
current path (character design, the support inbox, account action) stated. A
policy that describes a control we have not built is the one thing on these
pages that could not be walked back.

**All three of those shipped on 28 August (B3), and the pages were rewritten to
match.** Safety clause 02 now describes the date-of-birth gate and says plainly
that a date is a claim rather than a proof; clause 03 describes moderation on
both sides, the decline-then-end sequence, the category that gets no first
chance, and what the event record does *not* contain; clause 06 describes the
distress path; clause 07 points at the report control instead of at an inbox.
Terms clause 02 gained the same gate. Privacy gained three things it now has to
name: the date of birth, the safety record, and the classifier as a use of
OpenAI. The rule did not change — the pages say what the code does — the code
simply caught up with what they were promising.
**Still owed:** a solicitor's pass before paid accounts open, and a company
entity name once one exists — the documents currently trade as "Nerve".

### B5 · Email cannot carry a beta  ·  **receiving + sending fixed 30 Aug, undeployed**

**Fixed.** `support@hellonerve.com` is a real mailbox with a catch-all behind
it, so `hello@`, `privacy@` and `abuse@` all land somewhere. Resend is verified
on `send.hellonerve.com` — SPF and the bounce MX sit on the subdomain and DKIM
at `resend._domainkey`, so the root MX and root SPF that carry receiving are
untouched and there is no second SPF record at the apex, which is the usual way
this is broken. DMARC is published at `p=none`. Supabase Auth sends through
Resend now instead of its own sender, which was the hourly limit this entry was
about. `SUPPORT_EMAIL` is one constant and every surface imports it.

Mail authentication is complete on both paths, verified against public
resolvers: SPF single-record at the apex, DMARC at `p=none`,
`resend._domainkey` for app mail and `privateemail._domainkey` (2048-bit) for
mail sent from the mailbox. **Namecheap Private Email publishes under the
`privateemail` selector, not `default`** — checking the wrong one is how this
was briefly recorded as missing when it had been there all along.

**Still owed:** none of this reaches a user until the tree is pushed
(`PAYMENTS-APPROVAL.md` §5.3).

**What it was.**
`support@nerve.training` is printed in the footer, in Settings, and in all three
legal documents — and `nerve.training` has no DNS records at all: no A, no MX.
Every message to it bounces. The product runs on `hellonerve.com`, which does
have working mail (privateemail.com MX, SPF present, no DMARC record).

So this entry is two problems, not one. The *sending* half is what it always
said — no custom SMTP, no sending domain, Supabase's built-in limits. The
*receiving* half is new and is a one-line change in
`components/site/site-chrome.tsx` (`SUPPORT_EMAIL`) plus the three legal pages
and the Settings row. Until it is made, the contact address on our privacy
policy does not exist, and the only offered route to account deletion (B6) goes
to it. `PAYMENTS-APPROVAL.md` §5.2.
**Built:** Supabase's built-in sender, which has a hard low hourly limit and
puts its own domain on the envelope. `DATA.md` already records this: *"It will
not carry a private beta. Wire a real sender before M5, not during it."*
**Missing:** custom SMTP (Resend or Postmark), a sending domain with SPF/DKIM,
and the Magic Link template edit that finally enables the six-digit code path.
**Why it blocks:** twenty users signing up in one evening means most of them
never get the email, and the failure looks like a broken product rather than a
rate limit.

### B6 · Delete and export  ·  **export shipped 8 Sep** · `delete still owed`
**Spec:** §16.7 — recordings are the user's: per-session delete, bulk delete,
full export, hard purge on account deletion.
**Built (database):** `export_my_data()` returns everything we hold about the
caller — profile, entitlement, streak, sessions, transcripts, scores, field
logs, unlocks, ledger and safety events — running as the caller, so RLS decides
what it can see. Proven from a second account: B's export contains none of A's
rows.

**Export shipped 8 September (audit C4).** `exportMyData()` in
`app/profile/actions.ts` calls the RPC in the user's own client and returns the
JSON; the browser builds the download, because a Server Action cannot set a
`Content-Disposition`. **The RPC moved with it**: it promised "everything we
hold" and stopped being true on 7 September, when `interview_setups` began
holding the role, the job description, the custom questions and the extracted
text of a CV — the most personal document this product stores — and
`interview_credit_entries` began holding what an account bought and spent.
Neither was in the bundle. `20260908091000_export_includes_interviews.sql` adds
both plus the subscription mirror. That ordering was the point: an incomplete
export nobody can run is a latent defect, and an incomplete export **with a
Download button on it** is a false claim a user can verify on day one.

**Delete is now honest rather than theatre.** It was a `disabled` "Delete
everything" button under a *Type DELETE to confirm* field, over copy saying
support handles it — a ritual in front of a control that could not act, which
tells a user the software is broken on the screen where §16 makes its most
serious promise. The field and the dead button are gone; what is there now is
the list of what goes, the sentence that a person does it, and a `mailto` that
opens with the subject filled in.

**Still owed:** the account-deletion path itself (admin API plus a storage
sweep, so it cannot be a SQL function) and a bulk-delete control.
**Why it still blocks:** the export half is the promise a user checks on day
one and that half is now real; "email support to delete your account" is still
not the promise, but it is at least what the screen now says.

### B7 · Nothing is instrumented  ·  **code done 1 Sep** · `keys owed`
**Spec:** §04 — PostHog for funnels and week-4 cohorts, Sentry for errors with
replay off on the live route.
**Built (1 Sep):** both packages are installed and wired. `lib/analytics/events.ts`
is the catalogue — nine events, in the order `docs/site-audit-openai.md` set out:
brief viewed → rep started → **first user turn** → rep completed → scorecard
viewed → technique opened → focused rep started → field challenge accepted →
logged. `components/analytics.tsx` is the only file that imports `posthog-js`,
the way `lib/voice/provider.ts` is the only seam for a voice vendor.

Three things about it that are decisions rather than defaults:

- **M5's gate is answerable without a stale counter.** *Three or more reps* is a
  cohort on the event stream (`rep_completed` at least 3 times), not a
  `reps_completed` person property that would be wrong between every rep and
  its next identify call.
- **`safeProps` refuses free text.** Ids, enums, finite numbers and booleans
  only — a transcript turn, a display name or a field-log note cannot leave with
  an event. Throws in development, drops in production, for the same reason
  moderation fails open: §05 does not let instrumentation end a live rep.
- **`sessionReplayAllowed` is §04's replay rule as a tested function**, applied
  on every navigation and widened to text mode, saved transcripts and
  scorecards, and the field log. Sentry ships with **no replay integration at
  all**, so the rule lives in exactly one place.

Both are off until keyed, and the imports are dynamic and inside the key check,
so an unkeyed deployment fetches nothing — first-load JS is unchanged at 103 kB.

**Still owed:** the PostHog project and key, the Sentry project and DSN,
`withSentryConfig` for source maps (needs an auth token), and confirmation that
the first events actually land. The pipeline half noted below is unaffected.
**Why it blocks:** M5's gate is *week-4 retention above 25% among users who did
three or more reps*. That number cannot be computed from what is currently
recorded, and the beta's entire purpose is to produce it. It also means a
crashed rep in Colombo at 9pm on a Friday is invisible.

**Narrowed 24 Aug.** The *pipeline* half was instrumented first: every non-fatal
voice incident is counted in `lib/voice/incidents.ts` and stored on
`sessions.pipeline_incidents`. That was the acute case — a rep where she was cut
off on most replies, or where real user turns were deleted, is now
distinguishable after the fact from a rep the user simply played badly.

**Closed in code 1 Sep**, from the P0 row of `docs/site-audit-openai.md`. What
remains is two accounts and two environment variables, which is why this entry
is `keys owed` rather than cleared: nothing is recorded until somebody creates
the projects, and a funnel that has never been seen arriving is not a funnel
anybody should trust yet.

**Partly answered from the other side, 9 Sep — first-party page counting.**
The vendor half above is still `keys owed`, and this does not close it. What
shipped is a second, smaller pipe that needs no vendor at all: `page_views`,
written by `app/api/pageview/route.ts` from a beacon in `components/analytics.tsx`,
read by `/admin`. It answers *did anybody come, and did they sign up* — which is
the question an unkeyed deployment could not answer at all, and the one a launch
day is judged on. It does **not** answer M5's gate: that is a week-4 cohort over
an event stream and still needs PostHog.

Three things about it worth knowing before touching it:

- **A stored path is a route shape, never a URL.** `/share/<token>` is stored as
  `/share/[token]`, and `lib/analytics/pageview.ts` scrubs anything merely
  *shaped* like a token as a backstop, so a route added later by somebody who
  never read that file is scrubbed by length rather than leaked. A share link is
  a capability URL; a traffic table holding raw paths is a list of live ones.
- **No cookie, and therefore no consent banner.** `visitor` is
  `sha256(salt | UTC day | ip | user agent)`, computed in the route and stored in
  no other form. The day is *inside* the digest, so it groups one person within a
  day and is useless across two. That is deliberately weaker than an analytics
  identity — privacy clause 07 promises no tracking cookie, and a counter needing
  one would be a change to what we told people. Clauses 01, 02 and 07 moved in
  the same commit. `DNT: 1` is honoured and writes nothing.
- **It is a different pipe from the funnel events on purpose.** PostHog answers
  cohorts in a vendor dashboard; this answers traffic on the same screen as the
  accounts it turned into. Keying PostHog later changes nothing here.

### B8 · The field track  ·  **cleared 23 Aug**  ·  `DB done` · `loop done` · `chart done`
**Spec:** §09 — four tiers, daily assignment, predicted anxiety before, actual
discomfort after, and the predicted-vs-actual chart that "does the therapeutic
work".
**Built (app, 23 Aug):** the loop is real. One challenge a day, chosen
deterministically from the user and the local day so a refresh cannot reroll
it; tier-gated off the sim level; accepted with the prediction captured before
they go; logged with what it actually felt like; and an ask made carries the
streak on a day with no rep. Optimistic writes throughout. The fixture is
deleted.
**Why it blocks:** three separate loads. It is the measurement instrument for
the top risk in §19 — whether any of this transfers to real life — and without
it the beta cannot answer the question it exists to ask. It is the free loop
that keeps the streak alive when voice minutes are gone (§14), which is what
stops the paywall being a churn event. And the rejection log is the
organic-distribution engine §18 calls a survival requirement.
**Built (database):** `field_challenges` with **24 hand-written, reviewed
challenges** across the four tiers, each carrying its own safety note at T3 and
T4; `field_assignments` with the predicted anxiety captured at accept and one
live challenge a day; `field_logs` with both anxiety numbers, the ask flag and
no UPDATE policy for anyone; and `streaks`, moved out of `entitlements` and now
counting a rep **or** a logged ask, which is what §14 means when it says
running out of minutes must never break the streak.
**Built (chart, 23 Aug):** the predicted-versus-actual chart on `/field`, with
the gap shaded and a verdict line in the user's own numbers, plus the summary
figure on `/profile` — both from one function, so they cannot disagree. Axes are
drawn before there is anything to plot (§15). It does not flatter: when actual
comes in above predicted the fill turns amber and the copy says to ease back a
tier, because §09's own warning is that going too hard too early sensitises
rather than habituates. Milestones at 10 / 25 / 50 / 100 with hand-written copy
each, fired once ever out of `unlocks`. `npm run db:field` now runs 27 checks.

**Nothing outstanding.** This entry is closed; the milestone becomes a share card
in item 8 of `M2-PLAN.md`, which is an addition rather than a gap.

### B9 · No spend ceiling on the paid routes  ·  **cleared 24 Aug**
**Was:** every money route required a session, and `/api/voice/token` refused a
caller with no reps left — but nothing bounded SPEND. A signed-in user could
post transcripts to the grader in a loop; a leaked cookie could do it faster.
No account-level or project-level kill switch existed.

**Now:** one gate, `maySpend` (`lib/db/spend.ts`), on **five** routes — the
entry named two, and the sweep found `/api/voice/llm` and `/api/voice/tts`
(both proxy a standing vendor key behind nothing but `requireUser`) and
`/api/voice/token`, which had a rep quota but no kill switch and is the most
expensive endpoint in the product. A halt that does not stop a rep starting is
not a halt.

Three gates, answered in **one round trip** by `spend_allowance` — deliberate,
because `/api/voice/tts` sits on the critical path of every reply and three
sequential checks would be three hops on `ttsFirstByteMs`:

| Gate | Where it lives | Why there |
|---|---|---|
| Project kill switch | `NERVE_SPEND_HALT` in the environment | Stopping the bill has to be a dashboard toggle rather than a migration — and has to work when the database is the problem. Checked first, needs no database |
| Account kill switch | `entitlements.spend_halted_at` | Read-only to its owner, written by the service role (§14, rule 9). The tool for one runaway user rather than a runaway bill |
| Daily spend cap | The append-only ledger, in the user's own local day | 100c free / 300c pro / 600c elite — roughly 5× each plan's honest day at the ceiling rate. A backstop against a loop, not a second quota |
| Per-user rate limit | `rate_limits`, one bucket per route family | A runaway grader loop must not eat the budget the live rep needs to keep talking |

Order matters: the kill switch is checked before the cap and the cap before the
rate limit, so a halted account never has its allowance consumed — being
switched off must not also cost you the allowance you need when you are
switched back on. Asserted in `npm run db:spend`.

**Two decisions worth knowing.** The gate **fails open** on an unreachable
database: the alternative converts a database blip into a total product outage
and ends live reps mid-sentence, and the exposure is bounded by everything still
standing — the session check, the rep quota, and the project switch, which needs
no database at all. And every limit is several times the honest rate of a real
three-minute rep, because §05 says nothing may interrupt a live rep, so a limit
a real session can reach is a limit that will eventually cut somebody off
mid-sentence.

**Verified:** `npm run db:spend`, 27 checks — the limit trips at the limit and
not before, the window rolls clean, buckets are independent, the cap reads the
real ledger, a halt refuses without consuming the allowance, and none of
`rate_limits`, `spend_allowance` or `spend_halted_at` is readable, writable or
callable by the user it is about. Plus route-level tests in
`app/api/api-auth.test.ts` asserting each of the five refuses **before** the
paid call, because the failure mode is a handler forgetting to ask.

### B9a · Leaked-password protection is off  ·  ~5 minutes  ·  **still off, re-checked 30 Aug**

Found by the Supabase security advisor while clearing B9, unrelated to it.
Supabase Auth can check new passwords against HaveIBeenPwned and refuse the
compromised ones; the setting is off.

It matters here because of D1: the build ships password sign-in alongside OTP,
against a spec line that says no password fields anywhere — and since Google
came off on 30 Aug, a password is now the only way in. As long
as passwords exist, a beta user reusing a breached one is an account takeover
that reaches a payment-bearing profile.

A dashboard toggle, not a migration — Authentication → Policies. Left alone
rather than flipped, because it changes what real sign-ups are allowed to do
and that is an operator's call.

The advisor also reports `rate_limits` as "RLS enabled, no policy" at INFO.
That one is **correct and intended**: a rate limit a user can read is one they
can pace against, and one they can write is not a limit. Only the service role
touches it.

### B10 · The mic primer is built and never shown  ·  **cleared 24 Aug**
**Was:** `MicPermissionSheet` existed and was imported by nothing. The live
screen went straight to `getUserMedia`, and a refusal surfaced as the generic
mic-lost modal with no recovery instructions.

**Now:** `MicPrimerSheet` fires on the brief, before the browser dialog, once
per browser — and is skipped entirely once permission is granted, because an
explanation of a dialog that will not appear is a door in the way. The refusal
path is `MicBlockedSheet`, split out from `MicLostModal` because a refused
microphone and one that dropped mid-rep are different problems with different
fixes: telling somebody whose headset unplugged to go and edit their site
settings is how a fixable problem becomes an abandoned session. Recovery copy
names the actual menu per browser (§12), with Safari given its own answer since
its menu is nothing like the others; `lib/data/mic.test.ts` covers the user-agent
detection, including that Chrome's UA contains "Safari" and Edge's contains
both.

### B11 · Some of her replies are never heard, and nothing noticed  ·  ~0 days, waiting on one rep  ·  `detection 24 Aug · evidence + recovery 25 Aug`

Reported as "I can't hear her first few sentences, and sometimes I hear
everything." Measured rather than reproduced: five stored rep recordings were
decoded and every agent turn was scored for audio energy against its own
transcript window.

| Rep | Agent turns | Turns with no audio at all |
|---|---|---|
| nadia (fresh test account, 24 Aug 14:17) | 21 | 2 — **her first two**, "Hey." and "Nadia." |
| nadia (24 Aug 02:57) | 22 | 2 — "Afternoon." (her first) and "Yeah, that's it." |
| maya (24 Aug 01:51) | 21 | 3 — "I drink it.", "Maya.", "Hey." |
| maya (24 Aug 09:58) | 21 | 0 |
| robin (24 Aug 08:08) | 19 | 0 |

Seven of 104. The recording taps the agent AnalyserNode, which sits on the
remote WebRTC track itself, so this is what arrived in the browser and not what
the speakers did with it.

**It is all-or-nothing per utterance.** The voiced-fraction histogram across all
104 turns is bimodal: a normal cluster at 0.4–0.8 and six turns at exactly 0.00,
with almost nothing between. Random packet loss produces partials; this does
not. Whole replies are either rendered or absent.

#### Re-measured 25 Aug over every stored rep — and it is not the opening

The five reps above were widened to **all 31 reps that have a recording: 560 of
her turns against 553 of the user's**. The user's own mic is the control.

| | her turns | lost | rate |
|---|---|---|---|
| **all turns** | 560 | 22 | 3.9% |
| turns of **3 words or fewer** | 95 | **22** | **23%** |
| turns of **more than 3 words** | 465 | **0** | **0%** |
| the user's turns (control) | 553 | 0 | 0% |

**Length is the cause; position is a symptom.** Every lost line without
exception is three words or shorter — median *one* word: "Hey.", "Nadia.",
"Morning.", "Maya.", "Afternoon.", "Alright." Not one of the 465 turns longer
than three words has ever been lost. Her first turn is over-represented (9 of
the 22) only because her openings are where the short lines live, which is why
this reads from the user's seat as "I can't hear her first few sentences".

**Three more theories are dead**, measured over the same 560 turns:

- **Not the cold-track race** the `attachRemote` rebind targets. Onset lag is
  flat at 0.80s across every idle bucket from 0–1s to 12s+, correlation with
  the preceding idle gap **+0.03**, and lost turns had *less* idle before them
  than heard ones (3.9s vs 4.7s).
- **Not barge-in or a cancel.** **0 of 22** lost turns had a user turn start
  within 1.5s of them, against 19 of 538 heard turns.
- **Not delayed playback.** Scanning ±6s around each lost line for unexplained
  energy: 19 of 22 have none anywhere in the recording, and the other 3 are
  adjacent user speech inside the scan window. The audio is dropped, not late.

**The media path itself is healthy.** Her audio arrives a constant +0.80s after
`output_audio_buffer.started` (p10 +0.12, p90 +1.04); the mic control is
+0.24s. That is ordinary end-to-end latency — data channel first, media after —
and it is stable, not a stall.

A duration-dependent loss is the useful constraint here. A WebAudio graph that
is not pumping, or an element that never started, cannot know how long an
utterance is: it would lose the head of the long lines too. Something is
swallowing short talkspurts whole, which points **upstream of the browser**.

**What it is not.** The clean maya rep with three inaudible turns recorded
`{overlaps: 0, truncated: 0, unheard: 0, echoRejected: 0, providerErrors: 0}` —
so no `response.cancel`, no `output_audio_buffer.clear` and no
`conversation.item.truncate` was sent for any of them. `interrupt_response` is
`mayInterrupt(persona)`, false below level 5, so the server did not interrupt
her either. Autoplay is not it: MediaStream playback is exempt from Chrome's
policy, and the AudioContext is not the playback path while
`roomAcousticsEnabled()` is off. The rounds 10–12 fixes in `translate.ts` are
all still holding.

**Why it stayed invisible.** `sealAgentTurn` refuses to commit a reply whose
`output_audio_buffer.started` never fired, and reports `agent.unheard`. A buffer
that opens, sends nothing audible and closes cleanly is indistinguishable from a
healthy turn on the data channel — so the line was committed in full, scored,
counted into warmth, and shown in the debrief as something she said. `unheard`
read 0 on every one of these reps.

**Landed 24 Aug.** `lib/voice/audibility.ts` plus the watch in the OpenAI
adapter: her analyser is sampled every 50ms between `agent.speech.start` and
`agent.speech.stop`, and a turn whose peak never reaches -46 dBFS now fires the
existing `agent.unheard` incident, so it counts into `pipeline_incidents` and
into `incidentsAreAlarming`. The non-fatal error it emits alongside carries the
`inbound-rtp.packetsReceived` delta across the turn. The turn is **not** dropped
from the transcript — `sealAgentTurn` drops on the provider's own evidence,
while this is a local measurement, and a browser with an odd WebAudio graph must
not be able to quietly delete a rep.

Also landed: the cold-track rebind in `attachRemote`. `ontrack` fires inside
`setRemoteDescription`, before any RTP has arrived, so both the
`MediaStreamAudioSourceNode` and the element's `play()` were bets that the
browser would wire them up retroactively when media started. The source is now
rebuilt once on the track's first `unmute`, against a stable analyser the
recorder and the visualiser can keep holding. That targets the two first-turn
cases in the table; it does not explain the three mid-rep ones.

**Landed 25 Aug, part 1 — the packet delta is now stored.** The detector fired
twice on the 24 Aug 15:39 rep and caught both of that rep's silent turns, which
is the first and only rep it has run on. It also computed the
`inbound-rtp.packetsReceived` delta across both of them, formatted it into a
`VoiceError` string, and dropped it: `pipeline_incidents` stored counts and
nothing else. The rep this blocker had been waiting for happened, and the answer
was thrown away.

`RepIncidents.unheardTurns` now carries one `{at, peak, samples, packetDelta,
recovered}` record per locally measured silent turn, capped at
`MAX_UNHEARD_RECORDS` and written into the existing `pipeline_incidents` column
— no migration. The counter is polled every 4th audibility sample rather than
awaited at settle, because `settleHerVoice` runs inside the same
`output_audio_buffer.stopped` handler that seals the turn and an await there
loses the incident on a final turn.

**Read it with `npm run db:rep -- <n>` or `scripts/last-reps.ts`. `packetDelta:
0` closes this blocker as a vendor fault; a healthy count reopens it as a
browser graph fault and makes it ours.**

**Landed 25 Aug, part 2 — she is asked to say it again.** Detection alone still
left the user with a hole. On a silent verdict the adapter now deletes the
conversation item she believes she said and asks the gate for a repeat, so she
answers the question again in her own words rather than re-reading a line.

The safety argument is that a held line is never lost. `sealAgentTurn` holds the
turn instead of committing it, and it is dropped **only** once a replacement has
actually been committed; every other path — gate declines, data channel closed,
repeat stalls, rep ends — releases it back into the transcript. The gate
declines rather than queues a repeat when a real user turn is already waiting,
because a line arriving two turns late is worse than the gap. One recovery per
line, never a chain: a repeat that is itself inaudible is committed normally.
Covered by `lib/voice/incidents.test.ts` and the `holding an unheard turn` block
in `response-gate.test.ts`.

**Still owed on the realtime arm.** The next rep with a short opener reads out
the packet delta and settles which half this is. Until then the recovery is a
mitigation, not a fix — it makes the hole audible again without explaining it.

**It happened again on 6 September, on the other arm, and for a different
reason.** Same user report, almost word for word: "the first one or two
sentences she spoke were not audible." Rep `0fa8a1e3`, Tess, 74 seconds.
`pipeline_incidents` read `{unheard: 0, unheardTurns: []}` throughout.

Two of her seven replies never reached the user, and the ledger proves both:

| | what the receipt says | what happened |
|---|---|---|
| reply 1 | `status: aborted`, `attemptedCharacters: 63`, `characters: 0`, `ttsRequestIds: []`, `firstAudio: false` | synthesis killed in flight; she never made a sound |
| reply 2 | `characters: 52`, `firstAudio: true`, `requestToFirstAudioMs: 2160` | audio began; he spoke over its first millisecond |

**The cause of the first is the cause of the second.** `onUserSpeechStart` cut
on `player.isPlaying || responding`, and `responding` is true from the instant
generation starts — so a user speaking while she was still *thinking* aborted
her turn. Her first reply needed 5.3 seconds (`llmFirstTokenMs: 2781` on a cold
cache, then 2.5s in TTS). He waited seven, was told by the guided rail to ask a
follow-up, and spoke. That utterance killed the reply. He then said "Hello",
which landed on the exact millisecond her second line began and killed that one
too — and `commitAgentTurn`'s `if (text)` found nothing in a turn sealed at zero
played seconds and dropped it in silence.

So the transcript records him talking to himself for twenty seconds, and the
warmth engine scored "Hello" as a dead end (−1.36) and capped her next reply to
two words. The pipeline failure was charged to the user.

**Why nothing noticed: this arm never had the detector.** `TurnAudibility` and
`analyserRms` were imported by `lib/voice/openai/index.ts` and by nothing else.
Everything above landed on 24–25 August for the arm that stopped shipping on
5 September.

**Landed 6 September.**

- `displaceCurrentReply` splits **barge-in** from **supersede**, and decides by
  asking `playedText` — the same function that would do the truncating, so the
  decision to truncate and the truncation can no longer disagree. Words reached
  the ear: truncate, commit, count. Nothing did: abandon it, count neither,
  report it. A wall-clock grace was rejected because an underrun advances time
  while no audio plays.
- The audibility watch is wired into the pipeline arm, starting on `onFirstAudio`
  and settling at commit. `UnheardTurn` gains `audioMs` — how much audio the
  player was handed — because there is no peer connection here to read
  `packetDelta` from. It answers the same question: **zero** is a fault upstream
  of the browser, a healthy number with a silent analyser is the audio graph.
- `commitAgentTurn` no longer drops a generated reply in silence. Three cases now
  report `agent.unheard` where all three were previously invisible: a superseded
  reply, a committed turn nothing was heard during, and a generation that
  produced no audio at all.
- The guided rail advances on completed **exchanges** rather than on his turns
  (D13), so it can no longer tell a user to follow an answer that never arrived.
  That is what put his voice on top of her first reply.

**Read it with `scripts/last-reps.ts`, which prints whichever delivery figure
the arm actually has.** The realtime half of this blocker is unchanged and still
owed its packet delta.

### B12 · The Sunday letter has no scheduler  ·  ~0 days on Pro, ~0.5 days on Actions  ·  `deferred 24 Aug`

**The deferral is now a public claim, re-checked 30 Aug.** `/pricing` lists "the
Sunday review letter" among what a Free account gets and `/how-it-works`
describes it. `vercel.json` carries exactly one cron — the audio purge — so
nothing fires it. A merchant-of-record reviewer compares the pitch to the
product (`PAYMENTS-APPROVAL.md` §5.6), and this is one of three places where
the two currently disagree. Either schedule it or take it off the pricing page;
leaving a paid-page promise unscheduled is the worse of the two.

`/api/cron/weekly-review` is written hourly on purpose: Vercel crons run in UTC
and "Sunday morning" is the user's Sunday, so the route asks each user's own
clock and leans on the `(user_id, week_start)` unique constraint to write the
letter once. Vercel's Hobby plan refuses any cron more frequent than daily, and
the first production deploy failed on exactly that expression.

Rather than make it daily — which reintroduces the timezone bug the route was
written to avoid, posting a Sunday letter into somebody's Monday — the cron was
removed from `vercel.json` and the deploy shipped without it. `purge-audio`
stays, daily at 03:20 UTC, because the 30-day audio retention in §05 is an
obligation and its schedule is Hobby-legal.

**What this costs right now.** No weekly review is generated for anybody. The
route, `generateWeeklyReviews` and the letter itself are all built and tested;
nothing is calling them. §11's Sunday letter is silently absent rather than
broken, which is the worse of the two failure modes to leave undocumented.

**The three ways out**, in the order they were considered: a GitHub Actions
workflow curling the endpoint hourly with `CRON_SECRET` as a bearer token —
free, preserves the design, adds a second place that has to hold the secret; a
Pro upgrade, which unlocks the expression as authored; or a daily cron and an
accepted drift. Deferred rather than decided.

> **Decided on 3 September: the first one** (`RETENTION-AUDIT.md` R6, which
> calls this the cheapest retention point on the board). `.github/workflows/cron.yml`
> runs at seven past every hour and curls two routes with `CRON_SECRET` as a
> bearer token: `/api/cron/weekly-review`, and the new
> `/api/cron/streak-nudge`. The URL names `www` and the workflow does not follow
> redirects, so the apex 308 fails loudly rather than quietly succeeding against
> the wrong host.
>
> **It does nothing until two secrets are set, and both are founder tasks.**
> `CRON_SECRET` as a GitHub Actions repository secret, holding the same value as
> the Vercel env var — without it both routes answer 401 rather than running
> open. And `RESEND_API_KEY` on Vercel for the nudge, without which every send
> is a logged no-op and the run still reports success. The weekly letter needs
> only the first. Until the first is set, no letter is generated for anybody and
> the pricing page's promise to free accounts is still unkept.

**Blocker total: roughly 10.5 working days**, down from 21 after the database
pass, 16 with B8 cleared, 15 with B9, 14 with B10, back down as B11's half day
was spent, and down again with B1 and B3 — plus merchant-of-record review time,
which runs in parallel and can fail. **Seven of the twelve blockers remain**,
one of them (B11) now mitigated and instrumented but still owed its explanation,
which costs a rep rather than a day, and one (B12) deferred rather than decided.

> **B9 was the one to take next, and it is done (24 Aug).** B1 followed on 27
> August and B3 on 28 August, which between them clear everything on this list
> that the merchant-of-record application was waiting on. **What to take next is
> not on this list: it is the application itself**, tracked in
> [`PAYMENTS-APPROVAL.md`](PAYMENTS-APPROVAL.md). Its two remaining blockers —
> a mailbox that answers, and an entity with a bank account — are founder tasks,
> and they are now the only things with external lead time that can fail.
>
> The largest code item left is **B2 (billing)**, and none of it can start
> before approval. **B5 (email cannot carry a beta, ~0.5 days)** is the useful
> thing to do while waiting, because it overlaps the mailbox question.

### B13 · The first session could end with nothing  ·  **cleared 25 Aug**

Found by walking the deployed app as a cold user rather than by reading the
code: sign up, one rep, every signed-in route. Eight defects, all of them on the
path between the sign-up form and the first score, and they compounded — the
worst realistic first session was a microphone the app never heard, a rep spent
on it, a result screen blaming the user for it, no grade, and a home screen
whose primary button read OUT OF REPS above a ten-hour timer.

**Was → Now**, in the order a user meets them:

1. **Onboarding restarted from step one.** Every answer was already written the
   moment it was given, but `/`, `/train` and `/login` all redirected an
   unfinished account to `/onboarding/track`, so a refresh looked like losing
   work that had not been lost. Now the guard resumes at the first unanswered
   step. `active_track` could not be the marker for step one — it carries a
   default and is therefore set before anybody has chosen anything — so the
   track step stamps `ui_flags['onboarding:track']`, the pattern the profile
   already uses for one-time beats. `app/page.tsx` shares the same resolver
   rather than keeping its own copy of the answer.

2. **The microphone gate was a silent dead end.** `getUserMedia` does not settle
   while the browser's permission bubble is open, and never settles at all if
   the bubble is dismissed or suppressed — so the button was pressed, the
   promise hung, and the screen showed exactly what it had shown before. There
   were only four states and no pending one. Now there are six: `requesting`
   says the browser is being waited on, and a twelve-second timer promotes it to
   `waiting`, which names the address-bar control and offers a retry. The
   priming sentence says why the permission is needed before the dialog appears.

3. **Onboarding had no exit.** With onboarding incomplete every protected route
   bounced back to it and there was no sign-out anywhere inside it, so the only
   way out of a step somebody could not complete was clearing cookies. Sign-out
   now sits in the onboarding chrome, and the mic step offers *Look around
   first*, which lands on `/train` — anything less is a skip button that does
   not skip, because the guard would send them straight back. The rep brief asks
   again, with its own primer (B10).
   **Revised 30 Aug**: it used to get there by calling `finishOnboarding`, which
   turned the escape hatch into a trapdoor — the brief and the "How a rep works"
   sheet were skipped permanently, with nothing in the product that would ever
   offer them again. It stamps `ui_flags['onboarding:deferred']` now, which the
   guard treats exactly as it treats a finished run while leaving
   `onboarding_complete` false, so `/train` can carry one quiet *Finish setup*
   row back to the step. `ONBOARDING-AUDIT.md` R20.

4. **The brief was shown twice.** `/onboarding/ready` is the brief — same
   character, same rule block, same Start — and Start routed to
   `/rep/nadia/brief?calibration=1`, which rendered the identical card at a new
   URL and asked for Start again. The query parameter was read by nothing. It
   now goes straight to the rep.

5. **A rep nobody spoke in still cost a rep.** The quota is spent when the
   transport connects, which is before anybody knows whether the microphone was
   working. `finishSession` now asks whether any *user* turn carried text —
   `turns.length` counts her side too, so a character talking into silence for
   three minutes looked like a rep — and calls `refundRep` when none did. The
   streak now hangs off the same answer, which is stricter than the old
   `turns.length > 0` and more honest. `refundRep` mirrors `consumeRep`: service
   role, conditional UPDATE, today's counter only, floors at zero used.

6. **The result screen blamed the user for it.** A silent rep produced "She
   wasn't interested from the start. Some aren't." — a sentence about the user's
   charm, printed because their headset was muted. The result screen now reads
   the transcript and, when no user turn carried text, says we could not hear
   them, that the rep is back on their counter, and offers an immediate retry
   plus a link to the mic test. The ungraded scorecard leads with *Run it back*
   rather than offering only a transcript that is empty.

7. **The transcript contradicted itself.** The header printed the session's
   final warmth while the trajectory beneath it printed `0 → 0`, and the
   zero-turn case reused the filter's empty state — "No turns match · Try the
   full transcript view" — while the ALL tab was already selected. Silence is
   now its own state with the sparkline suppressed, and the filter's empty state
   says something true and offers the switch back.

8. **`Win rate` was a headline lifetime stat.** §07 is explicit that outcome is
   never scored, and the profile's second figure was the percentage of reps that
   ended in a number — reading 0% to anybody on their first day. Replaced with
   mean composite across graded reps; ungraded reps are excluded rather than
   averaged in as zeros, because a model call that failed is a missing
   measurement and not a bad performance.

9. **Both Upgrade buttons did nothing.** No navigation, no message, on the one
   screen where somebody is deciding whether this product can be trusted with a
   card. Until B2 lands they record the ask instead — `ui_flags['waitlist:pro']`
   / `['waitlist:elite']` — and the sheet says plainly that checkout is still
   being built. That is the honest button and it is also the only demand signal
   available before launch.

**Verified.** `npm run db:rep` carries four new assertions for the refund: a
rep nobody spoke in is given back, the returned rep can be spent again, the
credit lands twice, and refunding an unspent counter cannot mint reps past the
cap. Items 1–4 were re-walked in a browser on a fresh account.

**Still owed by hand.** The silent-rep copy was verified end to end, but
against a rep ended early rather than a full three minutes.

**A correction, recorded because the first version of this entry was wrong.**
While testing, screens were repeatedly seen sitting in skeletons that never
resolved, with every client hook falling back to empty. That was written up
here as a pre-existing product defect. It is not one. The cause was the
automated browser window being occluded. In that state React never begins
hydrating: no fibers are attached, no effects run, no reads are issued, and
every control is inert — which is indistinguishable, from the outside, from a
data layer returning nothing. The evidence is consistent and was gathered
rather than assumed: `document.visibilityState` is `hidden` and
`requestAnimationFrame` never fires, while `setTimeout` and `MessageChannel`
resolve in under a millisecond, so the page is running but never painting. No
exception is raised anywhere — `window.onerror`, `unhandledrejection` and
`console.error` were all instrumented and stayed empty — so hydration is not
failing, it is never starting. Polyfilling `requestAnimationFrame` onto timers
did not change it, so rAF is a symptom of the same non-painting rather than the
gate itself; the precise mechanism inside React was not chased further because
the boundary is clear enough. The identical build hydrates and behaves normally
in a visible tab, which is where every other check in B13 was carried out. It
"reproduced on the deployed build" because the same occluded window was pointed
at it. **Nothing to fix, and nothing a user can hit.**

**What was real, and is now fixed (B14).** The thing that survived that
investigation is the read layer's identity lookup — see below.
### B14 · Six auth round-trips per screen  ·  **cleared 25 Aug**

**Was:** every read in `lib/data/queries.ts` opened with its own
`supabase.auth.getUser()` — six call sites. `getUser()` is not a local token
decode; it posts the access token to `/auth/v1/user` so the server can say
whether it is still valid. So a single screen fired four of those concurrently
before it fetched a single row, and every navigation repeated the set. The reads
were cheap; the identity lookup in front of each one was not.

**Now:** one memoised lookup per browser client, in `lib/data/session.ts`.
Concurrent callers share the in-flight promise and later callers get the
resolved value. The memo is dropped when the identity actually changes —
`SIGNED_IN`, `SIGNED_OUT`, `USER_UPDATED` — and deliberately not on
`TOKEN_REFRESHED` (same person) or `INITIAL_SESSION` (describes the lookup
already running). It is a cache of *who*, never of *still allowed*: the token is
re-validated by PostgREST on every query and RLS is what authorises the row.
Server-side sign-out cannot fire the browser's auth listener, so the two
sign-out forms clear the memo themselves.

A failed lookup is not cached at all. `sessionStatus()` distinguishes
`signed-out` — the auth server answering "that is not a session" — from
`unavailable`, which is not reaching it, and the next read retries rather than
inheriting a verdict it never got.

**And the one behaviour change that came with it:** `useUserState` now sends a
`signed-out` client to `/login` instead of leaving it on a page rendering empty.
The route guard is server-side only, so a client whose session had gone — signed
out in another tab, cookies cleared, token revoked — kept rendering a page the
server had already approved, with every read returning nothing. It redirects
only on `signed-out`; `unavailable` is left alone, because bouncing somebody to
a login screen over a dropped connection is worse than the problem. No `next`
parameter: `/` already decides where a signed-in person lands, and a redirect
target read off the URL is an open redirect waiting to be found.

**Verified.** `lib/data/session.test.ts` — twelve assertions, and the one that
matters is the call count: six concurrent readers produce one `getUser()`. It
also covers signed-out via error, signed-out via null user, unavailable on a
thrown fetch, retry-after-unavailable, and each of the four auth events.

---

### B15 · Nothing brings anybody back on day two  ·  **cleared 25 Aug**

The second half of the same cold walk that produced B13. B13 fixed the session
that could end with nothing; this is the day that could contain nothing. Seven
items, all of them between "the first rep is over" and "why would I open this
again", and one of them — text mode — is the answer to four of the others.

**Was → Now:**

1. **One rep a day, on day one.** Three minutes of product, and on day one those
   three minutes could produce nothing at all. A user cannot feel improvement
   without a second attempt, and the rank card was already naming a target —
   "score 70+ in 2 reps at level 1" — that a free account needed two calendar
   days to attempt. Day one became **three reps on every plan**
   (`lib/data/allowance.ts`), keyed off `entitlements.created_at`, which has no
   user write path — so a second day one could not be minted.
   **Superseded 31 Aug (D11).** That grant was the loud half of a recurring cost
   for users who never pay, and voice is sold by the account now: free grants
   none, and the one free rep is the sign-up rep, held once per account on
   `entitlements.onboarding_rep_used_at`. The rank card's own target — "score
   70+ in 2 reps at level 2" — is now a Pro target rather than one a free
   account is shown and cannot reach, which is the honest version of the
   complaint this item raised.

2. **Voice was the only way in, and the only thing to do.** Text mode
   (`/text/[personaId]`) runs the same character, the same compiled contract and
   the same memory with no microphone, no clock, no meter, no score and **no
   quota**. It removes the permission from the critical path for a nervous first
   session, and it is what is still open when the day's reps are gone — which is
   why `/train`'s primary action is now "Talk to her in text" instead of a dead
   OUT OF REPS in amber.

   It is unmetered to the user and not to us: it has its own `text` spend bucket
   so a loop there cannot eat the allowance a live rep needs to keep talking
   (§14). `text_threads` is one rolling conversation per person per character,
   owner-writable for the same reason `persona_memory` is — nobody would pay to
   change what they themselves typed. **Start fresh** clears the thread, and
   offers separately to clear the memory line, because those are two different
   promises.

3. **Character memory reached one arm of two.** The Realtime mint read it; the
   assembled pipeline compiled the contract from the bare roster record, so on
   ElevenLabs no character had ever remembered anybody. Both now resolve it — and
   the user's first name — through one module (`lib/db/persona-context.ts`), from
   the authenticated user rather than from anything a client sent.

4. **Three onboarding answers that bought nothing.** *(Closed 30 Aug — the third
   answer, `experience`, was cut rather than wired: nothing downstream ever read
   the column, and the tempting wiring is a difficulty adjustment, which §08 and
   §12 forbid announcing. `focus_area` can now be changed in Settings.
   `ONBOARDING-AUDIT.md` R3, R21.)* `focus_area` now decides the
   first character, the first field challenge and the technique card on the brief
   before there is a graded rep to draw one from (`lib/data/focus.ts`). It is the
   *last* tie-break in the persona choice, so it settles the first rep and then
   gets out of the way of the rotation — an answer that pinned somebody to one
   character forever would be a worse bug than the one being fixed.

5. **Nobody was ever asked their name.** §08's `usesYourName` dial has been on
   every character since M1, and the steering item that opens it — "You may use
   his name." — was compiling into contracts that were never told what the name
   was, while `/profile` rendered an email local-part in display caps. Onboarding
   now asks, skippably, and the contract is told when she may know it: he tells
   her, or they have met before.

6. **The library never sent anyone to a rep.** Every card now ends in "Run a rep
   on this", wired to an authored character-per-card rule
   (`lib/techniques/scenario.ts`) — the room the card names when the roster has
   one, otherwise the character who trains that sub-score. Plus next/previous
   inside the section, a read mark, and the deduplication: a card's first target
   is its home, so fourteen cards stop reading as eighteen.

7. **"Listening" was a label, not a signal.** A whole rep could run with a muted
   headset and the status line said the same thing throughout. The dot is now the
   real input stream, and a rep that has heard nothing at all for fifteen seconds
   says so. Gated on never having been heard rather than on a recent silence,
   because letting a silence sit is something the format explicitly allows.

**Verified.** `npm run db:rep` carries the day-one quota end to end — three
spent, the fourth refused, the refund, and day two back to one — and
`npm run db:verify` carries eight new text-mode assertions including "a text
thread spends no rep" read back off `entitlements`. Text mode itself was walked
in a browser on a fresh account: memory line shown, reply in character, start
fresh clearing the thread and leaving the memory, and `/train` reorganising
around text once the quota was spent.

**Owed by hand:** the input meter and the silence nudge have not been seen
against a real three-minute rep, for the same reason B13's silent-rep copy has
not — it needs a working microphone rather than a stub.

---

## 2b. What the database pass added

Applied through the Supabase MCP, one migration per change, each committed to
`supabase/migrations/`:

| Migration | What it adds |
|---|---|
| `m3_safety_and_consent` | `safety_events`; date of birth, age confirmation and the recordings toggle on `profiles` |
| `m3_field` | `field_challenges`, `field_assignments`, `field_logs` and their policies |
| `m3_streaks` | `streaks`, backfilled out of `entitlements`, counting reps and asks alike |
| `m3_unlocks` | `unlocks` — when the celebration was shown |
| `m3_library` | `techniques`, one table for cards, openers, ladders, recoveries and exits |
| `m3_subscriptions` | `subscriptions`, the merchant-of-record mirror |
| `m3_weekly_reviews` | `weekly_reviews` |
| `m3_interview` | `interview_setups` and the private `cv` bucket |
| `m3_account_data` | `export_my_data()` and `spend_today_cents()` |
| `m3_index_foreign_keys` | The four covering indexes the linter asked for |
| `p1_text_threads` | `text_threads` — one rolling typed conversation per person per character, owner-writable, unmetered |
| `p1_export_text_threads` | `export_my_data()` learns about `text_threads` and `persona_memory` (§16.7) |

And, seeded from the repo by `npm run db:content`: 24 field challenges and 14
library cards.

Two things a database pass cannot do, both flagged by the Supabase advisors and
both one click in the dashboard: **leaked-password protection is off** (turn it
on — we ship password auth), and the "unused index" notices on the new tables
are expected until something queries them.

---

## 3. Product-promise gaps

Launch is possible with these outstanding. The product is thinner than the spec
until they land, and each one is somewhere the spec says the thinness will be
felt.

### Scoring (§07)
- ~~**Six of eight deterministic metrics are scored.**~~ **Done 24 Aug.** All
  eight carry points. The two became graded 0-1 values beside their booleans:
  `planQuality` (specific 1 / vague 0.5 / no attempt unmeasured) and
  `exitQuality` (warm 1 / trailed off 0.5 / pushed 0). Neither is conditioned on
  how the rep went — gating the exit on rejection would score a rejecting rep
  across seven metrics and a receptive one across six, which is outcome
  deciding the composite's composition and §07 broken by the back door. Not
  asking is unmeasured rather than zero, because §16 rule 6 bans pressure
  closes and reading a closed person correctly is good play.
- **The grade calibration harness is built and unscored.** `npm run
  grade:calibrate` drives the deployed `/api/grade` and fails on drift beyond
  five points on any sub-score or the composite. Ten real transcripts are
  collected. **None are hand-scored**, and the suite refuses to report success
  below twenty — §17's gate on M2, and the one piece of it that is reading
  rather than building.
- ~~**The scorecard reads in the wrong order.**~~ **Done 24 Aug.** `wentWell`
  is its own card between the composite and the metrics, and it is never gated
  — it used to sit inside the Pro lock, so the users most likely to quit after
  a bad rep were the only ones who never saw the encouraging half.
- **The six sub-scores are chips, not the display.** §07's example is six named
  rows; ours renders them as small labels inside one audit row.
- **No staged reveal.** §02 rule 6 wants the composite counting up over 900ms
  with sub-scores staggering at 60ms. It renders instantly.
- ~~**No technique links.**~~ **Done 24 Aug.** The weakest two each link to
  their technique, and the brief carries the technique of the session. A test
  asserts every sub-score has a card to point at, so §07's sentence stays
  keepable.

### Progression (§08)
- ~~**The unlock rule differs.**~~ **Done 23 Aug.** The gate is §08's: two
  sessions scoring 70+ at the level below, uniformly two. Wins no longer gate
  anything, which closes the outcome-scoring problem D8a opened — the gate had
  been reading a win the grader could invent, so it was scoring outcome twice
  over.
- ~~**No adaptive difficulty.**~~ **Done 23 Aug.** `difficulty_offsets`,
  per-user and per-level, service-role write. Two reps at 75+ make her harder,
  two under 55 ease her back, clamped at ±6 start and ±0.25 gain in code *and*
  in CHECK constraints. The downward path returns nothing to display, by
  construction rather than by convention.
- ~~**Ranks are dead.**~~ **Done 24 Aug.** `lib/data/rank.ts` derives the rank
  from the same qualifying counts as the unlocks; `syncLevel` mirrors it onto
  `profiles.rank`; the rail is on Train. §08's four names survive three tiers by
  earning the last one *at* the top rather than above it.
- ~~**No baseline rep and no week-four re-test.**~~ **Done 23 Aug.** Written
  once by the first graded rep, re-offered at day 28 in the user's own
  timezone, and compared sub-score by sub-score at `/progress/baseline`. Which
  rep counts as the re-test is derived rather than stored, and it is the first
  qualifying attempt rather than the best — a re-test you can re-roll is not a
  measurement.
- ~~**`unlocks` is written now, but only for milestones.**~~ **Done 23 Aug.**
  All three kinds write through one `recordUnlocks` / `announceUnlock` pair, and
  the scorecard fires `LevelUnlockedSheet` off the row rather than off the
  `useState(false)` that nothing set. The sheet's copy named Jules and Samara
  for every level including the ones they are not on; it is hand-written per
  tier now.
- ~~**Character memory is a table nobody writes to.**~~ **Done 23 Aug.** The
  grade now returns a `memoryLine`, `lib/grade/memory.ts` decides whether it is
  fit to store, and the live page injects it into the character contract. The
  filter is what makes the feature safe rather than a positioning risk: second
  person, affection and performance judgement are all rejected, so what she
  carries is the encounter and never how he did (§14). Reset is one tap on the
  brief screen, the persona sheet, or all of them at once from Settings.
- Sim levels gate field tiers, and the field persists. ~~Struck 23 Aug.~~

### Three faults found in live reps, 23 Aug — all fixed

Reported from actual use rather than from reading the code, and worth keeping
together because two of the three had the same root.

**Her replies were being cancelled and recorded anyway.** Routing her voice
through WebAudio hid it from the browser's echo canceller, so her own audio came
back in on the microphone, VAD committed it as a user turn, and the overlap
guard cancelled the reply that resulted. The transcript kept it regardless:
eight agent turns across five sessions had physically impossible durations —
`"Catching my breath between sets right now."` at **0.22s for seven words**,
0.03 sec/word against ~0.35 for real speech. The user heard nothing; the scorer
read it as a spoken turn. Fixed in `attachRemote` (element playback when there
is no room) and in the translator (audio, not text, opens a turn; a reply that
never reached the speakers is dropped and reported as `agent.unheard`). See
`AUDIO.md`.

**Two characters shared a voice and one had none.** Alex named no OpenAI voice
at all and fell silently through the timbre default onto `coral` — Maya's voice.
Robin and Nadia were both `marin`, so Level 1 and Level 7 sounded identical. All
eight are now cast explicitly and distinctly, and the conformance suite refuses
an unnamed or duplicated voice. Maya moved from `coral` to `cedar` on a reported
distortion; **that part is a hypothesis, not a measurement** — five characters
remain on the older voice set and would sound the same way if the voice is the
cause rather than the cancelled audio above.

**The result screen contradicted itself.** It showed `final_warmth` against
`ARM_THRESHOLD` — two numbers nothing had ever compared. A real rep finished at
71.25 against a bar of 65 and correctly said "She left": warmth was 63.68 at the
wind-down, and crossed 65 two and a half seconds later. The engine was right and
the screen read `71 / 65` with "You were close" under it. `sessions.decision_warmth`
now stores the reading the ending actually turned on, `resultReading` decides
which number explains the outcome, and the late-surge case has its own copy.
Older reps have no stored decision, but finishing above the bar and losing is
itself proof it was taken lower, so they read correctly too.

### Ten faults found in a pipeline teardown, 24 Aug — all fixed

Prompted by a rep against Erin where the user heard one word of hers all
session. Everything below was already emitting an event or storing a column; the
common thread is that **nothing on the screen a real user is on was listening**,
so all of it was invisible until somebody noticed by ear.

**She was cut off mid-word and the transcript covered it up.** `mayInterrupt`
enables server-side barge-in at level 5+, and the VAD threshold is deliberately
low (`0.4`) because our user is nervous and quiet — so a breath was enough to
truncate her. The translator only *dropped* a reply whose audio never opened;
200ms of audio satisfied that, so a reply the user heard one syllable of was
committed **in full** to the transcript, the warmth engine and `/api/grade`.
`lib/voice/truncate.ts` now clips the turn to what actually played at a word
boundary, `agent.truncated` reports it, and the adapter sends
`conversation.item.truncate` so *her own history* matches what was heard — which
is what stopped the "she started saying something and it became something else"
symptom. The ElevenLabs arm already did all of this; the two adapters now share
the string arithmetic.

**Short replies and callbacks were being deleted before she saw them.**
`echoOverlap` was a bare ratio with no minimum length, so a one-content-word
turn was decided by a single word: "Awesome." against a line containing
"awesome" scored 1.00 and was deleted — no transcript entry, no warmth event, no
reply, no trace. Speaking over her dropped the bar to 0.6, which is where levels
1–4 live, so "Four minutes?" answering "The board says four minutes" was deleted
too. That is a **callback**, the highest-paying move in `fast.ts` and a §07
metric. The rule now needs three content tokens and two shared before it may
fire, and `user.echo-rejected` reports every rejection.

**Character memory never reached the model.** Every other part of §08 worked —
the filter, the write, the brief-screen line, "start fresh". The live page read
the memory and attached it to the persona, then the browser sent the token route
a slug and nothing else and the contract was recompiled from the bare roster
record. The read now lives in the token route, derived from the authenticated
user rather than travelling through the client, which also keeps the "a client
that can post its own instructions can post its own character" rule intact.

**The product path had no telemetry at all.** `agent.overlap`,
`agent.double-turn`, `agent.unheard`, `agent.tool-leak` and the gate stall were
emitted and dropped; only fatal errors were handled. The M0 harness counted all
of them and the real screen counted none. `lib/voice/incidents.ts` counts them,
`sessions.pipeline_incidents` stores them, and `incidentsAreAlarming` flags a rep
whose transcript should not be trusted — which is the difference between a bad
grade caused by the user and one caused by the transport.

**§05 re-injection never ran in production.** `StabilityMeter` and
`compileReinforcement` were wired in the M0 harness only, so a character break in
a real rep was never detected and never repaired. Now wired in
`lib/data/rep.ts`. Its competing length rule ("usually 4–10 words, never over
15") is gone: the band owns length, and a reminder fired mid-break is the worst
possible moment to restart the round-6 argument.

**Turn-taking calibration was specified, had a column, and had no write path.**
`profiles.vad_offset_ms` was read on every live rep and written by nothing; the
onboarding mic step showed a level meter and a hard-coded "testing, one two
three" it never timed — and printed that phrase back in the mono data face under
"We can hear you", which read as a transcript of speech nothing had transcribed.
The step reports the measurement itself now (`ONBOARDING-AUDIT.md` R4). Everyone ran at a flat 600ms — a confident speaker's
pause — which is why a hesitant user's sentence arrived as two turns drawing two
separate one-word answers. `lib/voice/calibration.ts` measures the real
inter-clause pause off the meter that was already running. `resolveSilenceMs`
also stopped flooring the offset at zero, so the negative half of the column's
range is reachable and a fluent speaker gets a faster turn.

**Steering was drilled into her.** It fired on every VAD speech start —
including noise and turns deleted milliseconds later — and the composed line is
deterministic within a band, so a rep accumulated fifteen near-identical copies
of the same stage direction. Repetition is how you make a model *more*
mechanical. `directiveIfChanged` sends it when it changes, with a heartbeat.

**Three correct rules composed into "What?".** The clarification instruction,
the continuity rule about repeating back what you heard, and the band's word cap.
Each right; together, one syllable. She now has to name the part she did not
catch.

**The turn assembler leaked across a cancelled response.** `sealAgentTurn`
returned early without resetting when a final transcript never arrived, and
`openAt` only assigns when the slot is null — so the next reply inherited the
abandoned start time and overwrote its text.

**And the cold bands were a word cap.** CLOSED was "one to four words". On
levels 5+ the meter never leaves it inside three minutes, so an entire rep was a
stranger who could not form a sentence. See `PERSONA.md` — difficulty is no
longer expressed as syllables.

### The session, as an experience (§02, §12)
- No armed countdown (3·2·1 with tick and haptic), so a rep starts by silently
  becoming live.
- No character-left moment. An exit at 40 seconds is meant to be a full-bleed
  designed beat; it currently ends like any other rep.
- No reconnection handling behind the modal: `ConnectionLostModal` renders, but
  there is no ICE-drop retry, no paused timer, no "saved up to 2:14".
- No session audio replay. Recordings upload to a private bucket, the 30-day
  purge works, and there is no player anywhere in the product.
- No sound kit and no haptics. Grep finds no `vibrate` call and no sound assets.
- No PWA manifest or offline shell.
- No keyboard paths — `Space` to arm and `Esc` to end are unimplemented.
- No first-scorecard explainer. §12 calls it "load-bearing for retention",
  because it is where the user learns that outcome is not scored.
- ~~Seven built overlays are imported by nothing.~~ **Done 24 Aug.** Six were
  dead duplicates of inline versions the screens had grown and are deleted — a
  component nothing imports is how the next person wires the wrong one. The
  seventh became two real overlays; see B10.
- **Room tone is off on purpose.** §02 rule 2 calls the ambient bed the highest
  ratio of perceived value to effort in the product; the procedural version was
  hurting intelligibility and is switched off pending recorded beds
  (`AUDIO.md`). Until those land, this rule is unmet.

### Content (§10 D, E)
- ~~**The technique library exists in the database and nowhere else.**~~
  **Done 24 Aug.** `/library` and `/library/[slug]`, grouped by the sub-score a
  card moves, plus the technique of the session on the brief and the link from
  the scorecard.
- ~~**The insight surface is one chart.**~~ **Done 24 Aug.** `/progress` carries
  the composure trend, the six sub-score lines, the filler and talk-ratio
  history and the stored Sunday letters at `/progress/week/[id]`. Linked from
  Profile and deliberately not from Train (§02).

### The interview track — **door shut 24 Aug**
Screens exist and are fixture-driven. There are no interviewer characters, no
CV storage bucket, no role/JD/question persistence, and no interview-specific
metrics. This is M4-and-after by the spec's own ordering and is not a launch
blocker.

The nav already hid it — the track switcher needs two unlocked tracks and every
profile has one. What the nav could not do was stop somebody typing the URL, so
`/interview*` now redirects unless `unlocked_tracks` contains it. That turns an
existing column into a real gate, and it is what will let the track ship to a
subset of accounts later without any of this changing.

**Planned 6 September — [`INTERVIEW-PLAN.md`](INTERVIEW-PLAN.md).** Still not a
launch blocker and the door stays shut, but the track now has a costed plan
rather than a shrug: ~17.5 days in five phases, interviews sold as **credits**
rather than through `reps_per_day` (a daily rate cannot hold a twenty-minute
item), a measured $0.45–0.60 per twenty-minute interview against a $9 price, a
free five-minute screener once per account, and interview progress kept entirely
separate from the dating ladder.

**The plan is written under one constraint and it is worth reading before the
plan**: the dating arm is finished and nothing in the interview track may change
how it behaves, sounds or scores — now recorded as rule 19 in `CLAUDE.md`. That
is what makes the judgement layer a set of new files rather than a shared table
with a parameter, and it is why the work opens with characterization snapshots of
the dating prompts, bands, reciprocity decisions and timings.

Two findings in it are about the build as it stands today rather than about the
track. **The first is a landmine, and it is now closed:** `syncLevel`
(`lib/db/progress.ts:428` — the plan calls it `refreshProgression`) selected
every session with no track filter and fed `qualifyingByLevel`, `rankFor` and
`unlockedTier`, so the day the first interviewer was seeded into `personas` a rep
scoring 70+ against them would have opened a **dating** tier, fired its once-ever
moment and moved the rank rail — silently, and by default. The plan says
`sessions.track` is written and nothing reads it; checked against the database on
7 September, **the column had never existed**. It does now
(`20260907013000_sessions_track.sql`, defaulted to `dating` and set from the
persona by a trigger), and the filter landed **before** the first interviewer was
seeded with the no-op measured rather than argued: 89 sessions, 17 users, every
one of them dating, so the filtered set was the identical set. That proof has now
expired, which is exactly why the ordering mattered.

**The second is accounting, and it is still open:** every combined turn is
stamped with the text model (`turnReservation` returns `model:
compiled.llm.model`), so 447 ledger rows carrying $1.76 since 5 September file
TTS under `gpt-4.1-mini`, and `usage_ledger.seconds` is 0 on every row the
pipeline arm has written. Cost by model is currently wrong, which is exactly the
report a new SKU needs — still recorded here rather than fixed, because it is a
write to a shared accounting path and rule 19 says leave it alone. **It gets
harder to defer from D onwards**, because a credit sold for $9 whose COGS cannot
be attributed by model is a margin nobody can check.

**Phases A, B and C shipped on 7 September** — see `INTERVIEW-PLAN.md` §14 for
what landed, the five defects the audition harness found that were invisible at a
desk, and the four things still owed by hand.

**Phases D and E shipped the same day (§15), and the door is open.** Every
account is granted the free five-minute screener at sign-up, a credit landing
adds `interview` to `unlocked_tracks` by trigger, and the guard — unchanged —
now lets everybody through. Three one-time packs exist at Whop ($6 / $20 / $45 since 9 September),
Pro grants one interview credit per billing period and Elite four, a lapse voids
unspent grants and leaves purchased ones alone, and `/pricing` and the landing
page both carry an interview surface. **This is the first thing in the product
that takes money for the second track**, and the money path is asserted by
`npm run db:billing`, `npm run db:credits`, `npm run whop:verify` and
`npm run whop:probe`.

What is still owed: **no pack has been bought with a real card** (D2's gate — see
`INTERVIEW-PLAN.md` §15), and the model-stamping defect above is now the live
margin problem it was predicted to become, because a $9 credit's COGS still
cannot be attributed by model.

---

## 3b. The 8 September experience audit — Parts 1–8, all shipped

A walk of `www.hellonerve.com` signed out and signed in, desktop and mobile,
against the codebase. Twenty-three findings across five parts plus a
subscription-product checklist, a pricing read and a launch order, **all closed
on 8 September**. The read underneath them was one sentence: *the dating arm is
ready and the interview arm sells nothing* — the free round it advertises was
unreachable on the default path, the out-of-credits moment sold the wrong
thing, and the three pack prices sat on a page with no way to buy them.

Parts 1–4 shipped in the morning; **Part 5 (E1–E3), Part 6's remaining gaps and
Part 7's one buildable strategy item shipped the same day**, along with two live
provider defects the preflight found on the way through.

Nothing here touched `lib/warmth/`, `lib/personas/`, `lib/grade/`, `lib/audio/`
or any `PIPELINE_*` default. `lib/characterization/dating-arm.test.ts` was green
on every commit (rule 19). E1 is the one change on this list both arms read, and
it is deliberately symmetrical: the same rewrite on both rows, not a one-arm
edit.

### Part 1 — the four that were named

| # | Was | Is |
|---|---|---|
| A1 | Setup was a three-step wizard with the interviewer bolted on *after* it, and round and difficulty buried in step one of a flow you run once. Cold start to microphone was eight screens | Split in two. A **profile** (role, company, job description, field, CV, questions) set once and edited from the home screen, and a **run** — interviewer → `/interview/start` → brief — every time. The two dials worth changing per interview are now the run's only questions |
| A2 | `RepsRemaining` had four states and two were links. "3 reps left" and "2 credits" — the two pills anybody actually looks at — were inert `<span>`s | All four are links. Reps to `/profile/subscription`, credits to `/interview`. Same visual treatment; a target, not a new control |
| A3 | Elite is monthly only and both boards **fell back** to its monthly offer on the weekly tab, so "7 days free, then $49 every month" sat under a period note reading "no trial and no commitment". In-app it was worse — `PlanCard` never drew the "Monthly only" chip `PlanColumn` did | `plansOn(period)` filters the board and `periodAsideFor` says in one line where Elite went. The column count follows the cards, so two plans do not leave a third of the board empty |
| A4 | `/profile/subscription` printed "Practice interviews · 1 / month" on every card and sold no credits. The only place in the product to buy one was a sidebar button on `/interview` | A **Credits** block on the subscription screen: balance, round costs, the expiry sentence, the three packs. `components/interview/credits.tsx` is the shared component — it could not live in `interview-screens.tsx`, which `modals.tsx` already imports |

### Part 2 — the interview track

**B1 (blocker).** Every account is granted one `screener` credit at sign-up, a
screener credit buys the five-minute round and nothing else, and
`DEFAULT_ROUND` was `recruiter`. So a new account walked the whole setup and
read *"a recruiter screen costs one credit, and there are none in the
account"* — while the pill in the chrome said **1 credit**. Two numbers
disagreeing on one screen, at the exact moment the landing page's promise of a
free interview should have paid off. **The one giveaway on every account in the
database failed silently at the moment of redemption.** `openingRound(hasScreener)`
is the fix, and the hero now quotes the account total with one sentence saying
what it cannot buy, so the pill, the card and the hero agree.

**B2 (blocker).** The interview brief opened `PaywallSheet` on `credits <= 0`
and got the **dating** one: titled "Keep training", saying *"Your voice reps for
today are done"*, printing Pro and Elite's reps per day, counting down to a
daily reset that does not apply to a balance, and pointing at a screen that sold
no credits. Every sentence false, on the second track's single monetisation
moment. There is an interview branch now — packs, per-credit rates, round costs,
the expiry sentence, Pro as a secondary line — and the body is `creditRefusal`,
so it never says "none left" to somebody holding a screener.

**B3.** Recruiter 10 min, Technical 20, Deep technical 25, Final 20 — and all
four were `credits: 1`. A rational buyer never spent a credit on the cheapest,
friendliest, most convertible round in the product. **Priced by length now**
(1 / 2 / 3 / 2), and the packs are sold as *credits* rather than as interviews,
because five credits is between two and five interviews depending on what they
buy. `ROUND_COST_NOTE` is the one string that says so, read by `/pricing`,
`/interviews`, the credits card and the paywall.

**The ladder that landed here was wrong within a day, and D18 is why.** It was
authored off MINUTES, which is not what an interview costs; the costing that
settled it is in `INTERVIEW-PLAN.md` §6.1 and the result is 1 / 2 / 2 / 2. What
survives of B3 unchanged is the part that mattered: the screen is still strictly
cheaper than every round it competes with, which is the only property the
finding actually needed.

**The ledger had to move with it, and the audit understated that.** A hold was
one row and the balance counted holds with `count(*)`, so it could not express a
three-credit round. `20260908090000_interview_credit_hold_amount.sql` adds
`amount` (defaulting to 1, which is what makes it safe on a live table) and the
balance sums it. `planSpend` replaces `nextLotToSpend` on the spending path: a
deep technical can draw one expiring grant and two purchased credits, all or
nothing, and settle writes **one ledger row per source** — so the module's
invariant, that every row carries the expiry of the lot it belongs to, still
holds. `refundInterviewCredit` was `.maybeSingle()` over the spend rows, which
errors outright on two and would otherwise have refunded one credit of three.

**B4.** `SetupLayout` rendered `0X / 03` over `value={step / 3 * 100}` and there
were four screens. The bar filled, the counter read 03/03, and a fourth screen
appeared. Falls out of A1 for free, and the count comes from `SETUP_STEPS` now
rather than a literal.

**B5.** `choose()` did `router.push('/interview')` — somebody who had just
decided who they wanted to face was put back on a dashboard and asked to find
the Start button. It pushes to the run's own setup now; `inRun={false}` keeps
`/roster` a browse.

**B6.** On a phone the hero fills the screen and the whole sidebar stacked
underneath as six undifferentiated cards, with the captions toggle drawn at the
same weight as the credit balance. Ordered by what somebody does — credits,
profile, readiness, last interview — and **the captions toggle moved to the run
setup**, where it belongs: it is a per-interview decision.

### Part 3 — money

**C1 (blocker).** The pack cards ended in nothing. No CTA on the highest-intent
block on the site, while every other card on the page ends in a button —
reading as unfinished next to the plan board above it, on the page a
merchant-of-record reviewer opens. Signed in, the button opens a real checkout;
signed out it goes to `/signup?pack=…` and the sign-up screen names what they
came for. Carrying the intent all the way into an automatic checkout is still
open and is a nice-to-have rather than part of this.

**C2.** Credits are granted on `payment.succeeded` — one payment, one period,
one grant — and weekly Pro pays every seven days. So it granted ~4.35 credits a
month while every surface printed "1 / month": **weekly Pro out-granting Elite
at 60% of the price, and under-promising it at the same time.** The grant is a
property of the **offer** now (`PlanOffer.interviewCredits`), weekly grants
none, and the card says "Sold separately" rather than printing a zero.
`periodForWhopPlan` is how the webhook knows which offer was bought.

**C3.** Measured at 375px: the cards stacked Free, Pro, Elite, and Free is the
longest card on the board, so Pro's "Most popular" chip sat two screens down. A
reader met a $0 plan, a wall of what it includes, and a **Start free** button
before they ever saw a price — on the view the traffic actually arrives in. CSS
`order` on the lead card below the breakpoint; the desktop three-across is
unchanged.

**C4.** See B6 above — export wired, delete made honest.

**C5.** The invoice row rendered only when the provider had returned a
`manageUrl`, so on every account where it had not the screen said nothing at all
about receipts. It always renders now. And "Switch to Elite" said nothing about
money: there is one sentence under it stating what starts when, and pointing at
the receipt for the period being left — it deliberately does **not** assert a
proration mechanism nobody has verified.

### Part 4 — onboarding and the first run

**D1.** `/onboarding/track` asked dating or interview and the run ended at
`/train` in every case, where `AppShell`'s pathname effect set the track back to
`dating`. The one question onboarding asks about intent was overwritten within a
second of being answered — and the interview option was still a *waitlist*, from
when the track was screens over fixtures. It is a real choice now, the run ends
on `/interview` when it is taken, the mic step's *look around first* honours it
too, and the focus question says which half it is about rather than asking
somebody who came for interviews about flirting.

**D2.** Clicking **Start training free** landed on *"Your date of birth"* —
before email, before password, before anything was at stake. §16.4 requires the
gate before the account **exists**, and nothing is created until the final
submit; the ordering was a product decision on top of the rule, and it measured
the wrong cost. Email and password first, the date on step two, the gate
unchanged. Worth an A/B once PostHog keys land (B7).

**D3.** The hero sells one product and the app has two. One clause in the hero,
`Interviews` in the header and footer nav, and **`/interviews`** — a dedicated
paid-traffic destination that renders the landing page's own `InterviewTrack`
and `ScoringLaw` rather than restating them, so the ad and the page it lands on
cannot come to describe different products. In the sitemap at 0.9.

**D4.** Two free samples existed and never met: the sign-up voice rep and the
five-minute screener. Nothing told a dating-track user the second one existed.
One quiet row on `/train`, after the first graded rep, gone once the screener is
spent.

**D5.** `RosterScreen` renders `InterviewerPicker`, so the same screen lives at
`/roster` and `/interview/interviewers` — and on the second URL the Roster rail
item went dark and Train lit up, mid-run. `RUNS_UNDER` in `app-shell.tsx` names
the exception.

### One thing found while fixing these, and fixed

`ProductProvider` was `useState('aisha-rahman')`, and every consumer reads
`selectedInterviewerId ?? setup?.interviewerId` — a `??` that could never reach
its right-hand side. The stored choice was unreachable: pick Marcus, save him,
reload, get Aisha. Cosmetic while the picker was a screen you visited once; A1
made it the first step of every run, so the fallback had to actually work. It is
`null` now.

### Part 5 — found signed in, all three shipped 8 September

**E1. The brief named the outcome as the goal, on both arms.** `RuleBlock` read
`Goal · Get her number` and `Goal · Answer well enough to be called back`, and
`HowItWorksSheet` closed the dating four on *"She decides at the end whether you
get her number."* Rule 2 is the product — outcome is never scored — and the
landing page argues exactly that. This was not a copy inconsistency: it is the
last thing read before the microphone opens, so it was an **instruction, at the
moment of highest attention, to play for the result**, which is the behaviour
that collapses Close and Signal reading. The screen primed the failure and the
grader then scored it.

Both rows now name a manner rather than a result — *Have a conversation worth
having* and *Answer like the person they should call back* — and the sheet's
fourth line is *"She decides at the end. Nothing she decides is scored."* The
mechanic is untouched: she still decides, and the interview still ends on the
clock. `lib/data/mission.ts` and `lib/data/guided.ts` are Tier 0 and neither was
opened; the sentence never lived there.

**E2. The track reset to dating on every cold load.** `ProductProvider` was
`useState('dating')` — hardcoded, never seeded from `profiles.active_track`,
never persisted — and `AppShell`'s pathname effect only corrects it on
`/interview`, `/train` and `/field`. Every **shared** route inherited the
default, so an interview account that refreshed, opened a bookmark, followed a
link from an email or came back the next day landed on `/roster` and got the
dating roster, the dating nav with Field back in it, and a "reps left" pill in
place of its credits. `active_track` — the one thing onboarding asks about
intent — was read by nothing in the chrome, and `setActiveTrack` was dead code.

The provider gained `adoptTrack`, which is deliberately not `setTrack`: the two
answers arrive in the wrong order. The pathname is known during the first
render and the profile a fetch later, so the **first** answer wins and every
later one is ignored — landing on `/interview` and being dragged back to dating
a moment later would be a worse bug than the one being fixed. It is gated on
`unlockedTracks`, so a stored track the account cannot open never draws a rail
to a guard. And the switcher now writes `active_track`, without awaiting and
without revalidating the layout: nothing server-rendered is behind a nav tap.

**E3. The card marked CURRENT PLAN quoted whatever tab you pressed.** On a
monthly Pro trial, pressing **Weekly** made your own subscription read `$7 /
week · $7 every week. Cancel any time. · About $30 a month.` A tab is a question
about what is **for sale**; the current plan is not for sale, so it answers a
different question now and quotes what was bought.

The period was the hard part and is the interesting half. The mirror did not
carry one, and it cannot be derived in a browser — the vendor-plan-id map lives
in `WHOP_PLAN_*`. So `applySubscriptionEvent` resolves it at write time and
stores it on the `last_event` blob it already owns: no migration, and the env
stays server-side. It is kept under the same rule as the renewal date and the
cancel flag beside it — **an event may change it and may not forget it** —
because `invoice.past_due` names a user and no plan, and writing the absence
through would blank the price on the subscription screen of the account whose
card has just failed. When the period is genuinely unknown (a hand-set
entitlement, a row written before the field existed) the card draws **no price
at all** rather than falling back to the tab, which is the same mistake in a
quieter voice.

Two things came with it. The *"Also seen"* on the audit was real: nothing
reconciled `entitlements.reps_per_day` with the authored plan, so the header
read *"20 voice reps per day"* over a card reading *"3 / day"*. The current
card now prints what the account is **granted** and every other card prints
what its plan is authored to grant — one formatter, `repsPerDayLine`, so the two
cannot be worded differently. And `PlanCard` was still calling
`interviewsLine(plan.id)` with no period, so in-app the weekly tab said
*"1 / month"* where the public board said *"Sold separately"* — C2 surviving on
one surface.

### Three found walking the interview arm itself, and fixed

Not on the audit — it walked the money surfaces. These are the second track
still wearing the first one's furniture, and in all three the interview material
already existed and was simply not being reached.
`INTERVIEW-TECHNICAL-PLAN.md` §15 is the long version.

**The judged half of the scorecard was labelled with dating dimensions.** An
interview is graded on structure, specificity, listening, signal reading,
composure and the questions asked back; `INTERVIEW_SUBSCORE_KEY` renames those
onto the `scores` columns the dating arm already had, so no migration is needed.
**That rename was a storage decision and it leaked onto the screen** — a
candidate scored on whether their answer had a shape read *"Opening 71"*, and
one scored on evidence read *"Curiosity 64"*. Every number was right and four of
the six labels named something an interview is not scored on at all.
`subScoreLabel(key, interview)` fixes it, and the interview labels are **derived
from `DIMENSION_LABEL`** — this arm's existing naming, already printed on
`/interview` — rather than authored a second time. The measured half needed
nothing: it has read *answer share · longest answer · fillers / min · thinking
time · questions back* since §14, and technical accuracy already answers
"did they know it".

**`/progress` drew interview scores as dating trends.** `fetchProgress` read
`scores` unfiltered, and every interview writes a row into those same six
columns — so structure was plotted on the Opening line and specificity on
Curiosity, and somebody who did four interviews watched their dating trends move
without doing a dating rep. It filters to `sessions.track = 'dating'` now, which
is the other half of a filter the interview arm has always applied on its side.

**The library is dating-only** — D17 in §4. Recorded as spec drift rather than a
bug, because §11 is what says otherwise.

### Part 6 — the gaps against what subscription products ship

Every **essential** on the audit's table is now Have. Three were closed here:
E2, E3, and **failed-payment recovery**, which was Partial — `past_due` stated
the problem and offered no action, so the only route to a new card was an email
from a provider that person had already ignored once. The dunning state now
carries an **Update card** button above the cancel button (a screen whose only
action during a failed payment is "Cancel" is a screen recommending churn), the
line is amber rather than mute, and when there is no `manageUrl` it stops
promising one and says the provider will email a link instead.

Two nice-to-haves were taken because both are cheap and both prevent a support
ticket rather than adding a feature:

**Usage history for credits.** The ledger is append-only and has always held
every movement; nothing ever showed one. *"I bought five and I have three"* is
the standard question in a credit product, asked by somebody who ran two
interviews and could not see that they had. `lib/data/credit-history.ts` turns a
row into a sentence — hand-authored per kind, never the column name — and
`CreditsPanel` draws it behind a closed `<details>`, so the card is the same
height for everybody who is not asking and the buy buttons cannot be pushed
below the fold on a phone (B6's lesson). **It reads the ledger and never sums
it**: the balance is the RPC's answer, and a second, subtly different total on
the same card is exactly the bug this was meant to prevent.

**The low-balance line (S5).** One credit left, said once, on the interview
scorecard — the highest-intent second in the product, and the only place where
that line is a service rather than an advertisement interrupting training. It
is below the actions, never above them, and **zero is not low**: `creditRefusal`
already owns the empty case in its own words on the brief, and two sentences
about one emptiness in two voices is worse than one.

The rest of the nice-to-haves were declined on 8 September rather than
deferred by omission: **no annual offer** (S4), **no bundle** (S2), **no
referral** (S5's first item). Pause and win-back stay where the audit put them.

### Part 7 — the founding allocation (S3), and nothing else

S1's argument is why almost none of Part 7 was built: **discounting a metered
product recruits the cohort that uses it hardest**, so a percentage off buys
worse customers than it does revenue. The one urgency device that survives that
is the founding price, and `CHECKOUT_NOTE` had been promising it since 31 August
while asking nobody to act.

It has a cap now. `FOUNDING_ACCOUNTS` is 200, `PRO_STANDARD_PRICE` is $29, and
`checkoutNoteFor` writes the sentence both pricing surfaces print. Three states,
hand-authored, and the middle one is the whole point:

| Places left | What it says |
|---|---|
| `null` | The bare promise, **with no number in it**. The count could not be read |
| `> 0` | "Pro is $19 for the first 200 accounts and $29 after that — 183 founding places left" |
| `0` | "The 200 founding places are taken and Pro is **moving to** $29" |

**The number is counted, not asserted.** `lib/db/founding.ts` reads `profiles`
with `head: true`, so a count comes back and no row does; it memoises for a
minute (the figure only grows, so stale is never an over-promise) and answers
`null` rather than throwing. A "3 places left" nobody counts is a compliance
risk on the page §14 has a reviewer reading, not a taste question — which is
also why the `null` state publishes no figure at all.

**The raise itself is a plan at the provider, not a constant in this repo.**
`npm run whop:verify` now warns the moment the allocation is spent while Pro is
still selling at the founding price, so the promise coming due is something the
preflight says out loud. Until that plan exists we charge less than advertised,
which is the safe direction to be wrong in — and the note says *moving to*
rather than *is*, for exactly that reason. There is no countdown, nothing
resets, and no struck-through price we never charged; `plans.test.ts` asserts
the copy never mentions time.

### Two things the preflight caught that were not in the audit

Both were live, both were found by `npm run whop:verify` on 8 September, and
both are fixed.

**The industry classification had drifted again** — to `ai_and_automation_software
/ ai_chatbot_software`, the value rule 12 records the 7 September `PATCH
/products` causing. Restored to `personal_development /
public_speaking_coaching` and read back with the preflight, then read back a
**second** time after the plan write below, because rule 12's whole point is
that a product write is an account write.

**The "One interview" pack was selling at $2.** Changed at 03:15 that morning
for a live checkout test — the account's only earnings were the $2.04 it took —
and left there, so `/pricing` advertised $9 over a $2 checkout. Restored to the
authored $9. The one existing purchase stands.

## 4. Spec drift — decide, then make one of them true

These are not bugs. They are places where the build and the spec disagree and
somebody has to say which is right.

| # | Spec says | Build does | Note |
|---|---|---|---|
| D1 | "No password fields anywhere" (§04, §11) | Password sign-up and sign-in, alongside OTP. Google removed 30 Aug — never configured | The frontend brief asked for passwords. Either the spec line goes, or the screens do. **Order changed 8 September (§3b, D2 of the audit):** email and password are step one and the date of birth step two. §16.4 is untouched — it requires the gate before the account **exists**, and nothing is created until the final submit, where `checkAge` runs on the server ahead of `auth.signUp`. Asking the date first was a product decision on top of that rule and it measured the wrong cost: cold ad traffic met the most personal question this product asks before anything was at stake |
| ~~D2~~ | Free = 3 reps ≈ 9 min, then paywall; $19 / 60 min and $39 / 150 min | Free = **no voice at all** past one sign-up rep; Pro $19 / 3 a day; Elite $49 / 6 a day | **Resolved 31 Aug — see `PAYMENTS-NEW-INTEGRATION.md`.** All three inconsistencies closed. Price: Pro is at §14's own $19, launched as an explicit founding-member price so it can be raised for later cohorts without breaking faith; Elite went to $49 because $39 with six reps a day lands at 53% gross after the merchant of record, under the 59% §14 had already rejected once. Unit: reps a day, which §14 agrees is the better framing, and the spec's minutes stay recorded as drift rather than being rewritten. Generosity: free was one rep a day *forever*, a recurring ≈$2.64/month for a user who never pays; it is now voice-less, and the one free rep happens once during sign-up. `lib/site/plans.ts` is still the single record both surfaces read, and `lib/site/plans.test.ts` asserts the ordering and the copy. **Extended 7 September**: the same record now also holds the three interview credit packs ($9 / $29 / $59), the per-plan interview allotment (1 on Pro, 4 on Elite) and both credit expiry rules, so the second meter is authored in the same place as the first and cannot drift from `/pricing` either — see `PAYMENTS-NEW-INTEGRATION.md` §13 and D16 below. **Extended again 8 September (§3b, B3 and C2)**: rounds are priced by length rather than flat (1 / 2 / 3 / 2), so the packs are sold as **credits** and `ROUND_COST_NOTE` is the one string that says what a round costs; and the interview grant moved from the plan to the **offer**, because credits are granted per payment and weekly Pro pays every seven days — it was granting ~4.35 a month while printing "1 / month", out-granting Elite at 60% of the price. Weekly grants none and says "Sold separately". **Extended a third time, 9 September**: the ladder is **1 / 2 / 2 / 2** and the packs carry **2 / 8 / 20** credits, with Pro on two a month and Elite six — see D18. **And a fourth time, the same day**: the packs were repriced to **$6 / $20 / $45** from $9 / $29 / $59 — see D19 |
| D3 | Bill per second, minutes framed as reps | Both: an append-only per-second ledger *and* a reps/day counter that actually gates | Fine as a design, but only one is enforced. If a rep can run 2 minutes, reps/day and minutes are interchangeable — say so once, in the spec |
| ~~D4~~ | Streaks run on asks made, never on asks accepted (§09) | ~~Streak counts days with a voice rep~~ | **Resolved 23 Aug.** A logged ask calls `recordTrainingDay`, so the field carries the day when the voice quota is gone (§14), and `npm run db:field` asserts a streak starting with no rep anywhere near it |
| D5 | Robin at a gallery opening; Alex at a bar, alone (§06) | Robin in a hotel lobby; Alex at a gallery opening | Alex was authored and tuned first and kept her room. Level 7 is `signalClarity: 20`, not the venue |
| D6 | Level 1 rep "sub-60-second first rep" (§19) | Three minutes, hard, for every dating rep | Three minutes is §14's own arithmetic ("3 reps ≈ 9 min") and is now product law (`PRODUCT.md`). Consider a shorter first-ever rep specifically |
| D7 | 34 routes, `/home` + `/train` + `/sessions` + `/progress` + `/library` | Four sections: Train, Roster, Field, Profile | Deliberate (`PRODUCT.md`). The spec's inventory should be restated against it so the two stop diverging silently |
| D8 | Unlock at two sessions scoring 70+ | Unlock on wins at the tier below | See §3. Worth fixing toward the spec: it scores process, ours scores outcome. **Sharper than it looked** — until 23 Aug the "win" itself was partly the grader's outcome, so the gate was scoring outcome twice over. That half is fixed (D8a); the rule is still wins rather than 70+ |
| D9 | "Volt is the ONLY accent"; Cool, Amber and Red are data or semantic, never branding (Arena) | Persona avatars carry a per-character hue on a constrained material ramp | **Decided 24 Aug — resolved in favour of the build, with a rule.** Characters have to be told apart at a glance on the roster, and shape alone was not enough — the argument was made when there were eight and holds with three, since the hue IS the warmth meter rather than decoration. The concession is bounded and enforced in code rather than in a style note: hues avoid the 60–115° band where Volt lives, no avatar colour comes within an RGB distance of 60 of Volt, Cool, Amber or Red, and chroma is floored at 0.34 and ceilinged at 0.86 so an avatar can never reach an accent's saturation. `lib/personas/visual.test.ts` holds all three. The Arena section of `CLAUDE.md` now records the carve-out |
| ~~D11~~ | One rep a day on free, and voice as the only way to train (§01, §14) | Free has **no** voice reps; one sign-up rep, once per account; text mode runs the same character unmetered, on any day | **Superseded 31 Aug.** The day-one grant of three reps was decided on 25 Aug and was right about the arc — fail, adjust, succeed cannot happen inside one attempt — and wrong about who pays for it: free was also one rep a day forever, so day one's three was the loud half of a recurring cost for users who never paid. That arc is now the argument *for* Pro rather than something given away in front of it. What replaces it is a single sign-up rep on `entitlements.onboarding_rep_used_at`, which has no user write path, so abandoning and resuming onboarding cannot mint a second one; `lib/data/allowance.ts` holds the rule and `npm run db:rep` drives it. Text mode is unchanged and is now the larger half of what free is: no voice minutes, no meter, no score, capped below `ARM_THRESHOLD` so it can never produce the number a voice rep exists to earn. §14's rule still holds and matters more than before — running out must never break the habit, so a field challenge still keeps the day |
| D12 | Free is "Level 1 personas", paid is "every persona" (the in-app plan comparison, and §14's tier table) | Nothing has ever gated a character by plan | **Resolved 27 Aug in favour of the build, by making the copy true.** **Second half closed 31 Aug:** the scorecard carried the mirror-image defect — four metric rows, the judgement row, both moments and the transcript link were drawn under a `LockOverlay` for a free account, while `/pricing` listed the full scorecard under what a plan never changes, and `/session/[id]/transcript` had no plan check on it at all. A claim rather than a gate, removed for the same reason. The paywall a free account meets is the microphone, and it is enough. `unlockedLevels` counts reps scoring 70+ and has never read a plan; `entitlements.plan` touches exactly two things, `reps_per_day` and the daily spend cap. The comparison was advertising a gate that did not exist, which is a promise to build one. Both the public and in-app plan lists now say volume and nothing else — and that is the better argument anyway, since a free tier that withholds the mechanism is a demo with a price attached |
| D13 | "No coaching during the rep. Nothing on screen but a timer, a live waveform and the mission" (§05); "not a reply generator — we never write your messages for you… our entire differentiation is the opposite promise" (§01) | **Tess only** carries an on-screen script during her rep: an aim, and for five of the six scored dimensions an example line to say | **Decided 6 September in favour of the build, bounded to one character.** Tess is rung 1 and is who a new account meets on the one free rep, and first-session drop-off is where products in this category die — a user who freezes there never finds out that rung 2 is better. `site-audit-openai.md` reached the same conclusion from outside ("a performance dashboard without a coach") and put "a guided first win" on its borrow list. **What keeps it bounded is code, not this note:** `lib/data/guided.ts` holds one script for one slug; `assertGuidedStep` is stricter than anything else in the build and refuses appearance, pickup, contact-detail and ask-her-out vocabulary outright; `assertNoScript` and every mission on the other nine surfaces are untouched; and `guided.test.ts` walks the real roster to assert that exactly one persona carries the flag. The live rail is a rail and never a pop-up — text changing in place, `aria-hidden`, no animation — because §05's objection is to *interruption*, and the whole script is read on the brief first, where coaching has always been allowed. **The public claim moved with it**: `components/site/landing.tsx` now says "Your first character walks you through it. After that the words are yours", because §14 has a merchant-of-record reviewer reading that page and a promise the build no longer keeps is the kind of thing that gets checked. **Two defects found on the first real guided rep, 6 September, both fixed the same day.** The rail advanced on his turn count alone, so when her first two replies never reached him (B11) step two told him to *"follow one answer twice"* against a silence containing no answer — he read the line out, and that utterance is what aborted the reply she was still synthesising. It advances on completed **exchanges** now (`min(userTurns, agentTurns)`), so it cannot point at an answer that has not arrived, and a failing pipeline holds the script still instead of marching somebody through a monologue. Separately the close sat at six user turns, which the pipeline arm reaches in about a minute: the rail told him to leave at 0:63 of a 3:00 rep, he read the line, and the one free rep a new account gets ended at 74 seconds in a phone number. **The close is now reachable only through `wrapping`** — the format already owns that moment at `WRAP_UP_MS`, and telling him to leave before she has been told to wind down is the product arguing with itself, the same argument `dueSceneBeat` settles with `LAST_BEAT_FRACTION`. **Owed:** the composure step ships with no line on purpose (its skill is not filling a pause), and whether guided reps should be comparable to unguided ones on the personal-best composite is an open question — Tess is rung 1 and already the easiest, so it introduces no new comparability problem the ladder did not already have |
| D14 | "No coaching during the rep. Nothing on screen but a timer, a live waveform and the mission" (§05) | **Interview only:** a fourth thing may appear on the live screen — the question the interviewer just asked — behind a setting that is **off by default** | **Decided 7 September in favour of the build, bounded by a test.** `INTERVIEW-PLAN.md` §5.11 is the argument and the honest part of it is that this is text on a live screen and §05 allows three things. Three reasons it is a setting rather than a decision, in ascending order of weight: an interview question is longer and denser than "what do you do", holding it while answering is a real load; the product's own recommendation is to leave it off, and the setup screen says so in those words; and it is a genuine **accessibility control**, which is the strongest of the three and the one that makes imposing either answer wrong. **It is a caption and never a prompt, and that is enforced in code rather than in this note.** `assertCaption` (`lib/data/interview-agenda.ts`) refuses any string that is not a verbatim substring of something the interviewer actually said in this rep — not a banned-word list, which would be an argument about which hints are acceptable, but a refusal of the entire category: there is no phrasing of "try the STAR method" that survives it. The counter beside it advances on **completed exchanges** rather than his turns alone, which is D13's lesson applied to a different rail, and the wind-down owns the last step outright for the same reason. §11 of the plan keeps the rest refused: no guided rail on the interview track, none on the free screener, and Tess's carve-out stays one character wide |
| D15 | "Outcome is never scored. Score process, never result" (§07); the grade is six dimensions of delivery, and the rubric says "do not penalise a candidate for not knowing something" | **Interview only:** a seventh scored dimension, `technical_accuracy`, on rounds that probe | **Decided 7 September in favour of the build, one track wide, and `NERVE-SPEC.md` is deliberately NOT edited.** §07's rule is about the OUTCOME and it is untouched: whether the interviewer seemed convinced still contributes zero, and a candidate who is turned down can still score 92 — which matters more on this track than any other, because "did you get the job" is what every competitor in the category scores. What changed is a different question. The old rule made Nerve a gym for how you handle an interview; the reason for changing it is commercial and was stated plainly — *that is what people will be paying for, to know if they know* — and a candidate who wants to find out whether their understanding of authentication survives contact with an interviewer cannot find that out from a composure score. `INTERVIEW-TECHNICAL-PLAN.md` §3 is the argument. **Four things bound it, and three of them are code rather than this note.** She never surfaces it during a rep — no correction, no hint, no "how it is going" — so rule 8 and §05 are intact and the number exists only on the scorecard. "I do not know", said plainly, still scores well on composure and is excluded from accuracy entirely, so the card can say *you handled that well and you were wrong*, which is the useful sentence. The grader **abstains by construction** (§8.3): `UNSCORABLE` is the default, an abstention leaves the denominator rather than scoring zero, a round where everything abstained returns **null**, and `parseAccuracyJudgements` downgrades any `WRONG` with no quote, no correction, or a quote that is not verbatim in what the candidate actually said — because a grader that invents a quote tells somebody they said something they did not, and a false accusation costs the account where an abstention costs nothing. And the **dating arm has no accuracy dimension and never will**: `judgementMeanOf` branches on the layer's absence, every dating rep reaches the six-dimension arithmetic it always did, and `lib/characterization/dating-arm.test.ts` pins both the number and the fact that the seventh key is not on that path |
| D16 | Free is **voice-less**: `reps_per_day: 0` is the paywall, and the only voice a free account ever gets is one sign-up rep (`PAYMENTS-NEW-INTEGRATION.md` §5.2, D2, D11) | **Every account, free included, is granted a free five-minute interview at sign-up** — real voice, on the real interview arm, worth about 14¢ | **Decided 7 September in favour of the build.** `INTERVIEW-PLAN.md` §5.6 budgeted it and D5 built it, but the tension with D2 is real and belongs here rather than in a plan: a free account is defined by having no voice, and this is voice. Three things settle it. It is **once per account, not once a day** — the same shape as the sign-up rep, on the same doctrine, with `screener:<user id>` as the reference so abandoning and resuming onboarding cannot mint a second; the recurring cost D2 was written to kill does not exist here. It is **a quarter of what a full interview costs and a fifth of what the old daily free rep cost the business**. And it is the only honest way to sell a $9 item: a pack bought by somebody who has never heard an interviewer is a refund, and §14 says a merchant-of-record account dies of disputes rather than of anything else. **The consequence nobody planned for was the spend cap**, and it is the interesting half. `voice_daily_cap_cents` adds 90c of headroom per credit — sized for a twenty-five-minute round — so granting every account a credit silently moved **free's daily ceiling from 100c to 190c**, which is a change to what a DATING account may spend, arriving sideways from a feature on the other track. That is exactly the shape rule 19 exists to catch and exactly the shape that would not have been noticed: it broke no test that was about it, and surfaced as one assertion in `db:credits` whose whole job was A5's promise that free's number never moves. Screener credits now earn no headroom at all (`20260907043000_screener_no_extra_cap.sql`), which is also simply correct — five minutes at 14c fits inside free's existing 100c beside the sign-up rep. **The second consequence is deliberate and is E1**: a credit landing opens the interview track, so every account in the product now has the track switcher in its chrome. §9 of the plan is the argument — a product whose public surface carries interview rehearsal is describing itself in the category the Whop account is already registered under |
| D17 | §11 lists the **library under both tracks**, and `navItems` did: the argument was that the cards are about holding a conversation with somebody who is not helping you, which an interview is | The library is offered on the **dating rail only** | **Decided 8 September against the spec.** The argument does not survive reading the cards. `lib/techniques/library.ts` is *"Open with the room, not with her"*, *"Use what she already gave you"*, *"Ask for something specific"* and five sets of openers — café, gym, platform, party, conference. There is no reading of an interview in which **Openers — gym** is guidance, and a second track advertising the first one's material as its own is the same defect `INTERVIEW-TECHNICAL-PLAN.md` §14 already fixed one surface of: that pass took the library LINKS off the interview scorecard and left the rail offering the whole section, so the conclusion reached the screen that linked *into* a card and not the one that advertised it. The route is untouched and the track switcher is two taps away, so nothing a dating user had is gone. Writing interview technique cards is the version of this that puts the item back on the rail; until they exist, `scorecard.tryNext` is this arm's authored prose and is already there |
| D18 | §14 prices voice by the minute and says nothing about how a second track's item is priced. The build's own answer, one day old, was to price a round by its **length**: 1 / 2 / 3 / 2 credits for 10 / 20 / 25 / 20 minutes | A round costs **one credit or two**: the ten-minute recruiter screen is one, every longer round is two. Packs carry 2 / 8 / 20 credits at the same $9 / $29 / $59, and the monthly grant is two on Pro and six on Elite | **Decided 9 September, on a costing rather than an argument.** Length is not what an interview costs. Costed component by component off `voice_operations` (`INTERVIEW-PLAN.md` §6.1): a deep technical runs at ~$0.41 against a technical's ~$0.34 and a recruiter screen's ~$0.18 — **1.2x the cost at 1.5x the price** — because her airtime is what scales and an interviewer talks *less* of a long round, not more. Cost-plus is the wrong frame here anyway: COGS is 3–4% of pack revenue, so the ladder was passing on a difference that does not matter at a magnitude that does. What it cost the buyer was worse than the accounting. One credit bought a recruiter screen and nothing else, so somebody who had just used the free five-minute screener, wanted a real technical, and paid $9 was answered by `creditRefusal` with *"a technical costs 2 credits and there is one in the account"* — **the first paid purchase in the product met by a request to buy again**, for a ten-minute version of the free thing they had just had. Pro had the same shape: $19 a month reached no round longer than the screen while its card promised "one practice interview a month". **Prices did not move and deliberately did not** — a public price is very hard to raise again (`FOUNDING_NOTE` already commits us on the plans) and credits-per-pack can be turned back down for a later cohort without breaking a promise. B3's finding survives intact: the screen is still strictly cheaper than every round it competes with, which is what stopped it being dominated; above that line the three long rounds are priced together so they are chosen on fit. Asserted by `interview-credits.test.ts` as a *property* — screen strictly cheapest, long rounds equal — rather than as a copy of the table. **"Prices did not move" held for about six hours**: D19 cut them the same day. The reasoning above is not overturned by that — it argues the counts are the dial to turn *when the price has to hold*, and D19 is the separate decision that the price itself was wrong for the audience |
| D10 | Eight characters, one per level, and level 8 unwinnable by construction (§06) | **Four** characters on rungs 1–4; the other five retired; no unwinnable rung | **Decided 24 Aug — deliberate, and the one entry here that gives something up.** See D10a. **Narrowed 31 Aug:** Tess was authored for the sign-up rep and took rung 1, Nadia moved to 2 and Maya back to 3, so the ladder is contiguous for the first time and no rung falls back to a neighbour's curve. Robin stays at 4, which is where §12 takes the warmth digits off the screen — that rule finally lands on the character it was written for. Four rungs is four UI tiers, so `Level` widened and the rank rail stayed anchored to the characters it was written about: Nadia earns Regular, Maya Contender, Robin Closer, and the on-ramp mints nothing |
| D19 | Packs at **$9 / $29 / $59**, and D18 six hours earlier arguing explicitly that a price on a public page must not move | **$6 / $20 / $45** for the same 2 / 8 / 20 credits — $3.00, $2.50 and $2.25 a credit | **Decided 9 September, and the direction is the whole decision.** D18 is right that a public price is very hard to *raise*, which is an argument against raising and not against ever setting one properly. The audience this track is for is students preparing a first graduate round, and for them $9 to find out whether the thing works at all is the barrier; $6 is not. **The window is what made it free**: one $2 test purchase, `volume_usd` 0, no paying customers — so today it is a price, and in a month it is a public price *cut*, which teaches everyone to wait for the next one. Spent once, deliberately, and the credits dial stays the one that turns afterwards. **Margin was never the question and was measured rather than assumed**: Whop's real cost is **$0.37 fixed plus 5%**, read off the fee breakdown of an actual payment rather than a published table (rule 14), and §6.1 puts a credit at $0.17–0.21 to serve — so $6 nets $5.33 against $0.36 of COGS and every rung clears **92%**; the worst case, every credit burned on a round that hits the $0.90 clamp, still clears 73%. **The top pack is $45 and not the $49 first proposed, for two reasons.** At $49 the ladder runs $3.00, $2.50, $2.45 — a 17% step then a **2%** one, which is the big pack losing its reason to exist, and `plans.test.ts` asserted only that the rate *falls*, so it would have passed while defeating its own intent; there is an 8% floor on every step now. And $49 is **Elite's monthly price**: a one-time $49 for twenty credits drawn beside "$49 / month" for six credits a month, on the page §14 has a compliance reviewer opening, is a comparison that makes the subscription look like a mistake. A second test refuses any pack priced at a plan's headline number. **The vendor is not optional here**: `whop:setup` PATCHes an existing plan on `--apply`, but its dry run said only `ok already exists` over three plans still charging the old price — `whop:verify` is what caught it, and the dry run now names the drift it intends to write |
| D20 | Rule 19: "The dating arm is finished. Do not change how it behaves, sounds or scores — for any reason" | The dating arm was **retuned on purpose**: the band table, the fast scorer, the steering line, all four shipped persona contracts and the grade gate | **Decided 10 September by the product owner, on evidence, and the rule was rewritten rather than broken.** The premise had expired. Measured across 1,274 real agent turns: six disfluencies, five self-repairs, three bare answers, and **one** request to repeat something — over three minutes in a noisy café, against a user the transcriber renders as *"Bro, cords taste like wet cardboard"*. Median turn eight words, so the caps were working and length was never the defect; her **wit rate was 100%**, and "Machines hum, people pass, and I get a break from my usual noise" is a tricolon nobody says while waiting for a dryer. Rule 19's real content was never "never change this" — it was "never change this *by accident, on the way to something else*", and that half is intact and now says so. **The ceremony is what makes it a decision rather than a drift**: every compiled prompt was dumped before and after and diffed line by line before a single digest was retaken, the five reasons are recorded inline in `dating-arm.test.ts`, and `tts` and `turn` came through byte-identical on all nine characters under both environments — so nothing about her voice, her stability or her turn-taking moved. **The interviewers moved too**, for the em-dash removal and the volunteering licence, and that is named in the same note rather than discovered later: a shared compiler is a shared dial, which is the lesson D16 paid for through data and this one pays for through a function. **What is still owed is the only thing that can settle it: `npm run rep:audition`.** The suite is green and green proves the corpus numbers, not the ear. `PERSONA-AUDIT.md` §14.5 lists the four claims worth spending money on |

### D10a · Four characters instead of eight  ·  **decided 24 Aug, narrowed 31 Aug**

§06 authors eight rungs and the roster shipped all eight. It shipped three from
24 August — Nadia on rung 1, Maya on 2, Robin on 4 — and ships four from 31
August: **Tess on rung 1, Nadia on 2, Maya on 3, Robin on 4.**

Tess was authored for the sign-up rep (`PAYMENTS-NEW-INTEGRATION.md` §4) and
everything below still applies at four: the calibration gate is about seven
transcripts per character rather than two, and the difficulty curves are still
authored per character rather than interpolated. What the fourth rung bought,
beyond the sign-up rep itself, is a **contiguous** ladder — 1, 2, 4 had nothing
at 3, so `levelTrajectory(3)` fell back to a neighbour's curve. It no longer
falls back to anything below rung 5.

**The argument for.** A persona contract is the only part of this product that
cannot be verified at a desk. Schema, RLS, grading, the field loop and the rep
format all have harnesses; whether a character holds up over three minutes is
answerable only by running reps against her and reading the transcript. Eight
characters is eight of those surfaces. §17's calibration gate is twenty
hand-scored transcripts *in total* — across eight characters that is two or
three each, which is not evidence about any of them; across three it is about
seven each. The gate gets sharper without getting bigger.

**What moved, and what did not.** Difficulty is layer 1 and character is layer
2 (`PERSONA.md`), so moving them cost nothing in personality: Maya took the
authored rung-2 curve and Robin the rung-4 one, and both are otherwise
untouched. Robin's `signalClarity: 20` — the entire reason she is hard — is
layer 2 and never moved. The rungs are 1, 2 and 4 rather than 1, 2 and 3
because §12 takes the warmth digits off the screen from level 4, and the top
rung is exactly where a user should be reading a person rather than a meter.

**What this gives up, stated plainly.** Alex is retired, and with her goes the
only level that cannot be won by construction. §06 is right about why she
existed: a ladder where charm always eventually works teaches that persistence
is the answer, which is the single worst thing this product could teach. Three
things carry that lesson now instead of one character:

- Robin at rung 4 ends in a polite no in the overwhelming majority of reps.
  Eighteen turns of good play lands her at 59 against a 65 line. She is hard
  rather than sealed, which is a weaker version of the lesson, honestly stated.
- The field track, where the outcome is a real person's real no.
- §07's rule, unchanged and enforced in code: outcome is worth zero. A rep that
  ends in rejection can score 92.

**This is the entry to revisit first if the beta says the ladder is too kind.**
The cheapest fix is not re-authoring anybody: Alex is still in the repo, still
tuned, still exercising every clamp in the warmth engine through
`engine.test.ts`, and putting her back on the roster is an edit to
`PERSONAS` in `lib/personas/index.ts` plus a re-seed.

**Retired, not deleted.** The five are unpublished in the database rather than
removed. `sessions.persona_id` references that table and `sessions.persona_slug`
is denormalised beside it for exactly this case, so every rep anybody ever ran
against Priya, Jules, Erin, Sam or Alex stays a complete and readable record.
`npm run db:seed` performs the retirement, and only on a full seed.

**The knock-on nobody would have predicted: field tier 4 lost its gate — and
got a better one.** The field's four tiers were gated on sim level (T2 at 4, T3
at 6, T4 at 7), a near 1:1 mapping onto four sim tiers. Three sim rungs cannot
earn four field tiers. T2 and T3 are re-anchored onto the rungs that exist (2
and 4); **T4 is no longer a gym gate at all.**

**Resolved 24 Aug — T4 is earned in the field.** It opens on the top rung *plus*
five distinct days on which a tier-3 ask was actually made (`T4_ASK_DAYS` in
`lib/field/assignment.ts`). Days rather than asks, because habituation is
repetition spread over time and five asks in one brave afternoon is one
exposure. Asks made rather than accepted, because §09 is explicit that nothing
in the field is gated on the other person saying yes.

This is the better coupling, not merely the one that survived the roster change.
Gating the hardest real-world ask on gym performance always said that being good
at talking to a synthetic character earns the right to approach a person. It
does not; doing the smaller thing, repeatedly, does. The sim rung stays
necessary and is no longer sufficient.

Two properties worth knowing:

- **It fails shut.** `unlockedTier`'s history argument is optional and its
  absence gates T4 closed, so any caller that cannot see the field log is wrong
  in the safe direction. For an exposure ladder, too little is a slow week and
  too much is somebody quitting.
- **The moment fires on the day it is earned.** `syncLevel` runs after a graded
  rep, which is the wrong event for a tier earned by going outside — so
  `syncFieldTier` runs from the log path instead. Otherwise a user unlocks it on
  a Tuesday and is told on Thursday.

`npm run db:field` covers the counting: two asks in one day counting once, an
honest "did not ask" counting for nothing, the gate shut on day four and open on
day five, and the moment recorded exactly once.

**Five is a judgement call and is meant to be tuned** once the beta has numbers.
It is one named constant.

### D8a · The grade was inventing wins  ·  **fixed 23 Aug**

Found in a live Priya rep. `wonFromRep` opened with
`if (outcome === 'receptive') return true` before it looked at the meter, so a
rep that peaked at 60.16 — never armed, shown to the user as "She left" — was
rewritten as a win the moment the grade landed. Three places were affected:

| Where | Was | Now |
|---|---|---|
| `wonFromRep` | Outcome short-circuited the meter | Takes no outcome at all |
| `saveScore` | `won === true ? true : recompute(…, outcome)` — could hand out a win, never take one back | `session?.won ?? wonFromRep(…)`; the grade never revises either way |
| `fetchPersonas` | Selected `outcome`, never `won` — the roster's **locked state** came off the grade | `row.won ?? wonFromOutcome(row.outcome)` |

§07 says outcome is recorded and worth zero. It was worth a win, an unlock and a
contradiction with the screen the user had just been shown. Four regression
tests, all verified to fail against the pre-fix code. One real row corrected by
`npm run db:repair-wins`.

The same rep surfaced a second defect — an exit condition the user could trip by
asking for a number, ending the rep before the wind-down. Both are written up in
full in `M2-PLAN.md` item 0.

### D2a · What the three-minute rep actually costs

Measured 23 August, closing the cost debt the rep-format change left behind.
`npm run cost:model` is the arithmetic, sourced line by line to `docs/M0.md`.

Four priced `gpt-realtime-mini` runs landed at **$0.0192–$0.0293/min**, against
§18's assumed $0.05–0.08. A three-minute rep is therefore **$0.058–0.088**, not
§18's $0.21. And the specific fear §04 records — that realtime re-charging prior
audio context each turn makes a longer rep cost more than pro rata — does not
appear: 305.8s against 117.8s is +2.8% per minute. Removing blind scheduled
reinforcement is what bought that (M0, fourth finding).

At the dearest measured rate, and assuming every user burns the whole cap:

| | Price | Cap | Voice cost | Margin |
|---|---|---|---|---|
| §14 Training | $19 | 60 min | $1.76 | 91% |
| §14 Serious | $39 | 150 min | $4.39 | 89% |
| **Built** Pro | $24 | 3/day ≈ 270 min | $7.91 | 67% |
| **Built** Elite | $39 | 6/day ≈ 540 min | $15.82 | **59%** |

§14's own tiers are comfortable. **The build's are where the pressure is**, and
in two places the spec would not have chosen:

- **Elite at 59%** is the exact number §14 rejected 200 minutes for — "too thin
  once merchant-of-record fees and infrastructure come out". Take the MoR's ~7
  points off and it is ~52%. Six reps a day is a bigger promise than 150 minutes.
- **Free at one rep a day is recurring, not a trial.** §14 budgets $0.72 *once*
  before the paywall; an engaged free user on the built plan burned **$2.64 a
  month, indefinitely**. §18's ~4% break-even conversion was computed against the
  one-off figure and did not survive that unexamined.

**Both were resolved on 31 August, and this section is the reason they were.**
Elite went to $49, where six reps a day is 62% gross after the merchant of
record rather than 53%. Free lost voice entirely: the recurring $2.64 becomes a
one-off ≈$0.09 for the sign-up rep, which is inside §14's own $0.72 budget and
restores §18's break-even arithmetic to the figure it was computed against.
`PAYMENTS-NEW-INTEGRATION.md` is the plan of record and D2 is closed. **Still owed:** the live ten-rep
measurement `M0.md` specifies, from the Colombo home connection at 7–9pm. This is
a projection from measured runs, not a measurement.

#### D2b · Every number above is priced on a model we may not be running

Opened 4 September, and it is the larger half of D2a rather than a footnote.

**All four M0 runs were `gpt-realtime-mini`. `.env.local` sets
`OPENAI_REALTIME_MODEL=gpt-realtime`** — the full model, at 3.2x the mini's
token rates. The two facts have sat in this document since 23 August, one in
D2a and one in the hero-audio note above, and were never multiplied together.
The margin table is therefore priced on a model that may not have served a
single real rep.

At the dearest measured rate, scaled by the rate cards in `lib/voice/rates.ts`:

| | mini (measured) | `gpt-realtime` (configured) |
|---|---|---|
| $/min | $0.0293 | $0.0938 |
| 3-minute rep | $0.088 | $0.281 |
| Pro $19, 270 min/mo | $7.91 → **58%** | $25.32 → **−33%** |
| Elite $49, 540 min/mo | $15.82 → **68%** | $50.63 → **−3%** |
| Sign-up rep, per free account | $0.088 | $0.281 |

**A fully-utilised Pro account loses money on the full model** — before the
merchant of record's ~7 points, which take it to −40%. Elite is roughly break
even. The whole D2 resolution of 31 August, and §18's break-even conversion
arithmetic, rest on the mini figures.

Three things this does *not* yet establish, and none should be assumed:

1. **What production runs.** `OPENAI_REALTIME_MODEL` is a Production secret in
   Vercel and was not read. It may well be mini, in which case this is a local
   development cost only and D2a stands unchanged. **Read it before acting on
   anything here** — `vercel env pull --environment=production`.
2. **Whether anyone burns the cap.** These are full-utilisation figures. Real
   usage decides the real margin, and nobody has measured it.
3. **What the full model actually costs.** The 3.2x is derived from the rate
   cards on a modelled token profile, not from a priced run. The live ten-rep
   measurement `M0.md` still specifies would settle it, and it should now be
   run **on the configured model**, which is the reason it never closed the
   question the first time.

**The 2.1 move is not implicated.** `gpt-realtime` → `gpt-realtime-2.1` changes
one rate, output text $16 → $24/M; output audio stays at $64/M and dominates, so
it is +0.9% on a rep. Both cards are now in `lib/voice/rates.ts` — before 4
September `gpt-realtime-2.1` priced at **$0/min**, and since `spend_today_cents()`
reads that ledger, both kill switches and the daily cap would have gone blind to
the most expensive model in the product. The env var is also not checked against
`M0_MODELS`; only the client-supplied override is.

---

## 5. What is genuinely done

So the list above is read in proportion.

- **The voice loop**, against a real provider, behind an interface neither the
  app nor the UI can see through. Two adapters, one conformance suite.
- **The three-minute dating rep**: warmth 65 arms it silently, thirty seconds
  from the end she is told either to leave or to offer her number, her closing
  line is allowed to finish, and the whole thing is written down when it ends
  however it ends.
- **Four characters**, one per rung and the ladder contiguous, hand-authored
  against §06's table — with five more authored, tuned and retired rather than
  deleted (D10a). The ladder tests as monotonically harder, and since the
  three-minute retune a test pins *which rungs a strong player can actually arm*
  at three different rep lengths, because monotonic dials turned out not to be
  enough to keep a rung meaning anything. Nothing on the roster is unwinnable by construction any
  more; the top rung is hard rather than sealed, which D10a argues out.
- **The field, end to end**: one challenge a day chosen deterministically,
  accepted with the prediction captured before they go, logged with what it
  actually cost, carrying the streak on a day with no voice rep, and the
  predicted-versus-actual chart §09 calls the thing that does the therapeutic
  work — including the case where it comes out worse than they feared. 27 checks
  in `npm run db:field`.
- **The warmth engine**: per-turn fast scoring, an evidence-triggered slow
  scorer, asymmetric decay, bands that own delivery, and a calibration harness
  for the live scorer.
- **Progression, end to end**: a level opens on two reps scoring 70+ (§08, not
  on wins), the unlock records a row and celebrates once, difficulty adapts in
  both directions and announces only one of them, and the first rep is a
  measurement the product re-offers at day 28 and compares side by side.
- **The things that bring somebody back**: character memory, the Sunday letter
  generated on the user's own Sunday rather than the server's, and five kinds
  of share card whose §14 guardrails are enforced in code rather than asked for
  in a comment.
- **The data spine**: twenty-one tables — every one §13 names — RLS on all of
  them, verified from a second account by 51 checks, plus an append-only ledger
  that cannot be rewritten by anyone including us and a field log that cannot
  be rewritten even by the person who wrote it.
- **Two content libraries authored and seeded**: 24 field challenges across
  four tiers, each reviewed and stamped, and 14 library cards covering the six
  sub-scores, five settings, the ladder, recovery and the exit.
- **Auth** end to end: password, OTP, reset, and a route guard that
  reads the session and the profile with no development bypass.
- **Metering**: quota checked where money is committed, spent on connect,
  resumable across a reload, and never writable by the user.
- **Scoring**: 60% deterministic over six banded metrics, 40% judgement, an
  audit line that sums to the composite, and the whole lifecycle covered by
  `npm run db:rep`.

---

## 6. Suggested order

Nothing here is sequenced by size. It is sequenced by what unblocks what.

**Phase 1 — make it lawful and legible (≈ 8 days).** ~~The public site, the real
legal pages,~~ **(both done 27 Aug)** the age gate, moderation on both streams,
custom SMTP, the mic primer, Sentry and PostHog, and rate limits on the grader.
At the end of this the merchant-of-record application can go in — and it should,
on the first day it can, because it is the only item with external lead time.

The site being up moves the application from "cannot be made" to "should wait on
one thing": moderation. Every merchant of record on the §14 shortlist bans adult
content by name, and a reviewer who asks how the PG-13 bound is enforced should
get an answer better than the honest one the safety page currently gives.

**Phase 2 — close the loop (≈ 8 days).** The field: challenges table with
hand-written content, the log with both anxiety ratings, the predicted-vs-actual
chart, streaks moved onto asks, sim-level gating. Then character memory, the
baseline rep and the week-four re-test. This is the phase that makes the beta
able to answer its own question.

**Phase 3 — money (≈ 4 days, gated on the MoR answer).** Checkout, portal, the
webhook that writes the subscriptions mirror, the six paywall overlays, and
metering reconciled to the cent against the provider dashboard.

**Phase 4 — the promise (≈ 8 days).** Scorecard reveal and ordering, the two
unscored metrics, the grade calibration harness, the technique library, the
progress screens, the sound kit, haptics, countdown, replay, PWA, keyboard.

**Then M5.** Twenty users, five calls a week, and the only number that decides
anything.

---

## 7. Appendix — conformance tables

### Routes (§11)

| Spec route | State |
|---|---|
| `/` landing | **Done** (27 Aug) — hero replays a rep rather than running a live one; see B1 |
| `/how-it-works` | **Done** (27 Aug) |
| `/pricing` | **Done** (27 Aug) — quotes `lib/site/plans.ts`, the same record the in-app screen reads |
| `/legal/terms` | **Done** (27 Aug) — `/terms` permanently redirects here |
| `/legal/privacy` | **Done** (27 Aug) — `/privacy` permanently redirects here |
| `/legal/safety` | **Done** (27 Aug) |
| *(not in §11)* `/interviews` | **Added 8 Sep** — the paid-traffic destination for interview intent. Renders the landing page's own `InterviewTrack` and `ScoringLaw` rather than restating them, so the ad and the page cannot describe different products (§3b, D3) |
| *(not in §11)* `/sitemap.xml`, `/robots.txt` | **Added 27 Aug** — public routes crawlable, the product disallowed |
| `/auth/sign-in` · `/auth/sign-up` · `/auth/verify` · `/auth/callback` | Done as `/login`, `/signup`, `/verify-email`, `/auth/callback`, plus `/forgot-password` and `/reset-password` |
| `/start/goal` · `/start/mic` · `/start/brief` · `/start/rep` | Done as `/onboarding/*` → first rep. **Rebuilt 30 Aug**: one client route holding the step, four questions and a gate — age, track, focus, name, mic, ready. `experience` cut (nothing read it); the URLs remain resume targets and the run opens at the first unanswered step. `ONBOARDING-AUDIT.md` |
| `/start/baseline` self-assessment | **Missing** |
| `/start/result` baseline shown | **Missing** |
| `/home` | Done as `/train` |
| `/train` roster | Done as `/roster` |
| `/train/[persona]` | Done as `/roster/[persona]` |
| `/session/[id]/brief` · `/live` · `/score` · `/transcript` | Done as `/rep/[persona]/brief`, `/live`, `/session/[id]/scorecard`, `/transcript` |
| `/sessions` | Done as `/profile/history` |
| `/field` | **Done** — today's challenge, the predicted-vs-actual chart, counters, tier rail and history, all real |
| `/field/browse` · `/field/[id]` · `/field/log` · `/field/log/new` | **Missing** |
| `/progress` · `/progress/week/[id]` | **Done** (shipped 24 Aug, Phase C) — trends, sub-score lines and the stored Sunday letters |
| `/library` · `/library/[slug]` · `/library/openers` | **Done** — one surface for all five kinds rather than a separate openers route; grouped by sub-score, with read state, next/previous and a rep link on every card |
| *(not in §11)* `/text/[persona]` | **Added 25 Aug** — text mode. Same character, no microphone, no quota (B15) |
| *(not in §11)* `/interview` · `/interview/setup/{role,cv,questions}` · `/interview/interviewers` · `/interview/rep/[id]/{brief,live}` | **Added 7 Sep** — the second track, behind `unlocked_tracks` |
| *(not in §11)* `/interview/start` | **Added 8 Sep** — the per-run setup, between the interviewer and the brief. Round, question difficulty, captions and the CV, answered once per interview rather than once per account (§3b, A1) |
| *(not in §11)* `/interview/credits` | **Added 9 Sep** — the interview track's store, on its own route. The balance, `ROUND_COST_NOTE`, the three packs, both expiry rules and the ledger were the full `CreditsPanel` at the top of `/interview`'s sidebar, beside the role, the company, the CV and the last score — so the balance pill in the chrome, which is the most-tapped affordance in any credit product, landed somebody on the profile screen with the store wedged into a rail. The dating arm has never worked that way: its store is `/profile/subscription`, the reps pill goes there, and no plan board is drawn on `/train`. `/interview` keeps a `CreditsSummary` — the number and one secondary link — and the pill, the brief's out-of-credits gate and the checkout's return URL all point here now. `/profile/subscription` keeps its own `CreditsPanel` unchanged: somebody already on the money screen to buy something must not be sent to a third page to finish. **Same day, the card's two run-on sentences were fixed too**: `ROUND_COST_NOTE` and `CREDIT_EXPIRY_NOTE` were both rendered as `.label` — 11px uppercase mono, a *tag* style — so the one fact a buyer choosing between eight credits and twenty has to do arithmetic with, and the expiry promise quoted in terms clause 07, were the two hardest things on the card to read. The cost note is now `RoundCosts`, a four-row table (name · length · price) derived from `ROUND_COST_ROWS` and thence from `ROUND_TYPES`, so nothing about a round is retyped in a component; the expiry note keeps its string and loses the tag face. The sentence survives where a table will not fit — the paywall sheet, the scorecard's low-balance line, `/pricing` and `/interviews` — and `interview-credits.test.ts` asserts the two renderings cannot drift apart |
| `/settings` · `/settings/session` | Done as `/profile/settings` |
| `/settings/billing` | Partial — `/profile/subscription`, no portal. **Extended 8 Sep**: it sells interview credits, the invoice row always renders, and a plan switch states what happens to the money (§3b, A4 and C5) |
| `/settings/usage` | **Missing** |
| `/settings/privacy` | Partial — **export shipped 8 Sep** and runs the RPC (§3b, C4); the retention toggle and bulk delete are still missing |
| `/settings/danger` | Partial — the dead confirm field and disabled button are gone (§3b, C4); the sheet is now an honest `mailto`, and the deletion path itself is still owed |

### Tables (§13)

| Table | State |
|---|---|
| `profiles` | Done, extended with preferences, consent, the retention toggle and `ui_flags` for one-time beats |
| `personas` | Done, with presentation columns |
| `sessions` | Done, extended with the meter |
| `transcripts` | Done, with the per-turn warmth gutter |
| `scores` | Done |
| `persona_memory` | **Written** — one filtered line per user per character, cleared by its owner |
| `usage_ledger` | Done, append-only and trigger-protected |
| `entitlements` (not in §13) | Added — plan and quota, read-only to the user |
| `text_threads` (not in §13) | Added — text mode's rolling conversation. Owner-writable, unmetered, never reaches `sessions` |
| `streaks` | **Added** — a rep or a logged ask, read-only to the user |
| `unlocks` | **Added and written** — when the celebration was shown; what is unlocked stays derived. Carries `milestone` since `m4_milestone_unlocks`; `level` and `tier` are not written yet |
| `techniques` | **Added and seeded** — 14 cards |
| `field_challenges` | **Added and seeded** — 24 reviewed challenges across four tiers |
| `field_assignments` (not in §13) | **Added** — one live challenge a day, anxiety captured at accept |
| `field_logs` | **Added** — both anxiety numbers, and no UPDATE policy for anybody |
| `subscriptions` | **Added** — MoR mirror with abstract provider ids; nothing writes it yet |
| `weekly_reviews` | **Added** — nothing generates one yet |
| `safety_events` | **Added** — five kinds; users may file reports and read their own |
| `interview_setups` (not in §13) | **Added**, with a private `cv` bucket, ready for M4 |

Functions: `export_my_data()` and `spend_today_cents()`, both `security
invoker`, both revoked from `anon`.

### Premium craft rules (§02)

| # | Rule | State |
|---|---|---|
| 1 | No spinners, skeletons everywhere | **Held** |
| 2 | Ambient room tone under every session | **Off** — procedural version disabled for intelligibility; recorded beds pending |
| 3 | Real waveform from AnalyserNode | **Held** — both streams, real amplitude |
| 4 | Sound design as a system | **Missing** |
| 5 | Haptics on mobile | **Missing** |
| 6 | Staged score reveal | **Missing** |
| 7 | Tabular numerals everywhere | **Held** |
| 8 | Optimistic writes | **Partial** — writes land and report, but the UI waits |
| 9 | Full keyboard operation | **Partial** — focusable, but no Space/Esc |
| 10 | `prefers-reduced-motion` respected | **Held** |
| 11 | Never blame the user in an error | **Partial** — hand-written where it matters; `app/error.tsx` still prints a raw message |
| 12 | Copy is written, not generated | **Held** |
