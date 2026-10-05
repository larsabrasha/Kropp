import { describe, expect, it } from 'vitest'
import { addDays } from './dates'
import {
  addExercise,
  completeNextSet,
  currentEntry,
  lastTime,
  MAX_SETS,
  moveEntry,
  nextSessionNumber,
  removeEntry,
  statusOf,
} from './editing'
import type { DateOnly, Exercise, SetResult, Workout, WorkoutExercise, WorkoutStatus } from './model'

const bench: Exercise = {
  id: crypto.randomUUID(),
  name: 'Bröst maskin',
  kind: 'Strength',
  isArchived: false,
  categories: [],
  measuresTimeOnly: false,
}
const plank: Exercise = {
  id: crypto.randomUUID(),
  name: 'Plankan',
  kind: 'Timed',
  isArchived: false,
  categories: [],
  measuresTimeOnly: false,
}

/** C#'s default(DateOnly). */
const DEFAULT_DATE: DateOnly = '0001-01-01'

const workout = (
  date: DateOnly,
  session?: number,
  status: WorkoutStatus = 'Done',
  ...entries: WorkoutExercise[]
): Workout => ({ id: crypto.randomUUID(), date, sessionNumber: session, status, exercises: entries })

/** The C# helper's named arguments: Workout(date, status: ..., entries: ...). */
const workoutOf = (date: DateOnly, ...entries: WorkoutExercise[]) => workout(date, undefined, 'Done', ...entries)

const plain = (fields: Partial<WorkoutExercise> = {}): WorkoutExercise => ({
  exerciseId: crypto.randomUUID(),
  order: 0,
  sets: [],
  isSkipped: false,
  ...fields,
})

const entry = (exercise: Exercise, ...sets: SetResult[]): WorkoutExercise => ({
  exerciseId: exercise.id,
  order: 0,
  targetSets: 3,
  targetReps: 8,
  targetWeightKg: 60,
  settings: 'Sitthöjd 11',
  comment: 'tungt',
  sets,
  isSkipped: false,
})

describe('workout editing', () => {
  it('completing a set records the planned reps and weight', () => {
    const e = completeNextSet(entry(bench), 'Strength')

    expect(e.sets).toEqual([{ reps: 8, weightKg: 60 }])
  })

  it('completing a timed set records seconds only', () => {
    const e = plain({ exerciseId: plank.id, targetSets: 2, targetSeconds: 60 })

    expect(completeNextSet(e, 'Timed').sets).toEqual([{ seconds: 60 }])
  })

  it('adding an exercise takes the targets from last time', () => {
    const last = entry(bench, { reps: 8, weightKg: 60 })
    const w = workout('2026-09-23', undefined, 'Planned')

    const added = addExercise(w, bench, last).exercises
    expect(added).toHaveLength(1)
    const e = added[0]!

    expect(e.targetSets).toBe(3)
    expect(e.targetReps).toBe(8)
    expect(e.targetWeightKg).toBe(60)
    expect(e.settings).toBe('Sitthöjd 11')
    expect(e.sets).toEqual([])
  })

  it('adding a new exercise starts at three by eight', () => {
    const added = addExercise(workoutOf('2026-09-23'), bench, undefined).exercises
    expect(added).toHaveLength(1)
    const e = added[0]!

    expect([e.targetSets, e.targetReps, e.targetWeightKg]).toEqual([3, 8, undefined])
  })

  it('last time is the most recent earlier workout with results', () => {
    const older = workout('2026-09-14', 102, 'Done', entry(bench, { reps: 8, weightKg: 55 }))
    const newer = workout('2026-09-21', 104, 'Done', entry(bench, { reps: 8, weightKg: 60 }))
    const plannedOnly = workout('2026-09-22', 105, 'Planned', entry(bench))
    const skipped = workout('2026-09-22', 106, 'Skipped', entry(bench))
    const later = workout('2026-09-30', 110, 'Done', entry(bench, { reps: 8, weightKg: 70 }))
    const current = workout('2026-09-23', 107, 'Planned', entry(bench))

    const last = lastTime([older, newer, plannedOnly, skipped, later, current], current, bench.id)

    expect(last).toBeDefined()
    expect(last!.sets).toHaveLength(1)
    expect(last!.sets[0]!.weightKg).toBe(60)
  })

  it.each<[number, WorkoutStatus]>([
    [0, 'Planned'],
    [1, 'InProgress'],
    [3, 'Done'],
  ])('the status follows from what was logged (%i sets: %s)', (sets, expected) => {
    const e = entry(bench, ...Array.from({ length: sets }, () => ({ reps: 8 })))

    expect(statusOf(workout('2026-09-23', undefined, 'Planned', e), '2026-09-23')).toBe(expected)
  })

  it('a plan stays planned after its day and never turns skipped', () =>
    expect(statusOf(workout('2020-01-01', undefined, 'Skipped', entry(bench)), '2026-09-23')).toBe('Planned'))

  it('a started workout is done once its day has passed', () => {
    const day = '2026-09-21'
    const started = workoutOf(day, entry(bench, { reps: 8 }), entry(bench))

    expect(statusOf(started, day)).toBe('InProgress')
    expect(statusOf(started, addDays(day, 1))).toBe('Done')
    expect(statusOf(workoutOf(day, entry(bench)), addDays(day, 1))).toBe('Planned')
  })

  it('a workout is done when every exercise is finished or skipped', () => {
    const walk = plain({ durationMinutes: 20 })
    const started = entry(bench, { reps: 8 })

    expect(statusOf(workoutOf(DEFAULT_DATE, walk), DEFAULT_DATE)).toBe('Done')
    expect(statusOf(workoutOf(DEFAULT_DATE, walk, started), DEFAULT_DATE)).toBe('InProgress')
    expect(
      statusOf(
        workoutOf(DEFAULT_DATE, walk, { ...started, isSkipped: true }, { ...entry(bench), isSkipped: true }),
        DEFAULT_DATE,
      ),
    ).toBe('Done')
    expect(statusOf(workoutOf(DEFAULT_DATE, { ...entry(bench), isSkipped: true }), DEFAULT_DATE)).toBe('Planned')
  })

  it('the next session number follows the highest', () => {
    expect(nextSessionNumber([workout(DEFAULT_DATE, 101), workout(DEFAULT_DATE, 103), workout(DEFAULT_DATE)])).toBe(104)
    expect(nextSessionNumber([])).toBe(1)
  })

  it('removing and moving entries keeps the order contiguous', () => {
    const a = plain()
    const b = plain()
    const c = plain()
    const w = workoutOf(DEFAULT_DATE, { ...a, order: 0 }, { ...b, order: 1 }, { ...c, order: 2 })

    const moved = moveEntry(w, 2, 0)
    expect(moved.exercises.map((e) => e.exerciseId)).toEqual([c.exerciseId, a.exerciseId, b.exerciseId])
    expect(moved.exercises.map((e) => e.order)).toEqual([0, 1, 2])

    expect(moveEntry(moved, 0, 2).exercises.map((e) => e.exerciseId)).toEqual([
      a.exerciseId,
      b.exerciseId,
      c.exerciseId,
    ])

    const removed = removeEntry(moved, 0)
    expect(removed.exercises.map((e) => e.exerciseId)).toEqual([a.exerciseId, b.exerciseId])
    expect(removed.exercises.map((e) => e.order)).toEqual([0, 1])

    expect(moveEntry(removed, 0, 5)).toBe(removed)
    expect(moveEntry(removed, 1, 1)).toBe(removed)
  })

  it('the current exercise is the first not finished', () => {
    const warmUp = plain({ durationMinutes: 10 })
    const finished = entry(bench, {}, {}, {})
    const started = entry(bench, {})

    expect(currentEntry(workoutOf(DEFAULT_DATE, warmUp, finished, started, entry(bench)))).toBe(2)
    expect(currentEntry(workoutOf(DEFAULT_DATE, { ...warmUp, durationMinutes: undefined }, finished))).toBe(0)
    expect(currentEntry(workoutOf(DEFAULT_DATE, warmUp, plain({ exerciseId: bench.id })))).toBe(1)
    expect(currentEntry(workoutOf(DEFAULT_DATE, warmUp, finished))).toBeUndefined()
    expect(currentEntry(workoutOf(DEFAULT_DATE))).toBeUndefined()
  })

  it('a skipped exercise is finished whatever its sets', () => {
    const started = entry(bench, { reps: 8 })

    expect(currentEntry(workoutOf(DEFAULT_DATE, { ...started, isSkipped: true }, entry(bench)))).toBe(1)
    expect(currentEntry(workoutOf(DEFAULT_DATE, { ...entry(bench), isSkipped: true }))).toBeUndefined()
  })

  it('no set is added past ten', () => {
    const e = plain({ targetReps: 8, sets: Array.from({ length: MAX_SETS }, () => ({ reps: 8 })) })

    expect(completeNextSet(e, 'Bodyweight').sets).toHaveLength(10)
  })
})
