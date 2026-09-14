# UI and UX audit — 14 September 2026

This pass improves the existing Arena interface. It keeps the palette, typefaces,
2px corners, hairlines, persona identity ramps, routes, entitlements, and backend
contracts. No API handlers, Server Actions, database code, prompts, scoring rules,
billing rules, or dependencies were changed.

## What changed

- Public navigation keeps every section available on narrow phones and adds a
  direct log-in link for returning users. Both shells have a skip link; the app
  navigation exposes its current page, including review and interview setup views.
- Three-track navigation uses three columns. Training portraits have their own
  space above the name and actions, with smaller mobile framing and a compact
  desktop layout. Mobile persona details stack the portrait and name instead of
  breaking names into fragments. Their sticky actions align with the sheet.
- Loading buttons retain their width and accessible name. Inputs, textareas,
  selects, and date-of-birth errors expose their descriptions and invalid state.
  Password controls no longer become part of the field's accessible name.
- Tabs support arrows, Home, End, and a single tab stop. Selects expose the active
  option on the focused combobox and skip disabled options at either end.
- Sheets make their background inert, trap focus among visible enabled controls,
  and restore focus without moving the page. Only the handle starts a swipe;
  scrolling or selecting text in the body does not drag the sheet. Reduced motion
  removes the slide/scale transition. Status toasts remain outside the inert area.
- Pricing periods fit on narrow phones. Settings, skeletons, and admin panels
  shrink to their container. The admin behavior table scrolls within a keyboard
  focusable region. History's persona filter is available at every width and its
  empty state offers a clear-filters action.
- Field rating controls have larger mobile targets; outcome/reason controls expose
  selection. Small-screen inputs use 16px text. Supporting copy and inactive
  mobile navigation use the existing more readable secondary text color.
- Interview custom questions keep focus while edited. Clipboard failure gives a
  recovery message and pasted descriptions honor the existing length limit.
  Setup transitions retain their pending state until their existing save promise
  settles, and connection failures produce an inline error.
- The texting composer stays within the viewport, grows up to 180px, and wraps
  long content. Enter during IME composition does not send a message.

## Personas

All 14 authored visual identities were reviewed in a separate browser gallery
using the real component and renderer. Identity hues and geometry were retained.
Large filled portraits omit the decorative initial once the rendering is ready.

The CSS fallback is visible from the initial render until the first WebGL frame.
Rendering sleeps when all portraits are offscreen or reduced-motion portraits
are unchanged, and resumes on visibility, sizing, or state changes. Smoothing
and rotation now account for elapsed frame time, so different portrait frame
rates do not change their response speed. Reduced motion also disables parallax.

Context loss disposes the old instances and renderer. One recovery attempt is
allowed per mounted component; a repeated loss leaves a stable fallback rather
than repeatedly rebuilding the renderer.

Measured browser checks:

- All 14 portraits rendered, including low and high warmth.
- Reduced motion: zero new animation frames during a 700ms idle sample.
- Normal motion: 24 frames while visible, zero while hidden, then 25 after
  returning to view in the sampled intervals.
- Forced WebGL loss: all 14 displayed fallback, then all 14 recovered.
- A second forced loss: all 14 stayed in fallback after the retry window.

## Coverage and verification

Browser review covered public pages and legal pages; log-in, sign-up, password
recovery, and the public onboarding sequence; training, roster, field, library,
progress, baseline, profile, history, settings and subscription; interview home,
setup, interviewer selection, round selection and credits; texting inbox, all
four conversation surfaces and a debrief; and all three admin pages.

Detail checks included the four available roster pages, dating and interview
briefs, each library content layout, and a stored session's result, scorecard,
and transcript. The main matrix used 320px, 768px, and 1440px viewports, with
additional 375px checks and a final narrow-screen pass after fixes. Loading
skeletons were allowed to settle before the authenticated layout measurements.
The final overflow check accounts for the actual scrollbar-reduced content width.

Interaction checks exercised the public onboarding steps, question editing,
tab and select keyboard navigation, dialog focus containment and restoration,
and an unsent multiline texting draft. Existing saved settings, questions,
messages, and billing choices were not submitted or changed by these checks.

Validation: TypeScript, ESLint, the unit suite (2,399 passing, one existing skip),
and the isolated production build passed. The build used `.next-check` while
leaving the running development server's `.next` directory intact.

Live paid voice sessions, microphone hardware, checkout, destructive account
operations, and every possible account entitlement/outcome combination were not
exercised. Those paths received source review and the existing automated tests;
this audit is not a claim of physical-device or end-to-end payment certification.
No deployment was performed.
