import type { Interviewer, InterviewSetup } from '../types'

export const interviewSetup: InterviewSetup = {
  roleTitle: 'Senior Product Designer', company: 'Northstar Labs',
  jobDescription: 'Lead product design for a new developer platform, partnering closely with research and engineering.',
  cvFileName: 'ash-perera-cv.pdf', cvUploadedAt: '2026-08-20T09:12:00.000Z',
  customQuestions: ['Tell me about a product decision you would change.', 'How do you handle disagreement with engineering?'], complete: true,
}

export const interviewers: Interviewer[] = [
  { id: 'dan-whitfield', name: 'Dan Whitfield', style: 'friendly_hr', styleLabel: 'Friendly HR', gender: 'male', blurb: 'Warm, structured, and good at making silence feel expensive.', portraitUrl: '', level: 1, locked: false },
  { id: 'aisha-rahman', name: 'Aisha Rahman', style: 'friendly_hr', styleLabel: 'Friendly HR', gender: 'female', blurb: 'Easy rapport, precise follow-ups, remembers every vague answer.', portraitUrl: '', level: 1, locked: false },
  { id: 'marcus-vance', name: 'Marcus Vance', style: 'technical', styleLabel: 'Technical', gender: 'male', blurb: 'Interrupts abstractions and asks for the mechanism underneath.', portraitUrl: '', level: 3, locked: false },
  { id: 'elena-kovac', name: 'Elena Kovač', style: 'distracted_exec', styleLabel: 'Distracted exec', gender: 'female', blurb: 'Scanning for signal. You get one minute before she decides.', portraitUrl: '', level: 4, locked: true },
]
