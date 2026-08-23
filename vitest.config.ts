import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
      // See scripts/stubs/server-only.ts. The real package throws on import;
      // the runner is not a bundle, and the harnesses need to call the same
      // server code the Server Actions do rather than a copy of it.
      'server-only': fileURLToPath(new URL('./scripts/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    // `app/` too, so route handlers are testable. The auth gate on the routes
    // that spend money is the kind of thing that has to be asserted against the
    // handler itself: the failure mode is a handler forgetting to call the
    // helper, which a test of the helper alone cannot see.
    include: ['lib/**/*.test.ts', 'app/**/*.test.ts'],
  },
})
