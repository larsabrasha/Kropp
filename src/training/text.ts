import { formatNumber } from '../i18n/i18n'
import type { ExerciseKind, SetResult, WorkoutExercise } from './model'

// Short, unit-bearing texts for targets and sets, formatted in the current language ("22,5 kg" in Swedish).

export const num = formatNumber

const present = (parts: (string | undefined)[]) => parts.filter((p): p is string => p !== undefined)

/** "3 × 8 @ 20 kg", "3 × 30 s", "3 set @ 5 kg", "20 min", or empty when nothing is planned. */
export function target(entry: WorkoutExercise, kind: ExerciseKind): string {
  if (kind === 'Cardio')
    return present([
      entry.targetDurationMinutes !== undefined ? `${num(entry.targetDurationMinutes)} min` : undefined,
      entry.targetDistanceKm !== undefined ? `${num(entry.targetDistanceKm)} km` : undefined,
    ]).join(' · ')

  const sets = entry.targetSets
  const each = kind === 'Timed' ? entry.targetSeconds : entry.targetReps
  const unit = kind === 'Timed' ? ' s' : ''
  const head =
    sets !== undefined && each !== undefined
      ? `${sets} × ${each}${unit}`
      : sets !== undefined
        ? `${sets} set`
        : each !== undefined
          ? kind === 'Timed'
            ? `${each} s`
            : `${each} rep`
          : undefined
  const weight =
    kind === 'Strength' && entry.targetWeightKg !== undefined ? `@ ${num(entry.targetWeightKg)} kg` : undefined
  return present([head, weight]).join(' ')
}

/** The big text on a done set: the reps, or the seconds for a timed exercise. */
export const setMain = (set: SetResult, kind: ExerciseKind) =>
  kind === 'Timed' ? `${set.seconds ?? ''} s` : `${set.reps ?? ''}`

/** The weight of a set, always shown on it, like the plan shows it on a set not yet done. */
export const setWeight = (set: SetResult, kind: ExerciseKind) =>
  kind === 'Strength' && set.weightKg !== undefined ? `${num(set.weightKg)} kg` : undefined

/** Fewer reps (or seconds) than planned, which the set button shows in another colour. */
export function isShort(set: SetResult, entry: WorkoutExercise, kind: ExerciseKind): boolean {
  const [done, planned] = kind === 'Timed' ? [set.seconds, entry.targetSeconds] : [set.reps, entry.targetReps]
  return done !== undefined && planned !== undefined && done < planned
}

// Narrow no-break spaces keep "10 × 100" on one line.
export function setText(set: SetResult, kind: ExerciseKind): string {
  switch (kind) {
    case 'Strength':
      return set.weightKg !== undefined ? `${set.reps ?? ''}\u202F×\u202F${num(set.weightKg)}` : `${set.reps ?? ''}`
    case 'Timed':
      return `${set.seconds ?? ''} s`
    default:
      return `${set.reps ?? ''}`
  }
}

/** What was done: the sets in order, or for cardio the distance and time. */
export function result(entry: WorkoutExercise, kind: ExerciseKind): string {
  if (kind === 'Cardio')
    return present([
      entry.durationMinutes !== undefined ? `${num(entry.durationMinutes)} min` : undefined,
      entry.distanceKm !== undefined ? `${num(entry.distanceKm)} km` : undefined,
      entry.avgHeartRate !== undefined ? `${entry.avgHeartRate} bpm` : undefined,
    ]).join(' · ')
  const first = entry.sets[0]?.weightKg
  if (kind === 'Strength' && first !== undefined && entry.sets.every((s) => s.weightKg === first))
    return `${entry.sets.map((s) => s.reps ?? '').join(', ')} × ${num(first)} kg`
  return entry.sets.map((s) => setText(s, kind)).join(', ')
}

/** A whole number of at least 0 from a field, or undefined. */
export function parseInt0(value: string): number | undefined {
  const text = value.trim()
  if (!/^\+?\d+$/.test(text)) return undefined
  const n = Number(text)
  return Number.isSafeInteger(n) ? n : undefined
}

/** Number inputs report "22.5" whatever the language; a comma is accepted too. */
export function parseDecimal(value: string): number | undefined {
  const text = value.trim().replace(',', '.')
  if (!/^\+?(\d+\.?\d*|\.\d+)$/.test(text)) return undefined
  const n = Number(text)
  return Number.isFinite(n) ? n : undefined
}

/** A value for an input's value attribute: invariant, empty for none. */
export const invariant = (value: number | undefined) => (value === undefined ? '' : String(value))
