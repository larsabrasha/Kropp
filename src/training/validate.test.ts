import { describe, expect, it } from 'vitest'
import { AggregateTypes, type SyncChange } from '../sync/protocol'
import { SETTINGS_ID, toJson, type TrashedWorkout, type Workout } from './model'
import { validateChange } from './validate'

const NOW = new Date('2026-09-23T08:00:00Z').toISOString()
const EXERCISE_ID = '11111111-1111-1111-1111-111111111111'

const change = (type: string, id: string, isDeleted: boolean, data: string | null): SyncChange => ({
  type,
  id,
  modifiedAt: NOW,
  isDeleted,
  data,
})

const workoutChange = (workout: Workout, id?: string) =>
  change(AggregateTypes.workout, id ?? workout.id, false, toJson(workout))

const trashChange = (trashed: TrashedWorkout) =>
  change(AggregateTypes.trashedWorkout, trashed.id, false, toJson(trashed))

const validWorkout = (): Workout => ({
  id: crypto.randomUUID(),
  date: '2026-09-21',
  sessionNumber: 101,
  status: 'Done',
  exercises: [
    {
      exerciseId: crypto.randomUUID(),
      order: 0,
      targetSets: 3,
      targetReps: 8,
      targetWeightKg: 20,
      comment: '45 grader',
      sets: [{ reps: 8 }, { reps: 8 }, { reps: 10 }],
      isSkipped: false,
    },
  ],
})

describe('validateChange', () => {
  it('a complete workout is valid', () => expect(validateChange(workoutChange(validWorkout()))).toBeNull())

  it('a trashed workout is valid and its workout is checked too', () => {
    const workout = validWorkout()
    const trashed: TrashedWorkout = { id: workout.id, deletedAt: NOW, workout }

    expect(validateChange(trashChange(trashed))).toBeNull()
    expect(validateChange(trashChange({ ...trashed, workout: { ...workout, id: crypto.randomUUID() } }))).not.toBeNull()
    expect(validateChange(trashChange({ ...trashed, workout: { ...workout, note: 'x'.repeat(2001) } }))).not.toBeNull()
    expect(
      validateChange(change(AggregateTypes.trashedWorkout, workout.id, false, `{"id":"${workout.id}"}`)),
    ).not.toBeNull()
  })

  it('an exercise is valid', () =>
    expect(
      validateChange(
        change(
          AggregateTypes.exercise,
          EXERCISE_ID,
          false,
          `{"id":"${EXERCISE_ID}","name":"Bröst maskin","kind":"Strength","settingsNote":"Sitthöjd 11"}`,
        ),
      ),
    ).toBeNull())

  it('a tombstone without data is valid', () =>
    expect(validateChange(change(AggregateTypes.workout, crypto.randomUUID(), true, null))).toBeNull())

  it('a mismatched id is refused', () =>
    expect(validateChange(workoutChange(validWorkout(), crypto.randomUUID()))).not.toBeNull())

  it('an unknown type is refused', () =>
    expect(validateChange(change('weight', crypto.randomUUID(), false, '{}'))).not.toBeNull())

  it('a tombstone with data is refused', () =>
    expect(validateChange(change(AggregateTypes.workout, crypto.randomUUID(), true, '{}'))).not.toBeNull())

  it('malformed JSON is refused', () =>
    expect(validateChange(change(AggregateTypes.workout, crypto.randomUUID(), false, '{not json'))).not.toBeNull())

  it.each([
    [3, true, true],
    [0, true, false],
    [8, true, false],
    [3, false, false],
  ])('settings are validated (%i a week, fixed id %s, valid %s)', (perWeek, fixedId, valid) => {
    const id = fixedId ? SETTINGS_ID : crypto.randomUUID()
    const json = toJson({ id, sessionsPerWeek: perWeek })

    expect(validateChange(change(AggregateTypes.settings, id, false, json)) === null).toBe(valid)
  })

  it('a negative weight is refused', () => {
    const workout = validWorkout()
    workout.exercises[0]!.sets.push({ reps: 8, weightKg: -5 })
    expect(validateChange(workoutChange(workout))).not.toBeNull()
  })

  it('an exercise without a name is refused', () =>
    expect(
      validateChange(change(AggregateTypes.exercise, EXERCISE_ID, false, `{"id":"${EXERCISE_ID}","name":"  "}`)),
    ).not.toBeNull())

  it('a negative cardio target is refused', () => {
    const workout = validWorkout()
    workout.exercises[0] = { ...workout.exercises[0]!, targetDurationMinutes: -1 }
    expect(validateChange(workoutChange(workout))).not.toBeNull()
  })

  it('an exercise of an unknown kind is refused', () =>
    expect(
      validateChange(
        change(AggregateTypes.exercise, EXERCISE_ID, false, `{"id":"${EXERCISE_ID}","name":"Sit ups","kind":7}`),
      ),
    ).not.toBeNull())
})
