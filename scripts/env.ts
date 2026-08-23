/**
 * `.env.local`, read by hand.
 *
 * Next loads it for the app; a standalone script gets nothing. Fewer lines
 * than a dependency, and no runner flag to remember.
 */

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export async function loadEnvLocal(): Promise<void> {
  let contents: string
  try {
    contents = await readFile(resolve(process.cwd(), '.env.local'), 'utf8')
  } catch {
    return
  }

  for (const line of contents.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const [key, ...rest] = trimmed.split('=')
    const name = key?.trim()
    // A value already in the environment wins: an explicit export is a
    // deliberate override and the file should not fight it.
    if (!name || process.env[name] !== undefined) continue
    process.env[name] = rest.join('=').trim().replace(/^["']|["']$/g, '')
  }
}
