// @vitest-environment happy-dom
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { expect, it } from 'vitest'
import { picture } from '../illustrations/illustrations'
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

const rows = () => [...document.querySelectorAll<HTMLElement>('[data-testid=template-choices] [data-template]')]
const rowNames = () => rows().map((r) => r.querySelector('.font-semibold')!.textContent)

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

it('plans an empty workout from the last row', async () => {
  const app = createTestApp()
  const tp = template('Bröst')
  await app.repository.save('template', tp.id, tp)
  const old = workout('2026-09-14', { sessionNumber: 103 })
  await app.repository.save('workout', old.id, old)
  app.renderAt('/')

  await waitFor(() => expect(rowNames()).toEqual(['Bröst', 'Tomt pass']))
  expect(document.querySelectorAll('form')).toHaveLength(0)
  fireEvent.click(document.querySelector('[data-template=empty]')!)
  fireEvent.click(screen.getByTestId('confirm-plan'))

  await waitFor(async () => expect(await app.repository.getAll('workout')).toHaveLength(2))
  const added = (await app.repository.getAll('workout')).find((w) => w.id !== old.id)!
  expect([added.templateId, added.sessionNumber, added.status]).toEqual([undefined, 104, 'Planned'])
  expect(added.exercises).toEqual([])
  // The page stays, as iOS stays where a thing was added; the new workout lights up where it lands.
  expect(window.location.pathname).toBe('/')
  const link = await waitFor(() => screen.getByTestId('upcoming'))
  expect(link.getAttribute('href')).toBe(`/workouts/${added.id}`)
  expect(link.hasAttribute('data-lit')).toBe(true)
  expect(
    document.querySelector(`[data-testid=workout-list] a[href="/workouts/${old.id}"]`)!.hasAttribute('data-lit'),
  ).toBe(false)
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

it('lists the three latest workouts, and leads to the calendar for all of them', async () => {
  const app = createTestApp()
  for (const day of ['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-14']) {
    const w = workout(day)
    await app.repository.save('workout', w.id, w)
  }

  app.renderAt('/')

  const rows = within(screen.getByTestId('workout-list')).getAllByRole('link')
  expect(rows.map((r) => within(r).getByTestId('workout-meta').textContent.toLowerCase())).toEqual([
    expect.stringContaining('tisdag 22 sep'),
    expect.stringContaining('måndag 21 sep'),
    expect.stringContaining('söndag 20 sep'),
  ])
  expect(screen.getByTestId('show-all').textContent).toBe('Visa alla')
  expect(screen.getByTestId('show-all').getAttribute('href')).toBe('/calendar')
})

it('shows the week as days done and planned, and opens the calendar from it', async () => {
  const app = createTestApp()
  // Monday done, Tuesday planned and missed, today (Wednesday) planned, Friday planned, last week done.
  const done = (date: string) => workout(date, { exercises: [entry(newId(), { sets: [{ reps: 8 }] })] })
  for (const w of [
    done('2026-09-21'),
    workout('2026-09-22'),
    workout('2026-09-23'),
    workout('2026-09-25'),
    done('2026-09-18'),
  ])
    await app.repository.save('workout', w.id, w)

  app.renderAt('/')

  const strip = screen.getByTestId('week-strip')
  expect([...strip.querySelectorAll('li[data-mark]')].map((d) => d.getAttribute('data-mark'))).toEqual([
    'done',
    'none',
    'planned',
    'none',
    'planned',
    'none',
    'none',
  ])
  expect(screen.getByTestId('week-summary').textContent).toBe('1 gjort · 2 planerade')
  // What each trains in a word under its day; with no exercises to tell, just a workout.
  expect([...strip.querySelectorAll('[data-testid=day-name]')].map((d) => d.textContent)).toEqual([
    'Pass',
    'Pass',
    'Pass',
  ])
  const link = screen.getByTestId('week-link')
  expect(link.getAttribute('href')).toBe('/calendar?week=2026-09-21')
  expect(link.getAttribute('aria-label')).toBe('Den här veckan: 1 gjort · 2 planerade. Kalender')
})

it('shows the next workout large: its day, exercises with their plan, last time, and what a tap does', async () => {
  const app = createTestApp()
  const names = ['Bänkpress', 'Flyes', 'Dips', 'Armhävningar']
  const xs = names.map(exercise)
  for (const x of xs) await app.repository.save('exercise', x.id, x)
  const tp = template('Bröst')
  await app.repository.save('template', tp.id, tp)
  const entries = xs.map((x, i) => entry(x.id, { order: i, targetSets: 3, targetReps: 8 }))
  const last = workout('2026-09-16', {
    templateId: tp.id,
    exercises: [entry(xs[0]!.id, { sets: [{ reps: 8 }] })],
  })
  const next = workout('2026-09-23', { templateId: tp.id, sessionNumber: 7, exercises: entries })
  await app.repository.save('workout', last.id, last)
  await app.repository.save('workout', next.id, next)

  app.renderAt('/')

  const card = screen.getByTestId('upcoming')
  expect(card.getAttribute('href')).toBe(`/workouts/${next.id}`)
  // How far away heads the card; the day is in its grey line.
  expect(screen.getByTestId('upcoming-when').textContent).toBe('I dag')
  expect(screen.getByTestId('next').getAttribute('aria-label')).toBe('Aktuellt pass')
  expect(within(card).getByTestId('upcoming-meta').textContent).toBe('Onsdag 23 sep. · Nr 7 · 4 övningar')
  const rows = [...within(card).getByTestId('upcoming-exercises').children].map((r) => r.textContent)
  expect(rows).toEqual(['Bänkpress3 × 8', 'Flyes3 × 8', 'Dips3 × 8', '+ 1 övning till'])
  // Each with its picture, where it has one.
  const pictures = within(card)
    .getAllByTestId('upcoming-exercise')
    .map((r) => r.querySelector('img')?.getAttribute('src'))
  expect(pictures).toEqual([picture('bench-press'), undefined, undefined])
  expect(within(card).getByTestId('upcoming-last').textContent).toBe('Förra gången: ons 16 sep')
  expect(within(card).getByTestId('upcoming-action').textContent).toBe('Starta passet')
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

it('without templates offers only an empty workout, as the suggestion, and explains templates', async () => {
  createTestApp().renderAt('/')

  await screen.findByTestId('no-templates')
  expect(rowNames()).toEqual(['Tomt pass'])
  expect(screen.getByTestId('plan').getAttribute('data-template')).toBe('empty')
})

it('plans the suggested template, chosen already, with the big button', async () => {
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

  // The suggestion first and marked, the other templates after it, an empty workout last.
  await waitFor(() => expect(rowNames()).toEqual(['Rygg', 'Bröst', 'Tomt pass']))
  expect(screen.getByTestId('plan').textContent).toContain('Föreslås')
  expect(document.querySelectorAll('[data-suggested]')).toHaveLength(1)
  expect(screen.queryByTestId('next')).toBeNull()
  expect(screen.getByTestId('plan-card').querySelector('h2')!.textContent).toBe('Planera nästa pass')
  expect(screen.getByTestId('next-date').textContent.toLowerCase()).toBe('i morgon, 24 sep.')
  // Tomorrow says how far it is already.
  expect(screen.queryByTestId('plan-days')).toBeNull()
  // Chosen already: its checkmark, and the big button says what it does.
  expect(screen.getByTestId('plan').getAttribute('aria-pressed')).toBe('true')
  expect(screen.getByTestId('plan').querySelector('[data-testid=chosen]')).not.toBeNull()
  expect(screen.getByTestId('confirm-plan').textContent).toBe('Lägg till pass')

  fireEvent.click(screen.getByTestId('confirm-plan'))

  await waitFor(async () => expect(await app.repository.getAll('workout')).toHaveLength(2))
  expect(window.location.pathname).toBe('/')
  const plan = (await app.repository.getAll('workout')).find((w) => w.id !== done.id)!
  expect(plan.templateId).toBe(back.id)
  expect(plan.date).toBe('2026-09-24')
  expect(plan.sessionNumber).toBe(102)
  expect(plan.exercises.map((e) => e.exerciseId)).toEqual([pull.id])
})

it('chooses another template with a tap on its row, and plans it with the button', async () => {
  const app = createTestApp()
  const bench = exercise('Bröst maskin')
  await app.repository.save('exercise', bench.id, bench)
  const chest = template('Bröst', [entry(bench.id)])
  const other = template('Annat')
  await app.repository.save('template', chest.id, chest)
  await app.repository.save('template', other.id, other)
  app.renderAt('/')

  await waitFor(() => expect(rows().length).toBeGreaterThan(0))
  fireEvent.click(rows().find((r) => r.textContent.startsWith('Bröst'))!)

  // A tap on a row only chooses it: nothing is added, the checkmark moves, and its exercises show
  // whole rather than cut short.
  const chosenRow = rows().find((r) => r.textContent.startsWith('Bröst'))!
  expect(chosenRow.querySelector('[data-testid=template-exercises]')!.classList).not.toContain('truncate')
  expect(window.location.pathname).toBe('/')
  expect(await app.repository.getAll('workout')).toEqual([])
  expect(
    rows()
      .filter((r) => r.getAttribute('aria-pressed') === 'true')
      .map((r) => r.textContent),
  ).toEqual([expect.stringMatching(/^Bröst/)])
  fireEvent.click(screen.getByTestId('confirm-plan'))

  await waitFor(async () => expect(await app.repository.getAll('workout')).toHaveLength(1))
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

  // Planning another waits behind the plus button, in a sheet that Escape closes again.
  expect(screen.queryByTestId('plan-card')).toBeNull()
  expect(screen.getByTestId('open-planning').textContent.trim()).toBe('Lägg till ett träningspass')
  fireEvent.click(screen.getByTestId('open-planning'))
  const sheet = screen.getByTestId('planning-sheet')
  expect(sheet.getAttribute('aria-label')).toBe('Lägg till ett träningspass')
  expect(sheet.querySelector('[data-testid=plan-card]')).not.toBeNull()
  fireEvent.keyDown(document, { key: 'Escape' })
  await waitFor(() => expect(screen.queryByTestId('planning-sheet')).toBeNull())
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
  expect(rowNames()[0]).toBe('Bröst')
  expect(screen.getByTestId('next-date').textContent.toLowerCase()).toBe('fredag 25 sep.')
  expect(screen.getByTestId('plan-days').textContent).toBe('Om 2 dagar')
  fireEvent.click(screen.getByTestId('confirm-plan'))

  // The sheet sinks away and the page stays, the new workout lit in the list.
  await waitFor(() => expect(screen.queryByTestId('planning-sheet')).toBeNull())
  expect(window.location.pathname).toBe('/')
  const second = (await app.repository.getAll('workout')).find((w) => w.id !== planned.id)!
  expect([second.date, second.templateId, second.sessionNumber]).toEqual(['2026-09-25', tp.id, 103])
  const row = document.querySelector(`[data-testid=planned-row] a[href="/workouts/${second.id}"]`)!
  expect(row.hasAttribute('data-lit')).toBe(true)
})

it('closes the planning sheet when pulled down from a row, without planning it', async () => {
  const app = createTestApp()
  const tp = template('Bröst')
  await app.repository.save('template', tp.id, tp)
  const planned = workout('2026-09-24')
  await app.repository.save('workout', planned.id, planned)
  app.renderAt('/')
  fireEvent.click(await screen.findByTestId('open-planning'))
  const row = rows()[0]!

  // A pull with the mouse that starts on a template's row, as on iOS from anywhere on a sheet.
  fireEvent.pointerDown(row, { pointerType: 'mouse', button: 0, clientX: 100, clientY: 300 })
  fireEvent.pointerMove(window, { pointerType: 'mouse', clientX: 100, clientY: 320 })
  fireEvent.pointerMove(window, { pointerType: 'mouse', clientX: 100, clientY: 600 })
  fireEvent.pointerUp(window, { pointerType: 'mouse', clientX: 100, clientY: 600 })
  fireEvent.click(row)

  await waitFor(() => expect(screen.queryByTestId('planning-sheet')).toBeNull())
  expect(await app.repository.getAll('workout')).toHaveLength(1)
  expect(window.location.pathname).toBe('/')
})

it('says how many days away a day chosen for planning is, also one in the past', async () => {
  createTestApp().renderAt('/')
  const date = await screen.findByTestId('plan-date')

  fireEvent.change(date, { target: { value: '2026-09-30' } })
  expect(screen.getByTestId('plan-days').textContent).toBe('Om 7 dagar')
  fireEvent.change(screen.getByTestId('plan-date'), { target: { value: '2026-09-22' } })
  expect(screen.getByTestId('plan-days').textContent).toBe('I går')
  fireEvent.change(screen.getByTestId('plan-date'), { target: { value: '2026-09-20' } })
  expect(screen.getByTestId('plan-days').textContent).toBe('För 3 dagar sedan')
})

it('lights the row of the workout just left, as iOS does on the way back', async () => {
  const app = createTestApp()
  const w = workout('2026-09-21')
  await app.repository.save('workout', w.id, w)
  app.renderAt('/')
  const row = () => document.querySelector(`[data-testid=workout-list] a[href="/workouts/${w.id}"]`)!
  expect(row().hasAttribute('data-lit')).toBe(false)

  fireEvent.click(row())
  fireEvent.click(await screen.findByTestId('back'))

  await waitFor(() => expect(window.location.pathname).toBe('/'))
  expect(row().hasAttribute('data-lit')).toBe(true)
})

it.each([
  ['2026-09-24', 'I morgon'],
  ['2026-09-26', 'Om 3 dagar'],
])('says how far away the next workout is (%s)', async (date, when) => {
  const app = createTestApp()
  const w = workout(date)
  await app.repository.save('workout', w.id, w)
  app.renderAt('/')

  expect(screen.getByTestId('upcoming-when').textContent).toBe(when)
})

it('names each day by what its workout trains', async () => {
  const app = createTestApp()
  const chest = { ...exercise('Bänkpress'), categories: ['Chest' as const] }
  const legs = { ...exercise('Knäböj'), categories: ['Legs' as const] }
  for (const x of [chest, legs]) await app.repository.save('exercise', x.id, x)
  const mon = workout('2026-09-21', { exercises: [entry(chest.id, { sets: [{ reps: 8 }] })] })
  const fri = workout('2026-09-25', { exercises: [entry(legs.id), entry(chest.id, { order: 1 })] })
  for (const w of [mon, fri]) await app.repository.save('workout', w.id, w)

  app.renderAt('/')

  const names = [...screen.getByTestId('week-strip').querySelectorAll('li[data-mark]')].map(
    (d) => d.querySelector('span:last-child')!.textContent,
  )
  expect(names).toEqual(['Bröst', '', '', '', 'Ben', '', ''])
})

it('turns to earlier weeks on a swipe, numbered as Swedish weeks, and back to this week', async () => {
  const app = createTestApp()
  const done = (date: string) => workout(date, { exercises: [entry(newId(), { sets: [{ reps: 8 }] })] })
  for (const w of [done('2026-09-16'), done('2026-09-18'), done('2026-09-21')])
    await app.repository.save('workout', w.id, w)
  app.renderAt('/')
  const heading = () => screen.getByTestId('week-heading').textContent
  expect(heading()).toBe('Den här veckanVecka 39')
  // Nothing after this week: no swipe forward.
  const swipe = (from: number, to: number) => {
    const link = screen.getByTestId('week-link').parentElement!
    fireEvent.pointerDown(link, { pointerId: 1, clientX: from, clientY: 100 })
    fireEvent.pointerMove(link, { pointerId: 1, clientX: (from + to) / 2, clientY: 100 })
    fireEvent.pointerMove(link, { pointerId: 1, clientX: to, clientY: 100 })
    fireEvent.pointerUp(link, { pointerId: 1, clientX: to, clientY: 100 })
  }

  swipe(60, 300)

  await waitFor(() => expect(heading()).toBe('Vecka 3814–20 sep.'))
  expect(screen.getByTestId('week-summary').textContent).toBe('2 gjorda')
  expect(screen.getByTestId('week-link').getAttribute('href')).toBe('/calendar?week=2026-09-14')
  // The first week with workouts is as far back as it goes.
  await new Promise((r) => setTimeout(r, 400))
  swipe(60, 300)
  await new Promise((r) => setTimeout(r, 400))
  expect(heading()).toBe('Vecka 3814–20 sep.')

  fireEvent.click(screen.getByTestId('this-week'))
  expect(heading()).toBe('Den här veckanVecka 39')
  expect(screen.queryByTestId('this-week')).toBeNull()
})

it('opens the planning sheet and keeps it open after a workout was planned on the page', async () => {
  const app = createTestApp()
  app.renderAt('/')

  // Nothing planned: the list on the page itself.
  fireEvent.click(await screen.findByTestId('confirm-plan'))
  await waitFor(() => expect(screen.getByTestId('upcoming')).not.toBeNull())

  fireEvent.click(screen.getByTestId('open-planning'))
  // It stays, rather than sinking away as if just done.
  await new Promise((r) => setTimeout(r, 400))
  expect(screen.getByTestId('planning-sheet').getAttribute('aria-label')).toBe('Lägg till ett träningspass')
})
