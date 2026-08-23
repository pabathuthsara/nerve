'use client'

/**
 * The tuning panel.
 *
 * DEV ONLY. Gated on NEXT_PUBLIC_DEV_TOOLS at the call site *and* here, and it
 * renders nothing at all when the flag is off, so a production build ships an
 * inert component rather than a hidden feature. This is instrumentation for us;
 * it is not a user feature and it must never become one.
 *
 * Ctrl+Shift+D toggles it. Collapsed by default, because a panel that is open
 * by default is a panel someone tunes by accident.
 *
 * Everything here writes into the TuningStore, which the warmth engine and the
 * steering composer read on EVERY turn rather than at connect. That is the
 * whole point: slide sharpness up and her next reply is different, without a
 * restart and without losing the conversation you were using to judge it.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  activePreset,
  deletePreset,
  devToolsEnabled,
  listPresets,
  parsePreset,
  savePreset,
  toPreset,
  type TuningPreset,
  type TuningStore,
} from '@/lib/tuning/store'
import {
  GATE_NAMES,
  effectiveSharpness,
  trackLabel,
  unlockedGates,
  type Expression,
  type Persona,
} from '@/lib/voice/types'
import type { WarmthBand } from '@/lib/warmth/bands'
import type { WarmthEvent } from '@/lib/warmth/engine'
import type { LatencyStats } from '@/lib/metrics/latency'
import type { RoomControls } from '@/lib/audio/types'

/** What the panel shows about the rep in progress. Read-only. */
export interface DevReadout {
  warmth: number
  band: WarmthBand
  /** The most recent applied warmth event — delta, source and reason. */
  lastEvent: WarmthEvent | null
  latency: LatencyStats
  /** Present only on an assembled adapter. */
  stages: { label: string; median: number; p90: number }[]
}

export interface DevPanelProps {
  store: TuningStore
  readout: DevReadout
  /** Live acoustics, once the session has armed. */
  room: RoomControls | null
  models: readonly string[]
  voices: readonly { id: string; label: string }[]
}

const EXPRESSIONS: Expression[] = ['playful', 'dry', 'earnest', 'flat']

export function DevPanel(props: DevPanelProps) {
  // Belt and braces with the call site. A component that can only be rendered
  // behind a flag is safer than one that merely usually is.
  if (!devToolsEnabled()) return null
  return <Panel {...props} />
}

function Panel({ store, readout, room, models, voices }: DevPanelProps) {
  const [open, setOpen] = useState(false)
  const [, force] = useState(0)
  const [presets, setPresets] = useState<TuningPreset[]>([])
  const [presetName, setPresetName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Re-render on every store change; the store is the source of truth and
  // React is only a view of it.
  useEffect(() => store.subscribe(() => force((n) => n + 1)), [store])
  useEffect(() => setPresets(listPresets()), [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        setOpen((value) => !value)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const state = store.get()
  const persona = state.persona

  const applyPreset = useCallback(
    (preset: TuningPreset) => {
      store.set(preset.state)
    },
    [store],
  )

  if (!open) {
    return (
      <div style={collapsed}>
        dev tools — <kbd style={kbd}>Ctrl</kbd>+<kbd style={kbd}>Shift</kbd>+<kbd style={kbd}>D</kbd>
      </div>
    )
  }

  return (
    <aside style={panel}>
      <header style={header}>
        <strong style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Tuning — {persona.name}
        </strong>
        <button style={btn} onClick={() => setOpen(false)}>close</button>
      </header>

      {/* -------------------------------------------------- readout */}
      <Section title="Live">
        <Readout label={trackLabel(persona.track).toLowerCase()}
          value={`${readout.warmth.toFixed(1)}  ${readout.band}`} />
        <Readout
          label="last delta"
          value={
            readout.lastEvent
              ? `${signed(readout.lastEvent.delta)} · ${readout.lastEvent.source} · ${readout.lastEvent.reason}`
              : '—'
          }
        />
        <Readout
          label="intimacy / overreach"
          value={
            readout.lastEvent?.intimacy === null || readout.lastEvent === null
              ? '—'
              : `${readout.lastEvent.intimacy} vs ${Math.round(readout.lastEvent.warmthBefore)} = ${signed(
                  (readout.lastEvent.intimacy ?? 0) - readout.lastEvent.warmthBefore,
                )}`
          }
        />
        <Readout
          label="effective sharpness"
          value={`${effectiveSharpness(persona.personality, readout.warmth).toFixed(1)} (base ${persona.personality.sharpness})`}
        />
        <Readout
          label="gates open"
          value={unlockedGates(persona.gated, readout.warmth).join(', ') || 'none'}
        />
        <Readout
          label="latency med / p90"
          value={
            readout.latency.medianMs === null
              ? '—'
              : `${readout.latency.medianMs}ms / ${readout.latency.p90Ms}ms`
          }
        />
        {readout.stages.map((stage) => (
          <Readout key={stage.label} label={stage.label} value={`${stage.median}ms / ${stage.p90}ms`} />
        ))}
      </Section>

      {/* -------------------------------------------------- trajectory */}
      <Section title="Trajectory — how warmth moves">
        <Slider label="start" min={-20} max={100} step={1} value={persona.trajectory.start}
          onChange={(v) => store.setLayer('trajectory', { start: v })} />
        <Slider label="startJitter" min={0} max={30} step={1} value={persona.trajectory.startJitter}
          onChange={(v) => store.setLayer('trajectory', { startJitter: v })} />
        <Slider label="gain" min={0} max={3} step={0.05} value={persona.trajectory.gain}
          onChange={(v) => store.setLayer('trajectory', { gain: v })} />
        <Slider label="decay" min={0} max={4} step={0.05} value={persona.trajectory.decay}
          onChange={(v) => store.setLayer('trajectory', { decay: v })} />
        <Slider label="decayPerTurn" min={0} max={3} step={0.05} value={persona.trajectory.decayPerTurn}
          onChange={(v) => store.setLayer('trajectory', { decayPerTurn: v })} />
        <Slider label="maxGainPerTurn" min={0} max={12} step={0.5} value={persona.trajectory.maxGainPerTurn}
          onChange={(v) => store.setLayer('trajectory', { maxGainPerTurn: v })} />
        <Slider label="sessionCeiling" min={0} max={100} step={1} value={persona.trajectory.sessionCeiling}
          onChange={(v) => store.setLayer('trajectory', { sessionCeiling: v })} />
        <Slider label="hardCeiling" min={0} max={100} step={1} value={persona.trajectory.hardCeiling}
          onChange={(v) => store.setLayer('trajectory', { hardCeiling: v })} />
      </Section>

      {/* -------------------------------------------------- personality */}
      <Section title="Personality — who she is">
        <Slider label="sharpness" min={0} max={100} step={1} value={persona.personality.sharpness}
          onChange={(v) => store.setLayer('personality', { sharpness: v })} />
        <Slider label="sharpnessLowWarmthBoost" min={0} max={50} step={1}
          value={persona.personality.sharpnessLowWarmthBoost}
          onChange={(v) => store.setLayer('personality', { sharpnessLowWarmthBoost: v })} />
        <Slider label="humour" min={0} max={100} step={1} value={persona.personality.humour}
          onChange={(v) => store.setLayer('personality', { humour: v })} />
        <Slider label="talkativeness" min={0} max={100} step={1} value={persona.personality.talkativeness}
          onChange={(v) => store.setLayer('personality', { talkativeness: v })} />
        <Slider label="patience" min={0} max={100} step={1} value={persona.personality.patience}
          onChange={(v) => store.setLayer('personality', { patience: v })} />
        <Slider label="distraction" min={0} max={100} step={1} value={persona.personality.distraction}
          onChange={(v) => store.setLayer('personality', { distraction: v })} />
        <Slider label="signalClarity" min={0} max={100} step={1} value={persona.personality.signalClarity}
          onChange={(v) => store.setLayer('personality', { signalClarity: v })} />
        <Select label="expression" value={persona.personality.expression} options={EXPRESSIONS}
          onChange={(v) => store.setLayer('personality', { expression: v as Expression })} />
      </Section>

      {/* -------------------------------------------------- gated */}
      <Section title="Gated — what warmth unlocks">
        {GATE_NAMES.map((name) => {
          const gate = persona.gated[name]
          const hasCeiling = 'ceiling' in gate
          return (
            <div key={name} style={{ marginBottom: 6 }}>
              <div style={{ color: '#9DA396', fontSize: 11 }}>{name}</div>
              <Slider label="unlocksAt" min={0} max={120} step={1} value={gate.unlocksAt}
                onChange={(v) => store.setGate(name, { unlocksAt: v })} />
              {hasCeiling && (
                <Slider label="ceiling" min={0} max={100} step={1}
                  value={(gate as { ceiling: number }).ceiling}
                  onChange={(v) => store.setGate(name, { ceiling: v } as Partial<Persona['gated'][typeof name]>)} />
              )}
            </div>
          )
        })}
      </Section>

      {/* -------------------------------------------------- room */}
      <Section title="Room">
        <Slider label="bedDb" min={-70} max={-10} step={1} value={persona.room.bedDb}
          onChange={(v) => { store.setLayer('room', { bedDb: v }); room?.setAmbientLevelDb(v) }} />
        <Slider label="reverbWet" min={0} max={0.4} step={0.01} value={persona.room.reverbWet}
          onChange={(v) => { store.setLayer('room', { reverbWet: v }); room?.setWetMix(v) }} />
        <Slider label="one-shot min (s)" min={2} max={90} step={1}
          value={persona.room.oneShotIntervalMs[0] / 1000}
          onChange={(v) => {
            const range: [number, number] = [v * 1000, Math.max(v * 1000, persona.room.oneShotIntervalMs[1])]
            store.setLayer('room', { oneShotIntervalMs: range })
            room?.setOneShotInterval([range[0] / 1000, range[1] / 1000])
          }} />
        <Slider label="one-shot max (s)" min={2} max={120} step={1}
          value={persona.room.oneShotIntervalMs[1] / 1000}
          onChange={(v) => {
            const range: [number, number] = [Math.min(persona.room.oneShotIntervalMs[0], v * 1000), v * 1000]
            store.setLayer('room', { oneShotIntervalMs: range })
            room?.setOneShotInterval([range[0] / 1000, range[1] / 1000])
          }} />
        <Readout label="bed running" value={room ? String(room.isRunning) : 'no room'} />
        <Readout label="ducked" value={room ? String(room.ducked) : '—'} />
      </Section>

      {/* -------------------------------------------------- session */}
      <Section title="Session">
        <Slider label="silenceMs (VAD)" min={200} max={3000} step={50} value={state.silenceMs}
          onChange={(v) => store.set({ silenceMs: v })} />
        <Select label="model" value={state.model} options={models}
          onChange={(v) => store.set({ model: v })} />
        {voices.length > 0 && (
          <Select label="voice" value={state.voiceId ?? ''} options={['', ...voices.map((v) => v.id)]}
            onChange={(v) => store.set({ voiceId: v || null })} />
        )}
        <p style={note}>
          silenceMs, model and voice are read when the session connects. Everything
          above applies to her next reply.
        </p>
      </Section>

      {/* -------------------------------------------------- presets */}
      <Section title="Presets">
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <input
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="name"
            style={input}
          />
          <button
            style={btn}
            onClick={() => {
              if (!presetName.trim()) return
              setPresets(savePreset(toPreset(presetName.trim(), store.get())))
              setPresetName('')
            }}
          >
            save
          </button>
          <button style={btn} onClick={() => download(activePreset(store.get()))}>export</button>
          <button style={btn} onClick={() => fileRef.current?.click()}>import</button>
          <button style={btn} onClick={() => store.reset()}>reset</button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={async (event) => {
            const file = event.target.files?.[0]
            if (!file) return
            const preset = parsePreset(await file.text())
            if (preset) applyPreset(preset)
            event.target.value = ''
          }}
        />
        {presets.length === 0 && <p style={note}>No saved presets yet.</p>}
        {presets.map((preset) => (
          <div key={preset.name} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
            <button style={btn} onClick={() => applyPreset(preset)}>{preset.name}</button>
            <span style={{ color: '#6A7062', fontSize: 11 }}>
              {new Date(preset.savedAt).toLocaleString()}
            </span>
            <button style={btn} onClick={() => setPresets(deletePreset(preset.name))}>×</button>
          </div>
        ))}
      </Section>
    </aside>
  )
}

/* ------------------------------------------------------------------ *
 * Bits
 * ------------------------------------------------------------------ */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ borderTop: '1px solid #242820', padding: '10px 0' }}>
      <h3 style={{ margin: '0 0 8px', fontSize: 11, color: '#C4F82A', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {title}
      </h3>
      {children}
    </section>
  )
}

function Slider(props: {
  label: string
  min: number
  max: number
  step: number
  value: number
  onChange: (value: number) => void
}) {
  return (
    <label style={{ display: 'grid', gridTemplateColumns: '1fr 90px 44px', gap: 6, alignItems: 'center', marginBottom: 3 }}>
      <span style={{ fontSize: 11, color: '#9DA396' }}>{props.label}</span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      <span style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
        {props.value}
      </span>
    </label>
  )
}

function Select(props: {
  label: string
  value: string
  options: readonly string[]
  onChange: (value: string) => void
}) {
  return (
    <label style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 6, alignItems: 'center', marginBottom: 3 }}>
      <span style={{ fontSize: 11, color: '#9DA396' }}>{props.label}</span>
      <select value={props.value} onChange={(e) => props.onChange(e.target.value)} style={input}>
        {props.options.map((option) => (
          <option key={option} value={option}>{option || '(persona default)'}</option>
        ))}
      </select>
    </label>
  )
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, marginBottom: 2 }}>
      <span style={{ color: '#6A7062' }}>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{value}</span>
    </div>
  )
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value)
}

function download(preset: TuningPreset): void {
  const blob = new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `nerve-preset-${preset.state.persona.slug}-${preset.savedAt.replace(/[:.]/g, '-')}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

/* ------------------------------------------------------------------ *
 * Styles
 * ------------------------------------------------------------------ */

const panel: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  right: 0,
  width: 340,
  height: '100vh',
  overflowY: 'auto',
  background: '#0B0C0A',
  color: '#EDEFE8',
  borderLeft: '1px solid #242820',
  padding: '12px 14px',
  fontFamily: 'ui-monospace, monospace',
  fontSize: 12,
  zIndex: 40,
}

const collapsed: React.CSSProperties = {
  position: 'fixed',
  bottom: 8,
  right: 10,
  color: '#6A7062',
  fontFamily: 'ui-monospace, monospace',
  fontSize: 11,
  zIndex: 40,
}

const header: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  paddingBottom: 8,
}

const btn: React.CSSProperties = {
  background: '#191C16',
  color: '#EDEFE8',
  border: '1px solid #242820',
  borderRadius: 2,
  padding: '3px 8px',
  fontSize: 11,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

const input: React.CSSProperties = {
  background: '#131511',
  color: '#EDEFE8',
  border: '1px solid #242820',
  borderRadius: 2,
  padding: '3px 6px',
  fontSize: 11,
  fontFamily: 'inherit',
  minWidth: 0,
}

const kbd: React.CSSProperties = {
  background: '#191C16',
  border: '1px solid #242820',
  borderRadius: 2,
  padding: '1px 4px',
}

const note: React.CSSProperties = { color: '#6A7062', fontSize: 11, margin: '6px 0 0' }
