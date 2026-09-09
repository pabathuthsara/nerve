# Nerve

Voice-AI conversation gym. Users do timed voice reps against AI characters who can
lose interest, get distracted and say no, then take graded rejection challenges into
the real world and log the outcome.

## Start every session here

1. **Read `docs/README.md`.** It is the index and it says which doc answers what.
2. **`docs/M3-PLAN.md` is what to do next.** The work between here and the
   premium layer, in dependency order with sizes and acceptance criteria. It
   opens with the two §17 gates that never passed — M0's blind provider A/B and
   M2's twenty hand-scored transcripts — because neither is code and both were
   walked past. `docs/M2-PLAN.md` is now history: all nine of its items shipped.
   **`docs/HUMANNESS-PLAN.md` is the rendering work**, ordered by impact per
   unit of cost, and it is where the answer to "she still sounds like an AI"
   lives. Items 1–4 shipped on 6 September; 5–10 are open, and item 5 — one
   Text-to-Dialogue socket per rep, `new_turn` on band change — is the natural
   next one now that a turn is buffered whole.
   **`docs/INTERVIEW-PLAN.md` is the second track, and every phase of it has
   now shipped** — A, B and C on 7 September, C½ the same day, and **D (money)
   and E (the door) the same day again. Its §15 is what landed**: three
   one-time packs at $9 / $29 / $59 carrying 2 / 8 / 20 credits, two interview
   credits a month on Pro and six on Elite, a free five-minute screener granted
   to every account at sign-up, and a trigger that opens the track the moment
   any credit lands. **The prices are original; the credit counts doubled on
   9 September** (`LAUNCH-GAP.md` D18) because one credit bought a recruiter
   screen and nothing else — so a $9 first purchase was answered by
   `creditRefusal` telling the buyer to buy again, and Pro's monthly credit
   could not reach a technical round at all. Turn the credits dial, never the
   price: a public price is very hard to raise again. Two
   things in §15 are worth knowing before touching money or the other track.
   **A card-backed trial emits a real `payment.succeeded` at $0** — read off a
   captured delivery rather than the specification — so the obvious credit
   design would have handed two credits to every trial; credits key on the
   payment and `membership.activated` grants nothing. And **granting every
   account a screener silently moved free's daily spend ceiling from 100c to
   190c**, because `voice_daily_cap_cents` adds 90c of headroom per credit: a
   dating number moved without a line in `lib/` changing, caught by one
   assertion in `db:credits` whose whole job was A5's promise that it never
   would. **A shared dial can be reached through DATA, not only through a file
   or an environment variable.**
   **`docs/INTERVIEW-TECHNICAL-PLAN.md` is Phase C½ and it SHIPPED — read its
   §13 first**, which is what actually landed, the five decisions taken while
   building it, and what is still owed by hand. It exists because four reps on a
   real microphone found that the track never asked a candidate whether they
   *know* anything: all six authored stems per field asked what they DID, and
   `deep_technical` read "one problem, taken all the way down", which drove an
   interviewer deeper into one project rather than out of it. What it added:
   probe domains per field (**the domain is authored, the question is hers** —
   which is how rule 10 survives a feature whose whole point is that the
   question emerges), a hardness slider that is a second axis and gets no
   warmth opinion, a round table where `shape` is behaviour rather than
   duration, and **technical accuracy as a seventh scored dimension** — a
   deliberate change to what this product is, argued in its §3, recorded as
   `LAUNCH-GAP.md` D15, with the grader abstaining by default because a false
   "you were wrong" costs the account and an abstention costs nothing.
   **§14 is the UI pass, and it is where the surprises were**: looking at the
   track found four SCORING defects rather than cosmetic ones — four of the
   eight deterministic bands score correct interview behaviour at zero, which is
   sixty percent of the composite, so `lib/grade/interview/metrics.ts` is now
   the interview table and `scoreMetrics()` with no argument is still the dating
   one.
   **§15 is the same lesson a third time, and it is the one to internalise:
   a rename done for STORAGE leaks onto the screen.** The interview grader
   scores structure, specificity, listening, signal reading, composure and the
   questions asked back; `INTERVIEW_SUBSCORE_KEY` renames those onto the dating
   `scores` columns so no migration is needed — and the scorecard then printed
   the DATING word for the stored key, so a candidate scored on whether their
   answer had a shape read *"Opening 71"*. Every number right, every label the
   other product. `subScoreLabel(key, interview)` is the fix and the interview
   labels are **derived from `DIMENSION_LABEL`**, never authored twice. The same
   walk found `/progress` plotting interview `structure` on the dating Opening
   line (it filters to `sessions.track = 'dating'` now), and the library — five
   sets of openers for a café, a gym and a party — being offered on the
   interview rail (`LAUNCH-GAP.md` D17). **When a second track reuses a first
   track's column, ask what the SCREEN then calls it.** A field is authored in `interview-fields.ts` and **offered only once it
   has probe domains**, which today means software alone.
   **The one thing §13.3 is emphatic about: none of it has been heard out
   loud.** The suite is green and §9's "Done when" is five claims about how a
   rep sounds — `npm run rep:audition -- marcus-vance confidently_wrong 1
   technical 4` is the instrument, and it spends money. Four authored
   interviewers, a parallel judgement layer, the credit ledger, the setup, the CV
   and the question rail all exist — and `unlocked_tracks` opens the track for
   nobody, so the guard still redirects every `/interview*` route to `/train`.
   **Read its §0 before touching anything there**, then **§14**, which records
   what landed and the five defects the audition harness found that were
   invisible at a desk. Two of them are worth knowing before you write anything
   for a second track: a rule that is correct on one arm can be *silently wrong*
   on the other (the 40% question quota gagged an interviewer on four turns in
   five, and the directive was ignored every time — a directive disobeyed every
   turn teaches the model that the bracketed line is optional), and a lexical
   heuristic tuned for short turns misfires on long ones (`isOpenQuestion` reads
   any paragraph containing "which" as a question, which disabled a gate
   entirely). **Interviews are sold as credits, never through `reps_per_day`**,
   because a daily rate cannot hold a twenty-minute item: three a day on Pro is
   ~$45/month of voice against $19. Purchased credits never expire and granted
   ones do — and every ledger row carries the expiry of the LOT it belongs to,
   spends included, which is what makes the balance a filtered sum that cannot go
   negative. **That sentence is also what the terms are quoted on**, so it lives
   as one string (`CREDIT_EXPIRY_NOTE`) read by `/pricing`, the interview home,
   terms clause 07 and refunds clause 04 — change it there and re-run
   `npm run legal:pdf`, never in one of the four.
3. **`docs/LAUNCH-GAP.md` is what is blocking launch.** Ten numbered blockers,
   the product-promise gaps, and nine pieces of spec drift that need a
   decision rather than a ticket.
   **Its §3b is the 8 September experience audit, Parts 1–8 — all shipped**,
   and it is the shortest description of what the product does now:
   the interview track is a **profile** you set once and a **run**
   (interviewer → `/interview/start` → brief) you set every time; rounds are
   priced by length rather than flat, so packs are sold as **credits**; the
   free five-minute screener is reachable on the default path for the first
   time; and `/interviews` is a public page. **Part 5 landed the same day and
   E1 is the one to read**: the brief's `GOAL` row named the outcome on both
   arms — the one thing §07 says is worth zero, stated at the moment of highest
   attention — so the screen was instructing people to play for the result and
   the grader was then scoring it. Both rows name a manner now. **E2 is the
   other one worth knowing about a second track**: `ProductProvider` never read
   `profiles.active_track`, so every SHARED route (`/roster`, `/library`,
   `/profile`) inherited the `dating` default and an interview account got the
   other product on its second visit. The fix is `adoptTrack` and not
   `setTrack`, because the URL is known on the first render and the profile a
   fetch later — **the first answer wins, and a late one must never overrule
   it.** Part 7 was declined almost entirely on S1's argument: **a percentage
   off a metered product recruits the cohort that uses it hardest**, so there
   is no annual offer, no bundle and no referral. What did ship is the founding
   allocation — 200 accounts at $19, then $29 — and its one rule is that **the
   number is counted, never asserted** (`lib/db/founding.ts`), because a
   "places left" nobody counts is a compliance risk on the page a
   merchant-of-record reviewer opens. The raise is a plan at the provider, so
   `whop:verify` warns when the allocation is spent rather than the page
   quietly flipping.
   **`docs/PAYMENTS-NEW-INTEGRATION.md` is how voice is sold**, and §11 of it
   is the record of what shipped on 31 August: free grants no voice reps, the
   one free rep happens once at sign-up, Pro is $19 and Elite $49 behind a
   seven-day card-backed trial. Read it before touching pricing, the allowance,
   or the roster's rungs.
   **`docs/PAYMENTS-APPROVAL.md` is the one blocker that is not code.** Getting
   a merchant of record to approve us: who we apply to, what a human reviewer
   opens when they look at the site, and the three things still in the way.
   Read it before touching anything public-facing — every provider on the
   shortlist bans dating products by name, so the landing page is an
   application document.
   **`docs/MARKETING-PLAN.md` is how customers arrive, and where the result is
   written down.** The 60-day US launch block — 4 September to 2 November, $340,
   a day-by-day with five gates. It is a living document: tick the day, log the
   number, record what the gate decided. Its §4 is the six things switched off
   in our own account, two of which break `whop:verify` or a promise in the
   terms if they are flipped carelessly — read it before unhiding the Whop
   product or adding a plan.
4. **`docs/RETENTION-AUDIT.md` is why the loop pulls, and what it cost to make
   it.** Seventeen findings, all resolved on 3 September: R2–R17 shipped, **R1
   was decided (free stays at `repsPerDay: 0`)** and §5 was held open on the
   record. Nothing there is outstanding as work; two secrets are (R6). Read its §2 before adding any celebration —
   the loud moment is keyed to a personal-best composite and never to a win —
   and its §4, which is the list of mechanics that stay refused: no confetti, no
   leaderboards, no guilt copy, no fourth haptic. **A gate lives in
   `UNLOCK_RULES`**: tier 2 costs one qualifying rep against Tess, and
   `rankFor` reads tiers *cleared* rather than tiers *open*, so a new gate must
   not move the rank rail with it.
5. **`docs/NERVE-SPEC.md` is the specification.** Section numbers (§04, §07,
   §14…) are cited throughout the code and the docs; when a rule here says
   "§07", that is where it comes from. Read it before implementing anything
   substantial.

**Then finish the loop: build it, verify it, and update the docs.** A change
that ships with stale docs is not finished — the table at the bottom of
`docs/README.md` says which doc to touch for which kind of change. Mark plan
items shipped with what actually landed *and* what is still owed by hand;
future sessions read those markers to decide what to do.

## Verify before saying it is done

```bash
npm run typecheck     # tsc --noEmit
npm run lint
npm test              # vitest, 1995 assertions
npm run build:check   # production build into .next-check, never .next
npm run db:verify     # RLS from a second real account, 51 checks
npm run db:rep        # the whole rep lifecycle, without a microphone
npm run db:field      # the field loop: assign, accept, log, streak, milestones
npm run db:spend      # the spend ceiling: rate limit, daily cap, both kill switches
npm run db:credits    # the interview credit: hold, settle, release, refund, both expiry rules, multi-credit rounds
npm run db:interview -- you@example.com   # open the interview track on an account, with credits
npm run db:billing    # the billing loop: grant, upgrade, dunning, expiry, dispute, replay
npm run whop:setup       # creates the Whop product, plans and webhook (dry run without --apply)
npm run whop:verify      # the money preflight: keys, plans, prices, trial, webhook
npm run whop:probe       # the webhook route over HTTP: signature, account check, status codes
npm run whop:probe -- --capture payment.succeeded
                         # prints the most recent REAL delivery of an event,
                         # ready to pin as a fixture (rule 14)
npm run legal:pdf        # the legal documents as PDFs, rendered from the running app
npm run shots            # product screenshots from the running app; no page embeds them (VISUAL-AUDIT §V2)
npm run grade:calibrate  # the §17 gate: grade drift on the deployed route
npm run rep:audition -- <slug> <player> <reps> [round] [difficulty]
                         # a whole rep without a microphone. The last two are
                         # INTERVIEW ONLY and drive the probe ladder end to end
                         # (INTERVIEW-TECHNICAL-PLAN T11). It spends money.
```

`db:*` scripts run against the real project and clean up after themselves.
Never run `next build` into `.next` while a dev server is up — see the note in
`next.config.ts`.

## Stack

- Next.js 15 (App Router) on Vercel — RSC for read paths, client components only around the live session
- Supabase — Postgres + Auth (email OTP, password, Google) + Storage; **RLS on every table, no exceptions**
- OpenAI Realtime `gpt-realtime-mini` over WebRTC, behind a `VoiceProvider` interface, with an ElevenLabs adapter (§04)
- Merchant of record for billing (Whop) — **not Stripe**; Stripe does not operate in Sri Lanka (§14). Creem was primary until it declined the account on 1 September; the swap cost an adapter, which is what §14's abstraction was built for
- PostHog analytics and Sentry errors are specified and **not yet installed** — see `LAUNCH-GAP.md` B7

## Rules that are not negotiable

1. **Nothing in the app layer imports a provider SDK.** All voice access goes through
   `lib/voice/provider.ts`. Both adapters emit identical normalised transcript turns
   `{ speaker, text, t_start, t_end }` — scoring depends on this and a provider switch
   must not break score comparability. (§04)
   **A cross-cutting fix belongs to both arms, and B11 is the cautionary tale.**
   `lib/voice/audibility.ts` was written provider-neutral, wired into the
   realtime adapter alone, and four days later that adapter stopped shipping —
   so the arm serving every customer reported zero incidents through a rep that
   lost two of her seven replies. When something is detected in one adapter, ask
   what the other one's equivalent evidence is before calling it done.
2. **Outcome is never scored.** A clean rep that ends in rejection can score 92.
   Score process, never result. (§07)
3. **The rep format is product law.** Three minutes. Warmth 65 *arms* the rep
   silently; thirty seconds from the end she is told either to leave or to
   offer her number; she keeps it if she is still at 55 or above. She never
   speaks digits. The rules live in `lib/data/rep-rules.ts` as pure functions
   with tests — change them there, not in the hook. **How the result is read is
   part of that file too**: `resultReading` owns `close`, `lateSurge` and
   `nearMiss`, so "she was never interested" and "you missed by four" are one
   decision with tests rather than two arithmetic expressions in a component.
4. **A word cap is a runtime ceiling, and it is what she writes to.** The band
   table in `lib/warmth/bands.ts` states a **typical first and a maximum
   second**, and `maxWords` is handed to the turn pipeline, which buffers her
   whole line and keeps sentences up to the first boundary at or past it
   (`capToBudget`). Both halves matter: a text model asked for "twelve at
   most" delivers twelve, and every number in
   that table was originally authored against a speech model that ran at half
   of whatever it was allowed. Moving a cap changes what customers hear.
   `DEFAULT_VERBOSITY_MEDIAN` is derived from the same table, so the drift
   alarm can no longer be set below the rules. (`PERSONA-AUDIT.md` §12)
   **The band is not the only ceiling** — see the reciprocity rule at the end
   of this list, which can lower it and never raise it.
5. **On a stateless arm, a permission repeated is an order.** The directive is
   the last system message before every generation. The band's length and
   question rules ship every turn, because nothing else owns reply length.
   Everything that tells her to *do* something — her agenda, the band's
   invitation, the gates she has earned — rides `includeStanding` and is sent
   only when the direction is genuinely new. Restated every turn they compose,
   and she performs all of them at once. (§11, §12)
6. **No spinners.** Skeletons that match the shape of the arriving content. (§02)
7. **Never announce a downward difficulty adjustment.** Silent. (§08, §12)
8. **No coaching during a live rep.** Timer, waveform, mission. Nothing else. (§05)
   **The one exception is Tess, and it is one character wide.** She is rung 1
   and is who a new account meets on its one free rep, so her rep carries an
   on-screen script — an aim, and for five of the six scored dimensions an
   example line. `lib/data/guided.ts` is the whole thing: one script for one
   slug, `assertGuidedStep` refusing appearance, pickup, contact-detail and
   ask-her-out vocabulary outright, and `guided.test.ts` walking the real roster
   so a second guided character cannot appear by accident. **`assertNoScript`
   and every mission on every other surface are untouched** — relaxing one
   screen must never relax the other nine. It is a rail and never a pop-up:
   text changing in place, `aria-hidden`, no animation, and the whole script is
   read on the brief first, because §05's objection is to interruption.
   **It advances on completed exchanges, and the close belongs to the
   wind-down.** Both are load-bearing and both were learned the hard way on
   6 September: advancing on his turns alone told him to "follow one answer
   twice" against a silence with no answer in it, and a close sitting at six
   user turns ended the one free rep at 74 seconds of 180 in a phone number. A
   step needs his turn *and* her reply; `wrapping` is the only route to the last
   step, so the rail and `WRAP_UP_MS` now fire together. The
   drift is recorded as `LAUNCH-GAP.md` D13, and **the landing page's claim
   moved with it** — "we never write your lines" was exact and is now "your
   first character walks you through it; after that the words are yours".
9. **Anything published is checked in code, not in a style note.** Share cards
   run through `assertPublishable` (`lib/share/cards.ts`) and a character's
   memory line runs through `lib/grade/memory.ts`. Both refuse rather than
   sanitise, because the failure mode is a public artefact or a companion-app
   framing, and §14 says either one is a payment account waiting to be closed.
10. **Content is authored in the repo and seeded, never generated at runtime.**
   Personas, field challenges and library cards live in `lib/`, are reviewed in
   a pull request, and reach the database through `npm run db:seed` and
   `npm run db:content`. For field challenges this is a safety rule, not a
   preference: the worst realistic outcome of any challenge is a polite no. (§09, §16)
   **The landing page's hero rep inverts this, and only there.** His half of it
   is authored and read aloud verbatim; **hers is captured from the real persona
   and must never be hand-written**, because what she says is the product and a
   written version of it would be advertising our own prose. `npm run hero:audio`
   records both. It spends money, so it is run by hand and never from a build.
11. **Anything a user could pay to change has no user write path.** Plan, quota,
   the one-off sign-up rep, streak, unlocks, difficulty offsets and
   subscriptions are read-only to their owner and written by the service role.
   **`entitlements.reps_per_day = 0` on free is the voice paywall itself** —
   `consumeRep` and `mayOpenSession` refuse at zero, and there is deliberately
   no second gate in the app layer for a screen to forget. The ledger is append-only and the
   field log cannot be rewritten by anybody, including the person who wrote it.
   (§14, §09)
   **Every route that spends money goes through `maySpend`** (`lib/db/spend.ts`)
   as well as `requireUser` — a session says who is asking, never how much they
   may spend. Adding a paid route means adding a bucket. `npm run db:spend`.
   **An interview costs what its round costs, and that is not always one.**
   A round costs **one credit or two** — the ten-minute recruiter screen is one,
   every longer round (technical, deep technical, final) is two — so
   `credits <= 0` is not the gate anywhere; `canAfford(spendable, round)` is.
   **It was 1 / 2 / 3 / 2 for one day and the lesson is worth the sentence: the
   ladder was authored off MINUTES, and minutes are not what an interview
   costs.** Costed off `voice_operations`, a deep technical runs at ~$0.41
   against a technical's ~$0.34 — 1.2x the cost at 1.5x the price — because TTS
   is 60-67% of every rep and an interviewer talks *less* of a long round, not
   more. Cost-plus was the wrong frame regardless: COGS is 3-4% of pack revenue.
   What the ladder actually has to hold is that **the screen stays strictly
   cheaper than every round it competes with** (`LAUNCH-GAP.md` B3), and that is
   asserted as a property rather than as a copy of the table. Costing is
   `INTERVIEW-PLAN.md` §6.1; the decision is `LAUNCH-GAP.md` D18. The ledger carries it: a hold has an
   `amount`, `planSpend` draws a round across as many lots as it takes (all or
   nothing), and a settle writes **one row per source**. Any screen that asks
   "can this start" must ask `spendableFor` for that round and compare against
   `creditCost`, and any sentence explaining a refusal comes from
   `creditRefusal` — three surfaces said it in three hand-written strings and
   two of them only knew about the screener case.
   The one endpoint that grants a plan is `app/api/webhooks/whop/route.ts`, on
   the service role. `lib/email/` sends the one message that goes out before a
   card is charged — the third of the three trial mitigations §14 asks for, and
   the only one the app itself owns.
12. **No clinical claims anywhere.** "Confidence training", never "treatment". (§16)
    This binds the payment provider's own record of us too: the Whop account is
    `software / personal_development / public_speaking_coaching`, and it was
    `mental_health_app` for days, which contradicted terms clause 08 in the one
    place a compliance reviewer reads first.
    **It is `public_speaking_coaching` and not `communication_coaching` for a
    reason.** The obvious vertical is a child of `dating_and_relationships` in
    Whop's taxonomy — it sits in the enum beside `mens_dating_coaching` and
    `relationship_coaching` — so pairing it with `personal_development` is an
    invalid combination that the API accepts, echoes back, and then silently
    resets to `health_and_wellness / mental_health_app`. Two writes were lost to
    that before the pattern was spotted. Never re-pick it.
    **It reverts on its own, and not only from the dashboard, and not only to
    `mental_health_app`.** Saving Whop's Business settings form does it; so does
    an API `PATCH /accounts` that sets nothing but an image — one call carrying
    only `opengraph_image` put it back to `health_and_wellness /
    mental_health_app` on 4 September. **And on 7 September a `PATCH /products`
    did it**: rewriting the storefront description to mention interviews and AI
    characters moved the ACCOUNT to `ai_and_automation_software /
    ai_chatbot_software` — a different value, from a write that does not touch
    the account at all. **Then it moved again twenty minutes later, to
    `industry_specific_software / other_general`, with no write of any kind in
    between.** Whop re-derives the classification from product content on a
    delay, so a preflight that passes right after a product write proves nothing
    about an hour later. **On 8 September it was still
    `ai_and_automation_software / ai_chatbot_software` the next day** — nothing
    corrected it overnight and the only thing that noticed was the preflight. It
    was restored, read back, a plan price was then written, and it was read back
    **again** for exactly that reason. So: treat **every** write to the account
    *or its products* as a write to the industry classification, send the classification
    alongside whatever else is being set where you can, **read it back with
    `npm run whop:verify` afterwards, every time** — that preflight is the only
    thing that has ever caught this — and **read it back again later**, before
    any launch or marketing action.
    Note also that **the API key cannot write the account at all** (404); only
    a user-token credential can, which is why `whop:setup` prints the account
    fields for a human instead of setting them. `npm run whop:verify` now
    asserts the classification, so the preflight fails rather than the
    compliance review.
13. **PG-13, enforced by moderation on both streams.** Payment-processor survival. (§16)
    Built, in `lib/safety/`. The verdict mapping, the escalation sequence and the
    age arithmetic are pure functions with tests — change them there, not in the
    hook or the route. First breach is an in-frame decline and the rep continues;
    a second ends it; content involving minors ends it on sight from either
    stream. Distress is read only off the user's stream, ends the rep and drops
    the training frame (§16.8). **Moderation fails open** and that is deliberate:
    §05 does not allow a vendor outage to cut off a live rep. The reasoning is in
    `lib/safety/assess.ts` and asserted in its tests.
    **A change to what the product refuses is a change to what the legal pages
    claim** — `components/site/legal-pages.tsx` is part of the same edit.

14. **A vendor's specification is not a vendor's payload, and a fixture nobody
    received proves nothing.** Whop's OpenAPI spec documents `membership.*` with
    nested `plan`/`user` objects; it actually sends flat `plan_id`, `user_id`
    and `current_period_end`. Built from the spec alone, the first real purchase
    put a paying customer on Pro **with no charge date** — the §14
    trial-ending-quietly failure. `lib/billing/events.test.ts` now pins the real
    captured deliveries verbatim, and they are the only fixtures in that file
    Whop actually sent. When integrating anything external, read one real
    payload before trusting the schema, and keep it as the test.

15. **Anything a machine calls must be the host that answers 200 without a hop.**
    `hellonerve.com` 308-redirects to **`www.hellonerve.com`**, which is
    canonical. A browser follows that; a webhook sender often treats 3xx as a
    failed delivery, and an OG scraper renders a blank card. The webhook URL,
    `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL` and `SITE_ORIGIN`'s fallback
    all name `www` for that reason. Related: **a Vercel env var added after a
    build starts is not in that build** — set it, then redeploy.

16. **Warmth is not the only meter. `lib/warmth/reciprocity.ts` models who is
    doing the work**, and without it the two come apart: at warmth 41 she
    answered three consecutive one-word turns with self-disclosure, a question
    and more self-disclosure. The mirror cap (`min(bandCap, ceil(hisWords ×
    1.3))`) may only ever LOWER the band, never mirrors a question, and floors a
    real turn at the band's typical; the question and volunteer gates need OPEN
    **and** something offered; and she may say nothing at all — enforced by
    making no request, never twice running, never on the closing turn, never on
    his opening line.
    **This file is not allowed a warmth opinion of its own.** Every gate was hung
    on ENGAGED for a day — twenty points above the band table it was gating, and
    above every `unlocksAt` on the roster — and it won every argument silently: a
    rep that peaked at 56 asked no question in seventeen turns, added nothing to
    any answer, and had all four of Nadia's authored gates dropped unread. Warmth
    is the band's; `unlocksAt` is the author's; this file only ever answers "what
    did he just do".
    A dead end costs more than a good question earns, or she never visibly
    withdraws. Reprice in `fast.ts`, never through `gain`/`decay` — those are the
    difficulty ladder. (`HUMANNESS.md` §7.1)

17. **A reply the user never heard is not an interruption, and it is never
    nothing.** `displaceCurrentReply` splits barge-in from supersede by asking
    `playedText` whether words actually reached the ear — the same function that
    would do the truncating, so the two cannot disagree. Cutting on `responding`
    instead destroyed two of her seven replies on 6 September, because that flag
    is true from the instant generation starts and a user cannot interrupt a line
    he has not heard. **Every reply that reaches nobody reports `agent.unheard`**,
    whatever killed it, and a turn with no audible words is never dropped in
    silence. (`PIPELINE.md` § Barge-in, `LAUNCH-GAP.md` B11)

18. **An uncertain cost is bounded, never unknown.** `voice_operation_settle`
    reads a null cost as the operation's whole reservation, so "we are not sure"
    and "charge the ceiling" are the same statement. A turn that synthesised zero
    characters was billed $0.0357 against a real $0.0009 that way, and the flat
    transcription envelope charged four minutes on every rep whatever its length.
    Price what is known, bound what is not — and bound it from something the
    server owns, never from a figure the browser reports (rule 11).
    (`PIPELINE.md` § Cost)

19. **The dating arm is finished. Do not change how it behaves, sounds or
    scores — for any reason, and especially not on the way to something else.**
    The latency work is done, the characters read the way they were authored to
    read, and that is the product customers pay for today. This is not a
    preference to be traded off against a cleaner design: `PERSONA-AUDIT.md`
    records an audit that correctly measured a problem with the shared band
    table, gave Tess her own bands, posture reading and punctuation, and made her
    worse — because the table was most of what made Nadia good. **An edit to a
    shared judgement file is an edit to every character that reads it, including
    the ones nobody was looking at.**
    In practice, three tiers (`INTERVIEW-PLAN.md` §0). **Tier 0, never opened:**
    the nine files in `lib/personas/`, `lib/warmth/{bands,reciprocity,prompt,fast,steering,levels}.ts`,
    `lib/grade/{prompt,memory}.ts`, `lib/data/{guided,mission}.ts`, `lib/audio/`,
    and every `PIPELINE_*` default — a second track gets a new file beside them,
    never a parameter added to them. **Tier 1, additive and gated:** shared
    plumbing (`lib/data/rep.ts`, `app/rep/actions.ts`, `lib/db/spend.ts`,
    `rep-screens.tsx`) where the dating path must reach the identical branch it
    reaches today and every new option defaults to off. **Tier 2, provable
    no-ops** — and the only one on the books is the track filter in
    `refreshProgression`, provable *because* every session row today is a dating
    session, which stops being true the moment an interviewer is seeded.
    It is enforced by tests rather than by care, and the tests exist:
    **`lib/characterization/dating-arm.test.ts`**, written before any interview
    code and green on every commit since. Fifty-two assertions — nine compiled
    contracts by digest and length, nine pipeline configs under two environments,
    the band table, `capToBudget`, every reciprocity decision, the fast scorer
    with and without temperament, the steering line, every timing constant,
    `resultReading`, the rubric, the live scorer's anchors and the turn
    reservation's arithmetic. **Do not delete it as redundant**: the other suites
    test that each piece is CORRECT and pass happily through a retune; this one
    tests that nothing MOVED. Snapshots taken after a change prove nothing, which
    is why it had to be first.

    **A shared dial is not only a shared FILE, and not only an environment
    variable.** C½ found that `ELEVENLABS_STABILITY` retuned a second track from
    outside the repo. Phase D found the third door: **data**. Granting every
    account a free interview screener moved `voice_daily_cap_cents` for every
    free account in the product — 100c to 190c — because that function
    multiplies a credit balance by ninety. No file in `lib/` changed, no
    constant moved, and a dating number moved anyway. When a feature on one
    track writes a row, ask what the other track multiplies it by.

    **Tier 2 has been spent.** The track filter landed on 7 September with the
    no-op measured rather than argued — 89 sessions across 17 users, every one of
    them dating — and `sessions.track` (which §2 of the plan wrongly listed as
    already existing) now carries it. That proof has expired: there are interview
    sessions now, so any further "provable no-op" needs its own proof.

## Design system — Arena

Dark only, no light mode. Athletic performance aesthetic: data is the hero.

- Ground `#0B0C0A` · Surface `#131511` · Surface-2 `#191C16` · Line `#242820`
- Volt `#C4F82A` — the ONLY accent. Live state, primary action, composite score, current
  position. If volt appears twice on a screen, one of them is wrong.
  **The exception is an earned moment** — a personal best, a rank, an unlock, a
  milestone — which may take the full frame in volt for under two seconds
  before returning to sober. One component owns it (`BestBeat`, in
  `components/screens/session-screens.tsx`), it is `aria-hidden`, and
  `prefers-reduced-motion` removes it entirely. **It is keyed to a personal-best
  composite and never to `session.won`**, because §07 says outcome is worth zero
  and a system that detonates on a win is scoring the result — see
  `docs/RETENTION-AUDIT.md` §2, which is the argument for the whole exception.
  Every other rule in Arena is a rule about restraint, which left the system
  with one emotional register and a first win rendering in the same language as
  a lost rep.
- Cool `#5AA9FF` — second data series only, never an action colour
- Amber `#FFB020` / Red `#FF4D3D` — semantic only, never branding
- Ink `#EDEFE8` · Ink-2 `#9DA396` · Ink-3 `#6A7062`
- Type: Barlow Condensed 700 (display, uppercase) / IBM Plex Sans (body) / IBM Plex Mono (data)
- **Border radius max 2px.** Hairlines, never shadows. `tabular-nums` on all digits.

**Marks, not icons.** Thirty things a user is meant to recognise on sight —
four ranks, four roster tiers, four field tiers, six score dimensions, five
library kinds, four rejection milestones, three plans — are drawn from
`components/marks/`, and the mapping lives in `lib/marks/registry.ts` with a
test that walks the real unions. A mark is Ink-2 and takes volt **only** through
`current`, which is how a forty-two glyph set stays inside "volt appears once
per screen". Add a glyph in both files or `tsc` and the suite will say so.
`docs/VISUAL-AUDIT.md` is the argument for all of it — including §1, which is
why the obvious answer to "too much text" (photographs of people) is the one
thing this product must never ship.

**The one carve-out: persona avatars.** Characters have to be told apart at a
glance, so each carries a hue — on a constrained material ramp authored in
`lib/personas/visual.ts`, never as an accent. The bounds are enforced by
`visual.test.ts`, not by this note: hues avoid the 60–115° band where Volt
lives, no avatar colour comes within an RGB distance of 60 of Volt, Cool, Amber
or Red, and chroma runs from a 0.34 floor to a 0.86 ceiling so an avatar can
never reach the saturation of an accent. Chroma rises with warmth, which is why
the colour is allowed to exist at all: it is the meter, not decoration.
Recorded as D9 in `LAUNCH-GAP.md` §4; the audit is `docs/AVATAR-AUDIT.md`.

## Conventions

- TypeScript strict. No `any` in `lib/voice/`.
- Server Actions for mutations; optimistic UI on every write (§02). Actions
  return `{ ok, message }` rather than throwing — a thrown Server Action error
  reaches the client as an opaque digest.
- Persistence is best-effort around a live rep: a failed write must never end
  the conversation.
- Every user-facing string is hand-authored — empty states included. No placeholder copy.
- `prefers-reduced-motion` respected everywhere, score reveal included.
- Provider, model and rate stamped on every `usage_ledger` and `scores` row.
- Schema changes go through the Supabase MCP, one migration per change, and the
  matching file is committed to `supabase/migrations/`. **Applied migrations are
  a record — never edit one after it has run**, the same way `docs/M0.md` is
  never rewritten.
