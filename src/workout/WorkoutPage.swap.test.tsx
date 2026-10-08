// @vitest-environment happy-dom
import { waitFor } from '@testing-library/react'
import { expect, it } from 'vitest'
import {
  $,
  $$,
  BENCH,
  click,
  entry,
  exercise,
  open,
  reload,
  saveExercise,
  seed,
  saveWorkout,
  text,
  waitForElement,
  walk,
  workout,
} from '../test/workoutPage'

const WALK = walk()
const BIKE = exercise({ name: 'Cykel', kind: 'Cardio' })
const ROWER = exercise({ name: 'Roddmaskin', kind: 'Cardio' })

it('changes the walk that warms up for the bike, suggested first, planned as last time', async () => {
  await Promise.all([WALK, BIKE, ROWER].map(saveExercise))
  await saveWorkout(
    workout({
      date: '2026-09-20',
      status: 'Done',
      exercises: [
        entry({ exerciseId: BIKE.id, order: 0, durationMinutes: 12, targetDurationMinutes: 12 }),
        entry({ exerciseId: ROWER.id, order: 1, durationMinutes: 5 }),
        entry({ exerciseId: BENCH.id, order: 2, sets: [{ reps: 8, weightKg: 40 }] }),
      ],
    }),
  )
  const today = await seed(
    workout({
      date: '2026-09-23',
      exercises: [
        entry({ exerciseId: WALK.id, order: 0, targetDurationMinutes: 10 }),
        entry({ exerciseId: BENCH.id, order: 1, targetSets: 3, targetReps: 8 }),
      ],
    }),
  )
  open(today.id)

  click(await waitForElement('[data-testid=edit]'))
  click($('[data-testid=entry-sheet] [data-testid=swap-exercise]'))

  const sheet = $('[data-testid=exercise-sheet]')
  expect(text($('h2', sheet))).toBe('Byt övning')
  // Done first in the workout comes before done elsewhere; strength and the walk itself never.
  expect($$('[data-testid=swap-suggestions] li', sheet).map(text)).toEqual(['CykelKondition', 'RoddmaskinKondition'])
  expect(sheet.textContent).not.toContain(WALK.name)
  // The keyboard stays down, so it does not cover the suggestions.
  expect(document.activeElement).not.toBe($('input[type=search]', sheet))

  click($('[data-testid=swap-suggestions] button', sheet))

  await waitFor(async () => expect((await reload(today.id)).exercises[0]!.exerciseId).toBe(BIKE.id))
  const swapped = (await reload(today.id)).exercises
  expect(swapped[0]).toMatchObject({ order: 0, targetDurationMinutes: 12, sets: [] })
  expect(swapped[1]!.exerciseId).toBe(BENCH.id)
  expect($$('[data-testid=exercise-sheet]')).toEqual([])
})
