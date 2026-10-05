// @vitest-environment happy-dom
import { act, fireEvent, waitFor } from '@testing-library/react'
import Sortable from 'sortablejs'
import { beforeEach, expect, it, vi } from 'vitest'
import { picture, prefetch } from '../illustrations/illustrations'
import { keyOf } from '../sync/localStore'
import {
  $,
  $$,
  app,
  BENCH,
  change,
  click,
  entry,
  exercise,
  marks,
  names,
  open,
  reload,
  saveExercise,
  seed,
  text,
  waitForElement,
  waitForElements,
  workout,
} from '../test/workoutPage'
import { newId } from '../training/model'

// Pictures are fetched for the service worker in the app; here the call is only recorded.
vi.mock('../illustrations/illustrations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../illustrations/illustrations')>()),
  prefetch: vi.fn(() => Promise.resolve()),
}))

beforeEach(() => vi.mocked(prefetch).mockClear())

// The workout page as a whole: opening, ordering, adding and removing exercises, status, deleting
// and locking. The cards' own behaviour is in WorkoutPage.sets, .cardio and .card.

it('shows not found for an unknown id', async () => {
  open(newId())

  await waitForElement('[data-testid=not-found]')
})

it('saves the new order when an exercise is dropped', async () => {
  const other = exercise({ name: 'Vader', kind: 'Bodyweight' })
  await saveExercise(other)
  const w = await seed(
    workout({
      date: '2026-09-23',
      exercises: [entry({ exerciseId: BENCH.id }), entry({ exerciseId: other.id, order: 1 })],
    }),
  )
  open(w.id)
  await waitFor(() => expect($$('[data-testid=drag-handle]')).toHaveLength(2))
  const list = $('[data-testid=entry-list]')
  await waitFor(() => expect(Sortable.get(list)).toBeDefined())

  // What SortableJS does when a card is dropped at a new position: it moves the card, then calls onEnd.
  act(() => {
    const item = list.children[1] as HTMLElement
    list.insertBefore(item, list.children[0]!)
    Sortable.get(list)!.option('onEnd')!({ oldIndex: 1, newIndex: 0, item, from: list } as Sortable.SortableEvent)
  })

  await waitFor(() => expect(names()).toEqual(['Vader', 'Bröst maskin']))
  await waitFor(async () => {
    const saved = (await reload(w.id)).exercises
    expect(saved.map((e) => e.exerciseId)).toEqual([other.id, BENCH.id])
    expect(saved.map((e) => e.order)).toEqual([0, 1])
  })
})

it('removes an exercise from the menu', async () => {
  const other = exercise({ name: 'Vader', kind: 'Bodyweight' })
  await saveExercise(other)
  const w = await seed(
    workout({
      date: '2026-09-23',
      exercises: [entry({ exerciseId: BENCH.id }), entry({ exerciseId: other.id, order: 1 })],
    }),
  )
  open(w.id)

  click((await waitForElements('[data-testid=edit]'))[0]!)
  expect(text($('[data-testid=editor] [data-testid=remove]'))).toBe('Radera övning')
  click($('[data-testid=editor] [data-testid=remove]'))

  await waitFor(() => expect(names()).toEqual(['Vader']))
  await waitFor(async () => expect((await reload(w.id)).exercises.map((e) => e.exerciseId)).toEqual([other.id]))
})

it('prefetches only the pictures a workout uses', async () => {
  const w = await seed(workout({ date: '2026-09-23', exercises: [entry({ exerciseId: BENCH.id })] }))

  open(w.id)

  await waitFor(() => expect(prefetch).toHaveBeenCalled())
  expect(vi.mocked(prefetch).mock.calls[0]![0]).toEqual([picture('machine-chest-press')])
})

it('creates a new exercise from the picker and adds it', async () => {
  const w = await seed(workout({ date: '2026-09-23' }))
  open(w.id)

  click(await waitForElement('[data-testid=add-exercise]'))
  fireEvent.input($('[data-testid=exercise-picker] input[type=search]'), { target: { value: 'Plankan' } })
  change($('[data-testid=exercise-picker] select'), 'Timed')
  expect($('[data-testid=create-exercise]').hasAttribute('disabled')).toBe(true)
  click($('[data-testid=exercise-picker] [data-area=Core]'))
  click($('[data-testid=create-exercise]'))

  await waitFor(() => expect($('[data-testid=exercise-entry] h3').textContent).toBe('Plankan'))
  const plank = (await app.repository.getAll('exercise')).find((e) => e.name === 'Plankan')!
  expect(plank.kind).toBe('Timed')
  expect(plank.categories).toEqual(['Core'])
  await waitFor(async () => {
    const saved = (await reload(w.id)).exercises
    expect(saved).toHaveLength(1)
    expect(saved[0]!.exerciseId).toBe(plank.id)
    expect(saved[0]!.targetSeconds).toBe(30)
  })
})

it('picks an existing exercise', async () => {
  const w = await seed(workout({ date: '2026-09-23' }))
  open(w.id)

  click(await waitForElement('[data-testid=add-exercise]'))
  fireEvent.input($('[data-testid=exercise-picker] input[type=search]'), { target: { value: 'bröst' } })
  expect($$('[data-testid=exercise-picker] li')).toHaveLength(1)
  expect($('[data-testid=exercise-picker] li [data-testid=picker-thumbnail]').getAttribute('src')).toBe(
    picture('machine-chest-press'),
  )
  click($('[data-testid=exercise-picker] li button'))

  await waitFor(() => expect($('[data-testid=exercise-entry] h3').textContent).toBe('Bröst maskin'))
  await waitFor(async () => expect((await reload(w.id)).exercises.map((e) => e.exerciseId)).toEqual([BENCH.id]))
})

it('shows the details as text until tapped, and then as fields', async () => {
  const w = await seed(workout({ date: '2026-09-21', sessionNumber: 101 }))
  open(w.id)

  const meta = await waitForElement('[data-testid=workout-meta]')
  expect(text(meta)).toBe('måndag 21 sep. · 0 övningar · Nr 101')
  expect($('h1').textContent).toBe('Träningspass')
  expect($$('input[type=date]')).toEqual([])

  click($('[data-testid=unlock]'))
  click($('[data-testid=workout-meta]'))
  change($('[data-testid=details-editor] input[type=text]'), 'Ben och bröst')
  click($('[data-testid=details-editor] button'))

  await waitFor(() => expect($('h1').textContent).toBe('Ben och bröst'))
  expect($$('[data-testid=details-editor]')).toEqual([])
  await waitFor(async () => expect((await reload(w.id)).note).toBe('Ben och bröst'))
})

it('shows what its row in the list shows, with the same badge', async () => {
  const w = await seed(
    workout({
      date: '2026-09-23',
      sessionNumber: 102,
      note: 'lätt',
      exercises: [entry({ exerciseId: BENCH.id, targetSets: 1, targetReps: 8, sets: [{ reps: 8 }] })],
    }),
  )
  open(w.id)

  expect((await waitForElement('h1')).textContent).toBe('Bröst')
  expect(text($('[data-testid=workout-meta]'))).toBe('onsdag 23 sep. · 1 övning · Nr 102 · lätt')
  $('[data-testid=details] [data-testid=workout-icon]')
  const badge = $('[data-testid=details] [data-testid=status]')
  expect([badge.textContent, badge.getAttribute('data-status')]).toEqual(['Genomfört', 'Done'])
  expect(badge.classList).toContain('bg-green-100')
})

it('opens a workout scrolled to the top, also when the page is reused', async () => {
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  const first = await seed(workout({ date: '2026-09-21' }))
  const second = await seed(workout({ date: '2026-09-23' }))

  open(first.id)
  await waitFor(() => expect(scroll).toHaveBeenCalledTimes(1))

  // Another workout in the same app, without navigate (which scrolls on its own).
  act(() => {
    window.history.replaceState(null, '', `/workouts/${second.id}`)
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await waitFor(() => expect(scroll).toHaveBeenCalledTimes(2))

  act(() => {
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await act(() => app.repository.getAll('workout'))
  expect(scroll).toHaveBeenCalledTimes(2)
})

it('derives the status from the sets, with no switch for it', async () => {
  const w = await seed(
    workout({
      date: '2026-09-23',
      status: 'Planned',
      exercises: [entry({ exerciseId: BENCH.id, targetSets: 3, targetReps: 8 })],
    }),
  )
  open(w.id)

  expect((await waitForElement('[data-testid=details]')).textContent).toContain('Planerat')
  expect($$('[role=radio]')).toEqual([])

  click($('[data-testid=set-next]'))

  await waitFor(() => expect($('[data-testid=details]').textContent).toContain('Påbörjat'))
  await waitFor(async () => expect((await reload(w.id)).status).toBe('InProgress'))

  click($('[data-testid=set-next]'))
  click(await waitForElement('[data-testid=set-next]'))
  await waitFor(() => expect($('[data-testid=details]').textContent).toContain('Genomfört'))
  await waitFor(async () => expect((await reload(w.id)).status).toBe('Done'))

  click($('[data-testid=set-done]'))
  click($('[data-testid=set-editor] [data-testid=remove-set]'))
  await waitFor(() => expect($('[data-testid=details]').textContent).toContain('Påbörjat'))
  click($('[data-testid=set-done]'))
  click($('[data-testid=set-editor] [data-testid=remove-set]'))
  click($('[data-testid=set-done]'))
  expect(text($('[data-testid=set-editor] [data-testid=remove-set]'))).toBe('Radera set')
  click($('[data-testid=set-editor] [data-testid=remove-set]'))

  await waitFor(() => expect($('[data-testid=details]').textContent).toContain('Planerat'))
  await waitFor(async () => expect((await reload(w.id)).status).toBe('Planned'))
})

it('asks before deleting, and then moves the workout to the trash', async () => {
  const w = await seed(workout({ date: '2026-09-23' }))
  open(w.id)

  const del = await waitFor(() => {
    const found = $$('button').filter((b) => text(b) === 'Ta bort passet')
    expect(found).toHaveLength(1)
    return found[0]!
  })
  click(del)
  expect(await app.repository.getAll('workout')).not.toEqual([])
  click($('[role=alertdialog] button'))

  await waitFor(async () => expect(await app.repository.getAll('workout')).toEqual([]))
  expect((await app.store.get(keyOf('workout', w.id)))?.isDeleted).toBe(true)
  expect((await app.repository.get('trashedWorkout', w.id))?.workout.id).toBe(w.id)
})

it('marks the first unfinished exercise today, and moves the mark on', async () => {
  const w = await seed(
    workout({
      date: '2026-09-23',
      exercises: [
        entry({ exerciseId: BENCH.id, order: 0, targetSets: 1, targetReps: 8 }),
        entry({ exerciseId: BENCH.id, order: 1, targetSets: 1, targetReps: 8 }),
      ],
    }),
  )
  open(w.id)

  await waitFor(() => expect(marks()).toEqual(['true', 'false']))
  expect($$('[data-testid=exercise-entry]')[0]!.getAttribute('aria-current')).toBe('step')

  click($$('[data-testid=set-next]')[0]!)

  await waitFor(() => expect(marks()).toEqual(['false', 'true']))
})

it('marks the exercise of a workout on another day too, so it can be logged afterwards', async () => {
  const w = await seed(
    workout({ date: '2026-09-21', exercises: [entry({ exerciseId: BENCH.id, targetSets: 3, targetReps: 8 })] }),
  )
  open(w.id)

  expect((await waitForElement('[data-testid=exercise-entry]')).getAttribute('data-current')).toBe('true')
  click($('[data-testid=unlock]'))
  click($('[data-testid=set-next]'))

  await waitFor(async () => expect((await reload(w.id)).exercises[0]!.sets).toHaveLength(1))
})

it('opens a workout of an earlier day locked, and saves nothing until it is unlocked', async () => {
  const w = await seed(
    workout({ date: '2026-09-22', exercises: [entry({ exerciseId: BENCH.id, targetSets: 3, targetReps: 8 })] }),
  )
  open(w.id)

  expect((await waitForElement('[data-testid=locked]')).textContent).toContain(
    'Passet är från en tidigare dag och är låst.',
  )
  expect($('[data-testid=workout-body]').hasAttribute('disabled')).toBe(true)
  expect($('[data-testid=workout-meta]').hasAttribute('disabled')).toBe(true)
  // The browser does not click a disabled button; the page refuses to save if it happens anyway.
  click($('[data-testid=set-next]'))
  click($('[data-testid=workout-meta]'))
  expect($$('[data-testid=details-editor]')).toEqual([])
  expect((await reload(w.id)).exercises[0]!.sets).toEqual([])

  click($('[data-testid=unlock]'))

  expect($$('[data-testid=locked]')).toEqual([])
  expect($('[data-testid=workout-body]').hasAttribute('disabled')).toBe(false)
  click($('[data-testid=set-next]'))
  await waitFor(async () => expect((await reload(w.id)).exercises[0]!.sets).toHaveLength(1))

  click($('[data-testid=lock]'))
  expect($('[data-testid=workout-body]').hasAttribute('disabled')).toBe(true)
})

it.each([23, 25])('does not lock today or a later day (%i September)', async (day) => {
  const w = await seed(workout({ date: `2026-09-${day}` }))
  open(w.id)

  expect((await waitForElement('[data-testid=workout-body]')).hasAttribute('disabled')).toBe(false)
  expect($$('[data-testid=locked]')).toEqual([])
  expect($$('[data-testid=lock]')).toEqual([])
})

it('keeps an unlocked workout unlocked when a sync reloads it', async () => {
  const w = await seed(workout({ date: '2026-09-21' }))
  open(w.id)
  click(await waitForElement('[data-testid=unlock]'))

  await act(() => app.engine.sync())

  expect($('[data-testid=workout-body]').hasAttribute('disabled')).toBe(false)
})
