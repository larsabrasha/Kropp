import { describe, expect, it } from 'vitest'
import { canSwap, swapExercise } from './editing'
import { newId, type Exercise, type Workout, type WorkoutExercise } from './model'
import { swapSuggestions } from './swaps'

const exercise = (name: string, kind: Exercise['kind'], categories: Exercise['categories'] = []): Exercise => ({
  id: newId(),
  name,
  kind,
  categories,
  isArchived: false,
  measuresTimeOnly: false,
})

const WALK = exercise('Gång', 'Cardio')
const BIKE = exercise('Cykel', 'Cardio')
const ROWER = exercise('Roddmaskin', 'Cardio')
const CROSS = exercise('Crosstrainer', 'Cardio')
const NEVER = exercise('Löpband', 'Cardio')
const BENCH = exercise('Bänkpress', 'Strength', ['Chest'])
const DUMBBELLS = exercise('Hantelpress', 'Strength', ['Chest', 'Arms'])
const SQUAT = exercise('Knäböj', 'Strength', ['Legs'])
const ALL = new Map([WALK, BIKE, ROWER, CROSS, NEVER, BENCH, DUMBBELLS, SQUAT].map((e) => [e.id, e]))

const done = (e: Exercise): WorkoutExercise => ({
  exerciseId: e.id,
  order: 0,
  sets: e.kind === 'Cardio' ? [] : [{ reps: 8, weightKg: 40 }],
  durationMinutes: e.kind === 'Cardio' ? 10 : undefined,
  isSkipped: false,
})
const planned = (e: Exercise): WorkoutExercise => ({ exerciseId: e.id, order: 0, sets: [], isSkipped: false })
const session = (date: string, ...exercises: WorkoutExercise[]): Workout => ({
  id: newId(),
  date,
  status: 'Done',
  exercises: exercises.map((e, order) => ({ ...e, order })),
})

describe('swapSuggestions', () => {
  const today = session('2026-10-08', planned(WALK), planned(BENCH), planned(SQUAT))

  it('puts first what was done in the same place, then what was done most, of the same kind', () => {
    const history = [
      session('2026-10-01', done(BIKE), done(BENCH), done(ROWER), done(SQUAT)),
      session('2026-10-03', done(BIKE), done(BENCH), done(ROWER), done(SQUAT)),
      session('2026-10-05', done(CROSS), done(BENCH), done(ROWER), done(SQUAT)),
      session('2026-10-06', done(WALK), done(BENCH)),
    ]

    expect(swapSuggestions(today, 0, history, ALL).map((e) => e.name)).toEqual(['Cykel', 'Crosstrainer', 'Roddmaskin'])
  })

  it('suggests strength that trains an area the exercise trains, never one only planned', () => {
    const history = [
      session('2026-10-01', done(WALK), done(DUMBBELLS), done(SQUAT)),
      session('2026-10-02', done(WALK), planned(NEVER), { ...planned(SQUAT), order: 2 }),
    ]
    const benchDay = session('2026-10-08', planned(WALK), planned(BENCH))

    expect(swapSuggestions(benchDay, 1, history, ALL).map((e) => e.name)).toEqual(['Hantelpress'])
  })

  it('leaves out the workout itself, and what is already in it', () => {
    const history = [today, session('2026-10-01', done(BIKE), done(BENCH), done(SQUAT))]
    expect(swapSuggestions(today, 1, history, ALL)).toEqual([])
    expect(swapSuggestions(today, 0, history, ALL).map((e) => e.name)).toEqual(['Cykel'])
  })
})

describe('swapExercise', () => {
  it('plans the new exercise from the last time it was done, keeping the comment', () => {
    const walking = { ...planned(WALK), order: 2, targetDurationMinutes: 10, comment: 'Lugnt' }
    const lastBike = { ...done(BIKE), targetDurationMinutes: 15, targetDistanceKm: 5 }

    expect(swapExercise(walking, BIKE, lastBike)).toMatchObject({
      exerciseId: BIKE.id,
      order: 2,
      targetDurationMinutes: 15,
      targetDistanceKm: 5,
      comment: 'Lugnt',
      sets: [],
    })
  })

  it('keeps what was done, and only allows the same kind then', () => {
    const walked = { ...done(WALK), targetDurationMinutes: 10 }

    expect(swapExercise(walked, BIKE, undefined)).toEqual({ ...walked, exerciseId: BIKE.id })
    expect(canSwap(walked, 'Cardio', BIKE)).toBe(true)
    expect(canSwap(walked, 'Cardio', BENCH)).toBe(false)
    expect(canSwap(planned(WALK), 'Cardio', BENCH)).toBe(true)
  })
})
