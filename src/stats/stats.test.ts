import { describe, expect, it } from 'vitest'
import type { Exercise, SetResult, Workout, WorkoutExercise } from '../training/model'
import {
  bestOf,
  bucketsOf,
  goalStreak,
  latestRecords,
  logged,
  niceDomain,
  niceScale,
  occasionsOf,
  oneRepMax,
  rangeOf,
  seriesOf,
  setsPerArea,
  totalsOf,
  valueOf,
} from './stats'

const exercise = (id: string, kind: Exercise['kind'], categories: Exercise['categories'] = []): Exercise => ({
  id,
  name: id,
  kind,
  isArchived: false,
  categories,
  measuresTimeOnly: false,
})

const BENCH = exercise('bench', 'Strength', ['Chest', 'Arms'])
const PLANK = exercise('plank', 'Timed', ['Core'])
const RUN = exercise('run', 'Cardio', ['Legs'])
const ALL = [BENCH, PLANK, RUN]
const find = (id: string) => ALL.find((e) => e.id === id)

const entry = (exerciseId: string, sets: SetResult[], more: Partial<WorkoutExercise> = {}): WorkoutExercise => ({
  exerciseId,
  order: 0,
  sets,
  isSkipped: false,
  ...more,
})

let n = 0
const workout = (date: string, exercises: WorkoutExercise[]): Workout => ({
  id: `w${++n}`,
  date,
  status: 'Done',
  exercises,
})

const bench = (date: string, ...sets: [number, number][]) =>
  workout(date, [
    entry(
      'bench',
      sets.map(([reps, weightKg]) => ({ reps, weightKg })),
    ),
  ])

describe('logged', () => {
  it('keeps what happened, oldest first, and leaves out plans and the future', () => {
    const done = bench('2026-09-20', [8, 60])
    const plan = workout('2026-09-21', [entry('bench', [], { targetSets: 3 })])
    const future = bench('2026-09-30', [8, 60])
    const earlier = bench('2026-09-01', [8, 55])
    expect(logged([done, plan, future, earlier], '2026-09-23').map((w) => w.id)).toEqual([earlier.id, done.id])
  })
})

describe('ranges', () => {
  it('covers 13 weeks from a Monday for three months', () => {
    const range = rangeOf('3M', '2026-09-23', undefined)
    expect(range.start).toBe('2026-06-29')
    const buckets = bucketsOf(range)
    expect(buckets).toHaveLength(13)
    expect(buckets.at(-1)).toEqual({ start: '2026-09-21', end: '2026-09-23' })
  })

  it('covers twelve months for a year', () => {
    const buckets = bucketsOf(rangeOf('1Y', '2026-09-23', undefined))
    expect(buckets).toHaveLength(12)
    expect(buckets[0]).toEqual({ start: '2025-10-01', end: '2025-10-31' })
  })

  it('goes back to the first workout for all, by years past three', () => {
    expect(bucketsOf(rangeOf('All', '2026-09-23', '2026-01-15'))).toHaveLength(9)
    expect(bucketsOf(rangeOf('All', '2026-09-23', '2026-08-15'))).toHaveLength(6)
    const years = rangeOf('All', '2026-09-23', '2022-05-01')
    expect(years.unit).toBe('year')
    expect(bucketsOf(years).map((b) => b.start)).toEqual([
      '2022-01-01',
      '2023-01-01',
      '2024-01-01',
      '2025-01-01',
      '2026-01-01',
    ])
  })
})

describe('totals', () => {
  it('counts workouts, sets and kilograms in the span, cardio by its minutes', () => {
    const workouts = [
      bench('2026-09-01', [10, 50], [8, 60]),
      workout('2026-09-10', [entry('plank', [{ seconds: 60 }]), entry('run', [], { durationMinutes: 20 })]),
      bench('2026-06-01', [10, 100]),
    ]
    const totals = totalsOf(workouts, { start: '2026-08-31', end: '2026-09-13' }, find)
    expect(totals).toEqual({ workouts: 2, perWeek: 1, sets: 3, volumeKg: 980, cardioMinutes: 20 })
  })

  it('counts sets for every area of the exercise, and none for cardio', () => {
    const workouts = [
      bench('2026-09-01', [10, 50], [8, 60]),
      workout('2026-09-02', [entry('plank', [{ seconds: 60 }]), entry('run', [], { durationMinutes: 20 })]),
    ]
    expect(setsPerArea(workouts, { start: '2026-09-01', end: '2026-09-30' }, find)).toEqual([
      { area: 'Chest', sets: 2 },
      { area: 'Arms', sets: 2 },
      { area: 'Core', sets: 1 },
    ])
  })
})

describe('goal streak', () => {
  // 2026-09-23 is a Wednesday.
  const weekOf = (monday: string, count: number) => Array.from({ length: count }, () => bench(monday, [8, 60]))

  it('counts full weeks back, and this week only once it is reached', () => {
    const workouts = [...weekOf('2026-08-31', 3), ...weekOf('2026-09-07', 3), ...weekOf('2026-09-14', 3)]
    expect(goalStreak(workouts, '2026-09-23', 3)).toBe(3)
    expect(goalStreak([...workouts, ...weekOf('2026-09-21', 3)], '2026-09-23', 3)).toBe(4)
  })

  it('stops at a week short of the goal', () => {
    const workouts = [...weekOf('2026-08-31', 3), ...weekOf('2026-09-07', 2), ...weekOf('2026-09-14', 3)]
    expect(goalStreak(workouts, '2026-09-23', 3)).toBe(1)
    expect(goalStreak([], '2026-09-23', 3)).toBe(0)
  })
})

describe('an exercise over time', () => {
  it('estimates a one-rep max for 1 to 12 reps only', () => {
    expect(oneRepMax(1, 100)).toBe(100)
    expect(oneRepMax(10, 60)).toBe(80)
    expect(oneRepMax(15, 60)).toBeUndefined()
    expect(oneRepMax(8, undefined)).toBeUndefined()
  })

  it('reads each metric from a workout, both entries of one exercise together', () => {
    const w = workout('2026-09-01', [
      entry('bench', [
        { reps: 10, weightKg: 50 },
        { reps: 0, weightKg: 70 },
      ]),
      entry('bench', [{ reps: 6, weightKg: 65 }]),
    ])
    const [occasion] = occasionsOf([w], 'bench')
    expect(valueOf('weight', occasion!)).toBe(65)
    expect(valueOf('volume', occasion!)).toBe(890)
    expect(valueOf('oneRepMax', occasion!)).toBeCloseTo(78)
  })

  it('gives pace only where both time and distance were logged', () => {
    const run = (minutes?: number, km?: number) =>
      occasionsOf([workout('2026-09-01', [entry('run', [], { durationMinutes: minutes, distanceKm: km })])], 'run')[0]!
    expect(valueOf('pace', run(30, 5))).toBe(6)
    expect(valueOf('pace', run(30))).toBeUndefined()
    expect(valueOf('distance', run(30))).toBeUndefined()
  })

  it('finds the best point, lowest for pace', () => {
    const points = [
      { date: '2026-09-01', value: 6, workoutId: 'a' },
      { date: '2026-09-02', value: 5.5, workoutId: 'b' },
      { date: '2026-09-03', value: 6, workoutId: 'c' },
    ]
    expect(bestOf('pace', points)?.workoutId).toBe('b')
    expect(bestOf('distance', points)?.workoutId).toBe('a')
  })
})

describe('records', () => {
  it('is the last time each exercise beat everything before it, newest first', () => {
    const workouts = [
      bench('2026-08-01', [8, 60]),
      bench('2026-08-08', [8, 62.5]),
      bench('2026-08-15', [8, 65]),
      bench('2026-08-22', [8, 62.5]),
      workout('2026-08-02', [entry('plank', [{ seconds: 60 }])]),
      workout('2026-08-09', [entry('plank', [{ seconds: 75 }])]),
      workout('2026-08-03', [entry('run', [], { durationMinutes: 20, distanceKm: 3 })]),
    ]
    const records = latestRecords(logged(workouts, '2026-09-23'), ALL)
    expect(records.map((r) => [r.exercise.id, r.point.date, r.point.value, r.previous])).toEqual([
      ['bench', '2026-08-15', 65, 62.5],
      ['plank', '2026-08-09', 75, 60],
    ])
  })

  it('reads a series in date order', () => {
    const series = seriesOf(
      'weight',
      occasionsOf(logged([bench('2026-08-08', [8, 62.5]), bench('2026-08-01', [8, 60])], '2026-09-23'), 'bench'),
    )
    expect(series.map((p) => p.value)).toEqual([60, 62.5])
  })
})

describe('axes', () => {
  it('rounds the top up to whole steps', () => {
    expect(niceScale(4)).toEqual({ max: 4, step: 2 })
    expect(niceScale(7)).toEqual({ max: 7.5, step: 2.5 })
    expect(niceScale(7, 3, true)).toEqual({ max: 8, step: 4 })
    expect(niceScale(2870)).toEqual({ max: 3000, step: 1000 })
    expect(niceScale(0)).toEqual({ max: 1, step: 1 })
  })

  it('rounds both ends of a domain that does not start at 0', () => {
    expect(niceDomain(57.5, 72.5)).toEqual({ min: 55, max: 75, step: 5 })
    expect(niceDomain(60, 60)).toEqual({ min: 50, max: 70, step: 5 })
  })
})
