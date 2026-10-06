import { formatDate } from '../i18n/i18n'
import { stampTime } from '../sync/protocol'
import { dateOf } from '../training/dates'
import type { DateOnly } from '../training/model'

// Dates in the previews of an export and an import.

/** The day of an instant in the device's own time zone. */
export function localDate(stamp: string): DateOnly {
  const d = new Date(stampTime(stamp))
  return dateOf(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

/** "3 sep 2024 – 6 okt 2026", or one day, or undefined without workouts. */
export function dateRange(dates: readonly DateOnly[]): string | undefined {
  if (dates.length === 0) return undefined
  const sorted = [...dates].sort()
  const first = formatDate(sorted[0]!, 'd MMM yyyy')
  const last = formatDate(sorted.at(-1)!, 'd MMM yyyy')
  return first === last ? first : `${first} – ${last}`
}
