import { Limits } from './limits'
import {
  BODY_AREAS,
  type BodyArea,
  type DateOnly,
  type Exercise,
  type ExerciseKind,
  type SetResult,
  type Workout,
  type WorkoutExercise,
  type WorkoutStatus,
} from './model'

// The edits the workout page makes, as pure functions on the immutable model. Each returns a new
// aggregate for the page to save whole, which is also the unit sync sends.

export type FindExercise = (id: string) => Exercise | undefined

/** Compares optional numbers with a missing one first, as .NET orders nullable values. */
export const compareOptional = (a: number | undefined, b: number | undefined) =>
  a === b ? 0 : a === undefined ? -1 : b === undefined ? 1 : a - b

/**
 * A workout of an earlier day opens locked: what was logged is history, and a stray tap
 * should not change it. A plan for today or later stays open to edit.
 */
export const opensLocked = (workout: Workout, today: DateOnly) => workout.date < today

/**
 * The status follows from what was logged, so there is nothing to tick: nothing recorded is a
 * plan, whatever the date; something recorded is in progress until every exercise is finished,
 * and done once its day has passed. A workout of an earlier day is over, even if not every
 * planned set was logged, as in most of the log imported from Numbers.
 */
export function statusOf(workout: Workout, today: DateOnly): WorkoutStatus {
  if (!workout.exercises.some(hasResult)) return 'Planned'
  return workout.date < today || currentEntry(workout) === undefined ? 'Done' : 'InProgress'
}

/** Started or done: the workout happened, which is what planning counts. */
export const hasHappened = (workout: Workout) => workout.exercises.some(hasResult)

/** The workout with its stored status brought in line with statusOf. */
export const withDerivedStatus = (workout: Workout, today: DateOnly): Workout => ({
  ...workout,
  status: statusOf(workout, today),
})

/**
 * The body areas a workout trains, most exercises first, for naming it. Cardio is left out:
 * the walk that warms up nearly every session would otherwise make every session "legs".
 * Ties go to the area the workout comes to first, as a session tends to start with what it is
 * for; areas of the same exercise keep the order of BODY_AREAS.
 */
export function areasOf(
  workout: Workout,
  exercise: FindExercise,
  categories: (e: Exercise) => readonly BodyArea[],
): BodyArea[] {
  const groups = new Map<BodyArea, { count: number; first: number }>()
  workout.exercises
    .map((e) => exercise(e.exerciseId))
    .filter((e): e is Exercise => e !== undefined && e.kind !== 'Cardio')
    .forEach((e, index) => {
      for (const area of categories(e)) {
        const group = groups.get(area)
        if (group) group.count++
        else groups.set(area, { count: 1, first: index })
      }
    })
  return [...groups.entries()]
    .sort(
      ([a, ga], [b, gb]) => gb.count - ga.count || ga.first - gb.first || BODY_AREAS.indexOf(a) - BODY_AREAS.indexOf(b),
    )
    .map(([area]) => area)
}

/** Whether the workout has only cardio, which is named as such. */
export const isCardioOnly = (workout: Workout, exercise: FindExercise) =>
  workout.exercises.length > 0 && workout.exercises.every((e) => exercise(e.exerciseId)?.kind === 'Cardio')

export function nextSessionNumber(workouts: readonly Workout[]): number {
  return Math.max(0, ...workouts.map((w) => w.sessionNumber ?? 0)) + 1
}

/**
 * Adds an exercise at the end. Targets come from the last time it was done, so a plan starts
 * where the previous session left off; the user raises the weight when it is time.
 */
export function addExercise(workout: Workout, exercise: Exercise, lastTime: WorkoutExercise | undefined): Workout {
  const kind = exercise.kind
  const entry: WorkoutExercise = {
    exerciseId: exercise.id,
    order: workout.exercises.length,
    settings: lastTime?.settings,
    targetSets:
      lastTime?.targetSets ?? (lastTime && lastTime.sets.length > 0 ? lastTime.sets.length : defaultSets(kind)),
    targetReps: lastTime?.targetReps ?? defaultReps(kind),
    targetWeightKg: kind === 'Strength' ? lastTime?.targetWeightKg : undefined,
    targetSeconds: kind === 'Timed' ? (lastTime?.targetSeconds ?? 30) : undefined,
    targetDurationMinutes: kind === 'Cardio' ? lastTime?.targetDurationMinutes : undefined,
    targetDistanceKm: kind === 'Cardio' ? lastTime?.targetDistanceKm : undefined,
    sets: [],
    isSkipped: false,
  }
  return { ...workout, exercises: [...workout.exercises, entry] }
}

export function replaceEntry<T extends { exercises: WorkoutExercise[] }>(
  workout: T,
  index: number,
  entry: WorkoutExercise,
): T {
  const exercises = [...workout.exercises]
  exercises[index] = { ...entry, order: index }
  return { ...workout, exercises }
}

export function removeEntry<T extends { exercises: WorkoutExercise[] }>(workout: T, index: number): T {
  return {
    ...workout,
    exercises: workout.exercises.filter((_, i) => i !== index).map((e, i) => ({ ...e, order: i })),
  }
}

/** Moves an entry to a new position, as a drag and drop does. */
export function moveEntry<T extends { exercises: WorkoutExercise[] }>(workout: T, from: number, to: number): T {
  const count = workout.exercises.length
  if (from === to || from < 0 || to < 0 || from >= count || to >= count) return workout
  const exercises = [...workout.exercises]
  const [moved] = exercises.splice(from, 1)
  exercises.splice(to, 0, moved!)
  return { ...workout, exercises: exercises.map((e, i) => ({ ...e, order: i })) }
}

/**
 * The most sets the app offers for one exercise, planned or done. More than anyone logs, and
 * few enough that the sets still fit the card. The server allows more, for older data.
 */
export const MAX_SETS = Limits.sets

/** Records the next set as done at the planned values, the one-tap case at the gym. */
export function completeNextSet(entry: WorkoutExercise, kind: ExerciseKind): WorkoutExercise {
  if (entry.sets.length >= MAX_SETS) return entry
  const previous = entry.sets.at(-1)
  const set: SetResult =
    kind === 'Timed'
      ? { seconds: entry.targetSeconds ?? previous?.seconds }
      : kind === 'Bodyweight'
        ? { reps: entry.targetReps ?? previous?.reps }
        : { reps: entry.targetReps ?? previous?.reps, weightKg: entry.targetWeightKg ?? previous?.weightKg }
  return { ...entry, sets: [...entry.sets, set] }
}

export function replaceSet(entry: WorkoutExercise, index: number, set: SetResult): WorkoutExercise {
  const sets = [...entry.sets]
  sets[index] = set
  return { ...entry, sets }
}

export const removeSet = (entry: WorkoutExercise, index: number): WorkoutExercise => ({
  ...entry,
  sets: entry.sets.filter((_, i) => i !== index),
})

/** Newest first: by date, then by session number, a missing one last. */
const newestFirst = (a: Workout, b: Workout) =>
  b.date.localeCompare(a.date) || compareOptional(b.sessionNumber, a.sessionNumber)

/**
 * The most recent other workout, on or before current's date, where the exercise has something
 * recorded. Ties on a date go to the higher session number.
 */
export function lastTime(
  workouts: readonly Workout[],
  current: Workout,
  exerciseId: string,
): WorkoutExercise | undefined {
  return lastTimeOn(workouts, current, exerciseId)?.entry
}

/** lastTime with the day it was, to say how long ago. */
export function lastTimeOn(
  workouts: readonly Workout[],
  current: Workout,
  exerciseId: string,
): { date: DateOnly; entry: WorkoutExercise } | undefined {
  const candidates = workouts.filter((w) => w.id !== current.id && w.date <= current.date).sort(newestFirst)
  for (const w of candidates) {
    const entry = w.exercises.find((e) => e.exerciseId === exerciseId && hasResult(e))
    if (entry) return { date: w.date, entry }
  }
  return undefined
}

/** The newest workout that has exercises, the natural one to copy. */
export function latestWithExercises(workouts: readonly Workout[]): Workout | undefined {
  return workouts.filter((w) => w.exercises.length > 0).sort(newestFirst)[0]
}

/**
 * The exercise the user is on: the first, in order, that is not finished. Undefined when every
 * exercise is finished.
 */
export function currentEntry(workout: Workout): number | undefined {
  const index = workout.exercises.findIndex((e) => !isFinished(e))
  return index < 0 ? undefined : index
}

/**
 * Skipped, or done: cardio with a time or a distance, anything else with its planned sets
 * (one set when nothing is planned). Cardio has no sets, so it needs no kind to tell.
 */
export const isFinished = (e: WorkoutExercise) =>
  e.isSkipped ||
  e.durationMinutes !== undefined ||
  e.distanceKm !== undefined ||
  e.sets.length >= Math.max(e.targetSets ?? 1, 1)

/**
 * Records cardio as done at the planned time and distance, the cardio twin of completeNextSet.
 * What is not planned comes from last time, and so does the pulse.
 */
export const completeCardio = (entry: WorkoutExercise, lastTime: WorkoutExercise | undefined): WorkoutExercise => ({
  ...entry,
  durationMinutes: entry.targetDurationMinutes ?? lastTime?.durationMinutes,
  distanceKm: entry.targetDistanceKm ?? lastTime?.distanceKm,
  avgHeartRate: lastTime?.avgHeartRate,
})

/**
 * Cardio's planned minutes in a template. Templates from before cardio had targets kept them
 * in durationMinutes, which a template never uses for a result.
 */
export const cardioTargetMinutes = (templateEntry: WorkoutExercise) =>
  templateEntry.targetDurationMinutes ?? templateEntry.durationMinutes

export const cardioTargetKm = (templateEntry: WorkoutExercise) =>
  templateEntry.targetDistanceKm ?? templateEntry.distanceKm

export const clearCardio = (entry: WorkoutExercise): WorkoutExercise => ({
  ...entry,
  durationMinutes: undefined,
  distanceKm: undefined,
  avgHeartRate: undefined,
})

/** Whether anything was recorded: a set, or for cardio a time or a distance. */
export const hasResult = (e: WorkoutExercise) =>
  e.sets.length > 0 || e.durationMinutes !== undefined || e.distanceKm !== undefined

const defaultSets = (kind: ExerciseKind) => (kind === 'Cardio' ? undefined : 3)

const defaultReps = (kind: ExerciseKind) => (kind === 'Strength' || kind === 'Bodyweight' ? 8 : undefined)
