import { formatDate } from '../i18n/i18n'
import { addDays, dayOf, monthOf } from '../training/dates'
import type { DateOnly } from '../training/model'

/** A week's days, Monday to Sunday: "21–27 sep.", or "28 sep. – 4 okt." across two months. */
export function weekRange(monday: DateOnly): string {
  const sunday = addDays(monday, 6)
  return monthOf(monday) === monthOf(sunday)
    ? `${dayOf(monday)}–${dayOf(sunday)} ${formatDate(sunday, 'MMM')}`
    : `${formatDate(monday, 'd MMM')} – ${formatDate(sunday, 'd MMM')}`
}
