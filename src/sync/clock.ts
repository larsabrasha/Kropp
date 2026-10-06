import { stampTime } from './protocol'

/**
 * Stamps for sync: now in UTC, as an ISO string in whole milliseconds. Postgres keeps microseconds
 * and JavaScript milliseconds, so a finer stamp would not survive the round trip. Never stamp with
 * anything else.
 */
export function now(): string {
  return new Date().toISOString()
}

/** now, unless that is not later than the stored stamp: then one millisecond after it. */
export function nextStamp(now: string, stored: string | undefined): string {
  if (stored === undefined) return now
  const previous = stampTime(stored)
  return stampTime(now) > previous ? now : new Date(previous + 1).toISOString()
}

/**
 * A stamp read back from a backup, in whole milliseconds as now() stamps, and never later than
 * now: a stamp in the future would otherwise win over every change made until then.
 */
export function restoredStamp(stamp: string): string {
  return new Date(Math.min(stampTime(stamp), stampTime(now()))).toISOString()
}
