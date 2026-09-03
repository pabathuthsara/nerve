'use client'

import Image from 'next/image'

// Its own file. The date-of-birth field is a small state machine rather than a
// styled tag, and the rules it runs on live in `lib/safety/dob-field.ts`.
export { DateOfBirth } from './date-of-birth'

import { AnimatePresence, motion } from 'framer-motion'
import { FileText, Inbox, LockKeyhole, Upload, X } from 'lucide-react'
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react'
import { useBreakpoint } from '@/lib/hooks/use-breakpoint'
import { Mark, type MarkName } from '@/components/marks'
import type { Band } from '@/lib/data/types'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  fullWidth?: boolean
}

export function Button({ variant = 'primary', size = 'md', loading = false, fullWidth = false, className = '', children, disabled, ...props }: ButtonProps) {
  return (
    <button
      className={`arena-button arena-button--${variant} arena-button--${size}${fullWidth ? ' arena-button--full' : ''} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading}
      {...props}
    >
      {loading ? <span className="loading-dots" aria-label="Working"><i /><i /><i /></span> : children}
    </button>
  )
}

export function IconButton({ label, children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button className={`arena-icon-button ${className}`} aria-label={label} {...props}>{children}</button>
}

export function Card({ className = '', children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`arena-card ${className}`} {...props}>{children}</div>
}

export function Hairline({ vertical = false }: { vertical?: boolean }) {
  return <hr className={`hairline${vertical ? ' hairline--vertical' : ''}`} />
}

export function Stat({ label, value, size = 'sm', detail }: { label: string; value: ReactNode; size?: 'sm' | 'lg'; detail?: ReactNode }) {
  return <div className={`stat stat--${size}`}><span className="label">{label}</span><span className="stat__value">{value}</span>{detail ? <span className="mute">{detail}</span> : null}</div>
}

const bandColors: Record<Band, string> = {
  CLOSED: 'var(--band-closed)', GUARDED: 'var(--band-guarded)', OPEN: 'var(--band-open)', ENGAGED: 'var(--band-engaged)', INVESTED: 'var(--band-invested)',
}

export function Chip({ children, tone = 'neutral', band }: { children: ReactNode; tone?: 'neutral' | 'volt' | 'amber' | 'red' | 'band'; band?: Band }) {
  const style = tone === 'band' && band ? { color: bandColors[band], borderColor: `color-mix(in srgb, ${bandColors[band]} 50%, transparent)` } : undefined
  return <span className={`arena-chip arena-chip--${tone}`} style={style}>{children}</span>
}

export function ProgressBar({ value, tone = 'volt', label = 'Progress' }: { value: number; tone?: 'volt' | 'amber'; label?: string }) {
  const safe = Math.min(100, Math.max(0, value))
  return <div className="progress-bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={safe}><span style={{ width: `${safe}%`, background: tone === 'amber' ? 'var(--amber)' : 'var(--volt)' }} /></div>
}

export function ProgressRing({ value, size = 72, strokeWidth = 4, color = 'var(--volt)', className = '' }: { value: number; size?: number; strokeWidth?: number; color?: string; className?: string }) {
  const safe = Math.min(100, Math.max(0, value))
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  return (
    <svg className={`progress-ring ${className}`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--line)" strokeWidth={strokeWidth} />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="butt" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - safe / 100)} />
    </svg>
  )
}

export function Skeleton({ width = '100%', height = 16, className = '', style }: { width?: CSSProperties['width']; height?: CSSProperties['height']; className?: string; style?: CSSProperties }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" style={{ width, height, ...style }} />
}

/**
 * `mark` is the one that should be passed (V22).
 *
 * There are twenty-five empty states in this product and until now every one
 * of them drew the same tray — "This rep was not graded", "The roster is
 * empty" and "Nothing logged yet" were visually the same screen. The default
 * is kept so a new call site is never broken, but it is a fallback rather than
 * a choice: pass the mark for the surface you are standing on.
 */
export function EmptyState({ icon, mark, title, description, action }: { icon?: ReactNode; mark?: MarkName; title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state">{icon ?? (mark ? <Mark name={mark} size={32} /> : <Inbox size={32} strokeWidth={1.5} />)}<h2 className="display-md">{title}</h2><p>{description}</p>{action}</div>
}

export function LockOverlay({ requirement, children }: { requirement: string; children: ReactNode }) {
  return <div className="lock-wrap">{children}<div className="lock-overlay"><LockKeyhole size={22} strokeWidth={1.5} /><span>{requirement}</span></div></div>
}

export function Avatar({ name, src, size = 48, dimmed = false }: { name: string; src?: string; size?: 32 | 48 | 64 | 80 | 96 | 128; dimmed?: boolean }) {
  const [failed, setFailed] = useState(false)
  const initial = name.trim().charAt(0).toUpperCase()
  const signature = [...name].reduce((sum, character) => sum + character.charCodeAt(0), 0)
  const style = { width: size, height: size, opacity: dimmed ? 0.52 : 1, '--avatar-angle': `${signature % 180}deg`, '--avatar-shift': `${signature % 9 - 4}px` } as CSSProperties
  return (
    <span className="avatar" style={style}>
      {src && !failed ? <Image src={src} alt={name} fill sizes={`${size}px`} onError={() => setFailed(true)} /> : <span>{initial}</span>}
    </span>
  )
}

interface FieldProps {
  label: string
  error?: string
  hint?: ReactNode
  /**
   * A control sitting inside the input — the password eye, and nothing else so
   * far. It renders in a wrapper around the input rather than beside the whole
   * field, so it is anchored to the box it belongs to instead of to a guessed
   * distance from the top of the label.
   */
  adornment?: ReactNode
}

export function Input({ label, error, hint, adornment, id: providedId, className = '', ...props }: InputHTMLAttributes<HTMLInputElement> & FieldProps) {
  const generated = useId()
  const id = providedId ?? generated
  const input = <input id={id} className={`arena-input${error ? ' arena-input--error' : ''} ${className}`} {...props} />
  return <label className="field" htmlFor={id}><span className="label">{label}</span>{adornment ? <span className="field__control">{input}{adornment}</span> : input}{hint ? <span className="field__hint">{hint}</span> : null}{error ? <span className="field__error">{error}</span> : null}</label>
}

export function Textarea({ label, error, hint, id: providedId, className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps) {
  const generated = useId()
  const id = providedId ?? generated
  return <label className="field" htmlFor={id}><span className="label">{label}</span><textarea id={id} className={`arena-input arena-textarea${error ? ' arena-input--error' : ''} ${className}`} {...props} />{hint ? <span className="field__hint">{hint}</span> : null}{error ? <span className="field__error">{error}</span> : null}</label>
}

export function FileDrop({ file, onFile, accept = '.pdf,.docx', error }: { file: File | null; onFile: (file: File | null) => void; accept?: string; error?: string }) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const setFile = (list: FileList | null) => onFile(list?.[0] ?? null)
  return (
    <div className={`file-drop${error ? ' file-drop--error' : ''}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); setFile(event.dataTransfer.files) }}>
      {file ? <><FileText size={28} strokeWidth={1.5} /><div><strong>{file.name}</strong><span>{formatBytes(file.size)}</span></div><IconButton label="Remove file" onClick={() => onFile(null)}><X size={18} strokeWidth={1.5} /></IconButton></> : <><Upload size={28} strokeWidth={1.5} /><div><strong>Drop your CV here</strong><span>PDF or DOCX, up to 5 MB</span></div><label htmlFor={inputId} role="button" tabIndex={0} className="arena-button arena-button--secondary arena-button--sm" onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); inputRef.current?.click() } }}>Browse</label></>}
      <input ref={inputRef} id={inputId} type="file" accept={accept} hidden onChange={(event) => setFile(event.target.files)} />
      {error ? <p className="field__error">{error}</p> : null}
    </div>
  )
}

function formatBytes(bytes: number) { return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB` }

export function Tabs<T extends string>({ items, value, onChange, label = 'Section' }: { items: readonly T[]; value: T; onChange: (value: T) => void; label?: string }) {
  return <div className="arena-tabs" role="tablist" aria-label={label}>{items.map((item) => <button key={item} role="tab" aria-selected={item === value} onClick={() => onChange(item)}>{item.replaceAll('_', ' ')}</button>)}</div>
}

export function Sheet({ open, onClose, title, children, dismissible = true }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; dismissible?: boolean }) {
  const { isDesktop } = useBreakpoint()
  const dialogRef = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])
  useEffect(() => {
    if (!open) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusable = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])
    const focusFrame = window.requestAnimationFrame(() => (focusable()[0] ?? dialogRef.current)?.focus())
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissible) { event.preventDefault(); closeRef.current(); return }
      if (event.key !== 'Tab') return
      const items = focusable()
      if (!items.length) { event.preventDefault(); dialogRef.current?.focus(); return }
      const first = items[0]
      const last = items[items.length - 1]
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', keydown)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.cancelAnimationFrame(focusFrame); document.removeEventListener('keydown', keydown); document.body.style.overflow = previous; previousFocus?.focus() }
  }, [dismissible, open])

  return (
    <AnimatePresence>
      {open ? <motion.div className="sheet-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .18 }} role="presentation" onMouseDown={(event) => { if (dismissible && event.target === event.currentTarget) onClose() }}>
        <motion.section
          ref={dialogRef}
          className="sheet"
          role="dialog"
          aria-modal="true"
          aria-label={title ?? 'Dialog'}
          tabIndex={-1}
          initial={isDesktop ? { opacity: 0, scale: .98 } : { y: '100%' }}
          animate={isDesktop ? { opacity: 1, scale: 1 } : { y: 0 }}
          exit={isDesktop ? { opacity: 0, scale: .98 } : { y: '100%' }}
          transition={{ duration: .24, ease: [0.2, 0, 0, 1] }}
          drag={!isDesktop && dismissible ? 'y' : false}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: .6 }}
          onDragEnd={(_, info) => { if (info.offset.y > 90 && dismissible) onClose() }}
        >
          {!isDesktop ? <div className="sheet__handle" /> : null}
          <div className="sheet__head">{title ? <h2 className="display-md">{title}</h2> : <span />}{dismissible ? <IconButton label="Close" onClick={onClose}><X size={19} strokeWidth={1.5} /></IconButton> : null}</div>
          <div className="sheet__body">{children}</div>
        </motion.section>
      </motion.div> : null}
    </AnimatePresence>
  )
}

export function Modal(props: Omit<Parameters<typeof Sheet>[0], 'dismissible'>) { return <Sheet {...props} dismissible={false} /> }

type ToastTone = 'neutral' | 'volt' | 'red'
interface ToastItem { id: number; message: string; tone: ToastTone }
interface ToastContextValue { push: (message: string, tone?: ToastTone) => void }
const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const value = useMemo(() => ({ push: (message: string, tone: ToastTone = 'neutral') => {
    const id = Date.now() + Math.random()
    setItems((current) => [...current, { id, message, tone }])
    window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), 4000)
  } }), [])
  return <ToastContext.Provider value={value}>{children}<div className="toast-stack" aria-live="polite">{items.map((item) => <motion.div key={item.id} className={`toast toast--${item.tone}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>{item.message}</motion.div>)}</div></ToastContext.Provider>
}

export function useToast() {
  const value = useContext(ToastContext)
  if (!value) throw new Error('useToast must be used inside ToastProvider')
  return value
}
