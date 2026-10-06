// @vitest-environment happy-dom
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { expect, it } from 'vitest'
import { newId, type Exercise, type SetResult, type Workout, type WorkoutExercise } from '../training/model'
import { createTestApp, type TestApp } from '../test/render'

// Today is Wednesday 23 September 2026 (render.tsx), in week 39.

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

const tile = (id: string) => within(screen.getByTestId(id)).getByTestId('tile-value').textContent

it('opens from the bar of every page', () => {
  createTestApp().renderAt('/')

  expect(screen.getByTestId('stats-link').getAttribute('href')).toBe('/stats')
})

it('shows an empty state before anything is logged, planned workouts or not', async () => {
  const app = createTestApp()
  const planned = workout('2026-09-25', [entry(BENCH.id, [], { targetSets: 3 })])
  await app.repository.save('workout', planned.id, planned)
  app.renderAt('/stats')

  expect(screen.getByTestId('stats-empty').textContent).toContain('Ingen statistik än')
  expect(screen.queryByTestId('period')).toBeNull()
})

it('sums up the period in its first render, counting only what was logged', async () => {
  const app = createTestApp()
  await seed(app)
  app.renderAt('/stats')

  // No waitFor: the page reads the repository's memory while it renders the first time.
  expect(tile('total-workouts')).toBe('7')
  // From the first week trained, 7 September, not from 29 June: 7 workouts in 17 days.
  expect(tile('total-per-week')).toBe('2,9')
  expect(tile('total-sets')).toBe('9')
  expect(tile('total-volume')).toMatch(/^3\s440$/)
  expect(screen.getByTestId('range').textContent).toBe('29 juni–23 sep. 2026')
})

it('draws a bar a week with the goal, and counts the weeks the goal was reached', async () => {
  const app = createTestApp()
  await seed(app)
  app.renderAt('/stats')

  const chart = screen.getByTestId('workouts-chart')
  const bars = within(chart).getAllByTestId('bar')
  expect(bars).toHaveLength(13)
  expect(within(chart).getByTestId('goal-line')).toBeTruthy()
  expect(screen.getByTestId('streak').textContent).toBe('2 veckor i rad med minst 3 pass.')
})

it('reads out the bar picked with the arrow keys', async () => {
  const app = createTestApp()
  await seed(app)
  app.renderAt('/stats')

  const chart = screen.getByTestId('workouts-chart')
  fireEvent.keyDown(within(chart).getByTestId('plot'), { key: 'ArrowLeft' })

  expect(within(chart).getByTestId('readout-value').textContent).toBe('1')
  expect(within(chart).getByTestId('readout-sub').textContent).toContain('v. 39')
  fireEvent.keyDown(within(chart).getByTestId('plot'), { key: 'ArrowLeft' })
  expect(within(chart).getByTestId('readout-value').textContent).toBe('3')
  fireEvent.keyDown(within(chart).getByTestId('plot'), { key: 'Escape' })
  expect(within(chart).getByTestId('readout').textContent).toContain('Snitt')
})

it('counts sets for every area an exercise trains', async () => {
  const app = createTestApp()
  await seed(app)
  app.renderAt('/stats')

  const rows = within(screen.getByTestId('areas')).getAllByRole('listitem')
  expect(rows.map((r) => r.textContent)).toEqual(['Bröst7', 'Armar7', 'Mage2'])
})

it('lists the latest records, newest first, with what they beat', async () => {
  const app = createTestApp()
  await seed(app)
  app.renderAt('/stats')

  const records = within(screen.getByTestId('records')).getAllByRole('link')
  expect(records.map((r) => within(r).getByTestId('record-value').textContent)).toEqual(['75 s', '65 kg'])
  expect(records[1]!.textContent).toContain('upp från 62,5 kg')
  expect(records[1]!.getAttribute('href')).toBe(`/stats/exercises/${BENCH.id}`)
})

it('changes period in place, with a bar a month for a year', async () => {
  const app = createTestApp()
  await seed(app)
  app.renderAt('/stats')

  fireEvent.click(within(screen.getByTestId('period')).getByText('1 år'))

  expect(window.location.search).toBe('?period=1Y')
  expect(within(screen.getByTestId('workouts-chart')).getAllByTestId('bar')).toHaveLength(12)
  expect(within(screen.getByTestId('workouts-chart')).queryByTestId('goal-line')).toBeNull()
  expect(within(screen.getByTestId('stats-exercises')).getAllByRole('link')[0]!.getAttribute('href')).toBe(
    `/stats/exercises/${PLANK.id}?period=1Y`,
  )
})

it("follows an exercise's heaviest set over time, and its volume when chosen", async () => {
  const app = createTestApp()
  await seed(app)
  app.renderAt(`/stats/exercises/${BENCH.id}`)

  const chart = screen.getByTestId('exercise-chart')
  expect(within(chart).getAllByTestId('point')).toHaveLength(6)
  expect(within(chart).getByTestId('readout-value').textContent).toBe('60')
  expect(within(chart).getByTestId('readout-sub').textContent).toBe('±0 kg i perioden')
  expect(screen.getByTestId('best-weight').textContent).toBe('65 kg')
  expect(screen.getByTestId('best-volume').textContent).toMatch(/^960 kg$/)

  fireEvent.click(within(screen.getByTestId('metric')).getByText('Volym'))

  expect(window.location.search).toBe('?metric=volume')
  expect(within(screen.getByTestId('exercise-chart')).getByTestId('readout-value').textContent).toBe('480')
  expect(within(screen.getByTestId('exercise-chart')).getByTestId('readout-sub').textContent).toBe('−480 kg i perioden')
})

it('opens a workout from its history in the same sheet, with the way back to the exercise', async () => {
  const app = createTestApp()
  const workouts = await seed(app)
  app.renderAt(`/stats/exercises/${BENCH.id}`)

  const history = within(screen.getByTestId('history')).getAllByRole('link')
  expect(history).toHaveLength(6)
  expect(within(history[0]!).getByTestId('history-result').textContent).toBe('8 × 60 kg')
  fireEvent.click(history[0]!)

  await waitFor(() => expect(window.location.pathname).toBe(`/workouts/${workouts[5]!.id}`))
  expect(screen.getByTestId('sheet')).toBeTruthy()
  const back = screen.getByTestId('back')
  expect(back.getAttribute('href')).toBe(`/stats/exercises/${BENCH.id}`)
  expect(back.getAttribute('title')).toBe('Statistik')
})

it('says so when an exercise was never logged, or is not there', async () => {
  const app = createTestApp()
  await app.repository.save('exercise', BENCH.id, BENCH)
  app.renderAt(`/stats/exercises/${BENCH.id}`)
  expect(screen.getByTestId('exercise-stats-empty').textContent).toContain('inte loggad än')

  app.renderAt(`/stats/exercises/${newId()}`)
  await waitFor(() => expect(screen.getByTestId('not-found')).toBeTruthy())
})

it('filters the exercises by name, and keeps the filter back from one', async () => {
  const app = createTestApp()
  await seed(app)
  app.renderAt('/stats')

  const names = () =>
    within(screen.getByTestId('stats-exercises'))
      .getAllByRole('link')
      .map((a) => a.querySelector('.font-semibold')!.textContent)
  expect(names()).toEqual(['Plankan', 'Bänkpress'])

  fireEvent.change(screen.getByTestId('stats-search'), { target: { value: 'BÄNK' } })
  expect(names()).toEqual(['Bänkpress'])

  fireEvent.click(within(screen.getByTestId('stats-exercises')).getByRole('link'))
  await waitFor(() => expect(window.location.pathname).toBe(`/stats/exercises/${BENCH.id}`))
  fireEvent.click(screen.getByTestId('back'))
  await waitFor(() => expect(window.location.pathname).toBe('/stats'))
  expect(names()).toEqual(['Bänkpress'])

  const input = screen.getByTestId('stats-search')
  fireEvent.change(input, { target: { value: 'marklyft' } })
  expect(screen.getByTestId('stats-no-match').textContent).toBe('Ingen övning matchar.')
  // The filter outlives the page: leave it empty for the tests after this one.
  fireEvent.change(input, { target: { value: '' } })
})
