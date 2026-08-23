import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: true,
  /**
   * Nothing in the app is simulated any more. Auth, personas, sessions,
   * scores, entitlements and the live rep all run against the real thing, so
   * the MOCK_ variables that used to be mapped here are gone — a bypass that
   * exists only in development is a bypass whose absence nobody has tested.
   */

  /**
   * Build output directory.
   *
   * Overridable so a verification build can be sent somewhere other than
   * `.next`. Dev and production write incompatible artifacts to the same place,
   * and a `next build` run while `next dev` is up leaves the dev server serving
   * a manifest that no longer matches what is on disk — which surfaces as
   * `ChunkLoadError` or `originalFactory.call` and looks like an application
   * bug rather than a stale cache.
   *
   * Nothing needs to set this for normal work; `npm run dev` and `npm run
   * build` both use `.next` as usual.
   */
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
}

export default config
