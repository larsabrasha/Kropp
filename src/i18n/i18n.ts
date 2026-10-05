import { toUtcDate } from '../training/dates'
import type { DateOnly } from '../training/model'
import { en } from './en'
import { sv } from './sv'

// All UI text goes through t(). The app follows the browser's language: Swedish for sv, English
// for everything else. Add every new key to both en.ts and sv.ts.

export type MessageKey = keyof typeof en
export type Messages = Record<MessageKey, string>

export type Language = 'sv' | 'en'

const messages: Record<Language, Messages> = { en, sv }

const fromBrowser = (): Language =>
  typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('sv') ? 'sv' : 'en'

let language: Language = fromBrowser()

/** The locale for Intl: Swedish as in Sweden, English as in Britain (Monday first, day before month). */
export const locale = () => (language === 'sv' ? 'sv-SE' : 'en-GB')
export const currentLanguage = () => language

/** For tests, and nothing else: the app picks its language once at start. */
export function setLanguage(l: Language) {
  language = l
  if (typeof document !== 'undefined') document.documentElement.lang = l
}

/** The text for key, with {0}, {1}… replaced by args. */
export function t(key: MessageKey, ...args: (string | number)[]): string {
  const text = messages[language][key] ?? en[key] ?? key
  return args.length === 0 ? text : text.replace(/\{(\d+)\}/g, (m, i) => (i < args.length ? String(args[i]) : m))
}

/** A number as the app shows it: at most two decimals, a comma in Swedish ("22,5"). */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat(locale(), { maximumFractionDigits: 2, useGrouping: false }).format(value)
}

const part = (date: Date, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(locale(), { ...options, timeZone: 'UTC' }).format(date)

/**
 * A calendar date by a pattern of .NET-style tokens, as the .NET version showed them:
 * dddd (weekday), ddd (short weekday), d (day), MMMM (month), MMM (short month), yyyy (year).
 */
export function formatDate(date: DateOnly, pattern: string): string {
  const d = toUtcDate(date)
  return pattern.replace(/dddd|ddd|d|MMMM|MMM|yyyy/g, (token) => {
    switch (token) {
      case 'dddd':
        return part(d, { weekday: 'long' })
      case 'ddd':
        return part(d, { weekday: 'short' })
      case 'd':
        return String(d.getUTCDate())
      case 'MMMM':
        return part(d, { month: 'long' })
      case 'MMM':
        return part(d, { month: 'short' })
      default:
        return String(d.getUTCFullYear())
    }
  })
}

/** "måndag 21 sep" with the weekday's first letter capitalised, as at the start of a line. */
export const capitalize = (text: string) => text.charAt(0).toLocaleUpperCase(locale()) + text.slice(1)

/** The time of day of an instant, in the device's own time zone ("14:05"). */
export function formatTime(instant: Date): string {
  return new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit' }).format(instant)
}

/** Two-letter weekday names from Monday: "må ti on to fr lö sö", "Mo Tu We Th Fr Sa Su". */
export function shortestDayNames(): string[] {
  // 2024-01-01 was a Monday.
  return Array.from({ length: 7 }, (_, i) => part(new Date(Date.UTC(2024, 0, 1 + i)), { weekday: 'short' }).slice(0, 2))
}

/** Case-insensitive comparison in the current language, for sorting names. */
export const compareText = (a: string, b: string) => a.localeCompare(b, locale(), { sensitivity: 'base' })

export const lower = (text: string) => text.toLocaleLowerCase(locale())
