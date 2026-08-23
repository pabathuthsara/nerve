# The room

Ambient and reverb configuration. Every number here is meant to be tuned by
ear — that is why they are config rather than constants inside the audio graph.

> **The procedural room is currently OFF.** Convolution put her in a room and,
> on ordinary laptop speakers, made her harder to understand — smeared and
> echoey at exactly the moment somebody is straining to hear a stranger.
> Intelligibility beats atmosphere: a rep the user cannot follow is not a rep.
> Her voice now reaches the sink dry, through the null-scene path both adapters
> already had.
>
> Nothing below has been deleted or retuned. `roomAcousticsEnabled()` in
> `lib/audio/scenes.ts` is the single switch both adapters read, and
> `NEXT_PUBLIC_ROOM_ACOUSTICS=on` brings all of it back. Recorded room beds are
> planned as audio files; they are a different mechanism and will not restore
> the convolver.

## The graph (round 10 rebuild)

The bed used to be mixed into her output bus, which meant it only played while
she was speaking. That is backwards: the bed exists to fill the silence BETWEEN
turns, where dead air reads as "the app is broken".

```
ambient layers ──► ambientBus ──► ambientDuck ──────────────► destination
one-shots ───────► shotBus ──────┤        └─► reverbSend ──┐
her voice ──► input ──► dry ────────────────────────────────► destination
                    └─► wetSend ──► convolver ──► reverbOut ─► destination
```

Two independent chains. The ambient sources start once when the session ARMS
and stop once when it ENDS; nothing in the agent speech path can start, stop or
gate them. The only thing her speech does is **duck** the bed by 2.5 dB over
150 ms, releasing over 400 ms. Duck, never mute — muting would reintroduce the
original bug in a subtler form.

Verify by ear: mute the mic, say nothing for ten seconds, and the room must
still be there.

`lib/audio/audio.test.ts` pins this with a recording stub of WebAudio: it walks
the graph and asserts every looping ambient source reaches the destination
**without** passing through her input bus. That was a wiring fault, and wiring
is exactly what a pure maths test cannot see.

## The bed is currently off

`persona.room.bed` is `null` on Nadia, and null means **no ambient bed and no
one-shots** — no sources, no timer, nothing scheduled. Recorded beds land here
later; a scene id turns it back on.

Two reasons, and the second is the one that matters.

The bed was audible to the microphone and read as speech. That is the same
fault that made headphones mandatory (`M0.md`, fifth finding): her voice was
rendered through this WebAudio graph rather than a media element, so the
browser's echo canceller could not see it — and it could not see the bed either.
Every page turn and floorboard creak was a candidate user turn.

**Round 12 changed the routing underneath this.** The graph now ends at a
`MediaStreamAudioDestinationNode` played by an unmuted `<audio>` element, so
everything rendered here — her voice, the bed and the one-shots — is somewhere
the echo canceller can reach. That removes the reason the bed is off. It does
not by itself justify turning it back on: nobody has yet run a rep on the new
routing and confirmed that `steeringItemsSent` matches the user-turn count.
Turn the bed on once a run shows that, not before, and turn it on by itself so
a regression has one candidate cause.

**The reverb stays on.** Acoustics are the shape of the space and are applied
to her voice; the bed is sound playing *into* the room. Only the second can be
mistaken for someone speaking. She still sounds four feet away in a small
absorbent room; the room is simply silent.

Switching the bed off also separated something that had been conflated: `bed`
was doubling as both the ambient scene id and the word the persona compiler
drops into "a stranger in a bookshop". `sceneId(room)` now supplies the second,
so a silent room does not make her forget where she is standing.

## Levels — one absolute number

`masterDb` is the bed's absolute level in dBFS and is **the only absolute
number** in a scene. Every layer and one-shot `levelDb` is relative to it.

That was not true before round 10, and it made the bed inaudible. Layer levels
were absolute (−44, −46) and were then multiplied by an absolute `masterDb`
(−40), compounding to **−95.7 dBFS** — about 56 dB below the target the spec
states. The bed never played in any session. What could be heard was the
one-shots, which reached the speakers through her voice path and so skipped the
trim entirely; that is why ambience seemed to appear only when she spoke.

The noise buffer is also normalised to unity RMS. Brownian noise falls out of a
leaky integrator with no predictable amplitude — it measured −13.8 dBFS — and
that unknown offset sat underneath every dB value in `scenes.ts`, so none of
them meant what they said. Normalised, `dbToGain(levelDb)` produces exactly
`levelDb` dBFS.

Bookshop now lands at **−37.9 dBFS** with one-shots 6–14 dB above the floor.
`lib/audio/audio.test.ts` asserts the bed stays inside an audible window, so
this cannot regress silently.

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
