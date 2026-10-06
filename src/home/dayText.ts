import { formatDate, t } from '../i18n/i18n'
import { addDays, daysBetween } from '../training/dates'
import type { DateOnly } from '../training/model'

/** A day as the home page names it: "I dag", "I morgon, 24 sep", else "torsdag 24 sep". */
export function dayText(date: DateOnly, day: DateOnly): string {
  if (date === day) return t('Next.Today')
  if (date === addDays(day, 1)) return t('Next.Tomorrow', formatDate(date, 'd MMM'))
  return formatDate(date, 'dddd d MMM')
}

/** How far away a day is: "I dag", "I morgon", "Om 3 dagar". */
export function relativeDay(date: DateOnly, day: DateOnly): string {
  const days = daysBetween(day, date)
  if (days === 0) return t('Next.Today')
  if (days === 1) return t('Next.TomorrowShort')
  return days > 1 ? t('Next.InDays', days) : t('Next.DaysAgo', -days)
}
