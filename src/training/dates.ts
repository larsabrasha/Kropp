import type { DateOnly } from './model'

// Calendar arithmetic on yyyy-MM-dd strings. It runs in UTC, where a day is always 24 hours,
// so daylight saving time can never move a date. Such strings also compare correctly as text.

const parse = (date: DateOnly) => new Date(`${date}T00:00:00Z`)
const format = (d: Date): DateOnly => d.toISOString().slice(0, 10)

export function isDateOnly(value: unknown): value is DateOnly {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = parse(value)
  return !Number.isNaN(d.getTime()) && format(d) === value
}

export function addDays(date: DateOnly, days: number): DateOnly {
  const d = parse(date)
  d.setUTCDate(d.getUTCDate() + days)
  return format(d)
}

export function addMonths(date: DateOnly, months: number): DateOnly {
  const d = parse(date)
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + months)
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, last))
  return format(d)
}

/** Days from a to b; negative when b is earlier. */
export function daysBetween(a: DateOnly, b: DateOnly): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000)
}

/** 0 for Monday through 6 for Sunday. */
export function weekdayIndex(date: DateOnly): number {
  return (parse(date).getUTCDay() + 6) % 7
}

export function mondayOf(date: DateOnly): DateOnly {
  return addDays(date, -weekdayIndex(date))
}

/** The ISO 8601 week number: weeks start on Monday, and week 1 holds the year's first Thursday. */
export function weekNumber(date: DateOnly): number {
  const thursday = parse(addDays(date, 3 - weekdayIndex(date)))
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1)
  return Math.floor((thursday.getTime() - yearStart) / 86_400_000 / 7) + 1
}

export function yearOf(date: DateOnly): number {
  return Number(date.slice(0, 4))
}

/** 1 for January. */
export function monthOf(date: DateOnly): number {
  return Number(date.slice(5, 7))
}

export function dayOf(date: DateOnly): number {
  return Number(date.slice(8, 10))
}

export function dateOf(year: number, month: number, day: number): DateOnly {
  return format(new Date(Date.UTC(year, month - 1, day)))
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Today in the device's own time zone: the day the user is at the gym. */
export function today(): DateOnly {
  const now = new Date()
  return dateOf(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

/** A Date for formatting a calendar date with Intl, which must then use timeZone 'UTC'. */
export function toUtcDate(date: DateOnly): Date {
  return parse(date)
}

export const maxDate = (a: DateOnly, b: DateOnly) => (a > b ? a : b)
