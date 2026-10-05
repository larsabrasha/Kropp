import type { DateOnly } from './model'

/**
 * The largest values the app's fields take: well past what anyone logs, low enough to catch a
 * slipped digit. The server keeps its own, wider checks, so data logged before these stays valid.
 */
export const Limits = {
  sets: 10,
  reps: 100,
  weightKg: 500,
  seconds: 3600,
  minutes: 300,
  distanceKm: 100,
  heartRate: 250,
  sessionNumber: 9999,
  /** An exercise or template name. */
  name: 100,
  /** A setting, like "Sitthöjd 11". */
  shortText: 200,
  /** A comment or a note. */
  longText: 1000,
  search: 100,
  /** The dates the server accepts, see validate.ts. */
  firstDate: '2000-01-01' as DateOnly,
  lastDate: '2100-12-31' as DateOnly,
} as const

export const isInRange = (date: DateOnly) => date >= Limits.firstDate && date <= Limits.lastDate
