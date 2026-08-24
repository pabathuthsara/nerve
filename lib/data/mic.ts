/**
 * Microphone permission, and how to talk to somebody about it (§12, B10).
 *
 * §12: "Explains why we need the mic *before* the OS dialog fires. Skipping
 * this step is the single biggest cause of permanent permission denial."
 *
 * That sentence is the whole reason this module exists. A browser prompt that
 * arrives with no explanation gets dismissed, and on most browsers a dismissal
 * is permanent for the origin — so the cheapest funnel fix in the product is
 * one sheet shown one second earlier.
 */

export type MicPermission = 'granted' | 'denied' | 'prompt' | 'unknown'

/**
 * What the browser will do if we ask right now.
 *
 * `navigator.permissions` is not universal and Safari has historically not
 * reported `microphone` at all, so `unknown` is a real answer rather than a
 * failure — and every caller treats it the same way it treats `prompt`, which
 * is the safe direction: show the explanation rather than assume it is not
 * needed.
 */
export async function micPermission(): Promise<MicPermission> {
  try {
    const permissions = navigator.permissions as
      | { query?: (descriptor: { name: string }) => Promise<{ state: string }> }
      | undefined
    if (!permissions?.query) return 'unknown'
    const status = await permissions.query({ name: 'microphone' })
    if (status.state === 'granted' || status.state === 'denied' || status.state === 'prompt') {
      return status.state
    }
    return 'unknown'
  } catch {
    // Firefox throws on an unsupported descriptor rather than rejecting the
    // name. Not knowing is not an error worth surfacing.
    return 'unknown'
  }
}

export type Browser = 'chrome' | 'safari' | 'firefox' | 'edge' | 'other'

/** Enough to name the right menu. Never used for anything but copy. */
export function detectBrowser(userAgent: string): Browser {
  const ua = userAgent.toLowerCase()
  if (ua.includes('edg/')) return 'edge'
  // Chrome's UA contains "safari", so Safari has to be the absence of the
  // others rather than the presence of its own name.
  if (ua.includes('firefox')) return 'firefox'
  if (ua.includes('chrome') || ua.includes('chromium')) return 'chrome'
  if (ua.includes('safari')) return 'safari'
  return 'other'
}

/**
 * How to turn it back on, in the words that browser actually uses.
 *
 * §12 asks for "browser-specific recovery instructions, detected from user
 * agent". Generic advice — "check your browser settings" — is what a user
 * reads immediately before closing the tab.
 */
export function micRecovery(browser: Browser): string {
  switch (browser) {
    case 'chrome':
      return 'Click the icon at the left of the address bar, open Site settings, and set Microphone to Allow. Then reload.'
    case 'edge':
      return 'Click the lock at the left of the address bar, find Microphone, and set it to Allow. Then reload.'
    case 'firefox':
      return 'Click the microphone icon in the address bar and clear the block, or open Settings → Privacy & Security → Permissions → Microphone. Then reload.'
    case 'safari':
      return 'Open Safari → Settings for This Website, and set Microphone to Allow. On iOS it is in Settings → Safari → Microphone.'
    default:
      return 'Open your browser’s site settings for this page and set Microphone to Allow, then reload.'
  }
}
