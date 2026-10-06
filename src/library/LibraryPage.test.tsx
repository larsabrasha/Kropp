// @vitest-environment happy-dom
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { expect, it } from 'vitest'
import { newId, type Exercise, type SetResult, type Workout, type WorkoutExercise } from '../training/model'
import { createTestApp, type TestApp } from '../test/render'

// The library's lists. Today is Wednesday 23 September 2026 (render.tsx).

const exercise = (name: string, kind: Exercise['kind'], categories: Exercise['categories']): Exercise => ({
  id: newId(),
  name,
  kind,
  isArchived: false,
  categories,
  measuresTimeOnly: false,
})

const BENCH = exercise('Bänkpress', 'Strength', ['Chest', 'Arms'])
const PLANK = exercise('Plankan', 'Timed', ['Core'])

const entry = (exerciseId: string, sets: SetResult[], fields: Partial<WorkoutExercise> = {}): WorkoutExercise => ({
  exerciseId,
  order: 0,
  sets,
  isSkipped: false,
  ...fields,
})

const workout = (date: string, exercises: WorkoutExercise[]): Workout => ({
  id: newId(),
  date,
  status: 'Done',
  exercises,
})

const bench = (...sets: [number, number][]) =>
  entry(
    BENCH.id,
    sets.map(([reps, weightKg]) => ({ reps, weightKg })),
  )

/** Three workouts in each of the last two weeks, one so far this week, and one planned. */
async function seed(app: TestApp) {
  await app.repository.save('exercise', BENCH.id, BENCH)
  await app.repository.save('exercise', PLANK.id, PLANK)
  const workouts = [
    workout('2026-09-07', [bench([8, 60], [8, 60]), entry(PLANK.id, [{ seconds: 60 }])]),
    workout('2026-09-09', [bench([8, 62.5])]),
    workout('2026-09-11', [bench([8, 62.5])]),
    workout('2026-09-14', [bench([8, 65])]),
    workout('2026-09-16', [bench([8, 60])]),
    workout('2026-09-18', [bench([8, 60])]),
    workout('2026-09-21', [entry(PLANK.id, [{ seconds: 75 }])]),
    workout('2026-09-25', [entry(BENCH.id, [], { targetSets: 3, targetReps: 8, targetWeightKg: 65 })]),
  ]
  for (const w of workouts) await app.repository.save('workout', w.id, w)
  return workouts
}

it('lists the templates and the exercises, with how many there are', () => {
  createTestApp().renderAt('/library')

  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Bibliotek')
  expect(screen.getByTestId('templates-link').getAttribute('href')).toBe('/templates')
  expect(screen.getByTestId('exercises-link').getAttribute('href')).toBe('/exercises')
  expect(screen.getByTestId('settings-link')).toBeTruthy()
})

it('pushes the templates onto the library, with the way back to it', async () => {
  const app = createTestApp()
  app.renderAt('/library')

  fireEvent.click(screen.getByTestId('templates-link'))

  expect(window.location.pathname).toBe('/templates')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByTitle('Bibliotek').getAttribute('href')).toBe('/library')
})

it('filters the exercises by name, and keeps the filter back from one', async () => {
  const app = createTestApp()
  await seed(app)
  app.renderAt('/library')
  // The exercises a row from the library's first page, with how many there are.
  expect(screen.getByTestId('exercises-link').textContent).toBe('Övningar2')
  fireEvent.click(screen.getByTestId('exercises-link'))
  expect(window.location.pathname).toBe('/exercises')
  expect(screen.getByTestId('tab-library').getAttribute('aria-current')).toBe('page')

  const names = () =>
    within(screen.getByTestId('stats-exercises'))
      .getAllByRole('link')
      .map((a) => a.querySelector('.font-semibold')!.textContent)
  expect(names()).toEqual(['Plankan', 'Bänkpress'])

  fireEvent.change(screen.getByTestId('stats-search'), { target: { value: 'BÄNK' } })
  expect(names()).toEqual(['Bänkpress'])

  fireEvent.click(within(screen.getByTestId('stats-exercises')).getByRole('link'))
  await waitFor(() => expect(window.location.pathname).toBe(`/stats/exercises/${BENCH.id}`))
  // The same page as in the statistics, in the library's stack: back to its list.
  expect(screen.getByTestId('tab-library').getAttribute('aria-current')).toBe('page')
  expect(screen.getByTestId('back').getAttribute('title')).toBe('Övningar')
  fireEvent.click(screen.getByTestId('back'))
  await waitFor(() => expect(window.location.pathname).toBe('/exercises'))
  expect(names()).toEqual(['Bänkpress'])

  const input = screen.getByTestId('stats-search')
  fireEvent.change(input, { target: { value: 'marklyft' } })
  expect(screen.getByTestId('stats-no-match').textContent).toBe('Ingen övning matchar.')
  // The clear button empties it and keeps the focus, as iOS's does. The filter outlives the page,
  // so this also leaves it empty for the tests after this one.
  fireEvent.click(screen.getByRole('button', { name: 'Rensa' }))
  expect((input as HTMLInputElement).value).toBe('')
  expect(document.activeElement).toBe(input)
  expect(names()).toEqual(['Plankan', 'Bänkpress'])
  expect(screen.queryByRole('button', { name: 'Rensa' })).toBeNull()
})

it('lists every exercise, the ones never logged after the rest, and hidden ones last', async () => {
  const app = createTestApp()
  await seed(app)
  const squat = exercise('Benböj', 'Strength', ['Legs'])
  const old = { ...exercise('Armhävningar', 'Bodyweight', ['Chest']), isArchived: true }
  for (const e of [squat, old]) await app.repository.save('exercise', e.id, e)
  app.renderAt('/exercises')

  const rows = within(screen.getByTestId('stats-exercises')).getAllByRole('link')
  expect(rows.map((a) => a.querySelector('.font-semibold')!.textContent)).toEqual([
    'Plankan',
    'Bänkpress',
    'Benböj',
    'Armhävningar',
  ])
  expect(rows[2]!.textContent).toContain('Vikter · Inte loggad än')
  expect(rows[3]!.textContent).toContain('Dold')
})

it('lists the exercises before anything is logged', async () => {
  const app = createTestApp()
  await app.repository.save('exercise', BENCH.id, BENCH)
  app.renderAt('/exercises')
  expect(within(screen.getByTestId('stats-exercises')).getByRole('link').getAttribute('href')).toBe(
    `/stats/exercises/${BENCH.id}?from=library`,
  )
})

/**
 * A pull to the left with the mouse on a row, as a finger swipes it on a phone; then the moment in
 * which the click that ends a pull is swallowed passes.
 */
async function swipe(row: Element, dx = -200) {
  fireEvent.pointerDown(row, { pointerType: 'mouse', button: 0, clientX: 300, clientY: 10 })
  fireEvent.pointerMove(window, { pointerType: 'mouse', clientX: 300 + dx / 2, clientY: 10 })
  fireEvent.pointerMove(window, { pointerType: 'mouse', clientX: 300 + dx, clientY: 10 })
  fireEvent.pointerUp(window, { pointerType: 'mouse', clientX: 300 + dx, clientY: 10 })
  await new Promise((r) => setTimeout(r, 0))
}

it('deletes a template from its row, swiped, once confirmed', async () => {
  const app = createTestApp()
  const ben = { id: newId(), name: 'Ben', exercises: [] }
  await app.repository.save('template', ben.id, ben)
  app.renderAt('/templates')

  const row = within(screen.getByTestId('templates')).getByRole('link')
  await swipe(row)
  fireEvent.click(screen.getByTestId('swipe-delete'))
  fireEvent.click(screen.getByTestId('confirm-delete'))

  await waitFor(() => expect(screen.getByTestId('templates-empty')).toBeTruthy())
  expect(app.repository.peekAll('template')).toEqual([])
})

it('creates an exercise from the plus, and hides one or deletes one nothing uses from its row', async () => {
  const app = createTestApp()
  await seed(app)
  app.renderAt('/exercises')

  // New, in a sheet: named, an area chosen, created.
  fireEvent.click(screen.getByTestId('new-exercise'))
  fireEvent.change(screen.getByTestId('new-exercise-name'), { target: { value: 'Benböj' } })
  fireEvent.click(within(screen.getByTestId('new-exercise-sheet')).getByText('Ben'))
  fireEvent.click(screen.getByTestId('create-exercise'))
  await waitFor(() => expect(app.repository.peekAll('exercise').map((e) => e.name)).toContain('Benböj'))

  const rowOf = (name: string) =>
    within(screen.getByTestId('stats-exercises'))
      .getAllByRole('link')
      .find((a) => a.textContent.includes(name))!

  // Used in workouts: hidden, never deleted.
  await waitFor(() => expect(rowOf('Bänkpress')).toBeTruthy())
  await swipe(rowOf('Bänkpress'))
  expect(screen.queryAllByTestId('swipe-delete')).toHaveLength(1)
  const benchActions = rowOf('Bänkpress').closest('li')!
  expect(within(benchActions).queryByTestId('swipe-delete')).toBeNull()
  fireEvent.click(within(benchActions).getByTestId('swipe-hide'))
  await waitFor(() => expect(app.repository.peek('exercise', BENCH.id)!.isArchived).toBe(true))

  // Never used: deleted, once confirmed.
  const squat = rowOf('Benböj').closest('li')!
  await swipe(rowOf('Benböj'))
  fireEvent.click(within(squat).getByTestId('swipe-delete'))
  fireEvent.click(screen.getByTestId('confirm-delete'))
  await waitFor(() => expect(app.repository.peekAll('exercise').map((e) => e.name)).not.toContain('Benböj'))
})

it('deletes an exercise nothing uses from its own page too, and never one in use', async () => {
  const app = createTestApp()
  await seed(app)
  const unused = exercise('Rodd', 'Strength', ['Back'])
  await app.repository.save('exercise', unused.id, unused)

  app.renderAt(`/exercises/${BENCH.id}`)
  expect(screen.queryByTestId('delete-exercise')).toBeNull()

  app.renderAt(`/exercises/${unused.id}`)
  fireEvent.click(screen.getAllByTestId('delete-exercise').at(-1)!)
  fireEvent.click(screen.getByTestId('confirm-delete'))
  await waitFor(() => expect(window.location.pathname).toBe('/exercises'))
  expect(app.repository.peek('exercise', unused.id)).toBeUndefined()
})

it('does the outermost action on a full swipe: hides at once, and asks before deleting', async () => {
  // happy-dom lays nothing out: a row as wide as a phone's, for the full swipe's mark at half of it.
  const width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 375 })
  try {
    const app = createTestApp()
    await seed(app)
    const unused = exercise('Rodd', 'Strength', ['Back'])
    await app.repository.save('exercise', unused.id, unused)
    app.renderAt('/exercises')
    const rowOf = (name: string) =>
      within(screen.getByTestId('stats-exercises'))
        .getAllByRole('link')
        .find((a) => a.textContent.includes(name))!

    // In use: Dölj is the only action, done when let go past half the row.
    await swipe(rowOf('Bänkpress'), -320)
    await waitFor(() => expect(app.repository.peek('exercise', BENCH.id)!.isArchived).toBe(true))

    // Short of the mark: only opened, nothing done.
    await swipe(rowOf('Rodd'), -120)
    expect(screen.queryByTestId('confirm-delete')).toBeNull()
    // Past it: Radera, the outermost, asks first.
    await swipe(rowOf('Rodd'), -320)
    expect(screen.getByTestId('confirm-delete')).toBeTruthy()
    expect(app.repository.peek('exercise', unused.id)).toBeDefined()
  } finally {
    if (width) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', width)
  }
})

it('shows the exercises done most as cards, each leading to its progress in the library', async () => {
  const app = createTestApp()
  await seed(app)
  app.renderAt('/library')

  const cards = within(screen.getByTestId('most-done')).getAllByRole('link')
  expect(cards.map((c) => c.textContent)).toEqual(['Bänkpress6 pass', 'Plankan2 pass'])
  expect(cards[0]!.getAttribute('href')).toBe(`/stats/exercises/${BENCH.id}?from=library`)
})
