'use client'

/**
 * The persona tuning bench.
 *
 * Four things, in the order somebody actually uses them: pick a character,
 * move dials, see what the dials imply, take the result away as source.
 *
 * **Why the output is code and not a save button.** Rule 8 — content is
 * authored in the repo, reviewed in a pull request, and seeded. A flirtiness
 * ceiling is not decoration: it governs what a character will say, §16 leans
 * on that being reviewed, and a runtime write would move it without anybody
 * reading the diff. It also would not work — both voice paths resolve a
 * character through `getPersona()` against the TypeScript registry, and the
 * `personas` table is roster metadata. `scripts/seed-personas.ts` says it
 * plainly: *"The rep path still reads the registry."* A save button here would
 * look like it worked and change nothing about any rep.
 *
 * So there are two ways out of this screen instead:
 *
 *   **Copy the source** and paste it over the four layers in the persona file.
 *   That is the change that ships, and it arrives as a diff of numbers.
 *
 *   **Send to the live panel**, which writes a preset into the same
 *   `nerve.tuning.presets` key `app/rep/dev-panel.tsx` reads. Tune here, load
 *   it there mid-rep, hear it, come back. Same origin, same schema, no
 *   database.
 */

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  effectiveSharpness,
  GATE_NAMES,
  trackLabel,
  unlockedGates,
  type Expression,
  type Gated,
  type Personality,
  type RoomConfig,
  type Trajectory,
  type TrackId,
  type VoiceSelection,
} from '@/lib/voice/types'
import { changedDials, dialsToSource, type PersonaDials } from '@/lib/tuning/export'
import { editsBetween } from '@/lib/tuning/patch'
import { saveDials } from '@/app/admin/actions'
import { savePreset, toPreset } from '@/lib/tuning/store'
import { visualFor } from '@/lib/personas/visual'

export interface TunerPersona {
  slug: string
  name: string
  scene: string
  setting: string
  level: number
  track: TrackId
  voice: VoiceSelection
  want: string
  dials: PersonaDials
}

const EXPRESSIONS: Expression[] = ['playful', 'dry', 'earnest', 'flat']

/** The warmths the readout samples. 55 is where most gates sit. */
const SAMPLE_WARMTHS = [5, 20, 40, 55, 70, 85]

export function PersonaTuner({ personas, models, signedInAs }: { personas: TunerPersona[]; models: string[]; signedInAs: string }) {
  const [slug, setSlug] = useState(personas[0]?.slug ?? '')
  /** Edits, keyed by slug, so switching character does not lose work. */
  const [edits, setEdits] = useState<Record<string, PersonaDials>>({})
  const [model, setModel] = useState(models[0] ?? '')
  const [sent, setSent] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState<{ ok: boolean; message: string } | null>(null)
  const [saving, startSaving] = useTransition()
  const router = useRouter()

  const persona = personas.find((entry) => entry.slug === slug) ?? personas[0]
  const base = persona?.dials
  const dials = (persona && edits[persona.slug]) ?? base

  const source = useMemo(() => (dials ? dialsToSource(dials) : ''), [dials])
  const changed = useMemo(() => (base && dials ? changedDials(base, dials) : []), [base, dials])

  if (!persona || !dials || !base) return <main className="admin-page"><p>No personas in the registry.</p></main>

  const patch = (next: PersonaDials) => {
    setEdits((current) => ({ ...current, [persona.slug]: next }))
    setSent(null)
    setCopied(false)
    setSaved(null)
  }

  const setTrajectory = (key: keyof Trajectory, value: number) =>
    patch({ ...dials, trajectory: { ...dials.trajectory, [key]: value } })

  const setPersonality = (key: keyof Personality, value: number | Expression) =>
    patch({ ...dials, personality: { ...dials.personality, [key]: value } })

  const setGate = (name: keyof Gated, field: 'unlocksAt' | 'ceiling', value: number) =>
    patch({ ...dials, gated: { ...dials.gated, [name]: { ...dials.gated[name], [field]: value } } })

  const setRoom = (key: keyof RoomConfig, value: number) =>
    patch({ ...dials, room: { ...dials.room, [key]: value } })

  const revert = () => {
    setEdits((current) => {
      const next = { ...current }
      delete next[persona.slug]
      return next
    })
    setSent(null)
    setCopied(false)
    setSaved(null)
  }

  const copy = () => {
    void navigator.clipboard?.writeText(source).then(() => setCopied(true)).catch(() => setCopied(false))
  }

  /**
   * Write the moved dials into the persona file.
   *
   * Only what moved is sent — `editsBetween` produces the same dotted paths the
   * "what changed" line shows — so the action rewrites those lines and nothing
   * else in the file is opened.
   *
   * On success the local edit is dropped and the route refreshed, so `base`
   * comes back as what is now on disk. Without that, the panel would keep
   * showing the same dials as "moved" against a file that already has them.
   */
  const save = () => {
    const edits = editsBetween(base, dials)
    startSaving(async () => {
      const result = await saveDials(persona.slug, edits)
      setSaved(result)
      if (!result.ok) return
      setEdits((current) => {
        const next = { ...current }
        delete next[persona.slug]
        return next
      })
      router.refresh()
    })
  }

  /**
   * Hand the tuning to the live panel.
   *
   * A full `Persona` is what a preset holds, and this screen only has four
   * layers of one — so the rest is filled from what the server sent and the
   * contract is left empty. The live panel replaces the whole persona from a
   * preset, so an empty contract would silence her; it is spelled out in the
   * preset name instead, and the panel's own persona is the one that runs
   * unless somebody loads this deliberately.
   */
  const sendToLivePanel = () => {
    const name = `${persona.slug} · from admin`
    savePreset(toPreset(name, {
      persona: {
        slug: persona.slug,
        name: persona.name,
        scene: persona.scene,
        level: persona.level,
        track: persona.track,
        voice: persona.voice,
        want: persona.want,
        contract: '',
        ...dials,
      } as never,
      silenceMs: 600,
      model,
      voiceId: null,
    }))
    setSent(name)
  }

  const visual = visualFor(persona.name, persona.slug)

  return (
    <main className="admin-page">
      <header className="admin-head">
        <div>
          <span className="label">Persona tuning · {signedInAs}</span>
          <h1 className="display-lg">The bench</h1>
        </div>
        <p className="admin-note">
          Dials only. The contract, her want and her scene beats are prose and are edited in the file.
          Nothing here writes to the database — the rep path reads the TypeScript registry, so the
          change that ships is the paste at the bottom.
        </p>
      </header>

      <nav className="admin-roster" aria-label="Characters">
        {personas.map((entry) => {
          const dirty = !!edits[entry.slug]
          const hue = visualFor(entry.name, entry.slug)
          return (
            <button
              key={entry.slug}
              className={`admin-chip${entry.slug === persona.slug ? ' is-on' : ''}`}
              style={{ '--chip-hue': hue.core } as React.CSSProperties}
              onClick={() => setSlug(entry.slug)}
            >
              <i aria-hidden="true" />
              <span>{entry.name}</span>
              <small>L{entry.level}</small>
              {dirty ? <em title="Unsaved edits">•</em> : null}
            </button>
          )
        })}
      </nav>

      <div className="admin-grid">
        <div className="admin-col">
          <section className="admin-card">
            <header>
              <h2 className="display-md" style={{ color: visual.core }}>{persona.name}</h2>
              <span className="label">{persona.setting} · Level {persona.level} · {trackLabel(persona.track)}</span>
            </header>
            <p className="admin-want">She would rather be <strong>{persona.want}</strong>.</p>
          </section>

          <Section title="Layer 1 — trajectory" sub="Where warmth starts and how it moves.">
            <Slider label="start" min={-20} max={100} step={1} value={dials.trajectory.start} onChange={(v) => setTrajectory('start', v)} />
            <Slider label="startJitter" min={0} max={30} step={1} value={dials.trajectory.startJitter} onChange={(v) => setTrajectory('startJitter', v)} />
            <Slider label="gain" min={0} max={3} step={0.05} value={dials.trajectory.gain} onChange={(v) => setTrajectory('gain', v)} />
            <Slider label="decay" min={0} max={4} step={0.05} value={dials.trajectory.decay} onChange={(v) => setTrajectory('decay', v)} />
            <Slider label="decayPerTurn" min={0} max={3} step={0.05} value={dials.trajectory.decayPerTurn} onChange={(v) => setTrajectory('decayPerTurn', v)} />
            <Slider label="maxGainPerTurn" min={0} max={12} step={0.5} value={dials.trajectory.maxGainPerTurn} onChange={(v) => setTrajectory('maxGainPerTurn', v)} />
            <Slider label="sessionCeiling" min={0} max={100} step={1} value={dials.trajectory.sessionCeiling} onChange={(v) => setTrajectory('sessionCeiling', v)} />
            <Slider label="hardCeiling" min={0} max={100} step={1} value={dials.trajectory.hardCeiling} onChange={(v) => setTrajectory('hardCeiling', v)} />
          </Section>

          <Section title="Layer 2 — personality" sub="Who she is. None of it moves with warmth.">
            <Slider label="sharpness" min={0} max={100} step={1} value={dials.personality.sharpness} onChange={(v) => setPersonality('sharpness', v)} />
            <Slider label="sharpnessLowWarmthBoost" min={0} max={50} step={1} value={dials.personality.sharpnessLowWarmthBoost} onChange={(v) => setPersonality('sharpnessLowWarmthBoost', v)} />
            <Slider label="humour" min={0} max={100} step={1} value={dials.personality.humour} onChange={(v) => setPersonality('humour', v)} />
            <Slider label="talkativeness" min={0} max={100} step={1} value={dials.personality.talkativeness} onChange={(v) => setPersonality('talkativeness', v)} />
            <Slider label="patience" min={0} max={100} step={1} value={dials.personality.patience} onChange={(v) => setPersonality('patience', v)} />
            <Slider label="distraction" min={0} max={100} step={1} value={dials.personality.distraction} onChange={(v) => setPersonality('distraction', v)} />
            <Slider label="signalClarity" min={0} max={100} step={1} value={dials.personality.signalClarity} onChange={(v) => setPersonality('signalClarity', v)} />
            <label className="admin-select">
              <span>expression</span>
              <select value={dials.personality.expression} onChange={(event) => setPersonality('expression', event.target.value as Expression)}>
                {EXPRESSIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
          </Section>
        </div>

        <div className="admin-col">
          <Section title="Layer 3 — gated" sub="Threshold and ceiling. Never a base value — that would be a second warmth system.">
            {GATE_NAMES.map((name) => {
              const gate = dials.gated[name]
              const hasCeiling = 'ceiling' in gate
              return (
                <div key={name} className="admin-gate">
                  <span className="label">{name}</span>
                  <Slider label="unlocksAt" min={0} max={120} step={1} value={gate.unlocksAt} onChange={(v) => setGate(name, 'unlocksAt', v)} />
                  {hasCeiling ? <Slider label="ceiling" min={0} max={100} step={1} value={(gate as { ceiling: number }).ceiling} onChange={(v) => setGate(name, 'ceiling', v)} /> : null}
                </div>
              )
            })}
          </Section>

          <Section title="Layer 4 — room" sub="Acoustics, and the bed if there is one.">
            <Slider label="bedDb" min={-70} max={-10} step={1} value={dials.room.bedDb} onChange={(v) => setRoom('bedDb', v)} />
            <Slider label="reverbWet" min={0} max={0.4} step={0.01} value={dials.room.reverbWet} onChange={(v) => setRoom('reverbWet', v)} />
            <p className="admin-fine">
              bed <code>{dials.room.bed ?? 'null'}</code> · reverbIr <code>{dials.room.reverbIr ?? 'null'}</code> — both are
              scene ids, edited in the file.
            </p>
          </Section>

          <Section title="What the dials imply" sub="Computed from the values above, not measured from a rep.">
            <div className="admin-readout">
              <div className="admin-readout__row admin-readout__row--head">
                <span>warmth</span><span>eff. sharpness</span><span>gates open</span>
              </div>
              {SAMPLE_WARMTHS.map((warmth) => {
                const open = unlockedGates(dials.gated, warmth)
                return (
                  <div key={warmth} className="admin-readout__row">
                    <span className="data">{warmth}</span>
                    <span className="data">{effectiveSharpness(dials.personality, warmth).toFixed(1)}</span>
                    <span className="admin-gates">{open.length ? open.map((name) => <i key={name}>{name}</i>) : <em>none</em>}</span>
                  </div>
                )
              })}
            </div>
          </Section>
        </div>
      </div>

      <section className="admin-card admin-export">
        <header>
          <h2 className="display-md">{changed.length === 0 ? 'Nothing has moved' : `${changed.length} dial${changed.length === 1 ? '' : 's'} moved`}</h2>
          <span className="label">
            {changed.length === 0
              ? `${persona.name} matches lib/personas/${persona.slug}.ts`
              : changed.join(' · ')}
          </span>
        </header>

        {/* The model rides on the preset rather than on the persona: which arm
            answers is a session setting, and writing a model id into a
            character file would make it one of her traits. */}
        <label className="admin-select">
          <span>model (carried to the live panel)</span>
          <select value={model} onChange={(event) => setModel(event.target.value)}>
            {models.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>

        <div className="admin-actions">
          <button className="arena-button arena-button--primary" onClick={save} disabled={changed.length === 0 || saving}>
            {saving ? 'Saving…' : `Save to ${persona.slug}.ts`}
          </button>
          <button className="arena-button arena-button--secondary" onClick={sendToLivePanel} disabled={changed.length === 0}>
            Try it in a rep
          </button>
          <button className="arena-button arena-button--ghost" onClick={revert} disabled={changed.length === 0}>Revert</button>
        </div>

        {saved ? <p className={saved.ok ? 'admin-fine admin-fine--ok' : 'form-error'} role="status">{saved.message}</p> : null}

        {sent ? (
          <p className="admin-fine">
            Saved as <code>{sent}</code>. Start a rep, press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd> and load it from
            the presets list. It carries dials only — her contract comes from the registry, as it does in a real rep.
          </p>
        ) : null}

        {/* Kept, demoted. Saving is the normal way out of this screen; the
            source is here for the times you want to put the change somewhere
            this machine cannot write to. */}
        <details className="admin-source-toggle">
          <summary>Show it as source</summary>
          <pre className="admin-source"><code>{source}</code></pre>
          <button className="arena-button arena-button--ghost arena-button--sm" onClick={copy}>{copied ? 'Copied' : 'Copy source'}</button>
        </details>
      </section>

    </main>
  )
}

function Section({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <section className="admin-card">
      <header>
        <h2 className="display-md">{title}</h2>
        <span className="label">{sub}</span>
      </header>
      <div className="admin-controls">{children}</div>
    </section>
  )
}

function Slider({ label, min, max, step, value, onChange }: { label: string; min: number; max: number; step: number; value: number; onChange: (value: number) => void }) {
  return (
    <label className="admin-slider">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <strong className="data">{value}</strong>
    </label>
  )
}
