# The first screen: why 0 of 55 tapped, and the plan (5 October 2026)

**Status: PLAN. A0 (device check) DONE 5 Oct. Parts A and B are to be built together (owner, 5 Oct); nothing else built yet.** Day 32 of the launch block; Gate 3 is Thursday 8 October.

The short version: paid traffic reaches the first question of `/start` and nobody answers it. Before changing the page again, we need to know *why*: do people not read it, read it and decline, or is it broken on a device we have not tested? Today the data only records that they arrived. So Part A measures, Part B fixes the page, Part C fixes the ad, Part D tests the idea itself. Which of B or C ships depends on what A shows (§6).

---

## 0. Where we are

**Meta, campaign `NERVE · US · Traffic · Oct`** (one ad set, $5/day, Reels + Stories, US men 18–30; optimisation switched from link clicks to **landing page views** on 4 Oct ~12:30 LK):

| | 3 Oct | 4 Oct | 5 Oct (part) | Total |
|---|---|---|---|---|
| Spend | $2.69 | $7.03 | $3.04 | **$12.76** |
| Impressions | 194 | 476 | 182 | 852 |
| Landing page views | 17 | 27 | 19 | **63** |

**`/start`, Meta traffic, Sri Lanka excluded, since the D32 deploy (3 Oct 13:53 UTC):**

| Ad (`utm_content`) | Served | Saw the first question | Answered it | Accounts |
|---|---|---|---|---|
| `library` | 48 | 41 | **0** | 0 |
| `gaming` | 24 | 14 | **0** | 0 |
| **Total** | 72 | **55** | **0** | **0** |

**0 of 55 is not noise.** If even 10% of visitors would tap an answer, the chance of seeing zero is about 0.3%. The hook before D32 got the same result (0 of 6 tapped it). Two different first screens, same result.

### Ruled out

- **The page is broken in general.** The owner opened the ad link inside Instagram on 4 Oct at 19:01 LK and went question → name (7 s) → account (6 s). This was one device; **an iPhone has not been tested** (A0).
- **The page is too slow.** 41 of 48 `library` visitors reached the question.
- **The ad doesn't say what Nerve is.** It does. Both captions explain it and offer the free rep, with a SIGN_UP button:
  - Library: *"Study group in 5 minutes and she sits next to you. Do one practice rep first: a 3-minute conversation with an AI character who reacts like a real person, scored on how you talked. First rep free."* Headline *"Your first rep is free"*.
  - Gaming: *"6 hours in voice chat, no problem. Talking to someone in person? Different story. Nerve is a 3-minute voice rep with an AI character who can lose interest. Practice the conversation before it counts. First rep free."* Headline *"Practice the conversation first"*.
  - **Caveat:** on Reels and Stories the caption is collapsed to about one line. Most viewers see only the video, the headline and the button.
- **Correction to the chat on 4 Oct:** the page already says *"Free · no card · your first rep is included"*. It sits **under** the four answers.

### What the data can't tell apart yet

| | What it would look like | Fix |
|---|---|---|
| **H1. Not reading.** Reflex or accidental taps from Reels/Stories | Most leave within ~3 s, no touches | The ad (Part C). Page changes won't help |
| **H2. Read and declined.** They get it and don't want it now. It asks them to talk out loud to an AI, which nobody does mid-scroll | Many stay 3–20 s, some scroll or touch, no answer | The page (Part B), then the offer (Part D) |
| **H3. Broken on some device**, e.g. the iPhone Instagram webview swallowing the tap | Long stays and touches but no step change, concentrated on one device | Fix the bug; nothing else matters until then |

---

## A0. Device check (owner): DONE 5 October

**Result: the page works and loads fast on both phones the owner tried.** Recorded in `page_views`:

- **4 Oct 19:01 LK** (`pabath_test`, opened from an Instagram DM): question → name in 7 s → account in 6 s. The full run works inside Instagram's browser.
- **5 Oct 11:05–11:06 LK** (`pabath_test_ios`, iPhone, both ad links): `served` → first question within about 1 s on both. The owner reports it opens "super fast". (No answer was tapped on the iPhone, so a tap-through there isn't recorded yet; nothing suggests it would fail.)

So H3 (broken on a device) is unlikely. H1 and H2 remain, and Part A is how to tell them apart.

### The owner's hypothesis: Instagram's browser has none of your saved logins

True, and worth acting on, but **not at the first question**. Answering "What's the hard part?" needs no login and no typing. It matters on the **account screen**: in Instagram's browser nobody is signed in to Google, no password manager fills anything, and email autofill is often missing. Two consequences belong in this plan:

1. **Google sign-in may not work there at all.** Google refuses OAuth sign-in from embedded webviews (`disallowed_useragent`), and Instagram's in-app browser is one. Every ad visitor who reaches the account screen gets the Google button first (D25). **This has never been tested from an ad**: the only Google account so far (28 Sep) came through a normal browser. → **A3** below.
2. It makes the account screen the next likely wall once the first question works, so the account step should be measured as carefully as the first screen.

## Part A. Measure (build first, about half a day)

### A1. How long the first screen stays open, and whether anyone touches it

**What.** While the first `/start` screen is visible, the browser sends a small beacon at **3 s, 10 s and 30 s** of *visible* time (the clock pauses while `document.visibilityState` is `hidden`). It sends one more beacon on the **first touch anywhere on the page** (`pointerdown`), not only on an answer.

**Why heartbeats and not an exit beacon.** In-app browsers don't reliably fire `pagehide` or `visibilitychange` when the webview is swiped away. A heartbeat that arrived proves the visitor was still there; a missing exit beacon proves nothing.

**Files:**

| File | Change |
|---|---|
| `components/analytics.tsx` | `countStartDwell(step, seconds)` and `countStartTouch(step)` on the existing `countPageView` pipe, so the same filters apply: no `/admin`, no localhost, no `navigator.webdriver` |
| `components/screens/start-screens.tsx` | One effect, **first screen only** (`first === true`): start the visible-time clock, fire the three heartbeats, attach a one-shot `pointerdown` listener. Clear everything on step change or unmount |
| `lib/analytics/pageview.ts` | `normaliseDwell`, which accepts only `3 \| 10 \| 30` and refuses anything else (same refuse-don't-sanitise rule as `normaliseStep`). `touch` accepts only `true` |
| `app/api/pageview/route.ts` | Read `dwell` and `touch` from the body and pass them through |
| `lib/analytics/record.ts` | `ViewRow` gains `dwellS: number \| null` and `touched: boolean \| null` |
| `supabase/migrations/20261005xxxxxx_page_views_dwell.sql` | `alter table page_views add column dwell_s smallint check (dwell_s in (3,10,30)), add column touched boolean;` applied through the Supabase MCP, file committed, never edited afterwards |
| `lib/db/types.ts` | The two columns |

**Cost:** at most 4 extra rows per visitor, well inside the route's `BURST` of 80.

**Privacy:** no new identifier, no cookie, nothing typed is sent. Clause 07 is unaffected. If privacy clause 01 lists what the beacon collects, add "how long the first screen was open" there and re-run `npm run legal:pdf` (rule 13: a change to what we collect is a change to the legal page).

**Tests:** `lib/analytics/pageview.test.ts` checks that `normaliseDwell` refuses `4`, `-1`, `'10'` and `null`, that `touch` refuses anything but `true`, and that a dwell row still needs a known step.

### A2. Link the server's "served" row to what happened next (recommended, optional if time is short)

**Problem.** The `served` row is written by the server and the screen rows by the browser. They are matched by a digest of IP and user agent, and the two often don't match. From 1 to 5 October there were 136 served visitors and 102 browser visitors, but only **77 in common**. The owner's own test on 4 Oct produced two different visitor ids one second apart. So "served but never saw the question" is wrong by an unknown amount.

**Fix.** `app/start/page.tsx` mints a random per-render id (`crypto.randomUUID()`, first 16 hex characters), writes it on the `served` row and passes it to `StartScreen`. Every `/start` beacon from that render carries it. Add a `render_id text` column in the same migration. It is not a cookie, isn't stored in the browser, and a new one is made on every load, so it can't follow anyone.

### A3. Google sign-in inside Instagram's browser (check first, then fix only if broken)

**Check.** From an Instagram DM, open `https://www.hellonerve.com/start?track=dating&utm_source=pabath_test_ios&utm_content=library` on an iPhone and on an Android, go to the account screen and tap **Continue with Google**. Record exactly what happens (Google's `403 disallowed_useragent` page, a blank screen, or a working sign-in). **Delete any test account afterwards.**

**If it is blocked**, on in-app browsers only (user agent contains `Instagram`, `FBAN` or `FBAV`; detection is a pure function with tests in `lib/`):

- lead the account screen with the **email** form and move the Google button below it, and
- add one line under the Google button: *"Google sign-in may not work inside Instagram. Use email, or open this page in Safari or Chrome."*

Outside in-app browsers nothing changes. The §16.4 year stays the first field above both doors. `checkAge` still runs before `auth.signUp` and before the Google redirect. `npm run db:funnel` must pass.

**Measure the account screen too.** Send two more beacons from the account screen: `account_email` (first focus on the email field) and `account_google` (Google button tapped). Put them in a **new** allow-list, `START_ACTION_NAMES`, beside `START_STEP_NAMES` in `lib/analytics/pageview.ts`. `START_STEP_NAMES` must stay equal to the screen list, because `pageview.test.ts` asserts that. The next read then shows which door people try and where they stop.

### Ship A on its own

Branch → Vercel preview → owner taps through it in Instagram with a `pabath_test` link → production. Then collect **at least 40 first-screen visitors** (about two days at the current ~20 a day) before reading it (§6).

---

## Part B. The page (ships TOGETHER with Part A: owner's decision, 5 October)

**Why together.** The number B has to move, first-question answers, already has a baseline: **0 of 55**. Any answers after B are visible without waiting for one. What we give up is knowing whether the *old* page lost people by not being read (H1) or by being read (H2). The dwell data on the *new* page still answers that if answers stay at zero. B is small, and two days of waiting is about $10 of traffic and two of the 30 days left in the launch block.

### B1. A first line that continues the ad's story

`utm_content` picks a **scene line** that replaces the kicker on the first screen. The lines are authored in a new `lib/data/start-scenes.ts` (rule 10: authored and reviewed, never generated). An unknown or missing value keeps today's kicker.

| `utm_content` | Today | Proposed |
|---|---|---|
| `library` | Practice out loud with an AI | **Study group. She just sat down next to you.** |
| `gaming` | Practice out loud with an AI | **Six hours on voice chat. Now it's in person.** |
| anything else / none | Practice out loud with an AI | unchanged |

**Not cloaking.** The same link shows the same page to everyone, Meta's reviewer included. It is the `?track=` mechanism one level down, and `/` is untouched (B1 in `LAUNCH-GAP.md`).

### B2. A sub-line in plain words, on `/start` only

Today: *"Pick one. Your first rep is built around it."* A cold visitor doesn't know what a "rep" is.

Proposed: **"Practice it out loud first: 3 minutes with an AI character who can lose interest. Pick what's hard and your first practice is built around it."**

`FocusStep` is shared with the signed-in onboarding (`onboarding-questions.tsx`, on purpose), so this is an **optional `sub` prop** passed by `/start` only. The signed-in run keeps its line.

### B3. "Free" above the fold

`TRUST_LINE` (*Free · no card · your first rep is included*) sits under the answers. Take screenshots at Instagram in-app viewports (about **390×664** on iPhone and **360×640** on Android, after Instagram's own bars). If the line is below the fold, move it directly under the sub-line on the first screen only.

### Constraints for B

No statistic (D21's refusal); no clinical claim (rule 12); US spelling; Arena (volt once per screen). No Tier 0 file is touched, so `dating-arm.test.ts` must pass unchanged. The prop on the shared question is additive and defaults to today's text.

**Tests:** a unit test for the scene lookup (known → line, unknown → null, every line non-empty and under ~60 characters); `npm run db:funnel` still passes.

---

## Part C. The ad (no code; do it if A shows H1)

- **C1. Say it in the video, not the caption.** Add on-screen text in the last 2 seconds of each video: *"Practice this conversation with an AI first. Free."* Make it with the usual video pipeline, upload it as a **new** ad in the same ad set, and pause the old one after two days so the comparison is fair.
- **C2. Library headline.** *"Your first rep is free"* → *"Practice the conversation first"* (Gaming's headline, without the jargon). This can be done through Windsor's `update_ad_creative`. It makes a new creative and may send the ad back through review.
- **C3. Placements (owner's call).** Reels and Stories stay. Adding Feed is the option if H1 is strong, because people in Feed read captions. That means adding a placement, not removing one.

---

## Part D. Test the idea itself (owner, this week, runs alongside everything)

Parts A to C test the door. Only this tests the idea.

- Find **5 people** in the target group (men about 18–30, English-speaking, ideally not close friends). Send them the link and have them do **one rep**. Watch, or ask straight afterwards.
- Ask three things: *Would you do another one? What was it like? What would make it worth $7 a week?*
- **Pass:** 2 or more of the 5 do a second rep without being asked. **Fail:** nobody does. That is a stronger signal than any number of ad clicks, and it decides whether spending on traffic makes sense at all.

---

## 6. How we decide (read it on Thursday 8 October, Gate 3)

```sql
-- First-screen behaviour of Meta visitors since Part A shipped
select coalesce(content,'?') ad,
       count(distinct visitor) filter (where step = 'focus' and dwell_s is null and touched is null) saw,
       count(distinct visitor) filter (where dwell_s = 3)  stayed_3s,
       count(distinct visitor) filter (where dwell_s = 10) stayed_10s,
       count(distinct visitor) filter (where dwell_s = 30) stayed_30s,
       count(distinct visitor) filter (where touched)      touched,
       count(distinct visitor) filter (where step = 'name') answered
from page_views
where source = 'meta' and coalesce(country,'') <> 'LK' and path = '/start'
  and at > '<A ship time>'
group by 1;
```

| What it shows | Means | Do |
|---|---|---|
| Most never reach 3 s, few touches | H1 | Part C. Part B won't help |
| Many past 3 s, some touches, no answers | H2 | Part B |
| Many past 10 s **and** touching, no answers | H3 until shown otherwise | Test more devices; fix the bug first |
| B shipped, 40+ more visitors, still no answers | It's the offer, not the page | Part D decides; consider pausing spend until it does |

**Target:** at least **15%** of first-screen visitors answer the question, measured over at least 40 visitors.

---

## 7. Out of scope, and why

- **Meta pixel / a sign-up-optimised campaign.** `components/meta-pixel.tsx` exists but has no key. The privacy page says *"No advertising or cross-site trackers"*, so turning it on is a legal-page change first. At $35 a week a conversion campaign also can't leave Meta's learning phase (about 50 events a week are needed). Revisit once the first screen converts.
- **Bringing the hook back.** 0 of 6 tapped it (D32).
- **A rep before the account.** Refused in D21 (rule 11, and the age gate).
- **More budget.** It buys more of the same visitors.

## 8. Order

1. **Today:** A0 is done. Build A1, A2, A3 and Part B together on one branch, preview, owner check, ship.
2. **Tue–Wed:** collect 40+ first-screen visitors on the new page. Start Part D.
3. **Thu 8 Oct, Gate 3:** run §6. If answers are still zero, the dwell data says whether it is the ad (Part C) or the offer (Part D).

## 9. Verify before calling any part done

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build:check`, `npm run db:funnel`. Then one real tap-through inside Instagram with a `pabath_test` link, and check that its rows (including `dwell_s`, `touched` and `render_id`) appear in `page_views` before production.

## 10. When a part ships, update

`LAUNCH-GAP.md` (a new D-row; D33 is the latest), the `/start` row in `docs/README.md`, `MARKETING-PLAN.md` §9 (the numbers and what Gate 3 decided), and the status line at the top of this file.
