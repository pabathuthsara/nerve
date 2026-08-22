# The room

Ambient and reverb configuration. Every number here is meant to be tuned by
ear — that is why they are config rather than constants inside the audio graph.

## Where things live

| Path | Contains |
|---|---|
| `lib/audio/types.ts` | The per-scenario schema, plus `RoomControls` (the live tuning surface) |
| `lib/audio/scenes.ts` | Presets. `BOOKSHOP` is tuned; `BAR` is a stub proving the schema generalises |
| `lib/audio/impulse.ts` | Impulse-response synthesis. Pure maths, no AudioContext |
| `lib/audio/schedule.ts` | One-shot timing and weighted selection. Pure |
| `lib/audio/engine.ts` | `Room` — the WebAudio graph |

Acoustics are a **persona field** (`persona.acoustics`), not a global. A bar is
loud and reflective; this bookshop is quiet and dead. The bookshop is simply the
first one — a second scenario is a config row, not a rewrite.

Nothing uses sample assets. A room is a handful of numbers, so there is no asset
pipeline to licence, host or version.

## Tuning live

Start a rep. Three sliders appear under the timer once her track arrives:

- **ambient bed** — dB trim on the whole bed (`setAmbientLevelDb`)
- **reverb wet** — 0–40% wet share on her voice (`setWetMix`)
- **one-shot gap** — seconds between scheduled events (`setOneShotInterval`)

Changes apply immediately; nothing needs a restart.

## Why the bookshop is set the way it is

**The bed is a noise floor, not an atmosphere.** Quiet is not silence, and
digital silence is the giveaway that there is no room. So the continuous layer
is featureless only — faint HVAC hum plus muffled street traffic through glass,
around −40 dB, far quieter than a café.

**Nothing distinctive is in the loop.** A page turn or a floorboard creak inside
a looping bed is recognisable on its second pass and stops being scenery, which
is worse for immersion than having no page turn at all. Everything with
character is a randomly scheduled one-shot: page turn, floorboard creak, distant
door, book set down, shelf shift. Sparse, one every 20–40 s, randomised.

**A bookshop is acoustically dead.** Shelves packed with paper are excellent
broadband absorbers, so a hall or room preset is actively wrong — those model a
space where sound survives. The profile is:

| Field | Bookshop | Why |
|---|---|---|
| `rt60Seconds` | 0.3 | Very short decay |
| `earlyReflectionRatio` | 0.85 | Mostly early reflections, almost no tail |
| `dampingHz` | 6000 | Paper eats treble |
| `wetMix` | 0.10 | Subtle; past ~0.15 it reads as an effect |
| `preDelayMs` | 12 | About four feet away across a rug |

The goal is that she sounds four feet away in a small absorbent room — not
inside your head, and not in a cathedral.

**Because the room is quiet, a dry voice is MORE obvious here, not less.** There
is no background masking it. This is the scenario where the processing matters
most, which is the opposite of the intuition that a quiet scene needs less work.

## A note on the RT60 numbers

`rt60Seconds` describes the **tail envelope**. The *audible* decay of the
bookshop is shorter than 0.3 s because 85% of the energy sits in early
reflections — that is physically correct and the tests assert both properties
separately. If you want to hear the tail in isolation, drop
`earlyReflectionRatio` toward 0.05 temporarily.
