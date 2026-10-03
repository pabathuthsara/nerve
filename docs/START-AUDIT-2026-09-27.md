# `/start` audit — 27 September 2026

> **Status, 27 September 2026 — §2 items 1–6 built on `feat/start-funnel-v2`,
> plus a mobile polish pass (§5).** `LAUNCH-GAP.md` D31 is the record. What
> landed differs from the prescription in three places, all recorded in §5.
> **Owed by hand:** apply `supabase/migrations/20260927090000_page_views_campaign_tag.sql`
> BEFORE the deploy; tag every post link (§5.4); key the pixels only after
> privacy clause 07 is rewritten.
>
> **Superseded in part, 3 October 2026 — §7.** The hook and the Cass reveal
> are gone; the first screen is the first question. `LAUNCH-GAP.md` D32.

A second pass on the door, nine days after `SIGNUP-AUDIT-2026-09-18.md` and
`SIGNUP-FIXES-2026-09-18.md` shipped almost everything they asked for. This one
has something the first did not: **`page_views.step`**, so for the first time
the per-step drop is read from first-party data rather than guessed.

Sources: the production database (`page_views`, `auth.users`, `sessions`), the
deployed `www.hellonerve.com/start` driven in Playwright as an iPhone 13 and a
throttled Pixel 5, and this repo at `HEAD` (the uncommitted Heat work is not
deployed and nothing below is about it).

---

## 0 · What the data says

Window: 18 Sep 12:30 UTC (when `step` started recording) → 27 Sep.

| | |
|---|---|
| Accounts created | **0** (last one 18 Sep 11:45 UTC, before this window) |
| Unique visitors on `/` | 45 — about 30 excluding Sri Lankan desktop (owner / testing) |
| …of whom opened `/start` | **0 outside visitors** (2 in total, both the owner) |
| Unique visitors on `/start` | 19 — about 9 outside visitors |
| Outside visitors past screen 1 (hook → age) | **2** (one US, one CN) |
| Outside visitors past screen 2 (age → track) | **0** |
| `/start` visitors per week | 83 → 87 → **12** (weeks of 7, 14, 21 Sep) |
| Visitors with any referrer | 12 of 79. **67 are "direct"** |

Read it honestly:

1. **Volume is the first problem, not conversion.** About one real person a
   day reaches `/start`. At that rate a change that doubled signup rate from
   3% to 6% would take months to show up. So the fixes below should be shipped
   **as one batch**, on judgement, not A/B tested one at a time.
2. **Every recorded drop is at the first two screens.** Of ~9 outside
   visitors, 2 tapped the hook button and none got past the age question. Nine
   people proves nothing on its own — but it is the same place the code has a
   measurable defect (§1.1) and the place the run asks its most off-putting
   question (§1.2).
3. **The numbers undercount the bounce.** The pageview beacon
   (`components/analytics.tsx` → `/api/pageview`) fires after hydration, so a
   visitor who leaves in the first ~2 seconds is never recorded at all.
4. **You cannot tell which post brought anyone.** In-app browsers (TikTok,
   Instagram) strip the referrer, and `normalisePath` drops the query string,
   so `utm_*` never reaches the table either.

The product side still works: 31 accounts, 134 sessions, and almost every
account that exists ran a rep. The door is still the whole problem.

---

## 1 · Findings, most expensive first

### 1.1 · The first tap on the first screen does nothing — **measured**

The hook's button (`Set mine up — 40 seconds`) is an `onClick` inside a
`'use client'` tree with no `<form>` or `<a>` behind it. It is **visible at
~0.4 s and does nothing until hydration finishes at ~1.9 s** on an unthrottled
phone profile, **~2.9 s at 4× CPU throttle**. A tap in that window is not
queued — it is lost. Three runs on a throttled Pixel 5: one tap at 0.2 s after
the button appeared, then five seconds of waiting, **never advanced** (3/3).

That is exactly the visitor paid social sends: a mid-range Android in an
in-app browser, thumb already moving because the video said "link in bio".
To them the button is broken, and the recorded hook → age drop (2 of ~9) is
where they would show up.

**Fix (≈1 h):** make the hook's CTA work without JavaScript. Render it as
`<a href="/start?s=1">` (or a `<form method="get">`), have `StartPage` read
`s` and open the run at index 1. Hydrated, the click handler can
`preventDefault` and advance in place as it does now; unhydrated, it is a plain
navigation that lands on the age screen. The same treatment for `GO ON` and
`Set mine up` on the two claim screens costs nothing extra.

### 1.2 · The first question a stranger is asked is "How old are you?"

Screen 1 of 7 is the age gate, moved there on 18 Sep (SIGNUP-FIXES §2.2) on
the argument that a question asked "while nothing is invested costs less".
For completion rate that is backwards. Someone who clicked a rizz video is
asked to state their birth year before they have been asked anything about
themselves, and in a dating context an up-front 18+ gate reads like the door
of a different kind of site. It is the least rewarding question in the run,
placed where tolerance is lowest. 0 of the outside visitors who saw it
answered it.

**Fix (≈1 h):** keep §16.4 exactly as it is — one year field, `checkAge`,
before the account exists — but **ask it last**, as the first field on the
account screen, above `Continue with Google`. The year still crosses the
Google redirect because it is still asked before sign-in, so the reason the
gate moved (no `/onboarding/age` after Google) still holds. The run then opens
with the two most interesting questions it has: what are you training for, and
here is who you'll meet.

### 1.3 · Every social link lands on a page that pitches two products

All Buffer links point at bare `/start` (see `nerve-marketing` memory: "every
post link is hellonerve.com/start"). So someone who watched a dating clip
lands on: *"…a stranger you want to talk to, **or an interviewer you want to
impress**"*, and three screens later is asked which of the two they meant.
The first two seconds are spent reconciling the ad with the page.

`?track=` already exists (`startOpening`), but it only skips the hook and
still shows the track screen as a pre-selected "confirmation".

**Fix (≈1 h):**
- Every dating post links `/start?track=dating&utm_source=tiktok&utm_content=<post-id>`;
  interview ads link `?track=interview`.
- With a known track, the hook speaks for that track only (dating: *talk to
  her out loud for three minutes*; interview: the screener), and the **track
  screen is skipped**, not confirmed. Back from the next screen can still
  reach it.

### 1.4 · `/start` has none of the proof the homepage now has

Since 18 Sep, `/` carries a 10-second voice sample (`HEAR WHAT THIS IS 10S`,
`public/hero/intro.mp3`), a counted line (`134 reps run · 31 people
training`) and five named tester quotes. **All social traffic skips `/`**, and
the screen it lands on is a headline, a paragraph and a button — no sound, no
image, no number. The only proof in the run is one quote on the last screen.

**Fix (≈2 h):** put the counted line and a play button on the hook, under
the button. Better than the intro narration: `public/hero/` already holds a
real 50-second exchange with Nadia (`manifest.json`, her half captured from
`gpt-realtime` with `scripted: false`, his half recorded). Eight seconds of
that answers "what is this" better than the paragraph does, and it satisfies
rule 10 as it stands — hers captured, his authored. The `CASS` screen is the
second place for sound, if a captured line of hers is ever recorded.

### 1.5 · The run is longer than it says

The button promises 40 seconds; the run is 7 screens, two of which ask
nothing (`build` — Cass, and `mechanism` — "Inside, then outside"). Cass earns
her place: it is the only moment the product becomes a thing. `mechanism` is
the last surviving claim screen and repeats what the hook already said.

**Fix (≈30 min):** cut `mechanism`; move its one unique fact (the field
challenge) into one line on the Cass screen. With §1.2 and §1.3 the dating run
becomes:

| # | Now (7 + hook) | Proposed (5 + hook) |
|---|---|---|
| 0 | hook | hook — track-specific, voice sample, count |
| 1 | age | Cass — who you'll meet |
| 2 | track | focus — what's the hard part |
| 3 | Cass | name (skippable) |
| 4 | focus | account — year · Google · email |
| 5 | mechanism | |
| 6 | name | |
| 7 | account | |

(The track screen stays for anyone who arrives without `?track=`.) The "same
length, differ at one index" property of `DATING_STEPS`/`INTERVIEW_STEPS`
survives: both lists lose the same two entries.

### 1.6 · Measurement is still off, nine days after "one environment variable"

Checked on the live page today: `fbq`, `posthog` and `ttq` are all
`undefined`, and the only host contacted is `www.hellonerve.com`. The Meta
pixel and PostHog are built and unkeyed (`LAUNCH-GAP.md` B7); a TikTok pixel
does not exist in the code at all, although TikTok ads have been run.

**Fix (≈2 h):**
1. Set `NEXT_PUBLIC_META_PIXEL_ID` and the PostHog key in Vercel, redeploy.
2. Add a TikTok pixel beside `components/meta-pixel.tsx`, same env-gated
   pattern, `CompleteRegistration` on the account submit.
3. Add a first-touch `source` to `page_views` (from `utm_source` /
   `utm_content`, allow-listed like `step`) so the admin panel can say which
   post a visitor came from. This is the only way to learn which of the three
   daily posts is worth making more of.
4. Count the landing server-side (in `middleware.ts`, bots filtered as now)
   so the pre-hydration bounce in §0.3 becomes visible.

### 1.7 · Smaller things on the screens

- **Google is the fast path and it is styled as the secondary one.** On the
  account screen the lime button is `START THE REP`, under two fields; Google
  is an outline. Make Google the hot button and the email form the fallback.
- **`Speaking English more naturally — Coming soon`** is a disabled option on
  the track screen. A dead choice on a 7-screen run from a cold visitor is
  noise; hide it until it ships.
- **~130–170 px of empty space above the question** on the age and name
  screens at 390×844 (the hook was fixed on 18 Sep; the question screens were not).
- The display font swaps in late on `/start` (fallback sans for the first
  ~2 s, then Barlow Condensed), so the first thing a slow phone sees is a
  headline that visibly changes shape. `font-display` / preloading the 700
  weight on this route would stop it.

---

## 2 · What to do, in order

Ship 1–5 as one batch. At ~1 visitor a day there is nothing to A/B.

| # | Change | Effort | Why first |
|---|---|---|---|
| 1 | Hook CTA works before hydration (§1.1) | 1 h | A measured defect on the one screen where the data says people leave |
| 2 | Tag every link `?track=…&utm_source=…&utm_content=…`; track-specific hook; skip the track screen when known (§1.3) | 1 h + relinking Buffer | Message match, and one screen fewer |
| 3 | Age gate → first field on the account screen (§1.2) | 1 h | Stop opening with the gate |
| 4 | Voice sample + counted line on the hook (§1.4) | 2 h | The proof exists; the traffic never sees it |
| 5 | Cut `mechanism`; Google as the primary button; hide "Coming soon" (§1.5, §1.7) | 1 h | Seven screens → five |
| 6 | Pixel + PostHog keys, TikTok pixel, `source` column, server-side landing count (§1.6) | 2 h | Makes the next 100 visits readable |

Then the real constraint: **traffic**. None of the above matters at 12
visitors a week. The channels already identified in memory — YouTube Shorts
(~63% US audience), Reddit answers, and the interview track on Google search —
are where the next week's effort goes.

## 3 · Still refused

Nothing here reopens a refusal from D21 or SIGNUP-FIXES §5.6: no rep before
the account (rule 11, §16.4), no paywall in the run, no statistic on any
screen (rule 12), no fabricated proof, no countdowns. §1.2 moves the age gate;
it does not weaken it.

## 4 · Docs to touch when these ship

- `LAUNCH-GAP.md` D21 and D24 — the run's new shape; B7 when the keys land.
- `SIGNUP-FIXES-2026-09-18.md` §2.2 — record that the gate moved again, and why.
- `lib/data/start-funnel.test.ts` — the step lists and the equal-length property.
- `components/site/legal-pages.tsx` — only if what `/start` keeps changes (it should not).

---

## 5 · What landed — 27 September 2026

| § | Change | Where |
|---|---|---|
| 1.1 | Hook CTA is an `<a href="/start?…&s=1">`; hydrated it advances in place, unhydrated it navigates and `startOpening(…, begun)` opens the next screen. Query string (track, UTMs) is carried. Verified with JavaScript **blocked**: the tap lands on `build` (named track) or `track` (bare) | `start-screens.tsx` `HookStep`, `app/start/page.tsx` |
| 1.2 | `age` is not a step. Year is the first field on the account screen, above both doors; both refuse without a passing year; `signInWithGoogle` refuses a `/start` post with no year | `AccountStep`, `google-button.tsx` `beforeSubmit`, `app/auth/actions.ts` |
| 1.3 | `?track=` opens a hook written for that track and skips the track question forward (`startAdvance`); the rail drops the skipped screen (`startRail`); link previews per track (`generateMetadata`); landing hero/section CTAs link `?track=dating` | `start-funnel.ts`, `landing.tsx`, `app/start/page.tsx` |
| 1.4 | Counted "reps run · people training" line on the hook. **No audio** — decided by the owner | `HookStep` |
| 1.5 | `mechanism` cut; its field-challenge line is on `build`. Run: hook → track → build → focus/role → name → account (5 screens, 4 when the link names the track) | `start-funnel.ts` |
| 1.6 | `page_views.source`/`content` (allow-listed UTMs, first touch per tab), server-written `served` row per `/start` render, admin "Which post" table and `served` at the top of the funnel; TikTok pixel beside the Meta one, unkeyed; dev servers no longer write to the production traffic table | migration, `lib/analytics/record.ts`, `components/tiktok-pixel.tsx`, `components/analytics.tsx` |
| 1.7 | Google is the primary button on the account screen; "Coming soon" hidden on `/start`; the tester quote shows on the dating arm only | `start-screens.tsx`, `onboarding-questions.tsx` |

**Second pass, same day (owner's call): the quote moved and the account
screen was cut in half.**

- The tester quote left the account screen for the **hook**, under the button,
  merged with the counted line ("Mason Hayes · one of 31 people training") and
  set at body size rather than as a footnote. The account screen's doubt is
  "is it free, is it spam", which one line answers; the hook's is "is this
  real", which a named person answers — and the hook is where ~7 in 8 left.
  Interview links show the counted line only, since the quote is about
  strangers. The hook's paragraph was cut to one sentence to pay for it.
- The account screen went from twelve things to six: heading, "Free, no card.
  Recordings delete after 30 days.", the year (label reads "Year of birth ·
  18+"), Continue with Google, a **Use email instead** link that opens the
  same email form in place, and the terms. It fits one phone screen with no
  scroll, and still does with the email form open. A server error opens the
  form by itself so it is never hidden. Cost: one extra tap for people who
  will not use Google.

**Mobile polish pass (owner's request), walked at 360×740, 375×667 and 390×844
from the funnel through the first scorecard:**

- **Every text field zoomed the page on iPhone.** The body is 14px and fields
  inherited it; iOS zooms any focused field under 16px and does not zoom back.
  16px on `pointer: coarse`. This touched the account form, name, role and
  every signed-in field.
- Tap feedback on touch (`hover: none`): buttons give on press, option cards
  darken. Before, a tap had no acknowledgement until the next screen.
- 44px targets on touch for `arena-button--sm`, the report link and (38px)
  the room switcher.
- Numbered eyebrows ("Step two") on `/start` disagreed with the rail once the
  track question could be skipped; `/start` passes words instead.
- The first-win / first-loss sheets rose 0.9–1.1s after the result, over the
  verdict; now 2.6s.
- Short-phone rules (≤ 700px tall) so the hook's CTA and the build screen fit
  above the fold on an SE or an in-app browser.

**Deviations from §2:** the year sits on the account screen rather than a
screen of its own (it is one field; a screen would be the thing we removed);
`?track=` now opens on the hook rather than skipping it, because nearly all
traffic arrives from posts and a matching hook is the message-match fix; and
§1.6's "server-side landing count" is scoped to `/start` rather than every
route (it is the only page ads point at, and a middleware write on every
request is a cost on every request).

### 5.4 · Link format for posts

```
TikTok     https://www.hellonerve.com/start?track=dating&utm_source=tiktok&utm_content=<post-id>
Instagram  https://www.hellonerve.com/start?track=dating&utm_source=instagram&utm_content=<post-id>
YouTube    https://www.hellonerve.com/start?track=dating&utm_source=youtube&utm_content=<post-id>
Interview  https://www.hellonerve.com/start?track=interview&utm_source=google&utm_content=<ad-id>
```

`<post-id>`: lower-case letters, digits, `.`, `_`, `-`, up to 40 characters
(e.g. `0927-cafe-opener`). Anything else is dropped by `normaliseTag` and the
visit is still counted, untagged.

---

## 6 · The result screen and the scorecard — 27 September 2026

Owner's review of both screens on a phone: too much at the same weight, a
"Run it back" button with its icon stacked over its label, a level line
nobody could read, and no sense of reward. What was built:

**The icon bug was global.** Tailwind's preflight makes every `<svg>`
`display: block`, so inside `Button`'s content span the icon broke onto its
own line. `.arena-button__content` is `inline-flex` now, which fixes "Run it
back", "Make a card" and every other icon button in the product.

**Result screen** (`ResultScreen`):

- The process score counts up on the result screen itself, on a win and a
  loss, on a 0–100 rail with the 70 line marked (`ScoreReveal`,
  `components/scorecard/visuals.tsx` `ScoreRail`). One sentence under it from
  `progressReading`: "Scoring your rep…", "7 points short of Level 02 —
  Receptive.", "That one counted. 1 more…", or "Level 02 — Receptive is
  open." — the last one with the rail's dot taking the accent once.
- The band chip became "Engaged · warmth 69".
- "Run it back" is a full-width outlined button the same height as "See
  breakdown".
- "She'll remember" is a quote in her voice, under the button that goes back
  to her.
- The page arrives in order: headline, time, score (counting from ~0.65s),
  actions, memory. The first-result sheets wait 2.6s so they land after it.
- On a loss the warmth number is smaller, so the process score is the one
  number that reads as the result.

**Scorecard** (`ScorecardScreen`):

- The number is the hero with the verdict as its caption (R16 reversed,
  recorded there), plus "+N on your last rep" or "Your first score — the
  baseline" (`previousComposite`).
- "Where your points went": one bar split into the parts of the composite,
  each as wide as it was worth, what was lost hatched amber, the three
  biggest leaks named and tappable (`PointsBar`, `pointParts`).
- Metrics that lost more than a fifth of their points are expanded, biggest
  first, under "What cost you"; the rest fold into one "On target" line
  (`splitMetrics`). The metric bar is a target zone and a dot, amber when
  outside the zone.
- The judged dimensions are a hexagon (`SkillHexagon`) that grows in when it
  scrolls into view.
- The two moment cards became one warmth curve across the rep with the best
  and worst turns marked and a tab between them (`ConversationCurve`). The
  "she decides · 65" line is drawn on it. Scorer codes ("open-question",
  "no signal") are sentences now (`momentNote`), and a "worst moment" that
  rounds to 0 is not shown.
- "Try this next time" and the mission said the same thing; on dating only
  the mission and its technique links remain.
- "Run it back" is pinned above the tab bar; "Transcript", "Make a card" and
  "Next persona" sit quietly at the end.

Nothing here touches grading, the warmth engine or a persona. Verified on a
throwaway account with fixture scores at 360, 390 and 1280 wide, then the
account was deleted. `lib/data/result-view.test.ts` pins the rail sentence,
the parts arithmetic, the miss/held split, the "previous rep" rule and the
note copy.

---

## 7 · Follow-up, 3 October 2026 — the first screen is the first question

Branch `start-first-question`. `LAUNCH-GAP.md` D32 is the record; this is the
shape.

**Why.** The first Meta ads (live 3 Oct, US men 18–30, $5/day) bought 7 link
clicks at ~$0.14 in six hours. Of 8 real visitors, 6 saw the hook and **0**
tapped *Set mine up*. Organic since 27 Sep: 28 served → 18 hook → 6 track →
3 account → 0 accounts. An ad click has already been sold; the hook was a
second pitch.

### 7.1 · The run, before and after

| | Before (D31) | After (D32) |
|---|---|---|
| `?track=dating` | hook → Cass reveal → focus → name → account | **focus (1 of 3)** → name (2 of 3) → account (3 of 3) |
| bare `/start` | hook → track → Cass reveal → focus → name → account | **track** (no rail) → focus → name → account |
| `?track=interview` | hook → screener reveal → role → name → account | **role (1 of 3)** → name → account |
| after the account | mic intro → level → *We can hear you* + CONTINUE → brief → rep | mic intro → level, which confirms in place and moves on after ~1.1s → brief → rep |

Cass is introduced once, on the brief. The account screen says who they are
meeting in three authored lines: *Cass is ready.* / *She's an AI. No real
person on the other end — just you, out loud, for 3 minutes.* / the line for
their focus answer (`FOCUS_ACCOUNT_LINE`). The brief and the live caption
read *Cass · AI*.

### 7.2 · The first screen

Wordmark and LOG IN on top, the kicker *Practice out loud with an AI*, the
question, one sub-line, the answers, *Free · no card · your first rep is
included*. No back arrow. On tall phones (≥ 701px, ≤ 640px wide) the question
sits mid-screen and the answers in the lower half; on short phones the stack
is top-aligned so everything is above the fold. Measured at 390×844,
375×667 and 360×640 with an iPhone agent: every answer above the fold, no
horizontal scroll, volt at most once per screen, no console errors, Back from
the name and from the account never loses an answer.

**Every answer is a link.** `Option` takes an `href`; the run builds it with
`startQueryWith`, carrying `?track=`, every UTM and any earlier answer —
`/start?track=dating&utm_source=meta&utm_content=gaming&focus=sustaining`.
The server reads it back (`startAnswersFromQuery`) and `startOpening` opens
on the next screen. Hydrated, the click is intercepted as before, and once
the answer is in `sessionStorage` it is taken out of the address bar so a
reload cannot replay it. The role is a GET form (`RoleStep`'s `fallback`),
and a first name never goes in a URL. Tested with the JavaScript bundle
aborted outright (the tap advances, answer kept) and held 5s with the tap
landing first (the tap navigates, the answer survives hydration, the URL is
cleaned back to the ad link). With JavaScript *fully* off, every route on the
site shows only `app/loading.tsx`'s skeleton — it did before this too, because
the page streams behind that boundary — so that is not a case ad traffic hits.

### 7.3 · The funnel, step by step

`page_views.step` on `/start`: **`served`** (server) → `track` (bare links
only) → `focus` | `role` → `name` → `account` → **`signup`** (server, both
doors, only for an account `/start` created). Then on `/onboarding`, signed
in: `mic_intro` → `mic_granted` → `mic_good` → `brief` → `rep_started` (Start
pressed). The UTM tag rides every row in the tab; the server rows read it from
the URL and from the answers the form carries. Verified on a real sign-up
through the ad link: every row above landed with `utm_source=meta`,
`utm_content=gaming`, on one visitor.

Refused as not a person: `facebookexternalhit`, `facebookcatalog`,
`meta-externalagent`/`-fetcher`, `Facebot`, AdsBot, preview/prefetch headers,
and any browser reporting `navigator.webdriver`. The ~28 `utm_source=meta`
rows logged in three minutes when the ads were created had ordinary agents
and ran JavaScript, which is what the `webdriver` check is for; whether it
catches all of them will only show on the next ad edit.

### 7.4 · Still owed

- Deploy after the owner's OK; then open both live ad links at phone size and
  confirm they land on *What's the hard part?* and log `utm_source=meta`.
- `npm run legal:pdf` and re-upload — privacy clause 01 now names the time
  zone and the setup screens.
- Flagged, not changed: a focused email field's volt border beside the volt
  Google button; volt in the signed-in rail and meter. (Resolved the same day:
  `guided.ts`'s on-screen "apologising" → "apologizing", owner-directed; the
  mic intro's "not recorded" line checked against the code, kept, and privacy
  clause 01 now says the same.)
