'use client'

/**
 * Report a problem, on every session (§10 H).
 *
 * A quiet control rather than a prominent one, and that is the design. It has
 * to be findable from any rep and it must not be the thing the eye lands on
 * after a scorecard — a product that advertises its complaint button is a
 * product suggesting you will need it.
 *
 * NOT on the live rep screen. §05 allows the timer, the ring and her voice
 * during a rep and nothing else, and a "report" control in the corner would be
 * a third thing on the screen and a standing invitation to stop playing. The
 * way out of a live rep is the back arrow, which already exists; this is for
 * afterwards, when there is something to say about what happened.
 *
 * Sent once. The sheet closes on success and says so — a report the user
 * cannot tell landed is a report they send four times.
 */

import { useState } from 'react'
import { Flag } from 'lucide-react'
import { Button, Sheet, Textarea } from '@/components/ui'
import { REPORT_REASONS, reportSession } from '@/app/safety/actions'

export function ReportButton({ sessionId }: { sessionId: string | null }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<string>(REPORT_REASONS[0].value)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const send = () => {
    setBusy(true)
    setError(null)
    void reportSession({ sessionId, reason, note }).then((result) => {
      setBusy(false)
      if (result.ok) { setSent(true); return }
      setError(result.message)
    })
  }

  const close = () => {
    setOpen(false)
    // Reset on the way out rather than on the way in, so reopening a sheet
    // that has already been sent does not show the previous note again.
    window.setTimeout(() => { setSent(false); setNote(''); setError(null) }, 300)
  }

  return <>
    <button type="button" className="report-link" onClick={() => setOpen(true)}><Flag size={14} strokeWidth={1.5} /> Report a problem</button>
    <Sheet open={open} onClose={close} title={sent ? 'Sent' : 'Report a problem'}>
      {sent
        ? <div className="sheet-stack"><p>Thanks — a person reads these. If it needs a reply we will use the address you signed up with.</p><Button fullWidth onClick={close}>Done</Button></div>
        : <div className="sheet-stack"><p>Tell us what happened in this rep. It goes to us, not to anybody else.</p><div className="report-reasons">{REPORT_REASONS.map((item) => <label key={item.value} className={reason === item.value ? 'is-on' : ''}><input type="radio" name="report-reason" value={item.value} checked={reason === item.value} onChange={() => setReason(item.value)} /><span>{item.label}</span></label>)}</div><Textarea label="Anything else" rows={4} maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional. What she said, or what went wrong." />{error ? <div className="form-error" role="alert">{error}</div> : null}<Button fullWidth loading={busy} onClick={send}>Send report</Button><Button variant="ghost" fullWidth onClick={close}>Cancel</Button></div>}
    </Sheet>
  </>
}
