'use client'

/**
 * Uploading a rep recording to private storage (§05).
 *
 * Direct from the browser to Storage rather than through a Server Action:
 * a Server Action body is a serialised RPC payload, and pushing a megabyte of
 * audio through one on a Colombo home connection is exactly the case this
 * product cannot be careless about. RLS on the bucket does the authorisation,
 * keyed to the first path segment.
 */

import { supabaseBrowser } from './client'
import { extensionFor } from '@/lib/audio/recorder'

export interface UploadResult {
  path: string | null
  message: string | null
}

/**
 * The bucket matches on the bare type, so `audio/webm;codecs=opus` has to lose
 * its parameter before it is sent as a content type — otherwise every upload
 * is rejected as a disallowed mime type.
 */
function baseMimeType(mimeType: string): string {
  return mimeType.split(';')[0]!.trim()
}

export async function uploadRepAudio(input: {
  userId: string
  sessionId: string
  blob: Blob
  mimeType: string
}): Promise<UploadResult> {
  const path = `${input.userId}/${input.sessionId}.${extensionFor(input.mimeType)}`
  const supabase = supabaseBrowser()

  const { error } = await supabase.storage.from('session-audio').upload(path, input.blob, {
    contentType: baseMimeType(input.mimeType),
    // A rep is written once. An upsert would only ever mask a duplicate id.
    upsert: false,
  })

  if (error) return { path: null, message: `Audio not saved — ${error.message}` }
  return { path, message: null }
}
