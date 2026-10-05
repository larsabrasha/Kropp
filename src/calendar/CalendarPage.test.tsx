// @vitest-environment happy-dom
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { expect, it } from 'vitest'
import { newId, type Workout } from '../training/model'
import { createTestApp, type TestApp } from '../test/render'

async function save(app: TestApp, date: string, note: string): Promise<Workout> {
  const workout: Workout = { id: newId(), date, note, status: 'Planned', exercises: [] }
  await app.repository.save('workout', workout.id, workout)
  return workout
}

const dates = () => screen.queryAllByTestId('day').map((d) => d.getAttribute('data-date'))
const here = () => window.location.pathname + window.location.search

it('opens on this month with the days that have workouts as buttons', async () => {
  const app = createTestApp()
  await save(app, '2026-09-21', 'Ben')
  await save(app, '2026-09-21', 'Löpning')
  await save(app, '2026-08-31', 'Förra månaden')

  app.renderAt('/calendar')

  expect(screen.getByTestId('month').textContent).toBe('september 2026')
  expect(screen.queryByTestId('this-month')).toBeNull()
  // 31 August is in the first week of the grid but belongs to another month.
  await waitFor(() => expect(dates()).toEqual(['2026-09-21']))
  expect(screen.getByTestId('day').getAttribute('aria-label')).toBe('måndag 21 september: 2 pass')
  expect(screen.getByTestId('shown-heading').textContent.trim()).toBe('Alla pass i september (2 st)')
  expect(
    [...screen.getByTestId('calendar-workouts').querySelectorAll('[data-testid=workout-name]')].map(
      (e) => e.textContent,
    ),
  ).toEqual(['Ben', 'Löpning'])
})

it('shows the chosen day’s workouts, and the way back leads to that day', async () => {
  const app = createTestApp()
  const ben = await save(app, '2026-09-21', 'Ben')
  await save(app, '2026-09-14', 'Rygg')
  app.renderAt('/calendar')

  await waitFor(() => expect(document.querySelector("[data-date='2026-09-21']")).not.toBeNull())
  fireEvent.click(document.querySelector("[data-date='2026-09-21']")!)

  expect(document.querySelector("[data-date='2026-09-21']")!.getAttribute('aria-pressed')).toBe('true')
  expect(screen.getByTestId('shown-heading').textContent.trim()).toBe('måndag 21 september')
  expect([...screen.getByTestId('calendar-workouts').querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(
    [`/workouts/${ben.id}?back=calendar%3Fday%3D2026-09-21`],
  )
  expect(here()).toBe('/calendar?day=2026-09-21')

  fireEvent.click(screen.getByTestId('whole-month'))

  expect(screen.getByTestId('calendar-workouts').querySelectorAll('[data-testid=workout-name]')).toHaveLength(2)
  expect(here()).toBe('/calendar')
})

it('steps by month and by year', async () => {
  const app = createTestApp()
  await save(app, '2025-08-04', 'Ett år sedan')
  app.renderAt('/calendar')

  fireEvent.click(screen.getByTestId('previous-year'))
  expect(screen.getByTestId('month').textContent).toBe('september 2025')
  expect((await screen.findByTestId('calendar-empty')).textContent).toContain('Inga pass i september.')

  fireEvent.click(screen.getByTestId('previous-month'))
  expect(screen.getByTestId('month').textContent).toBe('augusti 2025')
  expect(dates()).toEqual(['2025-08-04'])
  expect(here()).toBe('/calendar?month=2025-08')

  fireEvent.click(screen.getByTestId('this-month'))
  expect(screen.getByTestId('month').textContent).toBe('september 2026')
})

it('opens on the day in the address', async () => {
  createTestApp().renderAt('/calendar?day=2024-02-29')

  expect(screen.getByTestId('month').textContent).toBe('februari 2024')
  await screen.findByTestId('calendar-empty')
})

it('stops at the first month the app accepts', () => {
  createTestApp().renderAt('/calendar?month=2000-01')

  expect(screen.getByTestId('previous-month').hasAttribute('disabled')).toBe(true)
  expect(screen.getByTestId('previous-year').hasAttribute('disabled')).toBe(true)
  expect(screen.getByTestId('next-month').hasAttribute('disabled')).toBe(false)
})

it.each([
  ['calendar?day=2026-09-21', '/calendar?day=2026-09-21', 'Kalender'],
  ['https://example.com', '/', 'Alla pass'],
])('lets a workout lead back only to the calendar (%s)', async (back, href, text) => {
  const app = createTestApp()
  const workout = await save(app, '2026-09-21', 'Ben')

  app.renderAt(`/workouts/${workout.id}?back=${encodeURIComponent(back)}`)

  const link = await screen.findByTestId('back')
  expect(link.getAttribute('href')).toBe(href)
  expect(link.textContent.trim()).toBe(text)
})

const swipe = (from: number, to: number, vertical = 0) => {
  const grid = screen.getByTestId('calendar')
  fireEvent.pointerDown(grid, { pointerId: 1, clientX: from, clientY: 100 })
  fireEvent.pointerMove(grid, { pointerId: 1, clientX: (from + to) / 2, clientY: 100 + vertical / 2 })
  fireEvent.pointerMove(grid, { pointerId: 1, clientX: to, clientY: 100 + vertical })
  fireEvent.pointerUp(grid, { pointerId: 1, clientX: to, clientY: 100 + vertical })
}

it('turns to the next month on a swipe left and back on a swipe right', async () => {
  createTestApp().renderAt('/calendar')

  swipe(300, 60)
  await waitFor(() => expect(screen.getByTestId('month').textContent).toBe('oktober 2026'))
  // A swipe while the month still slides is ignored.
  await new Promise((r) => setTimeout(r, 400))

  swipe(60, 300)
  await waitFor(() => expect(screen.getByTestId('month').textContent).toBe('september 2026'))
})

it('leaves the month alone on a vertical move, and a swipe chooses no day', async () => {
  const app = createTestApp()
  await save(app, '2026-09-21', 'Ben')
  app.renderAt('/calendar')
  await waitFor(() => expect(dates()).toEqual(['2026-09-21']))

  swipe(200, 190, 200)
  await new Promise((r) => setTimeout(r, 400))
  expect(screen.getByTestId('month').textContent).toBe('september 2026')

  const day = screen.getByTestId('day')
  fireEvent.pointerDown(day, { pointerId: 2, clientX: 300, clientY: 100 })
  fireEvent.pointerMove(day, { pointerId: 2, clientX: 100, clientY: 100 })
  fireEvent.pointerUp(day, { pointerId: 2, clientX: 100, clientY: 100 })
  fireEvent.click(day)

  expect(window.location.search).not.toContain('day=')
  await waitFor(() => expect(screen.getByTestId('month').textContent).toBe('oktober 2026'))
})

it('does not turn past the first month the app accepts', async () => {
  createTestApp().renderAt('/calendar?month=2000-01')
  const before = screen.getByTestId('month').textContent

  swipe(60, 300)
  await new Promise((r) => setTimeout(r, 400))

  expect(screen.getByTestId('month').textContent).toBe(before)
})
