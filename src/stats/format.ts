import { formatDate, formatNumber, locale, t } from '../i18n/i18n'
import { weekNumber } from '../training/dates'
import { PERIODS, type Metric, type Span, type Unit } from './stats'

// The statistics' numbers as text, in the current language.

/** A whole number with the language's grouping, for large sums: "12 340". */
export const formatWhole = (value: number) =>
  new Intl.NumberFormat(locale(), { maximumFractionDigits: 0 }).format(value)

/** One decimal at most, for averages: "2,7". */
export const formatOne = (value: number) => new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }).format(value)

/** Minutes per kilometre as a clock: "6:05". */
export function formatPace(minutesPerKm: number): string {
  const seconds = Math.round(minutesPerKm * 60)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/** A metric's value without its unit, as a chart's axis shows it. */
export function metricNumber(metric: Metric, value: number): string {
  switch (metric) {
    case 'pace':
      return formatPace(value)
    case 'volume':
      return formatWhole(value)
    case 'oneRepMax':
      return formatNumber(Math.round(value * 2) / 2)
    case 'distance':
    case 'weight':
    case 'duration':
      return formatNumber(value)
    default:
      return formatWhole(value)
  }
}

export const METRIC_UNITS: Record<Metric, string> = {
  weight: 'kg',
  oneRepMax: 'kg',
  volume: 'kg',
  bestReps: 'rep',
  totalReps: 'rep',
  bestSeconds: 's',
  totalSeconds: 's',
  duration: 'min',
  distance: 'km',
  pace: 'min/km',
  heartRate: 'bpm',
}

/** A metric's value with its unit: "62,5 kg", "6:05 min/km". */
export const metricText = (metric: Metric, value: number) => `${metricNumber(metric, value)} ${METRIC_UNITS[metric]}`

/** What one bar covers, in words: "v. 38", "september 2026", "2025". */
export function spanTitle(span: Span, unit: Unit): string {
  switch (unit) {
    case 'week':
      return `${t('Calendar.WeekShort')} ${weekNumber(span.start)} · ${formatDate(span.start, 'd MMM')}–${formatDate(span.end, 'd MMM')}`
    case 'month':
      return formatDate(span.start, 'MMMM yyyy')
    case 'year':
      return formatDate(span.start, 'yyyy')
  }
}

/** The days of a whole period: "29 jun–23 sep 2026". */
export function rangeText(span: Span): string {
  const sameYear = span.start.slice(0, 4) === span.end.slice(0, 4)
  return `${formatDate(span.start, sameYear ? 'd MMM' : 'd MMM yyyy')}–${formatDate(span.end, 'd MMM yyyy')}`
}

/**
 * The label under a bar, or none: a week's when it starts a month, a month's first letter, a year.
 * Short, so the labels of a year of weeks never meet.
 */
export function axisLabel(span: Span, unit: Unit): string | undefined {
  switch (unit) {
    case 'week': {
      const day = Number(span.start.slice(8, 10))
      return day <= 7 ? formatDate(span.start, 'MMM').replace('.', '') : undefined
    }
    case 'month':
      return formatDate(span.start, 'MMM').replace('.', '').charAt(0).toLocaleUpperCase(locale())
    case 'year':
      return span.start.slice(0, 4)
  }
}

/** The periods as the segmented control names them: "3 mån", "1 år", "Allt". */
export const periodOptions = () => PERIODS.map((p) => ({ value: p, label: t(`Stats.Period.${p}`) }))

/** "Mål 3" for a goal line, short enough for the axis. */
export const goalLabel = (value: number) => `${t('Stats.Goal')} ${value}`
