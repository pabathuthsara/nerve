'use server'

/**
 * The interview setup, written for real (INTERVIEW-PLAN C1, C2, C3).
 *
 * **Every function returns `{ ok, message }` rather than throwing**, the same
 * shape and for the same reason as `app/rep/actions.ts`: a thrown Server Action
 * error reaches the client as an opaque digest, and "Not saved — you are signed
 * out" is a sentence somebody can act on.
 *
 * ── WHO WRITES WHAT, AGAIN ───────────────────────────────────────────────
 *
 * The setup is the user's own document about their own job hunt and is written
 * in their own context through their own RLS policies. Rule 11 governs things
 * somebody could pay to change — plan, quota, the credit balance — and a job
 * description is not one of them.
 *
 * The CV is the most personal thing this product holds, which is why the
 * migration granted DELETE on the bucket and why **Replace and Remove both
 * delete the old object** here rather than orphaning it.
 */

import { revalidatePath } from 'next/cache'
import { currentUser, supabaseServer } from '@/lib/db/server'
import { createPackCheckout } from '@/lib/billing/checkout'
import { packsConfigured } from '@/lib/billing/plans'
import { INTERVIEW_PACKS, type PackId } from '@/lib/site/plans'
import { SUPPORT_EMAIL } from '@/components/site/site-chrome'
import {
  CV_TEXT_LIMIT,
  writeCvRecord,
  writeInterviewSetup,
  type SetupPatch,
} from '@/lib/db/interview'
import { extractCvText, MAX_CV_BYTES } from '@/lib/interview/cv-text'
// Every export of a `'use server'` module is a Server Action, so a pure helper
// cannot live here — it would be published as a callable endpoint.
import { safeFileName } from '@/lib/interview/cv-name'

export interface SetupResult {
  ok: boolean
  /** Null when ok. A short, honest sentence when not. */
  message: string | null
}

const SIGNED_OUT: SetupResult = { ok: false, message: 'Not saved — you are signed out.' }

export interface PackCheckoutResult {
  ok: boolean
  url: string | null
  message: string | null
}

/**
 * Every export of a `'use server'` module is a callable endpoint, so these two
 * helpers cannot be exported — the same constraint that put `safeFileName` in
 * its own file. They are small enough to keep here rather than mint a module
 * for.
 */
function isPackId(value: string): value is PackId {
  return INTERVIEW_PACKS.some((pack) => pack.id === value)
}

/** The first of these that is actually a URL. Blank and whitespace are unset. */
function firstConfiguredUrl(...candidates: (string | undefined)[]): string | undefined {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim()
    if (trimmed && /^https?:\/\//i.test(trimmed)) return trimmed.replace(/\/+$/, '')
  }
  return undefined
}

/** The role, the company, the job description, the field, the round, the questions. */
export async function saveInterviewSetup(patch: SetupPatch): Promise<SetupResult> {
  const result = await writeInterviewSetup(patch)
  if (result.ok) revalidatePath('/interview')
  return result
}

/**
 * The captions toggle (§5.11).
 *
 * Its own action rather than a field on the one above, because it is set from a
 * different screen at a different moment and an accessibility control that has
 * to be saved alongside a job description is a control somebody loses.
 */
export async function setInterviewCaptions(enabled: boolean): Promise<SetupResult> {
  return writeInterviewSetup({ captions: enabled })
}

export interface CvUploadResult extends SetupResult {
  fileName: string | null
  /** How much text reached the interviewer. Null when none did. */
  chars: number | null
  /**
   * Extraction failed and the file is still uploaded.
   *
   * Not an error: §C4 says a missing CV degrades to field plus role plus job
   * description rather than to a generic interview, so an unreadable CV is a
   * message and an interview that still runs.
   */
  warning: string | null
}

const UPLOAD_FAILED = (message: string): CvUploadResult =>
  ({ ok: false, message, fileName: null, chars: null, warning: null })

/**
 * Upload a CV, extract it once, and record both together (C2, C3).
 *
 * ── WHY THE SERVER DOES THE UPLOAD ───────────────────────────────────────
 *
 * The browser could upload straight to the bucket — the RLS key is the first
 * path segment and the policies are already correct. It does not, because the
 * extraction has to happen exactly once, on the server, on the bytes that were
 * actually stored. Doing it in two places means a row that names a file and
 * carries the previous file's text, which is worse than carrying neither: the
 * interviewer would be asking about a job the user has just replaced.
 *
 * The old object is deleted whichever way this goes, because a bucket that
 * accumulates every draft of somebody's CV is a bucket nobody would consent to.
 */
export async function uploadCv(form: FormData): Promise<CvUploadResult> {
  const user = await currentUser()
  if (!user) return { ...SIGNED_OUT, fileName: null, chars: null, warning: null }

  const file = form.get('file')
  if (!(file instanceof File)) return UPLOAD_FAILED('No file was sent.')
  if (file.size === 0) return UPLOAD_FAILED('That file is empty.')
  if (file.size > MAX_CV_BYTES) return UPLOAD_FAILED('That file is larger than 5 MB.')

  const fileName = safeFileName(file.name)
  if (!fileName) return UPLOAD_FAILED('Use a PDF or a DOCX file.')

  const supabase = await supabaseServer()
  const path = `${user.id}/${fileName}`

  await removeExistingCv()

  const bytes = new Uint8Array(await file.arrayBuffer())
  const { error } = await supabase.storage.from('cv').upload(path, bytes, {
    contentType: file.type || contentTypeFor(fileName),
    upsert: true,
  })
  if (error) return UPLOAD_FAILED(`Not uploaded — ${error.message}`)

  // Once, here, on the bytes that were stored. Never per turn (C3).
  const extracted = extractCvText(bytes, fileName)
  const saved = await writeCvRecord({
    path,
    fileName,
    text: extracted.ok ? extracted.text : null,
    error: extracted.ok ? null : extracted.message,
  })
  if (!saved.ok) return UPLOAD_FAILED(saved.message ?? 'Not saved.')

  revalidatePath('/interview')
  return {
    ok: true,
    message: null,
    fileName,
    chars: extracted.ok ? Math.min(extracted.text.length, CV_TEXT_LIMIT) : null,
    warning: extracted.ok ? null : extracted.message,
  }
}

/** Remove takes the object with it, not just the row. */
export async function removeCv(): Promise<SetupResult> {
  const removed = await removeExistingCv()
  if (!removed.ok) return removed
  const cleared = await writeCvRecord({ path: null, fileName: null, text: null, error: null })
  if (cleared.ok) revalidatePath('/interview')
  return cleared
}

async function removeExistingCv(): Promise<SetupResult> {
  const user = await currentUser()
  if (!user) return SIGNED_OUT
  try {
    const supabase = await supabaseServer()
    const { data } = await supabase
      .from('interview_setups')
      .select('cv_path')
      .eq('user_id', user.id)
      .maybeSingle()
    if (data?.cv_path) await supabase.storage.from('cv').remove([data.cv_path])
    return { ok: true, message: null }
  } catch {
    // A stale object is a storage cost, not a user-facing failure. The row is
    // what the prompt reads, and the caller is about to overwrite it.
    return { ok: true, message: null }
  }
}

function contentTypeFor(fileName: string): string {
  return fileName.endsWith('.pdf')
    ? 'application/pdf'
    : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
}

/**
 * Buying interviews (INTERVIEW-PLAN D3, E1).
 *
 * The only thing a user may do near the credit balance, and it writes nothing:
 * it opens a checkout at the merchant of record and hands back a URL. The
 * credits themselves land in `/api/webhooks/whop`, on the service role, because
 * `interview_credit_entries` has a read policy and nothing else — a balance
 * somebody can write is a free product (rule 11).
 *
 * The pack is validated against the authored list rather than trusted from the
 * form, for the reason `startCheckout` gives about periods: the argument
 * arrives from a browser, and a checkout opened for whatever string was posted
 * is a price nobody agreed to.
 */
export async function startPackCheckout(pack: string): Promise<PackCheckoutResult> {
  const user = await currentUser()
  if (!user) return { ok: false, url: null, message: 'Sign in first — credits belong to an account.' }

  if (!isPackId(pack)) return { ok: false, url: null, message: 'That is not a pack you can buy.' }

  /**
   * Refused before the provider is called, and with a sentence a person can
   * read. `whopPlanIdForPack` throws naming the missing variable, which would
   * otherwise put "WHOP_PACK_FIVE is not set" on the screen of somebody trying
   * to give us money.
   */
  if (!packsConfigured()) {
    return {
      ok: false,
      url: null,
      message: `Interview credits are not on sale yet. Email ${SUPPORT_EMAIL} and we will tell you the day they are.`,
    }
  }

  const origin = firstConfiguredUrl(process.env.NEXT_PUBLIC_SITE_URL, process.env.NEXT_PUBLIC_APP_URL)

  const result = await createPackCheckout({
    userId: user.id,
    pack,
    ...(origin ? { successUrl: `${origin}/interview/credits?bought=1` } : {}),
  })

  if (!result.ok || !result.url) {
    return { ok: false, url: null, message: result.message ?? 'Could not open checkout.' }
  }
  return { ok: true, url: result.url, message: null }
}
