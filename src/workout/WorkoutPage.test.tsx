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
  saveWorkout,
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

it('shows the workout in its very first render, with nothing in between', async () => {
  const w = await seed(workout({ date: '2026-09-23', exercises: [entry({ exerciseId: BENCH.id, targetSets: 3 })] }))

  open(w.id)

  // No waitFor: the page reads the repository's memory while it renders the first time.
  expect(names()).toEqual([BENCH.name])
})

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
  // Only in edit mode, from the menu, so a touch on a card is otherwise a tap or a scroll.
  await waitForElement('[data-testid=exercise-entry]')
  expect($$('[data-testid=drag-handle]')).toEqual([])
  click($('[data-testid=workout-menu]'))
  expect(text($('[role=menu] [data-testid=edit-exercises]'))).toBe('Ändra övningar')
  click($('[data-testid=edit-exercises]'))
  await waitFor(() => expect($$('[data-testid=drag-handle]')).toHaveLength(2))
  // Done takes the menu's place in the bar.
  expect($$('[data-testid=workout-menu]')).toEqual([])
  expect($('[data-testid=done-editing]').getAttribute('aria-label')).toBe('Klar')
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
  // Asked first; cancelling keeps it.
  const ask = $('[role=alertdialog]')
  expect(ask.getAttribute('aria-label')).toBe('Ta bort övningen ur passet? Det du har gjort i den försvinner.')
  click($$('button', ask).find((b) => text(b) === 'Avbryt')!)
  expect($$('[role=alertdialog]')).toEqual([])
  expect(names()).toEqual(['Bröst maskin', 'Vader'])
  click($('[data-testid=editor] [data-testid=remove]'))
  click($('[data-testid=confirm-remove]'))

  await waitFor(() => expect(names()).toEqual(['Vader']))
  await waitFor(async () => expect((await reload(w.id)).exercises.map((e) => e.exerciseId)).toEqual([other.id]))
})

it('removes in edit mode at once, but asks first when sets are done', async () => {
  const other = exercise({ name: 'Vader', kind: 'Bodyweight' })
  await saveExercise(other)
  const w = await seed(
    workout({
      date: '2026-09-23',
      exercises: [
        entry({ exerciseId: BENCH.id, sets: [{ reps: 8, weightKg: 20 }] }),
        entry({ exerciseId: other.id, order: 1 }),
      ],
    }),
  )
  open(w.id)
  click(await waitForElement('[data-testid=workout-menu]'))
  click($('[data-testid=edit-exercises]'))

  // Only the rows: no sets, no editor to open.
  await waitFor(() => expect($$('[data-testid=remove-in-edit]')).toHaveLength(2))
  expect($$('[data-testid=sets]')).toEqual([])
  expect($$('[data-testid=edit]')).toEqual([])

  // Nothing done in Vader: it goes at once.
  click($$('[data-testid=remove-in-edit]')[1]!)
  await waitFor(() => expect(names()).toEqual(['Bröst maskin']))
  expect($$('[role=alertdialog]')).toEqual([])

  // A set done in Bröst maskin: asked first.
  click($('[data-testid=remove-in-edit]'))
  click($('[data-testid=confirm-remove]'))
  await waitFor(async () => expect((await reload(w.id)).exercises).toEqual([]))
  // With nothing left, edit mode ends with the list, and the menu is back.
  await waitForElement('[data-testid=no-exercises]')
  expect($$('[data-testid=done-editing]')).toEqual([])
  click($('[data-testid=workout-menu]'))
  expect($('[data-testid=edit-exercises]').hasAttribute('disabled')).toBe(true)
})

it('leaves edit mode with Done, the cards as they were', async () => {
  const w = await seed(workout({ date: '2026-09-23', exercises: [entry({ exerciseId: BENCH.id })] }))
  open(w.id)
  click(await waitForElement('[data-testid=workout-menu]'))
  click($('[data-testid=edit-exercises]'))
  await waitForElement('[data-testid=done-editing]')
  expect($$('[data-testid=sets]')).toEqual([])

  click($('[data-testid=done-editing]'))

  await waitForElement('[data-testid=sets]')
  expect($$('[data-testid=drag-handle]')).toEqual([])
  expect($$('[data-testid=workout-menu]')).toHaveLength(1)
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
  // Never a form in the list: a row for a new one, last, named as searched for.
  expect($$('[data-testid=exercise-picker] select')).toEqual([])
  expect(text($('[data-testid=new-exercise]'))).toBe('Ny övning ”Plankan”')
  click($('[data-testid=new-exercise]'))

  // The form is pushed inside the same sheet, the name filled in, with the way back to the search.
  expect($$('[role=dialog]')).toHaveLength(1)
  expect(text($('[data-testid=exercise-sheet] h2'))).toBe('Ny övning')
  expect($<HTMLInputElement>('[data-testid=new-exercise-name]').value).toBe('Plankan')
  change($('[data-testid=new-exercise-kind]'), 'Timed')
  expect($('[data-testid=create-exercise]').hasAttribute('disabled')).toBe(true)
  click($('[data-testid=new-exercise-form] [data-area=Core]'))
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
  // The one match, and the row for a new one after it.
  expect($$('[data-testid=exercise-picker] li:has([data-testid=picker-thumbnail])')).toHaveLength(1)
  expect($$('[data-testid=exercise-picker] li')).toHaveLength(2)
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
  click($('[data-testid=workout-menu]'))
  click($('[role=menu] [data-testid=edit-details]'))
  // From the workout's menu in the bar, in a sheet of their own, as rows: the day, the number, the note.
  expect($('[data-testid=details-sheet]').getAttribute('aria-label')).toBe('Detaljer')
  expect($$('[data-testid=details-editor] li > :first-child').map((l) => l.textContent)).toEqual([
    'Datum',
    'Pass nr',
    'Anteckning',
  ])
  change($('[data-testid=details-editor] input[type=text]'), 'Ben och bröst')
  click($('[data-testid=close-details]'))

  await waitFor(() => expect($('h1').textContent).toBe('Ben och bröst'))
  await waitFor(() => expect($$('[data-testid=details-editor]')).toEqual([]))
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
  // A symbol, the filled green check, with the word as its tooltip.
  expect(badge.getAttribute('title')).toBe('Genomfört')
  expect(badge.querySelector('circle')!.classList).toContain('fill-green-600')
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

it('praises a workout once it is finished, by what it was of all and of its month', async () => {
  const before = workout({
    date: '2026-09-21',
    status: 'Done',
    exercises: [entry({ exerciseId: BENCH.id, sets: [{ reps: 8, weightKg: 60 }] })],
  })
  const w = await seed(
    workout({ date: '2026-09-23', exercises: [entry({ exerciseId: BENCH.id, targetSets: 1, targetReps: 8 })] }),
  )
  await saveWorkout(before)
  open(w.id)

  await waitForElement('[data-testid=details]')
  expect($$('[data-testid=cheer]')).toEqual([])

  click($('[data-testid=set-next]'))

  await waitForElement('[data-testid=cheer]')
  expect(text($('[data-testid=cheer-title]'))).toBe('Starkt!')
  expect(text($('[data-testid=cheer-detail]'))).toBe('Ditt 2:a pass · 2:a i september')
  // Just finished: the set celebrates itself, and confetti bursts over the praise.
  expect($('[data-testid=set-done]').getAttribute('data-fresh')).toBe('true')
  expect($$('[data-testid=confetti] .confetti')).toHaveLength(22)
})

it('keeps the praise of an earlier workout as it was on its day', async () => {
  const first = await seed(
    workout({
      date: '2026-09-21',
      status: 'Done',
      exercises: [entry({ exerciseId: BENCH.id, sets: [{ reps: 8, weightKg: 60 }] })],
    }),
  )
  await saveWorkout(
    workout({
      date: '2026-09-22',
      status: 'Done',
      exercises: [entry({ exerciseId: BENCH.id, sets: [{ reps: 8, weightKg: 60 }] })],
    }),
  )
  open(first.id)

  expect((await waitForElement('[data-testid=cheer]')).getAttribute('data-kind')).toBe('first')
  expect(text($('[data-testid=cheer-title]'))).toBe('Ditt första pass!')
  // Opened, not finished now: nothing moves.
  expect($$('[data-testid=confetti]')).toEqual([])
  expect($$('[data-testid=set-done][data-fresh]')).toEqual([])
})

it('celebrates only the set just done, not the ones before it', async () => {
  const w = await seed(
    workout({
      date: '2026-09-23',
      exercises: [entry({ exerciseId: BENCH.id, targetSets: 3, targetReps: 8, sets: [{ reps: 8 }] })],
    }),
  )
  open(w.id)

  click(await waitForElement('[data-testid=set-next]'))

  await waitFor(() => expect($$('[data-testid=set-done]')).toHaveLength(2))
  expect($$('[data-testid=set-done]').map((s) => s.getAttribute('data-fresh'))).toEqual([null, 'true'])
  expect($$('[data-testid=cheer]')).toEqual([])
})

it('asks before deleting, and then moves the workout to the trash', async () => {
  const w = await seed(workout({ date: '2026-09-23' }))
  open(w.id)

  // From the workout's menu, its one destructive item.
  click(await waitForElement('[data-testid=workout-menu]'))
  const del = $('[role=menu] [data-testid=delete-workout]')
  expect(text(del)).toBe('Ta bort passet')
  expect(del.className).toContain('text-red-600')
  click(del)
  expect($$('[role=menu]')).toEqual([])
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
  // Its menu offers to unlock it, and nothing that changes it.
  click($('[data-testid=workout-menu]'))
  expect($('[data-testid=edit-details]').hasAttribute('disabled')).toBe(true)
  expect($('[data-testid=edit-exercises]').hasAttribute('disabled')).toBe(true)
  expect($('[data-testid=delete-workout]').hasAttribute('disabled')).toBe(true)
  $('[data-testid=menu-unlock]')
  fireEvent.keyDown(document, { key: 'Escape' })
  expect($$('[role=menu]')).toEqual([])
  // The browser does not click a disabled button; the page refuses to save if it happens anyway.
  click($('[data-testid=set-next]'))
  expect((await reload(w.id)).exercises[0]!.sets).toEqual([])

  click($('[data-testid=unlock]'))

  expect($$('[data-testid=locked]')).toEqual([])
  expect($('[data-testid=workout-body]').hasAttribute('disabled')).toBe(false)
  click($('[data-testid=set-next]'))
  await waitFor(async () => expect((await reload(w.id)).exercises[0]!.sets).toHaveLength(1))

  click($('[data-testid=workout-menu]'))
  click($('[data-testid=lock]'))
  expect($('[data-testid=workout-body]').hasAttribute('disabled')).toBe(true)
})

it.each([23, 25])('does not lock today or a later day (%i September)', async (day) => {
  const w = await seed(workout({ date: `2026-09-${day}` }))
  open(w.id)

  expect((await waitForElement('[data-testid=workout-body]')).hasAttribute('disabled')).toBe(false)
  expect($$('[data-testid=locked]')).toEqual([])
  // Nothing to lock again in its menu either.
  click($('[data-testid=workout-menu]'))
  $('[role=menu] [data-testid=edit-details]')
  expect($$('[data-testid=lock]')).toEqual([])
  expect($$('[data-testid=menu-unlock]')).toEqual([])
})

it('keeps an unlocked workout unlocked when a sync reloads it', async () => {
  const w = await seed(workout({ date: '2026-09-21' }))
  open(w.id)
  click(await waitForElement('[data-testid=unlock]'))

  await act(() => app.engine.sync())

  expect($('[data-testid=workout-body]').hasAttribute('disabled')).toBe(false)
})

it('goes back from a new exercise to the search as it was left', async () => {
  const w = await seed(workout({ date: '2026-09-23' }))
  open(w.id)

  click(await waitForElement('[data-testid=add-exercise]'))
  fireEvent.input($('[data-testid=exercise-picker] input[type=search]'), { target: { value: 'Rodd' } })
  click($('[data-testid=new-exercise]'))
  click($('[data-testid=sheet-back]'))

  expect($<HTMLInputElement>('[data-testid=exercise-picker] input[type=search]').value).toBe('Rodd')
  expect(text($('[data-testid=exercise-sheet] h2'))).toBe('Lägg till övning')
})
