// @vitest-environment happy-dom
import { waitFor } from '@testing-library/react'
import { expect, it } from 'vitest'
import {
  $,
  $$,
  BENCH,
  click,
  entry,
  marks,
  open,
  reload,
  saveExercise,
  saveWorkout,
  seed,
  stepperFor,
  text,
  waitForElement,
  walk,
  workout,
} from '../test/workoutPage'

// Cardio on the workout page: its plan, one tap to finish it, and correcting what was done.

it('plans cardio at the top and corrects what was done on its button', async () => {
  const machine = walk()
  await saveExercise(machine)
  const w = await seed(
    workout({
      date: '2026-09-23',
      exercises: [entry({ exerciseId: machine.id, targetDurationMinutes: 5, settings: '60' })],
    }),
  )
  open(w.id)

  expect(text(await waitForElement('[data-testid=target]'))).toBe('5 min · 60')
  click($('[data-testid=edit]'))
  const editor = $('[data-testid=target-editor]')
  expect($$('[data-testid=stepper]', editor).map((s) => s.getAttribute('data-label'))).toEqual(['Minuter', 'km'])
  click($('[data-testid=increase]', stepperFor(editor, 'Minuter')))

  await waitFor(() => expect(text($('[data-testid=target]'))).toBe('5,5 min · 60'))
  await waitFor(async () => expect((await reload(w.id)).exercises[0]!.targetDurationMinutes).toBe(5.5))
  expect((await reload(w.id)).status).toBe('Planned')
  expect($$('[data-testid=cardio]')).toEqual([])

  click($('[data-testid=close-editor]'))
  click($('[data-testid=cardio-next]'))
  click(await waitForElement('[data-testid=cardio-done]'))
  click($('[data-testid=increase]', stepperFor($('[data-testid=cardio-editor]'), 'Snittpuls')))

  await waitFor(async () => {
    const saved = await reload(w.id)
    expect([saved.exercises[0]!.durationMinutes, saved.exercises[0]!.avgHeartRate, saved.status]).toEqual([
      5.5,
      120,
      'Done',
    ])
  })
})

it("finishes cardio with one tap at last time's values, and clears it", async () => {
  const machine = walk()
  await saveExercise(machine)
  await saveWorkout(
    workout({
      date: '2026-09-21',
      status: 'Done',
      exercises: [entry({ exerciseId: machine.id, durationMinutes: 3.5, avgHeartRate: 130 })],
    }),
  )
  const w = await seed(
    workout({
      date: '2026-09-23',
      exercises: [
        entry({ exerciseId: machine.id, order: 0, settings: '60' }),
        entry({ exerciseId: BENCH.id, order: 1, targetSets: 3, targetReps: 8 }),
      ],
    }),
  )
  open(w.id)

  click(await waitForElement('[data-testid=cardio-next]'))

  await waitFor(() => expect(text($('[data-testid=cardio-done]'))).toBe('3,5 min · 130 bpm'))
  expect(marks()).toEqual(['false', 'true'])
  await waitFor(async () => {
    const saved = (await reload(w.id)).exercises[0]!
    expect([saved.durationMinutes, saved.distanceKm, saved.avgHeartRate]).toEqual([3.5, undefined, 130])
  })

  click($('[data-testid=cardio-done]'))
  click($('[data-testid=cardio-editor] [data-testid=clear-cardio]'))

  await waitForElement('[data-testid=cardio-next]')
  await waitFor(async () => expect((await reload(w.id)).exercises[0]!.durationMinutes).toBeUndefined())
})

it('opens the fields to finish cardio with nothing planned or done before', async () => {
  const machine = walk()
  await saveExercise(machine)
  const w = await seed(workout({ date: '2026-09-23', exercises: [entry({ exerciseId: machine.id })] }))
  open(w.id)

  click(await waitForElement('[data-testid=cardio-next]'))

  await waitForElement('[data-testid=cardio-editor]')
  expect($$('[data-testid=cardio-next]')).toEqual([])
  expect((await reload(w.id)).exercises[0]!.durationMinutes).toBeUndefined()

  click($('[data-testid=cardio-editor] [data-testid=close-editor]'))
  await waitForElement('[data-testid=cardio-next]')
})

it('records the plan before last time when cardio is finished', async () => {
  const machine = walk()
  await saveExercise(machine)
  await saveWorkout(
    workout({
      date: '2026-09-21',
      status: 'Done',
      exercises: [entry({ exerciseId: machine.id, durationMinutes: 3.5, distanceKm: 0.3, avgHeartRate: 130 })],
    }),
  )
  const w = await seed(
    workout({ date: '2026-09-23', exercises: [entry({ exerciseId: machine.id, targetDurationMinutes: 5 })] }),
  )
  open(w.id)

  click(await waitForElement('[data-testid=cardio-next]'))

  await waitFor(() => expect(text($('[data-testid=cardio-done]'))).toBe('5 min · 0,3 km · 130 bpm'))
})

it('shows on cardio not yet done the plan it records', async () => {
  const machine = walk()
  await saveExercise(machine)
  const w = await seed(
    workout({
      date: '2026-09-23',
      exercises: [
        entry({ exerciseId: machine.id, targetDurationMinutes: 5, targetDistanceKm: 0.4 }),
        entry({ exerciseId: machine.id, order: 1 }),
      ],
    }),
  )
  open(w.id)

  const next = await waitForElement('[data-testid=cardio-next]')
  expect($$('span', next).map((x) => x.textContent)).toEqual(['5 min', '0,4 km'])
  expect(next.getAttribute('aria-label')).toBe('Klar med 5 min · 0,4 km')
  expect($$('[data-testid=cardio-next]')).toHaveLength(1)
  expect($$('[data-testid=cardio]')).toHaveLength(1)
})

it('shows last time as the plan of cardio with no plan of its own', async () => {
  const machine = walk()
  await saveExercise(machine)
  await saveWorkout(
    workout({
      date: '2026-09-21',
      status: 'Done',
      exercises: [entry({ exerciseId: machine.id, durationMinutes: 3.5, distanceKm: 0.3, avgHeartRate: 130 })],
    }),
  )
  const w = await seed(workout({ date: '2026-09-23', exercises: [entry({ exerciseId: machine.id, settings: '60' })] }))
  open(w.id)

  expect(text(await waitForElement('[data-testid=target]'))).toBe('3,5 min · 0,3 km · 60')
  click($('[data-testid=edit]'))
  const editor = $('[data-testid=target-editor]')
  expect($('input', stepperFor(editor, 'Minuter')).getAttribute('value')).toBe('3.5')
  expect($('input', stepperFor(editor, 'km')).getAttribute('value')).toBe('0.3')

  click($('[data-testid=increase]', stepperFor(editor, 'Minuter')))

  await waitFor(async () => {
    const saved = (await reload(w.id)).exercises[0]!
    expect([saved.targetDurationMinutes, saved.targetDistanceKm, saved.durationMinutes]).toEqual([4, 0.3, undefined])
  })
})

it('shows and records only minutes for cardio measured by time alone', async () => {
  const machine = walk({ measuresTimeOnly: true })
  await saveExercise(machine)
  await saveWorkout(
    workout({
      date: '2026-09-21',
      status: 'Done',
      exercises: [entry({ exerciseId: machine.id, durationMinutes: 3.5, distanceKm: 0, avgHeartRate: 130 })],
    }),
  )
  const w = await seed(workout({ date: '2026-09-23', exercises: [entry({ exerciseId: machine.id, settings: '60' })] }))
  open(w.id)

  expect(text(await waitForElement('[data-testid=target]'))).toBe('3,5 min · 60')
  expect($('[data-testid=last-time]').getAttribute('aria-label')).toBe(
    'Förra gången: mån 21 sep (2 dagar sedan), 3,5 min',
  )
  expect($$('span', $('[data-testid=cardio-next]')).map((x) => x.textContent)).toEqual(['3,5 min'])

  click($('[data-testid=cardio-next]'))
  await waitFor(async () => {
    const saved = (await reload(w.id)).exercises[0]!
    expect([saved.durationMinutes, saved.distanceKm, saved.avgHeartRate]).toEqual([3.5, undefined, undefined])
  })

  click($('[data-testid=cardio-done]'))
  expect(
    $$('[data-testid=stepper]', $('[data-testid=cardio-editor]')).map((x) => x.getAttribute('data-label')),
  ).toEqual(['Minuter'])
  click($('[data-testid=cardio-editor] [data-testid=close-editor]'))
  click($('[data-testid=edit]'))
  expect(
    $$('[data-testid=stepper]', $('[data-testid=target-editor]')).map((x) => x.getAttribute('data-label')),
  ).toEqual(['Minuter'])
})
