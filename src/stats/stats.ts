import { categoriesOf } from '../training/categories'
import { addDays, addMonths, dateOf, daysBetween, monthOf, mondayOf, yearOf } from '../training/dates'
import { hasResult } from '../training/editing'
import {
  BODY_AREAS,
  type BodyArea,
  type DateOnly,
  type Exercise,
  type ExerciseKind,
  type SetResult,
  type Workout,
  type WorkoutExercise,
} from '../training/model'

// The numbers the statistics show, as pure functions of the workouts. Only what was logged counts:
// a set done, a time or a distance; a plan that never happened is not training. An exercise is
// counted by its kind now, as the workout page shows it.

export const PERIODS = ['1M', '3M', '6M', '1Y', 'All'] as const
export type Period = (typeof PERIODS)[number]
export const DEFAULT_PERIOD: Period = '3M'

export const isPeriod = (value: string | null): value is Period => (PERIODS as readonly string[]).includes(value ?? '')

export type Unit = 'week' | 'month' | 'year'

/** A stretch of days, both ends included. */
export interface Span {
  start: DateOnly
  end: DateOnly
}

export interface Range extends Span {
  /** What one bar of the period's charts covers. */
  unit: Unit
}

type Find = (id: string) => Exercise | undefined

/** The workouts that happened: on today or before, with something logged. Oldest first. */
export function logged(workouts: readonly Workout[], today: DateOnly): Workout[] {
  return workouts
    .filter((w) => w.date <= today && w.exercises.some(hasResult))
    .sort((a, b) => a.date.localeCompare(b.date))
}

const firstOfMonth = (date: DateOnly) => dateOf(yearOf(date), monthOf(date), 1)

/**
 * The days a period covers, up to today, and its bars: weeks for one, three and six months (5, 13
 * and 26), months for a year (12), and months or, past three years, years for all of it.
 */
export function rangeOf(period: Period, today: DateOnly, first: DateOnly | undefined): Range {
  switch (period) {
    case '1M':
      return { start: mondayOf(addDays(today, -7 * 4)), end: today, unit: 'week' }
    case '3M':
      return { start: mondayOf(addDays(today, -7 * 12)), end: today, unit: 'week' }
    case '6M':
      return { start: mondayOf(addDays(today, -7 * 25)), end: today, unit: 'week' }
    case '1Y':
      return { start: addMonths(firstOfMonth(today), -11), end: today, unit: 'month' }
    case 'All': {
      const from = first !== undefined && first < today ? first : today
      const months = (yearOf(today) - yearOf(from)) * 12 + monthOf(today) - monthOf(from) + 1
      if (months > 36) return { start: dateOf(yearOf(from), 1, 1), end: today, unit: 'year' }
      // At least six bars, so a short history does not draw a few fat ones.
      return { start: addMonths(firstOfMonth(today), -Math.max(months, 6) + 1), end: today, unit: 'month' }
    }
  }
}

/** The range's bars in order, each the days it covers; the last ends on the range's end. */
export function bucketsOf(range: Range): Span[] {
  const next = (date: DateOnly) =>
    range.unit === 'week' ? addDays(date, 7) : range.unit === 'month' ? addMonths(date, 1) : addMonths(date, 12)
  const spans: Span[] = []
  for (let start = range.start; start <= range.end; start = next(start)) {
    const end = addDays(next(start), -1)
    spans.push({ start, end: end < range.end ? end : range.end })
  }
  return spans
}

const within = (date: DateOnly, span: Span) => date >= span.start && date <= span.end

/**
 * The weeks a span lasts, at least one, counted in days: a week begun counts as the part of it
 * gone, so this Wednesday's average neither waits for Sunday nor pretends the week is over.
 */
export const weeksIn = (span: Span) => Math.max(1, (daysBetween(span.start, span.end) + 1) / 7)

// What one workout adds up to.

/** Sets done in the workout's exercises that are not cardio. */
export function setsOf(workout: Workout, find: Find): number {
  return workout.exercises
    .filter((e) => find(e.exerciseId)?.kind !== 'Cardio')
    .reduce((sum, e) => sum + e.sets.length, 0)
}

/** Kilograms lifted in an entry: each set's reps times its weight. */
export const volumeOf = (entry: WorkoutExercise) =>
  entry.sets.reduce((sum, s) => sum + (s.reps ?? 0) * (s.weightKg ?? 0), 0)

/** Kilograms lifted in the workout's strength exercises. */
export function workoutVolume(workout: Workout, find: Find): number {
  return workout.exercises.filter((e) => find(e.exerciseId)?.kind === 'Strength').reduce((s, e) => s + volumeOf(e), 0)
}

export interface Totals {
  workouts: number
  perWeek: number
  /** Different exercises logged. */
  exercises: number
  sets: number
  volumeKg: number
  cardioMinutes: number
}

/** What the logged workouts in a span add up to. */
export function totalsOf(workouts: readonly Workout[], span: Span, find: Find): Totals {
  const inSpan = workouts.filter((w) => within(w.date, span))
  const cardioMinutes = inSpan
    .flatMap((w) => w.exercises)
    .filter((e) => find(e.exerciseId)?.kind === 'Cardio')
    .reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0)
  return {
    workouts: inSpan.length,
    perWeek: inSpan.length / weeksIn(span),
    exercises: new Set(inSpan.flatMap((w) => w.exercises.filter(hasResult).map((e) => e.exerciseId))).size,
    sets: inSpan.reduce((sum, w) => sum + setsOf(w, find), 0),
    volumeKg: inSpan.reduce((sum, w) => sum + workoutVolume(w, find), 0),
    cardioMinutes,
  }
}

/** A value for each bar of the range: what value gives for the workouts in its days. */
export function perBucket(
  workouts: readonly Workout[],
  range: Range,
  value: (inBucket: Workout[]) => number,
): { span: Span; value: number }[] {
  return bucketsOf(range).map((span) => ({ span, value: value(workouts.filter((w) => within(w.date, span))) }))
}

/** Sets done for each body area in the span, most first; an exercise's sets count for each of its areas. */
export function setsPerArea(workouts: readonly Workout[], span: Span, find: Find): { area: BodyArea; sets: number }[] {
  const sets = new Map<BodyArea, number>()
  for (const w of workouts) {
    if (!within(w.date, span)) continue
    for (const e of w.exercises) {
      const exercise = find(e.exerciseId)
      if (!exercise || exercise.kind === 'Cardio' || e.sets.length === 0) continue
      for (const area of categoriesOf(exercise)) sets.set(area, (sets.get(area) ?? 0) + e.sets.length)
    }
  }
  return [...sets.entries()]
    .map(([area, n]) => ({ area, sets: n }))
    .sort((a, b) => b.sets - a.sets || BODY_AREAS.indexOf(a.area) - BODY_AREAS.indexOf(b.area))
}

// One exercise over time.

/** One time an exercise was done: its entries in one workout, together. */
export interface Occasion {
  workoutId: string
  date: DateOnly
  entries: WorkoutExercise[]
}

/** Every time the exercise was logged, oldest first. */
export function occasionsOf(workouts: readonly Workout[], exerciseId: string): Occasion[] {
  return workouts
    .map((w) => ({
      workoutId: w.id,
      date: w.date,
      entries: w.exercises.filter((e) => e.exerciseId === exerciseId && hasResult(e)),
    }))
    .filter((o) => o.entries.length > 0)
}

/**
 * What can be followed over time, by kind. Strength: the heaviest set, the one-rep max it implies
 * and the kilograms lifted. Bodyweight and timed: the best set and the whole workout's. Cardio:
 * time, distance, pace and pulse, or time alone for what is logged by time alone.
 */
export const METRICS = {
  weight: 'Strength',
  oneRepMax: 'Strength',
  volume: 'Strength',
  bestReps: 'Bodyweight',
  totalReps: 'Bodyweight',
  bestSeconds: 'Timed',
  totalSeconds: 'Timed',
  duration: 'Cardio',
  distance: 'Cardio',
  pace: 'Cardio',
  heartRate: 'Cardio',
} as const satisfies Record<string, ExerciseKind>

export type Metric = keyof typeof METRICS

export function metricsFor(exercise: Exercise): Metric[] {
  if (exercise.kind === 'Cardio' && exercise.measuresTimeOnly) return ['duration']
  return (Object.keys(METRICS) as Metric[]).filter((m) => METRICS[m] === exercise.kind)
}

/** Whether a lower value is the better one: only pace, minutes per kilometre. */
export const lowerIsBetter = (metric: Metric) => metric === 'pace'

/**
 * The one-rep max a set implies, by Epley's formula: weight × (1 + reps / 30). Only for 1 to 12
 * reps, where the formula holds; a single is its own max.
 */
export function oneRepMax(reps: number | undefined, weightKg: number | undefined): number | undefined {
  if (reps === undefined || weightKg === undefined || reps < 1 || reps > 12 || weightKg <= 0) return undefined
  return reps === 1 ? weightKg : weightKg * (1 + reps / 30)
}

const maxOf = (values: (number | undefined)[]) => {
  const present = values.filter((v): v is number => v !== undefined)
  return present.length === 0 ? undefined : Math.max(...present)
}

const sumOf = (values: (number | undefined)[]) => {
  const present = values.filter((v): v is number => v !== undefined)
  return present.length === 0 ? undefined : present.reduce((a, b) => a + b, 0)
}

/** The metric's value for one occasion, or undefined when it was not logged. */
export function valueOf(metric: Metric, occasion: Occasion): number | undefined {
  const sets = occasion.entries.flatMap((e) => e.sets)
  const { entries } = occasion
  switch (metric) {
    case 'weight':
      return maxOf(sets.filter((s) => (s.reps ?? 0) > 0).map((s) => s.weightKg))
    case 'oneRepMax':
      return maxOf(sets.map((s) => oneRepMax(s.reps, s.weightKg)))
    case 'volume': {
      const kg = entries.reduce((sum, e) => sum + volumeOf(e), 0)
      return kg > 0 ? kg : undefined
    }
    case 'bestReps':
      return maxOf(sets.map((s) => s.reps))
    case 'totalReps':
      return sumOf(sets.map((s) => s.reps))
    case 'bestSeconds':
      return maxOf(sets.map((s) => s.seconds))
    case 'totalSeconds':
      return sumOf(sets.map((s) => s.seconds))
    case 'duration':
      return sumOf(entries.map((e) => e.durationMinutes))
    case 'distance':
      return sumOf(entries.map((e) => e.distanceKm))
    case 'pace': {
      const minutes = sumOf(entries.filter((e) => e.distanceKm).map((e) => e.durationMinutes))
      const km = sumOf(entries.filter((e) => e.durationMinutes).map((e) => e.distanceKm))
      return minutes !== undefined && km !== undefined && km > 0 ? minutes / km : undefined
    }
    case 'heartRate':
      return maxOf(entries.map((e) => e.avgHeartRate))
  }
}

export interface Point {
  date: DateOnly
  value: number
  workoutId: string
}

/** The metric for each occasion it was logged, oldest first. */
export const seriesOf = (metric: Metric, occasions: readonly Occasion[]): Point[] =>
  occasions.flatMap((o) => {
    const value = valueOf(metric, o)
    return value === undefined ? [] : [{ date: o.date, value, workoutId: o.workoutId }]
  })

/** The best point of a series, the earliest of equals: when the record was set. */
export function bestOf(metric: Metric, points: readonly Point[]): Point | undefined {
  const better = (a: number, b: number) => (lowerIsBetter(metric) ? a < b : a > b)
  return points.reduce<Point | undefined>(
    (best, p) => (best === undefined || better(p.value, best.value) ? p : best),
    undefined,
  )
}

/** The metric each exercise's records are counted by: what a lifter calls a personal best. */
export function recordMetric(exercise: Exercise): Metric {
  switch (exercise.kind) {
    case 'Strength':
      return 'weight'
    case 'Bodyweight':
      return 'bestReps'
    case 'Timed':
      return 'bestSeconds'
    case 'Cardio':
      return exercise.measuresTimeOnly ? 'duration' : 'distance'
  }
}

export interface PersonalRecord {
  exercise: Exercise
  metric: Metric
  point: Point
  /** The best before it, which it beat. */
  previous: number
}

/**
 * The latest personal record of each exercise: the last time it beat everything before it. The
 * first time an exercise is done is no record, as there is nothing to beat. Newest first.
 */
export function latestRecords(workouts: readonly Workout[], exercises: readonly Exercise[]): PersonalRecord[] {
  const records: PersonalRecord[] = []
  for (const exercise of exercises) {
    const metric = recordMetric(exercise)
    const points = seriesOf(metric, occasionsOf(workouts, exercise.id))
    let best: number | undefined
    let latest: PersonalRecord | undefined
    for (const point of points) {
      if (best !== undefined && (lowerIsBetter(metric) ? point.value < best : point.value > best))
        latest = { exercise, metric, point, previous: best }
      if (best === undefined || (lowerIsBetter(metric) ? point.value < best : point.value > best)) best = point.value
    }
    if (latest) records.push(latest)
  }
  return records.sort((a, b) => b.point.date.localeCompare(a.point.date))
}

/**
 * Every record set in the span, newest first: each time an exercise beat everything before it, by
 * the same measure as latestRecords. The first time an exercise is done is none.
 */
export function recordsIn(workouts: readonly Workout[], exercises: readonly Exercise[], span: Span): PersonalRecord[] {
  const records: PersonalRecord[] = []
  for (const exercise of exercises) {
    const metric = recordMetric(exercise)
    let best: number | undefined
    for (const point of seriesOf(metric, occasionsOf(workouts, exercise.id))) {
      const beats = best !== undefined && (lowerIsBetter(metric) ? point.value < best : point.value > best)
      if (beats && within(point.date, span)) records.push({ exercise, metric, point, previous: best! })
      if (best === undefined || beats) best = point.value
    }
  }
  return records.sort((a, b) => b.point.date.localeCompare(a.point.date))
}

/**
 * The exercises done in the span, each with what value adds up to over its logged entries there,
 * most first; none that add up to nothing. By workouts: how many workouts had the exercise.
 */
export function exercisesBy(
  workouts: readonly Workout[],
  span: Span,
  find: Find,
  value: ((entry: WorkoutExercise) => number) | 'workouts',
): { exercise: Exercise; value: number }[] {
  const sums = new Map<string, number>()
  for (const w of workouts) {
    if (!within(w.date, span)) continue
    const entries = w.exercises.filter(hasResult)
    if (value === 'workouts')
      for (const id of new Set(entries.map((e) => e.exerciseId))) sums.set(id, (sums.get(id) ?? 0) + 1)
    else for (const e of entries) sums.set(e.exerciseId, (sums.get(e.exerciseId) ?? 0) + value(e))
  }
  return [...sums.entries()]
    .flatMap(([id, sum]) => {
      const exercise = find(id)
      return exercise && sum > 0 ? [{ exercise, value: sum }] : []
    })
    .sort((a, b) => b.value - a.value || a.exercise.name.localeCompare(b.exercise.name))
}

/** The week of the span with the most workouts, the earliest of equals; undefined with none. */
export function bestWeek(workouts: readonly Workout[], span: Span): { monday: DateOnly; workouts: number } | undefined {
  const weeks = new Map<DateOnly, number>()
  for (const w of workouts)
    if (within(w.date, span)) weeks.set(mondayOf(w.date), (weeks.get(mondayOf(w.date)) ?? 0) + 1)
  return [...weeks.entries()]
    .sort(([a, n], [b, m]) => m - n || a.localeCompare(b))
    .map(([monday, n]) => ({ monday, workouts: n }))[0]
}

/** What a set counts for in its exercise's records; undefined for a set that does not count. */
function setValue(metric: Metric, set: SetResult): number | undefined {
  switch (metric) {
    case 'weight':
      return (set.reps ?? 0) > 0 ? set.weightKg : undefined
    case 'bestReps':
      return set.reps
    case 'bestSeconds':
      return set.seconds
    default:
      return undefined
  }
}

/**
 * The sets of a workout's entry that were records as they were done: each set that beat every set
 * of the exercise before it, in earlier workouts and earlier in this one. By the exercise's record
 * measure, so none for cardio; the first time an exercise is done has nothing to beat.
 */
export function recordSets(
  history: readonly Workout[],
  workout: Workout,
  entryIndex: number,
  exercise: Exercise,
): Set<number> {
  const records = new Set<number>()
  const metric = recordMetric(exercise)
  const before = history.filter(
    (w) => w.id !== workout.id && (w.date < workout.date || (w.date === workout.date && w.id < workout.id)),
  )
  const earlier = [...before.flatMap((w) => w.exercises), ...workout.exercises.slice(0, entryIndex)].filter(
    (e) => e.exerciseId === exercise.id,
  )
  let best = maxOf(earlier.flatMap((e) => e.sets.map((s) => setValue(metric, s))))
  if (best === undefined) return records
  workout.exercises[entryIndex]?.sets.forEach((set, index) => {
    const value = setValue(metric, set)
    if (value !== undefined && value > best!) {
      records.add(index)
      best = value
    }
  })
  return records
}

// Axes.

/** A round top for an axis from 0, and its steps: 0, 25, 50 rather than 0, 23, 46. */
export function niceScale(max: number, ticks = 3, whole = false): { max: number; step: number } {
  if (!(max > 0)) return { max: 1, step: 1 }
  const raw = max / ticks
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  // Whole steps for what is counted, such as workouts: never 2.5 of them.
  const step = (whole ? [1, 2, 2.5, 4, 5, 10] : [1, 2, 2.5, 5, 10])
    .map((f) => f * magnitude)
    .filter((s) => !whole || Number.isInteger(s))
    .find((s) => s >= Math.max(raw, whole ? 1 : 0))!
  return { max: Math.ceil(max / step) * step, step }
}

/** Round ends for an axis around values that do not start at 0, as a chart of weight over time. */
export function niceDomain(min: number, max: number, ticks = 3): { min: number; max: number; step: number } {
  if (min === max) {
    const pad = min === 0 ? 1 : Math.abs(min) * 0.1
    return niceDomain(min - pad, max + pad, ticks)
  }
  const { step } = niceScale(max - min, ticks)
  const lo = Math.floor(min / step) * step
  return { min: lo < 0 && min >= 0 ? 0 : lo, max: Math.ceil(max / step) * step, step }
}
