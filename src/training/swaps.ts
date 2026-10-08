import { categoriesOf, type ExerciseMap } from './categories'
import { hasResult } from './editing'
import type { Exercise, Workout } from './model'

// What an exercise in a workout is most likely changed for: what has been done in its place.

/** How many of the latest workouts count, so the suggestions follow what is done now. */
const RECENT_WORKOUTS = 30
/** As many as fit over the search without pushing the list away. */
export const MAX_SWAPS = 3

type Place = 'first' | 'middle' | 'last'

/** Where in a workout an exercise is, roughly, as workouts are of different lengths. */
const placeOf = (index: number, length: number): Place =>
  index === 0 ? 'first' : index === length - 1 ? 'last' : 'middle'

/**
 * Up to MAX_SWAPS exercises to change the one at index of workout for, most likely first. Only of
 * the same kind, and, but for cardio, training an area it trains: the bench press is changed for
 * dumbbell presses, not squats. Ranked by how often each was done in the same place, first, last
 * or between, in the latest workouts, then by how often at all, then by the latest. Only what was
 * done counts, so an exercise never done is never suggested; neither is one already in the workout.
 */
export function swapSuggestions(
  workout: Workout,
  index: number,
  history: readonly Workout[],
  exercises: ExerciseMap,
): Exercise[] {
  const current = exercises.get(workout.exercises[index]?.exerciseId ?? '')
  if (!current) return []
  const areas = new Set(categoriesOf(current))
  const inWorkout = new Set(workout.exercises.map((e) => e.exerciseId))
  const fits = (e: Exercise) =>
    !e.isArchived &&
    !inWorkout.has(e.id) &&
    e.kind === current.kind &&
    (e.kind === 'Cardio' || categoriesOf(e).some((area) => areas.has(area)))

  const place = placeOf(index, workout.exercises.length)
  const counts = new Map<string, { here: number; all: number; latest: string }>()
  const recent = history
    .filter((w) => w.id !== workout.id && w.exercises.some(hasResult))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, RECENT_WORKOUTS)
  for (const w of recent) {
    w.exercises.forEach((entry, i) => {
      if (!hasResult(entry)) return
      const exercise = exercises.get(entry.exerciseId)
      if (!exercise || !fits(exercise)) return
      const count = counts.get(exercise.id) ?? { here: 0, all: 0, latest: w.date }
      if (placeOf(i, w.exercises.length) === place) count.here++
      count.all++
      if (w.date > count.latest) count.latest = w.date
      counts.set(exercise.id, count)
    })
  }
  return [...counts.entries()]
    .sort(
      ([, a], [, b]) => b.here - a.here || b.all - a.all || (a.latest < b.latest ? 1 : a.latest > b.latest ? -1 : 0),
    )
    .slice(0, MAX_SWAPS)
    .flatMap(([id]) => exercises.get(id) ?? [])
}
