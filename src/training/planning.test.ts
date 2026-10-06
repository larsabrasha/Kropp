import { describe, expect, it } from 'vitest'
import { statusOf } from './editing'
import {
  DEFAULT_SETTINGS,
  daysBetweenSessions,
  type DateOnly,
  type Exercise,
  type ExerciseKind,
  type Workout,
  type WorkoutExercise,
  type WorkoutTemplate,
} from './model'
import {
  carriedOn,
  lastDone,
  planFrom,
  refreshPlan,
  suggestDate,
  suggestDateAfter,
  suggestTemplate,
  upcoming,
} from './planning'

const WEDNESDAY: DateOnly = '2026-09-23'

const exercise = (name: string, kind: ExerciseKind = 'Strength'): Exercise => ({
  id: crypto.randomUUID(),
  name,
  kind,
  isArchived: false,
  categories: [],
  measuresTimeOnly: false,
})

const walk = exercise('Gång i maskin', 'Cardio')
const bench = exercise('Bröst maskin')
const curl = exercise('Biceps hantlar')
const squat = exercise('Benböj lår framsida')
const pullDown = exercise('Pull down maskin')
const exercises = new Map([walk, bench, curl, squat, pullDown].map((e) => [e.id, e]))

const find = (id: string) => exercises.get(id)

const entry = (fields: Partial<WorkoutExercise> & { exerciseId: string }): WorkoutExercise => ({
  order: 0,
  sets: [],
  isSkipped: false,
  ...fields,
})

const workout = (fields: Partial<Workout> & { date: DateOnly }): Workout => ({
  id: crypto.randomUUID(),
  status: 'Planned',
  exercises: [],
  ...fields,
})

const done = (date: DateOnly, ...done: Exercise[]): Workout =>
  workout({
    date,
    status: 'Done',
    exercises: done.map((e, i) =>
      entry({
        exerciseId: e.id,
        order: i,
        targetSets: 3,
        targetReps: 8,
        targetWeightKg: 20 + i,
        sets: [{ reps: 8 }],
      }),
    ),
  })

const template = (name: string, ...entries: Exercise[]): WorkoutTemplate => ({
  id: crypto.randomUUID(),
  name,
  exercises: entries.map((e, i) => entry({ exerciseId: e.id, order: i, targetSets: 3, targetReps: 10 })),
})

describe('planning', () => {
  it('the next day is two days after the last session', () =>
    expect(suggestDate([done('2026-09-21', bench)], '2026-09-22', DEFAULT_SETTINGS)).toBe(WEDNESDAY))

  it('the next day is never in the past', () =>
    expect(suggestDate([done('2026-09-14', bench)], WEDNESDAY, DEFAULT_SETTINGS)).toBe(WEDNESDAY))

  it('a week with three sessions moves the next to monday', () =>
    expect(
      suggestDate(
        [done('2026-09-21', bench), done('2026-09-23', bench), done('2026-09-25', bench)],
        '2026-09-25',
        DEFAULT_SETTINGS,
      ),
    ).toBe('2026-09-28'))

  it('with no history the next day is today', () =>
    expect(suggestDate([], WEDNESDAY, DEFAULT_SETTINGS)).toBe(WEDNESDAY))

  it.each([
    [1, 7],
    [2, 3],
    [3, 2],
    [4, 1],
    [7, 1],
  ])('the days between sessions follow from sessions a week (%i a week, %i days)', (perWeek, days) =>
    expect(daysBetweenSessions({ ...DEFAULT_SETTINGS, sessionsPerWeek: perWeek })).toBe(days),
  )

  it('two sessions a week suggest three days later and fill the week sooner', () => {
    const twice = { ...DEFAULT_SETTINGS, sessionsPerWeek: 2 }

    expect(suggestDate([done('2026-09-21', bench)], '2026-09-22', twice)).toBe('2026-09-24')
    expect(suggestDate([done('2026-09-21', bench), done('2026-09-24', bench)], '2026-09-24', twice)).toBe('2026-09-28')
  })

  it('the template done longest ago is suggested', () => {
    const upper = template('Armar och bröst', walk, bench, curl)
    const legs = template('Ben', walk, squat)
    const back = template('Rygg', pullDown)
    const history = [
      done('2026-09-21', walk, squat),
      done('2026-09-19', walk, bench, curl),
      done('2026-09-16', pullDown),
    ]

    expect(suggestTemplate([upper, legs, back], history, find, WEDNESDAY)).toBe(back)
  })

  it('a template already planned is not suggested again', () => {
    const upper = template('Armar och bröst', bench, curl)
    const back = template('Rygg', pullDown)
    const plannedBack = workout({
      date: WEDNESDAY,
      templateId: back.id,
      exercises: [entry({ exerciseId: pullDown.id })],
    })
    const history = [done('2026-09-21', bench, curl), plannedBack]

    expect(suggestTemplate([upper, back], history, find, WEDNESDAY)).toBe(upper)
  })

  it('a second plan comes the days between sessions after the first', () =>
    expect(
      suggestDateAfter(workout({ date: WEDNESDAY }), [done('2026-09-21', bench)], WEDNESDAY, DEFAULT_SETTINGS),
    ).toBe('2026-09-25'))

  it('a template never done comes first', () => {
    const upper = template('Armar och bröst', bench, curl)
    const back = template('Rygg', pullDown)

    expect(suggestTemplate([upper, back], [done('2026-09-21', bench, curl)], find, WEDNESDAY)).toBe(back)
  })

  it('a workout planned from a template counts for it whatever its exercises', () => {
    const upper = template('Armar och bröst', bench, curl)
    const legs = template('Ben', squat)
    const fromLegs = { ...done('2026-09-21', bench, curl), templateId: legs.id }

    expect(lastDone(legs, [fromLegs], find)).toBe('2026-09-21')
    expect(lastDone(upper, [fromLegs], find)).toBeUndefined()
  })

  it('the warm-up walk does not make workouts alike', () => {
    const legs = template('Ben', walk, squat)

    expect(lastDone(legs, [done('2026-09-21', walk, bench)], find)).toBeUndefined()
  })

  it('a plan starts where last time left off', () => {
    const t = template('Armar och bröst', bench, pullDown)
    const history = [done('2026-09-19', bench)]

    const plan = planFrom(t, crypto.randomUUID(), WEDNESDAY, 102, history, find)

    expect(plan.templateId).toBe(t.id)
    expect(plan.status).toBe('Planned')
    expect(plan.sessionNumber).toBe(102)
    expect(plan.exercises.map((e) => e.exerciseId)).toEqual([bench.id, pullDown.id])
    expect([plan.exercises[0]!.targetReps, plan.exercises[0]!.targetWeightKg]).toEqual([8, 20])
    expect([plan.exercises[1]!.targetReps, plan.exercises[1]!.targetWeightKg]).toEqual([10, undefined])
    expect(plan.exercises.every((e) => e.sets.length === 0)).toBe(true)
  })

  it('the upcoming plan is the earliest from today', () => {
    const later = workout({ date: '2026-09-25' })
    const soon = workout({ date: WEDNESDAY })
    const past = workout({ date: '2026-09-21' })

    expect(upcoming([later, past, soon, done(WEDNESDAY, bench)], WEDNESDAY)).toBe(soon)
  })

  it('cardio minutes in a template become the plan and nothing counts as done', () => {
    // Templates from before cardio had targets kept the minutes in the result field.
    const t: WorkoutTemplate = {
      id: crypto.randomUUID(),
      name: 'Armar',
      exercises: [
        entry({ exerciseId: walk.id, durationMinutes: 5, settings: '60' }),
        entry({ exerciseId: bench.id, order: 1, targetDurationMinutes: undefined }),
      ],
    }

    const plan = planFrom(t, crypto.randomUUID(), WEDNESDAY, 103, [], find)

    const w = plan.exercises[0]!
    expect([w.targetDurationMinutes, w.durationMinutes, w.settings]).toEqual([5, undefined, '60'])
    expect(statusOf(plan, plan.date)).toBe('Planned')
  })

  it('cardio carries on from the time done last time, like any other exercise', () => {
    const last = workout({
      date: '2026-09-21',
      status: 'Done',
      exercises: [entry({ exerciseId: walk.id, targetDurationMinutes: 10, durationMinutes: 8 })],
    })
    const t: WorkoutTemplate = {
      id: crypto.randomUUID(),
      name: 'Armar',
      exercises: [entry({ exerciseId: walk.id, targetDurationMinutes: 5 })],
    }

    const planned = planFrom(t, crypto.randomUUID(), WEDNESDAY, 103, [last], find).exercises
    expect(planned).toHaveLength(1)
    expect(planned[0]!.targetDurationMinutes).toBe(8)
  })

  it('carries on from what was done: more sets than planned, the heaviest set, the settings', () => {
    const plan = entry({
      exerciseId: bench.id,
      targetSets: 3,
      targetReps: 10,
      targetWeightKg: 20,
      settings: 'Sitthöjd 9',
    })
    const last = entry({
      exerciseId: bench.id,
      targetSets: 3,
      targetReps: 10,
      targetWeightKg: 20,
      settings: 'Sitthöjd 11',
      sets: [
        { reps: 10, weightKg: 20 },
        { reps: 8, weightKg: 25 },
        { reps: 10, weightKg: 25 },
        { reps: 6, weightKg: 22.5 },
      ],
    })

    const next = carriedOn(plan, last, 'Strength')
    expect([next.targetSets, next.targetReps, next.targetWeightKg, next.settings]).toEqual([4, 10, 25, 'Sitthöjd 11'])
    // Fewer sets logged than planned, as much of the history: the plan's sets stand.
    expect(carriedOn(plan, { ...last, sets: [{ reps: 10, weightKg: 25 }] }, 'Strength').targetSets).toBe(3)
    // Ended early: last time's plan stands, as the model keeps it.
    expect(carriedOn(plan, { ...last, isSkipped: true }, 'Strength').targetWeightKg).toBe(20)
    // Never done: the plan as it is.
    expect(carriedOn(plan, undefined, 'Strength')).toBe(plan)
  })

  it('refreshes a plan for today or later as it opens, never one begun or past', () => {
    const last = workout({
      date: '2026-09-21',
      status: 'Done',
      exercises: [entry({ exerciseId: bench.id, targetSets: 3, sets: [{ reps: 8, weightKg: 30 }] })],
    })
    const plan = workout({
      date: WEDNESDAY,
      exercises: [entry({ exerciseId: bench.id, targetSets: 3, targetWeightKg: 25 })],
    })

    expect(refreshPlan(plan, [last, plan], find, WEDNESDAY).exercises[0]!.targetWeightKg).toBe(30)
    const past = { ...plan, date: '2026-09-22' }
    expect(refreshPlan(past, [last, past], find, WEDNESDAY)).toBe(past)
    const begun = { ...plan, exercises: [{ ...plan.exercises[0]!, sets: [{ reps: 8 }] }] }
    expect(refreshPlan(begun, [last, begun], find, WEDNESDAY)).toBe(begun)
    // Up to date already: the same workout, nothing to save.
    const fresh = refreshPlan(plan, [last, plan], find, WEDNESDAY)
    expect(refreshPlan(fresh, [last, fresh], find, WEDNESDAY)).toBe(fresh)
  })

  it('a plan never starts skipped', () => {
    const t: WorkoutTemplate = {
      id: crypto.randomUUID(),
      name: 'Bröst',
      exercises: [entry({ exerciseId: bench.id, targetSets: 3, isSkipped: true })],
    }

    const planned = planFrom(t, crypto.randomUUID(), WEDNESDAY, 103, [], find).exercises
    expect(planned).toHaveLength(1)
    expect(planned[0]!.isSkipped).toBe(false)
  })

  it('a workout begun today is still the one to open and counts as a session', () => {
    const begun = workout({
      date: WEDNESDAY,
      exercises: [entry({ exerciseId: bench.id, targetSets: 3, sets: [{ reps: 8 }] })],
    })

    expect(statusOf(begun, begun.date)).toBe('InProgress')
    expect(upcoming([begun], WEDNESDAY)).toBe(begun)
    expect(suggestDate([begun], WEDNESDAY, DEFAULT_SETTINGS)).toBe('2026-09-25')
  })
})
