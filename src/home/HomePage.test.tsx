// @vitest-environment happy-dom
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { expect, it } from 'vitest'
import { picture } from '../illustrations/illustrations'
import { addDays } from '../training/dates'
import { newId, type Exercise, type Workout, type WorkoutExercise, type WorkoutTemplate } from '../training/model'
import { createTestApp } from '../test/render'

const exercise = (name: string): Exercise => ({
  id: newId(),
  name,
  kind: 'Strength',
  isArchived: false,
  categories: [],
  measuresTimeOnly: false,
})

const entry = (exerciseId: string, fields: Partial<WorkoutExercise> = {}): WorkoutExercise => ({
  exerciseId,
  order: 0,
  sets: [],
  isSkipped: false,
  ...fields,
})

const workout = (date: string, fields: Partial<Workout> = {}): Workout => ({
  id: newId(),
  date,
  status: 'Planned',
  exercises: [],
  ...fields,
})

const template = (name: string, exercises: WorkoutExercise[] = []): WorkoutTemplate => ({
  id: newId(),
  name,
  exercises,
})

const radios = () => [...document.querySelectorAll('[data-testid=template-choices] [role=radio]')]
const texts = (elements: Element[]) => elements.map((e) => e.textContent.trim())

it('shows the empty state when there are no workouts', async () => {
  createTestApp().renderAt('/')

  await waitFor(() => expect(screen.getByTestId('empty-state').textContent).toContain('Inga pass än'))
})

it('shows the workouts in its very first render, with nothing in between', async () => {
  const app = createTestApp()
  const w = workout('2026-09-21')
  await app.repository.save('workout', w.id, w)

  app.renderAt('/')

  // No waitFor: the page reads the repository's memory while it renders the first time.
  expect(screen.getByTestId('workout-list').querySelectorAll('a')).toHaveLength(1)
})

it('plans an empty workout from the last choice', async () => {
  const app = createTestApp()
  const tp = template('Bröst')
  await app.repository.save('template', tp.id, tp)
  const old = workout('2026-09-14', { sessionNumber: 103 })
  await app.repository.save('workout', old.id, old)
  app.renderAt('/')

  await waitFor(() => expect(texts(radios())).toEqual(['Bröst', 'Tomt pass']))
  expect(document.querySelectorAll('form')).toHaveLength(0)
  fireEvent.click(document.querySelector('[data-template=empty]')!)
  expect(screen.getByTestId('next-name').textContent).toBe('Tomt pass')
  fireEvent.click(screen.getByTestId('plan'))

  await waitFor(() => expect(window.location.pathname).toContain('/workouts/'))
  const added = (await app.repository.getAll('workout')).find((w) => w.id !== old.id)!
  expect([added.templateId, added.sessionNumber, added.status]).toEqual([undefined, 104, 'Planned'])
  expect(added.exercises).toEqual([])
  expect(window.location.pathname).toBe(`/workouts/${added.id}`)
})

it('lists workouts as links with a summary', async () => {
  const app = createTestApp()
  const squat = exercise('Benböj lår framsida')
  const bench = exercise('Bröst maskin')
  await app.repository.save('exercise', squat.id, squat)
  await app.repository.save('exercise', bench.id, bench)
  const w = workout('2026-09-21', {
    sessionNumber: 101,
    status: 'Done',
    exercises: [entry(squat.id, { sets: [{ reps: 8 }] }), entry(bench.id, { order: 1 })],
  })
  await app.repository.save('workout', w.id, w)

  app.renderAt('/')

  await waitFor(() => {
    const link = within(screen.getByTestId('workout-list')).getByRole('link')
    expect(link.getAttribute('href')).toBe(`/workouts/${w.id}`)
    expect(within(link).getByTestId('workout-name').textContent).toBe('Ben och bröst')
    expect(within(link).getByTestId('workout-meta').textContent.toLowerCase()).toContain('måndag 21 sep')
    expect(within(link).getByTestId('workout-icon').getAttribute('src')).toBe(picture('squat'))
    expect(link.textContent).not.toContain('Nr 101')
    expect(link.textContent).toContain('2 övningar')
    // Half logged, but its day has passed: it is over.
    expect(link.textContent).toContain('Genomfört')
  })
})

it('groups workouts by weeks that start on monday', async () => {
  const app = createTestApp()
  for (const day of ['2026-09-20', '2026-09-21', '2026-09-23', '2026-09-14']) {
    const w = workout(day)
    await app.repository.save('workout', w.id, w)
  }

  app.renderAt('/')

  await waitFor(() => {
    const weeks = screen.getAllByTestId('week')
    expect(weeks.map((w) => [...w.querySelectorAll('h3 span')].map((x) => x.textContent.trim()).join(' '))).toEqual([
      'Vecka 39 21–27 september',
      'Vecka 38 14–20 september',
    ])
    expect(weeks.map((w) => w.querySelectorAll('li').length)).toEqual([2, 2])
  })
})

it('shows four weeks and more on request', async () => {
  const app = createTestApp()
  for (let week = 0; week < 6; week++) {
    const w = workout(addDays('2026-09-21', -7 * week))
    await app.repository.save('workout', w.id, w)
  }
  app.renderAt('/')

  await waitFor(() => expect(screen.getAllByTestId('week')).toHaveLength(4))
  expect(screen.getByTestId('more-weeks').textContent).toContain('2 äldre')

  fireEvent.click(screen.getByTestId('more-weeks'))

  expect(screen.getAllByTestId('week')).toHaveLength(6)
  expect(screen.queryByTestId('more-weeks')).toBeNull()
})

it('says one exercise in the singular', async () => {
  const app = createTestApp()
  const w = workout('2026-09-21', { exercises: [entry(newId())] })
  await app.repository.save('workout', w.id, w)

  app.renderAt('/')

  await waitFor(() =>
    expect(within(screen.getByTestId('workout-list')).getByRole('link').textContent).toContain('1 övning'),
  )
  expect(within(screen.getByTestId('workout-list')).getByRole('link').textContent).not.toContain('övningar')
})

it('without templates plans an empty workout and explains templates', async () => {
  createTestApp().renderAt('/')

  await screen.findByTestId('no-templates')
  expect(screen.getByTestId('next-name').textContent).toBe('Tomt pass')
  expect(screen.queryByTestId('template-choices')).toBeNull()
})

it('plans the suggested template in one tap', async () => {
  const app = createTestApp()
  const bench = exercise('Bröst maskin')
  const pull = exercise('Pull down maskin')
  await app.repository.save('exercise', bench.id, bench)
  await app.repository.save('exercise', pull.id, pull)
  const chest = template('Bröst', [entry(bench.id, { targetSets: 3, targetReps: 8 })])
  const back = template('Rygg', [entry(pull.id, { targetSets: 3, targetReps: 8 })])
  await app.repository.save('template', chest.id, chest)
  await app.repository.save('template', back.id, back)
  const done = workout('2026-09-22', {
    sessionNumber: 101,
    exercises: [
      entry(bench.id, { targetSets: 3, targetReps: 8, targetWeightKg: 60, sets: [{ reps: 8, weightKg: 60 }] }),
    ],
  })
  await app.repository.save('workout', done.id, done)

  app.renderAt('/')

  await waitFor(() => expect(screen.getByTestId('next-name').textContent).toBe('Rygg'))
  expect(screen.queryByTestId('next')).toBeNull()
  expect(screen.getByTestId('plan-card').querySelector('h2')!.textContent).toBe('Planera nästa pass')
  expect(screen.getByTestId('next-date').textContent.toLowerCase()).toBe('i morgon, 24 sep.')
  expect(texts(radios())).toEqual(['Bröst', 'Rygg', 'Tomt pass'])

  fireEvent.click(screen.getByTestId('plan'))

  await waitFor(() => expect(window.location.pathname).toContain('/workouts/'))
  const plan = (await app.repository.getAll('workout')).find((w) => w.id !== done.id)!
  expect(plan.templateId).toBe(back.id)
  expect(plan.date).toBe('2026-09-24')
  expect(plan.sessionNumber).toBe(102)
  expect(plan.exercises.map((e) => e.exerciseId)).toEqual([pull.id])
})

it('lets another template be chosen before planning', async () => {
  const app = createTestApp()
  const bench = exercise('Bröst maskin')
  await app.repository.save('exercise', bench.id, bench)
  const chest = template('Bröst', [entry(bench.id)])
  const other = template('Annat')
  await app.repository.save('template', chest.id, chest)
  await app.repository.save('template', other.id, other)
  app.renderAt('/')

  await waitFor(() => expect(radios().length).toBeGreaterThan(0))
  fireEvent.click(radios().find((b) => b.textContent.trim() === 'Bröst')!)
  expect(screen.getByTestId('next-name').textContent).toBe('Bröst')
  fireEvent.click(screen.getByTestId('plan'))

  await waitFor(() => expect(window.location.pathname).toContain('/workouts/'))
  const all = await app.repository.getAll('workout')
  expect(all).toHaveLength(1)
  expect(all[0]!.templateId).toBe(chest.id)
})

it('shows an existing plan instead of a suggestion', async () => {
  const app = createTestApp()
  const tp = template('Bröst')
  await app.repository.save('template', tp.id, tp)
  const planned = workout('2026-09-24')
  await app.repository.save('workout', planned.id, planned)

  app.renderAt('/')

  expect((await screen.findByTestId('upcoming')).getAttribute('href')).toBe(`/workouts/${planned.id}`)
  expect(screen.getByTestId('next')).not.toBeNull()

  // Planning another waits behind a quiet button, and folds away again.
  expect(screen.queryByTestId('plan-card')).toBeNull()
  expect(screen.getByTestId('open-planning').textContent.trim()).toBe('Lägg till ett träningspass')
  fireEvent.click(screen.getByTestId('open-planning'))
  expect(screen.getByTestId('plan-card').querySelector('h2')!.textContent).toBe('Lägg till ett träningspass')
  fireEvent.click(screen.getByTestId('close-planning'))
  expect(screen.queryByTestId('plan-card')).toBeNull()
})

it('plans another workout from a template beside an existing plan', async () => {
  const app = createTestApp()
  const bench = exercise('Bröst maskin')
  await app.repository.save('exercise', bench.id, bench)
  const tp = template('Bröst', [entry(bench.id)])
  await app.repository.save('template', tp.id, tp)
  const planned = workout('2026-09-23', { sessionNumber: 102 })
  await app.repository.save('workout', planned.id, planned)
  app.renderAt('/')

  fireEvent.click(await screen.findByTestId('open-planning'))
  expect(screen.getByTestId('next-name').textContent).toBe('Bröst')
  expect(screen.getByTestId('next-date').textContent.toLowerCase()).toBe('fredag 25 sep.')
  fireEvent.click(screen.getByTestId('plan'))

  await waitFor(() => expect(window.location.pathname).toContain('/workouts/'))
  const second = (await app.repository.getAll('workout')).find((w) => w.id !== planned.id)!
  expect([second.date, second.templateId, second.sessionNumber]).toEqual(['2026-09-25', tp.id, 103])
})

it('fills the chosen template and never makes it bolder', async () => {
  const app = createTestApp()
  const a = template('Ben och bröst')
  const b = template('Rygg')
  await app.repository.save('template', a.id, a)
  await app.repository.save('template', b.id, b)
  app.renderAt('/')

  const chips = () => [...document.querySelectorAll('[data-testid=template-choices] button')]
  await waitFor(() => expect(chips()).toHaveLength(3))
  // Same weight, border and padding either way, so choosing never resizes a chip.
  for (const chip of chips()) {
    expect(chip.classList).toContain('font-medium')
    expect(chip.classList).toContain('border')
    expect(chip.classList).toContain('px-4')
  }
  const checked = document.querySelectorAll('[data-testid=template-choices] button[aria-checked=true]')
  expect(checked).toHaveLength(1)
  expect(checked[0]!.classList).toContain('bg-accent-600')
})
