'use client'

import Link from 'next/link'
import { Check, GripVertical, Plus, Trash2, UploadCloud } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useInterviewers, useInterviewSetup, useSessionHistory, useUserState } from '@/lib/data'
import { AppShell } from '@/components/app-shell'
import { Avatar, Button, Card, Chip, EmptyState, FileDrop, Input, ProgressBar, Skeleton, Stat, Textarea } from '@/components/ui'
import { CVReplaceSheet } from '@/components/modals'
import { useProduct } from '@/components/product-provider'

export type InterviewRoute = '/interview' | '/interview/setup/role' | '/interview/setup/cv' | '/interview/setup/questions' | '/interview/interviewers'

export function InterviewScreen({ route }: { route: InterviewRoute }) {
  if (route === '/interview/setup/role') return <RoleSetup />
  if (route === '/interview/setup/cv') return <CvSetup />
  if (route === '/interview/setup/questions') return <QuestionsSetup />
  if (route === '/interview/interviewers') return <InterviewerPicker />
  return <InterviewHome />
}

function InterviewHome() {
  const { selectedInterviewerId } = useProduct()
  const { data: setup, loading } = useInterviewSetup()
  const { data: interviewers } = useInterviewers()
  const { data: user } = useUserState()
  const { data: sessions } = useSessionHistory()
  const interviewer = interviewers.find((item) => item.id === selectedInterviewerId) ?? interviewers.find((item) => !item.locked)
  const last = sessions.find((session) => session.track === 'interview')
  return <AppShell title="Interview"><div className="train-grid interview-home"><section>{loading || !setup || !interviewer ? <Skeleton height={520} /> : setup.complete ? <article className="interview-hero"><div className="interview-hero__top"><span className="label">Next simulation</span><Chip tone="volt">Ready</Chip></div><div className="interview-role"><span className="label">Role</span><h1 className="display-xl">{setup.roleTitle}</h1><p>{setup.company}</p></div><div className="interviewer-strip"><Avatar name={interviewer.name} src={interviewer.portraitUrl} size={64} /><div><strong>{interviewer.name}</strong><span className="label">{interviewer.styleLabel}</span></div></div><Link className="arena-button arena-button--primary arena-button--lg arena-button--full" href={`/interview/rep/${interviewer.id}/brief`}>Start interview</Link></article> : <SetupPrompt />}</section><aside className="side-stack"><Card className="interview-stats"><Stat label="Role" value={setup?.roleTitle ?? 'Not set'} /><Stat label="Interviewer" value={interviewer?.name ?? 'Not set'} /><Stat label="Questions added" value={setup?.customQuestions.length ?? 0} /></Card><Link className="arena-button arena-button--secondary arena-button--full" href="/interview/setup/role">Edit setup</Link>{last ? <Card><span className="label">Last interview</span><div className="interview-last"><span><strong>{last.personaName}</strong><small>{last.won ? 'Callback' : 'No callback'}</small></span><span className="data">{last.compositeScore}</span></div></Card> : null}<p className="label mute">{user?.repsRemainingToday ?? 3} simulations available today</p></aside></div></AppShell>
}

function SetupPrompt() { return <article className="setup-prompt"><span className="label">Three quick inputs</span><h1 className="display-xl">Set up your interview</h1><p>Give the interviewer enough context to make the questions specific.</p><div className="setup-progress">{['Role', 'CV', 'Questions'].map((item, index) => <span key={item}><i>{index + 1}</i>{item}</span>)}</div><Link className="arena-button arena-button--primary arena-button--lg" href="/interview/setup/role">Start setup</Link></article> }

function SetupLayout({ step, title, children }: { step: number; title: string; children: React.ReactNode }) { return <AppShell title="Interview setup"><div className="setup-page"><div className="setup-kicker"><span className="label">Interview setup</span><span className="data">0{step} / 03</span></div><ProgressBar value={step / 3 * 100} /><h1 className="display-lg">{title}</h1>{children}</div></AppShell> }

function RoleSetup() {
  const router = useRouter()
  const { data: setup } = useInterviewSetup()
  const [role, setRole] = useState(setup?.roleTitle ?? '')
  const [company, setCompany] = useState(setup?.company ?? '')
  const [description, setDescription] = useState(setup?.jobDescription ?? '')
  return <SetupLayout step={1} title="What are you walking into?"><form className="setup-form" onSubmit={(event) => { event.preventDefault(); router.push('/interview/setup/cv') }}><Input label="Role title" required value={role} onChange={(event) => setRole(event.target.value)} placeholder="Senior Product Designer" /><Input label="Company" value={company} onChange={(event) => setCompany(event.target.value)} placeholder="Optional" /><div className="textarea-tools"><Textarea label="Job description" rows={8} value={description} onChange={(event) => setDescription(event.target.value)} hint="The more you paste, the sharper the questions." /><button type="button" onClick={() => navigator.clipboard.readText().then(setDescription)} className="paste-action">Paste</button><span className="char-count data">{description.length} / 6000</span></div><Button size="lg" fullWidth disabled={!role.trim()}>Continue</Button></form></SetupLayout>
}

function CvSetup() {
  const router = useRouter()
  const { data: setup } = useInterviewSetup()
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [replace, setReplace] = useState(false)
  const [existing, setExisting] = useState(setup?.cvFileName ?? '')
  const [error, setError] = useState<string>()
  const uploadTimer = useRef<number | null>(null)
  const clearUpload = () => { if (uploadTimer.current !== null) window.clearInterval(uploadTimer.current); uploadTimer.current = null }
  useEffect(() => () => clearUpload(), [])
  const upload = (next: File | null) => {
    clearUpload()
    setError(undefined)
    if (!next) { setFile(null); setUploading(false); setProgress(0); return }
    const lowerName = next.name.toLowerCase()
    if (!lowerName.endsWith('.pdf') && !lowerName.endsWith('.docx')) { setError('Use a PDF or DOCX file.'); return }
    if (next.size > 5 * 1024 * 1024) { setError('File must be 5 MB or smaller.'); return }
    setFile(next); setUploading(true); setProgress(12)
    uploadTimer.current = window.setInterval(() => setProgress((value) => {
      const updated = Math.min(100, value + 22)
      if (updated >= 100) { clearUpload(); setUploading(false); setExisting(next.name); setFile(null) }
      return updated
    }), 130)
  }
  return <SetupLayout step={2} title="Add your CV"><div className="setup-form">{existing && !file ? <Card className="uploaded-file"><UploadCloud size={28} strokeWidth={1.5} /><div><strong>{existing}</strong><span>Uploaded just now</span></div><Button size="sm" variant="secondary" onClick={() => setReplace(true)}>Replace</Button></Card> : <FileDrop file={file} onFile={upload} error={error} />}{uploading ? <div className="upload-progress"><span className="label">Uploading <span className="data">{progress}%</span></span><ProgressBar value={progress} label="CV upload" /></div> : null}<Button size="lg" fullWidth disabled={uploading} onClick={() => router.push('/interview/setup/questions')}>Continue</Button><Button variant="ghost" fullWidth disabled={uploading} onClick={() => router.push('/interview/setup/questions')}>Skip for now</Button></div><CVReplaceSheet open={replace} onClose={() => setReplace(false)} fileName={existing} onReplace={() => { setExisting(''); setReplace(false) }} onRemove={() => { setExisting(''); setReplace(false) }} /></SetupLayout>
}

function QuestionsSetup() {
  const router = useRouter()
  const { data: setup } = useInterviewSetup()
  const [questions, setQuestions] = useState(setup?.customQuestions ?? [])
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const suggestions = ['Tell me about a time you failed', 'Why this company?', 'Describe a difficult stakeholder', 'How do you prioritise?', 'Tell me about a conflict', 'What would you change about your last role?']
  const commit = () => { if (draft.trim()) setQuestions((items) => [...items, draft.trim()]); setDraft(''); setAdding(false) }
  return <SetupLayout step={3} title="What should they ask?"><div className="question-editor">{questions.length === 0 ? <p className="question-empty">No custom questions yet. Your interviewer will still use the role brief.</p> : null}{questions.map((question, index) => <div className="question-row" key={`${question}-${index}`}><GripVertical size={17} strokeWidth={1.5} /><input aria-label={`Custom question ${index + 1}`} value={question} onChange={(event) => setQuestions((items) => items.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} /><button aria-label="Delete question" onClick={() => setQuestions((items) => items.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={17} strokeWidth={1.5} /></button></div>)}{adding ? <input className="question-add-input" aria-label="New custom question" autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') commit(); if (event.key === 'Escape') { setDraft(''); setAdding(false) } }} placeholder="Type a question, then press Enter" /> : <Button variant="secondary" onClick={() => setAdding(true)}><Plus size={17} strokeWidth={1.5} /> Add question</Button>}<div className="suggested-questions"><span className="label">Suggested</span>{suggestions.map((suggestion) => <button key={suggestion} onClick={() => { if (!questions.includes(suggestion)) setQuestions((items) => [...items, suggestion]) }}><Plus size={14} strokeWidth={1.5} /> {suggestion}</button>)}</div><Button size="lg" fullWidth onClick={() => router.push('/interview/interviewers')}>Finish setup</Button></div></SetupLayout>
}

export function InterviewerPicker() {
  const router = useRouter()
  const { selectedInterviewerId, setSelectedInterviewerId } = useProduct()
  const { data: interviewers, loading } = useInterviewers()
  return <AppShell title="Interviewers"><div className="screen-heading"><span className="label">Choose the pressure</span><h1 className="display-lg">Your interviewer</h1><p>Style changes the questions, follow-ups, and tolerance for vagueness.</p></div>{!loading && interviewers.length === 0 ? <EmptyState title="No interviewers yet" description="The next interviewer is being prepared." /> : <div className="interviewer-grid">{loading ? Array.from({ length: 4 }, (_, index) => <Skeleton key={index} height={300} />) : interviewers.map((interviewer) => <button key={interviewer.id} className={`interviewer-card${interviewer.locked ? ' locked' : ''}${selectedInterviewerId === interviewer.id ? ' selected' : ''}`} aria-pressed={selectedInterviewerId === interviewer.id} disabled={interviewer.locked} onClick={() => { setSelectedInterviewerId(interviewer.id); router.push('/interview') }}><div className="interviewer-portrait"><Avatar name={interviewer.name} src={interviewer.portraitUrl} size={96} />{interviewer.locked ? <span className="label">Level 4</span> : null}</div><div><Chip tone={interviewer.locked ? 'neutral' : 'volt'}>{interviewer.styleLabel}</Chip><h2 className="display-md">{interviewer.name}</h2><span className="label">{interviewer.gender} · level {interviewer.level}</span><p>{interviewer.blurb}</p></div>{!interviewer.locked ? <span className="select-line"><Check size={15} strokeWidth={1.5} /> {selectedInterviewerId === interviewer.id ? 'Selected' : 'Select'}</span> : <span className="select-line">Locked</span>}</button>)}</div>}</AppShell>
}
