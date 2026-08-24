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

## Her voice plays through the media element, not through the graph

**With no room, the `<audio>` element is the playback path and it is unmuted.**
That is not a detail — it is what lets the browser's echo canceller work. The
canceller cancels what it is *playing*, and it does not know about audio a
WebAudio graph renders. Route her through the graph and her own voice comes
back in on the microphone, server VAD commits it as a user turn, the response
gate creates a second reply on top of the one still speaking, and the overlap
guard cancels it.

M0's sixth finding measured the first half of that: 24 VAD triggers for 19 real
turns, five of them her own voice. The second half showed up in the stored
transcripts as agent turns with impossible durations — *"Catching my breath
between sets right now."*, seven words, **0.22 seconds** — replies that were
generated, cancelled before their audio buffer opened, and recorded anyway.

Two fixes, both in place:

- `attachRemote` plays her through the element when there is no room, and only
  routes into WebAudio when a room is actually going to convolve something. The
  analyser still taps the dry stream, through a zero-gain node into the
  destination so the waveform cannot quietly stop being pulled.
- The transcript-delta path no longer marks her as speaking. `agent.speech.start`
  and the turn boundary come from `output_audio_buffer.started` alone, and a
  reply whose buffer never opened is **dropped rather than committed** — a line
  the user never heard is worse than a gap, because the scorer reads these
  turns and so does the user. Dropping is reported as `agent.unheard` so it can
  never become a silent total loss.

**Turning procedural acoustics back on re-introduces the echo risk**, because
convolution has to happen in the graph. That is one more argument for recorded
beds over convolution on her voice.

## Barge-in: what she said, and what she remembers saying

Echo cancellation stops her voice being *heard* as a user turn. It does nothing
about the other half, which went unnoticed for longer: when a barge-in really
does cut her off, the words she generated after that instant reached nobody.

Two things now happen at that moment, and they are separate because they fix
separate faults.

**The transcript is cut back to what played.** The translator used to drop a
reply only when its audio never opened at all — 200ms of audio satisfied that,
so a reply the user heard one syllable of was committed in full to the
transcript, the warmth engine and `/api/grade`. `lib/voice/truncate.ts` clips it
proportionally against an estimate of how long the whole line would have taken,
and `snapToWordBoundary` guarantees the cut never lands mid-word. A cut
mid-*sentence* is honest — the user really did interrupt there. A cut mid-*word*
is a bug, and neither adapter is allowed to produce one. Reported as
`agent.truncated`.

**Her own history is cut back with it.** `conversation.item.truncate` is sent
with the measured playhead. Without it the model's conversation still contains
the whole sentence, so her next line continues from a thought the user received
one word of — which is what reads, live, as her starting to say something and
then saying something else. Server VAD does truncate on its own, but on the send
side: it knows what left the server, not what left the speaker. Our playhead is
never later than the server's, and truncating to an earlier point is always
legal, so this is a refinement rather than a fight.

The estimate is deliberately conservative. `WORDS_PER_SECOND` is set a little
slow, which over-estimates how long the full line would have taken and therefore
keeps slightly *more* text — the error that keeps a word the user did hear is far
cheaper than the error that deletes one.

The ElevenLabs arm has had this since round 8, sample-accurate from
`/with-timestamps` alignment. The two adapters now share the string arithmetic in
`lib/voice/truncate.ts`; only the precision of the playhead differs.

## Timing is a character trait

Warmth changed everything she said and nothing about how long she took, which is
backwards — people read interest from timing before they read it from words.

`lib/warmth/timing.ts` owns three consequences, all pure:

- **`replyDelayMs`** — a real pause before a cold reply, about the length of a
  glance up from a phone, tapering to nothing by warmth 60. Held inside the
  response gate with `inFlight` already set, so a turn arriving during the pause
  coalesces exactly as one arriving mid-generation would and the delay can never
  produce two replies.
- **`interruptsAt`** — §05 stays the ceiling: levels 1–4 never interrupt, at any
  warmth. Above that, interruption becomes a sign of engagement rather than a
  property of the rung. A bored stranger does not cut across you. This also
  removes the worst version of the barge-in problem, because at low warmth —
  where a nervous user is most likely to make noise they did not mean as speech —
  she is no longer listening for a gap to jump into.
- **`paceFor`** — a few percent, and no more. Past that it stops reading as
  engagement and starts reading as a character whose voice changes.

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
