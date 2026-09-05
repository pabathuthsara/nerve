/** These handlers verify identity and refresh auth cookies themselves. */
export const ROUTE_AUTH_PATHS = new Set([
  '/api/voice/token', '/api/voice/turn', '/api/voice/llm', '/api/voice/tts',
  '/api/voice/credits', '/api/warmth/score', '/api/grade', '/api/safety',
])
