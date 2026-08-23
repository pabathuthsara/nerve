/**
 * Retention windows (§05, §16).
 *
 * Audio is the expensive, sensitive half of a rep and buys nothing after the
 * user has reviewed it. The transcript is what scoring, progression and the
 * calibration harness read, and it is kept until the user deletes it.
 */
export const AUDIO_RETENTION_DAYS = 30
