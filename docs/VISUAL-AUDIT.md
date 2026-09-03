# Visual audit — where text is doing a picture's job

> **Most of this document shipped on 3 September 2026.** The mark system
> exists (`components/marks/`, forty-two glyphs, mapping tested in
> `lib/marks/registry.test.ts`), and the five `/how-it-works` diagrams, the
> loop ring, the plan matrix and the promoted anxiety chart are all in.
>
> **V2, V4, V5 and V16 — putting screenshots of the app on the public site —
> shipped and were then taken back out at the owner's request.** They did not
> look right on the page. The capture pipeline (V6) survives as a standalone
> tool; nothing on the site embeds its output. §2's finding stands as written:
> the product still is not shown anywhere it is sold from, and that is now a
> decision rather than an oversight.
>
> **What shipped, what was reverted, and the four defects the work uncovered
> is recorded at the bottom under "What shipped".** The audit text itself is
> left as written — it is the record of what was found, and rewriting a
> finding to match its fix loses the finding.

An audit of every surface in the product, public and signed-in, against one
question: **what is being said in words that would be understood faster as a
mark, a diagram, a chart or a picture?**

The verdict in one paragraph: Nerve has a real visual system and exactly one
piece of proprietary imagery — the persona orb, which is the best asset in the
product and is used in ten places across seven screens. Everything else that
is not a chart is prose. There are **no illustrations, no diagrams, no product
screenshots and no photographs anywhere in the build**; `public/` holds one OG
image and ten audio files. The gap that produces is not decorative. Four
ranks, four roster tiers, four field tiers, six score dimensions, five library
kinds, four rejection milestones and three plans — thirty things a user is
meant to recognise on sight — are distinguished by their names alone, set in the same
typeface at the same size in the same grey. `Rookie · Regular · Contender ·
Closer` is the clearest case and the one that prompted this audit, but it is a
symptom: the product has no mark vocabulary, so every distinction it wants to
draw has to be read.

This is not a request to make the app friendlier or softer. Arena is a
performance aesthetic and it should stay one. The fix is the same one a
scoreboard uses: **marks and diagrams instead of sentences, where the sentence
is doing a mark's job.**

---

## 0. What was measured

Every `.tsx` under `app/` and `components/`, every content file under `lib/`
that ships user-facing prose, and `public/`.

### Asset inventory — the whole of it

| Asset class | Count | Where |
|---|---|---|
| Photographs | **0** | — |
| Illustrations | **0** | — |
| Diagrams | **0** | — |
| Product screenshots | **0** | — |
| Video / motion | **0** | — |
| Proprietary marks | **1** | the persona orb (`components/fluid-persona/`) |
| Generic icons | 49 distinct | `lucide-react`, ~26 import sites |
| Chart types | 5 | trend, sparkline, warmth chart, anxiety chart, metric bar |
| CSS-only decoration | 2 | `.ring-illustration`, `.avatar::before/after` |
| Images in `public/` | 1 | `og.png` |

### Visible copy, by file

A rough count of hand-authored user-facing words, comments stripped.

| Words | File | Note |
|---|---|---|
| 3,245 | `components/site/legal-pages.tsx` | three legal pages; a reviewer reads these — see §1.1 |
| 1,521 | `lib/techniques/library.ts` | fourteen library cards |
| 1,424 | `components/screens/profile-screens.tsx` | profile, settings, subscription |
| 1,310 | `components/site/landing.tsx` | **one page** |
| 951 | `components/site/how-it-works.tsx` | one page |
| 867 | `lib/field/challenges.ts` | field challenges |
| 866 | `app/rep/rep-client.tsx` | the M0 harness — see V38 |
| 731 | `components/modals.tsx` | fifteen overlays |
| 723 | `components/site/pricing-page.tsx` | one page |
| 633 | `components/screens/session-screens.tsx` | result, scorecard, transcript |
| 560 | `components/screens/rep-screens.tsx` | brief and live |
| 539 | `components/screens/core-screens.tsx` | roster, persona detail, field |
| 533 | `components/screens/onboarding-screens.tsx` | five steps plus the gate |
| 521 | `lib/personas/presentation.ts` | roster blurbs |

The landing page is the number to hold on to: **1,310 words above the fold and
below it, and not one image.** A visitor deciding whether to open their
microphone and talk to a stranger reads a wall of argument and never sees the
thing they are being asked to do.

### Icon usage

- 49 distinct Lucide glyphs, none of them ours.
- `Check` is used for: a field rep logged, a plan feature, a read library card,
  a won session, a confirmed microphone, an accepted challenge, "on the list",
  "what worked", and the first-win sheet. Nine different meanings, one mark.
- `Trophy` carries both roster unlocks and field-tier unlocks — two different
  progressions.
- **25 `EmptyState` call sites, 0 of which pass an `icon`.** Every empty state
  in the product shows the same generic `Inbox`, including "This rep was not
  graded", "The roster is empty" and "Nothing logged yet".

---

## 1. The constraints this audit runs inside

The obvious answer to "too much text" is stock photography, and here it is
**forbidden**. These are not preferences; four of them are enforced in code or
in a document a stranger reads before we can take money.

### 1.1 No photographs of people. Not one. Ever.

`docs/PAYMENTS-APPROVAL.md` §3: every merchant of record on the shortlist bans
dating products by name, Creem already declined us as a category call, and Whop
was chosen partly because its prohibited list does *not* name dating. The Whop
account is classified `personal_development / communication_coaching`. A human
opens `/` during onboarding.

A photograph of a woman next to the words *get her number* converts a
communication-coaching classification into a dating app in one screen, and
`PAYMENTS-APPROVAL.md` §8.A is the mitigation we would then be relying on. The
same argument kills AI-generated character portraits, which additionally breach
rule 7's companion-app bound. **Whatever imagery this audit recommends is
abstract, diagrammatic, or a screenshot of our own interface.**

### 1.2 Volt appears once per screen

An icon set painted volt breaks the Arena rule on every screen it lands on.
Marks are Ink-2 (`#9DA396`) at rest and Ink-3 when secondary; volt is reserved
for the *current* one — the rank you hold, the tier you are on, the dimension
this rep is about.

### 1.3 The drawing style is already specified

Border radius max 2px, hairlines never shadows, `tabular-nums` on digits. That
is a complete instruction for an illustration system: **1px and 1.5px strokes,
flat, geometric, no gradients, no soft shapes, no drop shadows, no rounded
blobs.** The persona ramp in `lib/personas/visual.ts` is the only place colour
is allowed to behave differently, and it is bounded by tests.

### 1.4 Dark only

No light mode means no asset may carry a white ground. Everything is authored
for `#0B0C0A`, which rules out most third-party illustration packs outright and
argues for SVG components with `currentColor` rather than files.

### 1.5 Authored in the repo, reviewed in a pull request

Rule 8. Marks and diagrams are TSX/SVG components under `components/marks/`,
seeded nowhere and generated at runtime never. No icon font, no CDN, no
runtime-fetched SVG sprite.

### 1.6 Motion respects `prefers-reduced-motion`, and nothing becomes a spinner

§02. An animated diagram is a static diagram under a reduced-motion preference,
and no illustration may ever stand in for loading state — that is what
skeletons are for.

### 1.7 Weight

`public/` is 1.5 MB today and the public routes render statically. SVG marks
cost bytes in the hundreds. Screenshots and any motion clip are the only
raster assets recommended here, and they belong in `next/image` with explicit
dimensions.

---

## 2. The three systemic defects

Everything in §4 is an instance of one of these.

### V1 · There is no mark vocabulary, so every distinction has to be read

Thirty recognisable things — four ranks, four roster tiers, four field tiers,
six score dimensions, five library kinds, four milestones and three plans —
are drawn as words. (Warmth bands are the one family already carrying a signal
of their own, in `--band-*`.) A user cannot glance at the Train screen and see
where they stand; they have to read `Contender` and remember whether that is
above or below `Regular`. The rail draws four identical dots and puts the
names underneath, which tells you the order and nothing about the thing.

**Fix:** one authored mark set, seven families, thirty glyphs. §3 has the
table. This is the single highest-leverage change in the document because six
of the seven families appear on four or more screens each.

### V2 · The product is never shown, anywhere

No screenshot on `/`, `/how-it-works` or `/pricing`. The hero replays a real
rep as *audio* — which is excellent, and is the right call for the voice — but
a visitor still has no idea what the screen looks like while it is happening,
what a scorecard is, or what the field log does. The three most persuasive
artefacts in the product are the live rep, the scorecard and the
predicted-versus-actual chart, and a signed-out visitor sees none of them.

`ScorecardArtifact` on the landing page is the existing half-measure: a
hand-built HTML replica of a scorecard. It is good, and it proves the point —
somebody already decided a picture was needed there and hand-drew one in
markup rather than capturing the real screen.

**Fix:** V4, V5, V6.

### V3 · Prose is doing a diagram's job in eight places

Each of these is a structure — a sequence, a split, a ladder, a matrix —
explained in sentences:

| Where | Words | The structure hiding in it |
|---|---|---|
| `landing.tsx:212` The loop | ~200 | a four-beat cycle that returns to the start |
| `how-it-works.tsx:22` The rep anatomy | ~230 | a 3:00 timeline with a marked wind-down at 2:30 |
| `how-it-works.tsx:68` Sixty / forty | ~140 | one split bar, two columns |
| `how-it-works.tsx:145` The field tiers | ~130 | a four-rung ladder of rising exposure |
| `how-it-works.tsx:175` The milestones | ~120 | a 10 → 25 → 50 → 100 counter track |
| `how-it-works.tsx:190` The ranks | ~60 | a four-step standing ladder |
| `pricing-page.tsx` What a plan changes | ~90 | a two-column comparison matrix |
| `how-it-works.tsx:121` The memory rule | ~90 | allowed / refused, side by side |

That is roughly **1,060 words of the public site** whose entire job is to
describe a shape.

---

## 3. The mark system, built once and used everywhere

Seven families, thirty glyphs, one file per family under `components/marks/`.
Each is a square SVG on a 24-unit grid, 1.5px stroke, `currentColor`, no fill.
The reuse count is what justifies the work.

| Family | Glyphs | Replaces | Appears on |
|---|---|---|---|
| **Rank** | 4 — Rookie, Regular, Contender, Closer | four identical dots + a name | Train rail, `/how-it-works`, share cards, profile |
| **Dimension** | 6 — Opening, Curiosity, Listening, Signal reading, Composure, Close | six labels in six places | landing dimension grid, scorecard metric rows, progress sub-score cells, library group heads, mission card, focus links, brief |
| **Roster tier** | 4 — Open, Receptive, Neutral, Ambiguous | `Level 03 — Neutral` in text | roster level heads, persona cards, brief, scorecard header, unlock sheet |
| **Field tier** | 4 — In the app, Transactional, Social, The real thing | a `Tier 3` chip | field card, `/field`, `/how-it-works`, unlock sheet |
| **Library kind** | 5 — Technique, Opener, Ladder, Recovery, Exit | a label string on every tile | fourteen library tiles, card headers, pager |
| **Milestone** | 4 — 10, 25, 50, 100 | a bare number | milestone sheet, `/field` counter, `/how-it-works`, share cards |
| **Plan** | 3 — Free, Pro, Elite | a chip | `/pricing`, `/profile/subscription`, paywall sheet |

Design notes that keep it inside Arena:

- **Ranks are chevrons, not medals.** One, two, three ascending strokes, then a
  closed form for Closer. A trophy or a star reads as a badge shelf and §08
  explicitly rules that out; a chevron reads as standing.
- **Dimension marks are diagrammatic, not metaphorical.** Opening is a stroke
  breaking a line; Listening is a stroke returning; Close is a stroke resolving
  to a point. Nobody has to guess what a lightbulb means.
- **Tier marks encode the count.** Field tier 3 is three rungs. The mark is the
  number, so it never disagrees with the label beside it.
- **Volt only on the current one.** Every family renders in Ink-2 and takes a
  `current` prop.

**Size: L** — one focused piece of design work, then mechanical adoption. Split
it: dimension marks first (six places), ranks second (the visible complaint),
the rest as their screens are touched.

---

## 4. The findings, by surface

Ranked within each section by how much text they remove per unit of work.

### The public site

**V4 · The landing page never shows the app** — `components/site/landing.tsx`
The hero is a copy block, a rule block and an audio replay. **Fix:** a
device-framed still of the live rep screen mid-rep — the orb lit, the arc at
1:42, the band readout — sitting beside or under the replay, so the audio has
something to be happening *in*. Captured from the real app by a script, never
mocked, on the `hero:audio` precedent. **Size: M.**

**V5 · `ScorecardArtifact` is a hand-drawn replica of a real screen** —
`landing.tsx:145`
It exists because the page needed a picture. **Fix:** replace with a captured
screenshot of a real scorecard, or keep it and accept it will drift from the
real scorecard's design every time that screen changes. Prefer the capture.
**Size: S** once V6 exists.

**V6 · There is no screenshot pipeline** — new, `scripts/`
Add `npm run shots` — Playwright against a seeded account, capturing the live
rep, the scorecard, the field log and the progress trend at two widths, into
`public/shots/`. Run by hand, committed, exactly like `hero:audio`: it makes
marketing imagery a build artefact of the real product rather than a design
file that lies. **Size: M.** Unlocks V4, V5, V7, V16, V17.

**V7 · The six dimensions are 180 words of prose in a grid** —
`landing.tsx:49,193`
Six cards, each a two-digit index, a name, and 20–30 words. **Fix:** dimension
mark, name, and a six-word definition; the long form moves to `/how-it-works`.
Removes ~120 words from the page and makes the grid scannable in three seconds.
**Size: S** after §3.

**V8 · The loop is four paragraphs of a cycle** — `landing.tsx:212`
"One / Two / Three / Four" in an ordered list is a sequence pretending not to
be a diagram. **Fix:** a four-node cycle diagram — rep → scorecard → field
move → log, with the arrow returning to the start, which is the entire product
thesis and is currently only implied. Each node keeps a title and one line.
Removes ~110 words. **Size: M.**

**V9 · "What this is not" is four paragraphs behind four identical minus
signs** — `landing.tsx:58,342`
The same `Minus` glyph four times. **Fix:** four distinct struck-through marks
— a speech bubble with a line through it for the reply generator, a heart for
the companion app, a cross for therapy, an age mark for adult content — with
the copy cut to one sentence each and the full argument on `/legal/safety`.
Removes ~130 words. **Size: S.**

**V10 · The roster cards carry two `dl` rows of comma-joined strings** —
`landing.tsx:262`
"Responds to" and "Shuts down on" render as `a · b · c`. **Fix:** small
paired icon chips, green-cast for responds and dim for shuts-down. The orbs
already do the heavy lifting on these cards and are the strongest thing on the
page; give them more room. **Size: S.**

**V11 · Seven `site-aside` paragraphs, one under every section** —
`landing.tsx`, throughout
Each is a caveat in small grey type. Three of them are load-bearing (the
challenge review rule, the tier-unlock rule, the safety link) and four are
elaboration. **Fix:** cut the four; render the three as a marked footnote row
rather than a paragraph. Removes ~140 words. **Size: S.**

**V12 · `/how-it-works` is five diagrams written out as text** — see the V3
table
Four separate builds:
- **The timeline** — a horizontal 3:00 track with markers at 0:00, "anywhere",
  2:30 and 3:00, the wind-down window shaded. This is the single most useful
  picture the product could own; it explains the format in one glance and it
  belongs on the brief screen too (V20).
- **Sixty / forty** — one split bar, then the two lists beneath as they already
  are.
- **The field ladder** — four rungs rising, tier marks, one line each.
- **The milestone track** — 10 → 25 → 50 → 100 as a counter with the marks on
  it.
- **The rank ladder** — four rank marks with the blurb, replacing the `ol`.
**Size: L in total, M each.** Removes ~600 words from one page.

**V13 · `/pricing`'s "what a plan changes" is two tick lists** —
`components/site/pricing-page.tsx`
Two columns of prose with hairline bullets. **Fix:** one comparison matrix,
rows × three plan columns, ✓ / — marks. Its whole argument is *the only thing
that varies is one row*, which a matrix says instantly and two lists do not.
**Size: S.**

**V14 · The three legal pages are 3,245 words with no visual summary** —
`components/site/legal-pages.tsx`
The privacy page already has a summary grid; the other two do not. **Do not
illustrate the clauses** — a merchant-of-record reviewer and a disputing
customer both read this text and it must stay exact. **Fix:** a four-tile
summary card at the top of terms and safety (what this covers · what we refuse
· how to complain · governing law), each with a mark, mirroring the privacy
grid. Adds clarity without touching a single clause. **Size: S.**

**V15 · The footer's four commitments are a single grey sentence** —
`components/site/site-chrome.tsx`
`18+ only. Training, not therapy or clinical care. Sessions are bounded at
PG-13.` These are §16's load-bearing claims and the first thing a compliance
reviewer scans for. **Fix:** three marked pills rather than a run-on line.
**Size: XS.** Cheapest credibility win on the site.

### Sign-up and onboarding

**V16 · Sign-up is a bare form on an empty ground** — `auth-screens.tsx:110`
Two steps, two marks, a wordmark, and fields. Nothing tells you what you are
signing up to; the visitor has just left a page with no screenshots on it
either. **Fix:** a single quiet panel beside the form on desktop — one
screenshot from V6 and the three-line promise (one voice rep, no card, 18+).
**Size: S.**

**V17 · The verify-email, reset and expired-link states share three generic
glyphs** — `auth-screens.tsx:167–194`
`MailCheck` twice, `ShieldAlert` once, at 34px. **Fix:** three authored marks
at the size those screens deserve — they are the loneliest screens in the
product and currently look like an error page. **Size: S.**

**V18 · The track and focus questions are seven unadorned option cards** —
`onboarding-screens.tsx:375,446`
"What are you training for?" and "What's the hard part?" render as a stack of
`<strong>` + `<small>`. These are the two answers that steer the entire
product, and they look like a settings form. **Fix:** a mark per option —
four focus marks that are *the dimension marks from §3*, since the focus
answers map onto opening / sustaining / flirting / rejection and the mark
carries through to the brief and the scorecard. One vocabulary, learned in the
first ninety seconds and reused forever. **Size: S** after §3.

**V19 · The focus step never shows what the answer buys** —
`onboarding-screens.tsx:446`
The copy says it "picks who you meet first" and the component already resolves
`firstRep` from the answer. **Fix:** render her orb beside the chosen option
the moment it is chosen. The single most compelling image in the product,
shown at the moment the user is being asked to care. **Size: S** — the data is
already in the component.

**V20 · The age gate is text on a void** — `onboarding-screens.tsx:332`
A heading, a sentence and a date wheel. **Fix:** one mark; nothing else. It
should stay austere.

### The app

**V21 · The rank rail is four identical dots and a blurb** —
`train-screen.tsx:216`
The finding that prompted this audit. Four `<li><i/><span/></li>` — the dots
are indistinguishable, position is conveyed only by which one is volt, and the
blurb is a sentence that changes when you are promoted and is otherwise
invisible. **Fix:** the four rank marks from §3 on the track, the held one in
volt at a larger size, the blurb kept but demoted to one line under it, and the
`Next ·` requirement rendered as a progress mark against its target rather than
a sentence. **Size: S** after §3. **Highest visible impact per unit of work in
the document.**

**V22 · Every empty state in the product shows `Inbox`** — `components/ui/index.tsx:98`
25 call sites, 0 custom icons. "This rep was not graded", "The roster is
empty", "Nothing logged yet", "No such card", "Session not found" and twenty
more all show the same tray. **Fix:** pass a mark at every call site; six or
seven distinct ones cover all 25. **Size: S.** Cheapest per-screen improvement
in the app.

**V23 · The persona card's record is a shouted string** — `core-screens.tsx:52`
`0/3 — BEST WARMTH 41` in caps. **Fix:** a small warmth dial or bar reading 41
against the threshold, plus the attempt count as digits. The number already
means something on a scale; print the scale. **Size: S.**

**V24 · The roster's level headers are a name and a sentence** —
`core-screens.tsx:25,44`
`Level 02 — Neutral` / "She won't carry it for you." **Fix:** tier mark,
name, and the beaten count as a filled/unfilled pair of marks rather than
`1/2 beaten`. **Size: S.**

**V25 · The scorecard is the densest screen in the app and its six judged
dimensions render as chips** — `session-screens.tsx:214`
Six `<Chip>Opening 84</Chip>` in a row, under a header. The six measured
metrics above them get proper bars with target bands, which is right; the
judged six — the half users actually argue with — get chips. **Fix:** the same
bar treatment, with the dimension mark, so both halves read alike and the
composite's arithmetic is visible. **Size: M.**

**V26 · "The moment it worked" and "the moment it didn't" are quotes with a
delta** — `session-screens.tsx:239`
The strongest content on the scorecard, drawn as a blockquote. **Fix:** place
each moment on a miniature of the warmth sparkline that already exists on the
transcript screen, so the quote sits at the point in the rep where it happened.
Turns two quotes into two annotated events. **Size: M.** Also the natural home
for the audit's open P2 (annotated replay).

**V27 · The scorecard's context line is five facts joined by middots** —
`session-screens.tsx`
`Nadia · Level 03 — Neutral · 3:00 · left`. **Fix:** tier mark, duration as a
small arc, outcome as a mark. **Size: S.**

**V28 · Fourteen library tiles differ only in their words** —
`library-screens.tsx:104`
Label, title, summary; the `kind` is a string. Fourteen near-identical cards is
the exact complaint in `site-audit-openai.md`. **Fix:** the five kind marks
from §3 on every tile and every group head. The library becomes scannable
without cutting a word of the content — which is the right outcome, since the
card bodies are the product. **Size: S** after §3.

**V29 · Library card bodies are undifferentiated paragraphs** —
`library-screens.tsx:180`
`card.body.split('\n\n')` into `<p>`s, then examples as an unordered list, then
the drill in a card. 1,521 words across fourteen cards, all one texture. **Fix:**
set the examples as pull quotes (they are lines somebody might say — they
should look different from the analysis) and give the drill a numbered
step-mark. No content change. **Size: S.**

**V30 · The field challenge card is four stacked text blocks** —
`core-screens.tsx:FieldScreen`
Title, brief, "Done when", safety note. **Fix:** field tier mark on the card,
"Done when" as a single unchecked checkbox that fills when logged — the card
already knows the status — and the safety note kept as-is with its
`ShieldCheck`, which is one of the few icons in the build doing real work.
**Size: S.**

**V31 · The predicted-versus-actual chart is the product's whole argument and
is drawn at the size of a side card** — `components/field/anxiety-chart.tsx`
`/how-it-works` calls this "the most useful chart in the product". It sits
under a card heading on `/field` at 150px and is summarised on the profile as
`6 → 3`. **Fix:** promote it — full width on `/field`, with the gap between
the two lines shaded and labelled once, and the mean gap called out as the
headline number rather than a `Stat` detail string. This is also the best
share-card candidate in the product and the one artefact that is unambiguously
*not* a dating app. **Size: M.**

**V32 · The field tier track is four dots** — `core-screens.tsx:FieldScreen`
Same defect as the rank rail, same fix: tier marks. **Size: XS** after §3.

**V33 · Progress leaks a spec citation into user copy** —
`components/screens/progress-screens.tsx:60`
> "How you played, over time. Outcome is not in here — it never was (§07)."

`§07` is meaningless to a user and reads as a bug. **Fix:** delete the
parenthetical. **Size: XS.** *(Copy defect, found on the way — see §6.)*

**V34 · The Sunday letter is a wall of generated prose with three numbers
under it** — `train-screen.tsx:168`, `progress-screens.tsx:ReviewTile`
**Fix:** lead with the three figures as a marked row and let the letter follow.
The letter is worth reading; it is currently the first thing on the card and
the reason people skip it. **Size: S.**

**V35 · `Then and now` compares two numbers and six bars and says nothing
visually about time** — `components/screens/baseline-screen.tsx`
The bars are good. **Fix:** a single "N days apart" axis under the pair, so the
comparison reads as a span rather than as two figures. **Size: S.**

**V36 · Settings is 40+ label/detail rows** —
`profile-screens.tsx:SettingsScreen`
This is correct for settings and should mostly be left alone. The one
exception: the **Safety** group's "Training, not care" paragraph, which is a
§16 commitment sitting in the same visual weight as "Room ambience volume".
**Fix:** mark it and set it apart. **Size: XS.**

### Overlays and states

**V37 · Fifteen overlays share four generic glyphs at 34px** —
`components/modals.tsx`
`Trophy` for both unlock kinds, `Check` for first win, `Mic`/`MicOff` for three
different microphone situations, `LifeBuoy` for distress. The unlock sheet in
particular is the product's celebration moment and it shows a stock trophy.
**Fix:** the tier and rank marks from §3 at overlay scale for unlocks; keep
`LifeBuoy` and the microphone glyphs, which are conventional for good reasons.
**Size: S.**

**V38 · The milestone sheet — the product's best-designed moment — has no
mark** — `components/field/milestone-sheet.tsx`
It shows the count in the composite face, which is deliberate and right. **Fix:**
add the milestone mark behind or beside the number, and nothing else. It is
already the most restrained sheet in the build; keep it that way. **Size: XS.**

**V39 · The live rep is correct and should not be touched** —
`rep-screens.tsx:RepLiveScreen`
Timer arc, orb, band readout, mission line, input meter. §05 allows exactly
this and the screen already earns its silence. **No change.** Listed so nobody
takes §4 as licence to decorate it.

**V40 · `/rep` serves a raw developer harness to any signed-in user** —
`app/rep/page.tsx`, `app/rep/rep-client.tsx`
866 words of instrumentation, inline styles, and headings like
`Scorecard (§07)`. `lib/data/guards.ts` protects the prefix but does not
restrict it to admins. Out of scope for this audit's subject but it is the most
text-dense screen in the product and it is reachable. **Fix:** gate it the way
`/admin/personas` is gated. **Size: XS.**

---

## 5. Text to cut, not illustrate

Not everything here needs a picture; some of it needs deleting. Roughly 500
words across the public site are elaboration on a point already made:

| Where | Cut | Why |
|---|---|---|
| `landing.tsx` four of seven `site-aside` paragraphs | ~140 words | the section above already made the point |
| `landing.tsx` `DIMENSIONS` copy | ~120 words | the long form belongs on `/how-it-works` |
| `landing.tsx` `NOT` copy | ~130 words | one sentence each; `/legal/safety` holds the argument |
| `pricing-page.tsx` hero paragraph | ~60 words | the plan board says it |
| `how-it-works.tsx` `TIMELINE` copy | ~80 words | the diagram carries the sequence |

The FAQ blocks on `/` and `/pricing` are **not** on this list. They are
`<details>`, collapsed by default, and long answers in a closed accordion cost
a reader nothing — that pattern is already correct.

---

## 6. Two copy defects found on the way

Not visual, but they were in the same sweep and both are one-line fixes.

1. **`progress-screens.tsx:60` prints `(§07)` to the user.** V33.
2. **`app/rep/rep-client.tsx:924` prints `Scorecard (§07)` as a heading** on a
   route any signed-in user can reach. V40.

---

## 7. Build order

Leverage first. Nothing here blocks anything in `M3-PLAN.md`.

| Order | Work | Size | Unlocks |
|---|---|---|---|
| 1 | **The dimension and rank mark families** (10 glyphs) | M | V7, V18, V21, V25, V28, V33 |
| 2 | **V22** — a mark on all 25 empty states | S | every screen in the app |
| 3 | **V21** — the rank rail redrawn | S | the original complaint |
| 4 | **V6** — the screenshot pipeline | M | V4, V5, V16 |
| 5 | **V4, V5** — the app shown on the landing page | M | the MoR reviewer's first screen |
| 6 | **The remaining five mark families** | M | V24, V28, V30, V32, V37, V38 |
| 7 | **V12** — the five `/how-it-works` diagrams | L | −600 words on one page |
| 8 | **V8** — the loop diagram | M | −110 words, states the thesis |
| 9 | **V31** — promote the anxiety chart | M | the best share artefact we have |
| 10 | **V25, V26** — the scorecard's judged half and the two moments | M | the densest app screen |
| 11 | Copy cuts (§5), V33, V40, V15 | S | — |

Steps 1–3 are one focused session and answer the complaint that prompted this
document.

---

## 8. What not to do

- **No stock photography, no AI portraits, no lifestyle imagery.** §1.1. This
  is the one item on the list that could cost the payment account.
- **No mascot, no character illustrations.** Rule 7 and §14 — a drawn character
  is a companion-app framing whatever the drawing looks like.
- **No decorating the live rep.** §05 rule 6 allows a timer, a waveform and a
  mission. V39.
- **No illustrating the legal clauses.** V14 adds a summary; it does not touch
  the text a reviewer or a disputing customer reads.
- **No third-party illustration pack.** Every one of them is authored for a
  light ground with soft shapes and rounded corners, which is the opposite of
  Arena on three axes at once.
- **No animated illustrations as loading states.** §02 — skeletons that match
  the shape of the arriving content, and nothing else.
- **No second accent colour.** If a diagram needs more than Ink-2, Ink-3 and
  one volt, the diagram is doing too much.

---

## What this audit did not cover

- The persona orb itself, which has its own audit in `AVATAR-AUDIT.md` and is
  the one part of the visual system that is finished.
- The onboarding run's *content* — what it asks and what the answers buy — which
  is `ONBOARDING-AUDIT.md`'s subject. V18–V20 are about how those questions
  look, not what they ask.
- Motion and sound in the live rep, which shipped as `site-audit-openai.md`'s
  P1 and is recorded there.


---

## What shipped — 3 September 2026

All forty findings are addressed. The work is in one new mark system, one new
figure set, one new capture pipeline, and edits across twenty-one files.

### The three systemic defects

| | What landed |
|---|---|
| **V1** | `lib/marks/registry.ts` maps ranks, dimensions, roster tiers, field tiers, library kinds, milestones and plans to glyph names, with eleven tests that walk the **real** unions — `RANKS`, `SUB_SCORE_LABELS`, `REJECTION_MILESTONES`, `PUBLIC_PLANS`, `FOCUS_PLANS` — so a renamed rank or a seventh dimension turns the suite red before it turns a screen blank. `components/marks/index.tsx` draws all forty-two on one 24-unit grid: butt caps, mitred joins, 1.5 stroke, no fill. `Record<MarkName, ReactNode>` makes a missing glyph a `tsc` failure. Colour is owned by the component — Ink-2 at rest, volt only through `current` — so the set cannot break Arena's one-accent rule on the screens it lands on |
| **V2** | **Reverted — see "What was taken back out" below.** The pipeline that would have closed it survives: `npm run shots` (`scripts/shots.ts`) drives the system Chrome over the DevTools protocol, signs in through the real dev door, and captures nine screens into `public/shots/` as WebP. No new dependency: Node 22 has a global `WebSocket`, and `legal-pdf.ts` already spawns the same binary. **It deliberately does not capture `/rep/[id]/live`** — that opens a WebRTC session and spends money, and a build artefact that bills the account is the wrong kind of automation. Nothing on the site embeds what it produces |
| **V3** | Five diagrams in `components/site/figures.tsx` — `AppShot`, `LoopDiagram`, `RepTimeline`, `SplitBar` — plus the plan matrix on `/pricing`. The eight prose-as-structure passages the audit counted are all now drawn |

### The findings

Every V-number is done. The ones worth naming individually:

- **V6** — the pipeline reaches the scorecard by clicking the top row of `/profile/history`, because that route carries a session id and there is no path meaning "my most recent graded rep". It also stamps the three once-ever teaching overlays as seen, since every run uses a fresh profile and the first capture came back as a modal over a blurred page.
- **V12** — the rep timeline shades the 2:30–3:00 wind-down and carries a key naming it. The two §05 numbers stay off the public site: it says *when* she is told to wind down, never the warmth she must be at to offer.
- **V21** — the rank rail is the four chevron marks, held one in volt, done ones in Ink-2, unreached ones muted, each over its own rule.
- **V22** — all twenty-five empty states carry a mark; `EmptyState` keeps the `Inbox` default only so a new call site is never broken.
- **V25, V26** — the judged six now read like the measured six, and both moments sit on the rep's own warmth trajectory with the moment marked. The scorecard reads the transcript for this, and nothing on the screen waits on it: fewer than two scored turns renders the old card.
- **V31** — the mean gap is set in the composite face beside the chart heading. A positive gap prints as a minus, because the number went *down* from what was feared and a leading `+` on good news reads backwards.
- **V40** — `/rep` is `adminUser()` + `notFound()`, matching `/admin/personas`. It is not deleted; `docs/M0.md` still refers to it.

### What was taken back out

**V2, V4, V5 and V16 shipped and were reverted the same day**, on the owner's
call that the screenshots did not look right where they had been put:

| Where | What was there | State now |
|---|---|---|
| `/` under the hero | A full-width band showing the Train screen | Gone. The hero is the recorded rep again, and the page moves straight to the scoring law |
| `/` in the scoring-law section | A real captured scorecard under `ScorecardArtifact` | Gone. `ScorecardArtifact` — the hand-built figure that argues §07 with a rejection scoring 87 — stands alone again, as it did before |
| `/` in the loop section | The Field screen | Gone |
| `/signup` | A side panel with a capture and three promises, desktop only | Gone. Sign-up is one centred column on every route again |

`AppShot` and its CSS were deleted with them rather than left as dead UI, and
`public/shots/` was removed because nothing referenced it. **`scripts/shots.ts`
and `npm run shots` were kept**: it is a standalone tool that captures the real
app on demand — useful for a merchant-of-record review pack or anything else
outside these pages — and one command regenerates the whole set. If it is not
wanted either, deleting the script, its `package.json` entry and the two
mentions in `CLAUDE.md` and `docs/README.md` removes it completely.

**§2's finding is therefore still open, and is now a decision rather than an
oversight**: the product is not shown anywhere on the site it is sold from.

### Four defects the work uncovered

None of these were in the audit. All four are fixed.

1. **The roster hid the top of the ladder.** `core-screens.tsx` held a hand-written array of three tiers named Receptive, Neutral and Ambiguous. `progression.ts`'s names had shifted up a rung when Tess took the bottom and this copy never moved — so every tier was drawn under the name of the tier below it, **and there was no section for level 4 at all, so Robin did not appear on the progression map** while Train was offering her as today's rep. The list is now built from `TOP_TIER` and named from `LEVEL_NAMES`; only the one-line descriptions are authored here.
2. **"1 days".** Four screens printed a streak as `${n} days`, and every one of them said "1 days" on somebody's first day — the day the streak matters most, on the screen a new account lands on. `dayCount` in `lib/data/rank.ts` is the one helper, used by all four.
3. **`10 / 10` broke across two lines** in the Train sidebar and read as a layout bug rather than as a fraction. `.stat--lg` no longer wraps inside itself.
4. **A spec citation in user copy.** `progress-screens.tsx` printed "(§07)" to the user (this was V33 in the audit); `app/rep/rep-client.tsx` prints `Scorecard (§07)` as a heading, which V40's gate now puts behind admin.

### Still owed

- **The mark set has not been seen by anyone but its author.** Every glyph was checked at 44px and 18px on a dark ground, and three were redrawn after that check — `dim-opening` twice, because a line breaking off a baseline reads as an angle bracket and a line crossing one reads as a negation; `bound-clinical`, because a plus and a slash together read as a six-pointed star until the strike was masked out of the glyph rather than laid over it. That is not the same as a second pair of eyes.
- **`npm run shots` is a macOS script.** It hard-codes the Chrome path the way `legal-pdf.ts` does, and it wants `cwebp` (`brew install webp`) or it leaves PNGs and says so. Its captures are of one seeded account — a Pro plan, ten reps, one graded rep against Nadia — so nothing in them is false, but they are not a composite of a typical user.
- **V2 is unresolved.** If the product should be shown on the public site at all, it needs a treatment that was not the one tried here.
