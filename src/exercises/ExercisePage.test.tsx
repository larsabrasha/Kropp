// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, expect, it } from 'vitest'
import { picture } from '../illustrations/illustrations'
import { AggregateTypes } from '../sync/protocol'
import { newId, type Exercise, type Workout } from '../training/model'
import { createTestApp, type TestApp } from '../test/render'

const exercise = (name: string, kind: Exercise['kind'], isArchived = false): Exercise => ({
  id: newId(),
  name,
  kind,
  isArchived,
  categories: [],
  measuresTimeOnly: false,
})

const bench = exercise('Bröst maskin', 'Strength')
const walk = exercise('Gång i maskin', 'Cardio')
const old = exercise('Armhävningar', 'Bodyweight', true)

let app: TestApp

beforeEach(() => {
  app = createTestApp()
})

async function seed() {
  for (const e of [bench, walk, old]) await app.repository.save('exercise', e.id, e)
}

function renderExercise(id: string, back?: string) {
  return app.renderAt(back === undefined ? `/exercises/${id}` : `/exercises/${id}?back=${encodeURIComponent(back)}`)
}

const reload = async (id: string) => (await app.repository.get('exercise', id))!

const textInputs = () => document.querySelectorAll<HTMLInputElement>('[role=dialog] input[type=text]')

it('says where exercises come from when there are none', async () => {
  app.renderAt('/exercises')

  await screen.findByTestId('exercises-empty')
})

it('lists by name with hidden ones last, and can be searched', async () => {
  await seed()
  app.renderAt('/exercises')

  await waitFor(() =>
    expect([...screen.getByTestId('exercises').querySelectorAll('a .font-semibold')].map((n) => n.textContent)).toEqual(
      ['Bröst maskin', 'Gång i maskin', 'Armhävningar'],
    ),
  )
  const links = screen.getByTestId('exercises').querySelectorAll('a')
  expect(links[0]!.getAttribute('href')).toBe(`/exercises/${bench.id}`)
  expect(links[2]!.textContent).toContain('Dold')

  fireEvent.change(screen.getByTestId('exercise-search'), { target: { value: 'gång' } })
  expect(screen.getByTestId('exercises').querySelectorAll('a')).toHaveLength(1)
  fireEvent.change(screen.getByTestId('exercise-search'), { target: { value: 'xyz' } })
  screen.getByTestId('exercises-no-match')
})

it('shows not found for an unknown exercise', async () => {
  renderExercise(newId())

  await screen.findByTestId('not-found')
})

it('changes categories for the exercise, and they name the workouts', async () => {
  await seed()
  const workout: Workout = {
    id: newId(),
    date: '2026-09-23',
    status: 'Planned',
    exercises: [{ exerciseId: bench.id, order: 0, sets: [], isSkipped: false }],
  }
  await app.repository.save('workout', workout.id, workout)
  renderExercise(bench.id)

  expect((await screen.findByTestId('usage')).textContent).toContain('Används i 1 pass')
  const chips = screen.getByTestId('category-chips')
  expect(chips.querySelector('[data-area=Chest]')!.hasAttribute('disabled')).toBe(true)
  fireEvent.click(chips.querySelector('[data-area=Arms]')!)

  await waitFor(async () => expect((await reload(bench.id)).categories).toEqual(['Chest', 'Arms']))
  expect(await app.store.getPending()).toContainEqual(
    expect.objectContaining({ type: AggregateTypes.exercise, id: bench.id }),
  )

  cleanup()
  app.renderAt(`/workouts/${workout.id}`)
  await waitFor(() => expect(screen.getByTestId('details').textContent).toContain('Bröst och armar'))
})

it('saves the name, the setting, the weight step and hidden', async () => {
  await seed()
  renderExercise(bench.id)

  await screen.findByTestId('usage')
  fireEvent.change(textInputs()[0]!, { target: { value: 'Bröstpress' } })
  fireEvent.change(textInputs()[1]!, { target: { value: 'Sitthöjd 11' } })
  fireEvent.change(screen.getByTestId('weight-step'), { target: { value: '1' } })
  fireEvent.click(screen.getByTestId('archived'))

  await waitFor(async () => {
    const saved = await reload(bench.id)
    expect([saved.name, saved.settingsNote, saved.weightStepKg, saved.isArchived]).toEqual([
      'Bröstpress',
      'Sitthöjd 11',
      1,
      true,
    ])
  })
  expect(document.querySelector('[role=dialog] h1')!.textContent).toBe('Bröstpress')
})

it('refuses an empty name and keeps the old one', async () => {
  await seed()
  renderExercise(bench.id)

  await screen.findByTestId('usage')
  fireEvent.change(textInputs()[0]!, { target: { value: '  ' } })

  expect(screen.getByRole('alert').textContent).toBe('Övningen behöver ett namn.')
  expect(textInputs()[0]!.value).toBe('Bröst maskin')
  expect((await reload(bench.id)).name).toBe('Bröst maskin')
})

it('offers the weight step only for weights', async () => {
  await seed()

  renderExercise(walk.id)

  await screen.findByTestId('usage')
  expect(screen.queryByTestId('weight-step')).toBeNull()
})

it('changes the picture here', async () => {
  await seed()
  renderExercise(bench.id)

  await screen.findByTestId('change-illustration')
  expect(screen.getByTestId('illustration').textContent).not.toContain('Bryl Lim')
  fireEvent.click(screen.getByTestId('change-illustration'))
  expect(screen.getByTestId('illustration-credit').textContent).toContain('Bryl Lim')
  const picker = screen.getByTestId('illustration-picker')
  fireEvent.change(picker.querySelector('input')!, { target: { value: 'pec deck' } })
  fireEvent.click(picker.querySelector('[data-slug=pec-deck]')!)

  await waitFor(() =>
    expect(within(screen.getByTestId('illustration-large')).getByRole('img').getAttribute('src')).toBe(
      picture('pec-deck'),
    ),
  )
  await waitFor(async () => expect((await reload(bench.id)).illustration).toBe('pec-deck'))
})

it.each([
  [undefined, '/exercises'],
  ['workouts/0b3c5e0e-4f7a-4d0c-9d6a-2f1b8e3c7a11', '/workouts/0b3c5e0e-4f7a-4d0c-9d6a-2f1b8e3c7a11'],
  ['/workouts/0b3c5e0e-4f7a-4d0c-9d6a-2f1b8e3c7a11', '/workouts/0b3c5e0e-4f7a-4d0c-9d6a-2f1b8e3c7a11'],
  ['https://example.com/', '/exercises'],
  ['//example.com', '/exercises'],
])('goes back to where the user came from, but only inside the app (%s)', async (back, expected) => {
  await seed()

  renderExercise(bench.id, back)

  // The sheet's way back; the workout below the sheet has one of its own.
  expect((await within(await screen.findByRole('dialog')).findByTestId('back')).getAttribute('href')).toBe(expected)
})

it('can set cardio to measure time alone', async () => {
  await seed()
  renderExercise(walk.id)

  fireEvent.click(await screen.findByTestId('time-only'))

  await waitFor(async () => expect((await reload(walk.id)).measuresTimeOnly).toBe(true))
})

it('offers time alone only for cardio', async () => {
  await seed()
  renderExercise(bench.id)

  await screen.findByTestId('usage')
  expect(screen.queryByTestId('time-only')).toBeNull()
})

it('changes the kind, and a weight then stops showing', async () => {
  await seed()
  const workout: Workout = {
    id: newId(),
    date: '2026-09-23',
    status: 'Planned',
    exercises: [
      {
        exerciseId: bench.id,
        order: 0,
        targetSets: 3,
        targetReps: 20,
        targetWeightKg: 5,
        sets: [],
        isSkipped: false,
      },
    ],
  }
  await app.repository.save('workout', workout.id, workout)
  renderExercise(bench.id)

  fireEvent.change(await screen.findByTestId('kind'), { target: { value: 'Bodyweight' } })

  await waitFor(async () => expect((await reload(bench.id)).kind).toBe('Bodyweight'))
  expect(screen.queryByTestId('weight-step')).toBeNull()
  cleanup()
  app.renderAt(`/workouts/${workout.id}`)
  expect((await screen.findByTestId('target')).textContent.trim()).toBe('3 × 20')
})
