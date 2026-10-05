// @vitest-environment happy-dom
import { act, fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { $, app, BENCH, entry, seed, workout } from './test/workoutPage'
import { TODAY } from './test/render'

// Opening and closing a workout animate as a push and a pop (route.ts, index.css). happy-dom has
// no view transitions, so a stand-in records which one each change of page asked for.

let started: (string | undefined)[]

beforeEach(() => {
  started = []
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query }))
  document.startViewTransition = ((update: () => void) => {
    started.push(document.documentElement.dataset.transition)
    update()
    return { ready: Promise.resolve(), finished: Promise.resolve(), updateCallbackDone: Promise.resolve() }
  }) as typeof document.startViewTransition
  return () => {
    delete (document as Partial<Document>).startViewTransition
    delete document.documentElement.dataset.transition
  }
})

const openFromHome = async () => {
  const w = await seed(workout({ date: TODAY, exercises: [entry({ exerciseId: BENCH.id })] }))
  app.renderAt('/')
  fireEvent.click($(`main a[href="/workouts/${w.id}"]:not([data-testid=upcoming])`))
  return w
}

it('pushes a workout opened from the list and pops it on the way back', async () => {
  await openFromHome()
  expect($('[data-testid=details]')).toBeTruthy()

  fireEvent.click($('[data-testid=back]'))

  expect(window.location.pathname).toBe('/')
  expect(started).toEqual(['push', 'pop'])
})

it('pops when the browser goes back from a workout', async () => {
  await openFromHome()

  act(() => {
    window.history.back()
  })
  await vi.waitFor(() => expect(window.location.pathname).toBe('/'))

  expect(started).toEqual(['push', 'pop'])
  expect(screen.queryByTestId('details')).toBeNull()
})

it('raises settings as a sheet, pushes and pops inside it, and lowers it again', async () => {
  app.renderAt('/')

  fireEvent.click($('[data-testid=settings-link]'))
  fireEvent.click($('[data-testid=templates-link]'))
  fireEvent.click(within(screen.getByRole('dialog')).getByTitle('Inställningar'))
  fireEvent.click(within(screen.getByRole('dialog')).getByTitle('Stäng'))

  expect(window.location.pathname).toBe('/')
  expect(started).toEqual(['sheet-open', 'sheet-push', 'sheet-pop', 'sheet-close'])
})

it('pushes a workout opened from the calendar inside the calendar sheet', async () => {
  const w = await seed(workout({ date: TODAY, exercises: [entry({ exerciseId: BENCH.id })] }))
  app.renderAt('/')

  fireEvent.click($('[data-testid=calendar-link]'))
  fireEvent.click($(`[role=dialog] a[href^="/workouts/${w.id}"]`))

  expect(screen.getByRole('dialog').querySelector('[data-testid=details]')).not.toBeNull()
  expect(started).toEqual(['sheet-open', 'sheet-push'])
})

it('moves without a transition between pages of the same depth', async () => {
  app.renderAt('/calendar')

  fireEvent.click($('[data-testid=next-month]'))

  expect(window.location.search).toContain('month=')
  expect(started).toEqual([])
})

it('opens a workout without moving for anyone who asked for less motion', async () => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduced-motion'), media: query }))

  const w = await openFromHome()

  expect(window.location.pathname).toBe(`/workouts/${w.id}`)
  expect($('[data-testid=details]')).toBeTruthy()
  expect(started).toEqual([])
})

it('opens a workout once when its row is tapped twice before the transition starts', async () => {
  // A real transition renders the new page a frame later, so the row is still there for a second
  // tap; this stand-in waits too.
  document.startViewTransition = ((update: () => void) => {
    started.push(document.documentElement.dataset.transition)
    queueMicrotask(update)
    return { ready: Promise.resolve(), finished: Promise.resolve(), updateCallbackDone: Promise.resolve() }
  }) as typeof document.startViewTransition
  const w = await seed(workout({ date: TODAY, exercises: [entry({ exerciseId: BENCH.id })] }))
  app.renderAt('/')
  const row = $(`main a[href="/workouts/${w.id}"]:not([data-testid=upcoming])`)
  const before = window.history.length

  fireEvent.click(row)
  fireEvent.click(row)
  await vi.waitFor(() => expect($('[data-testid=details]')).toBeTruthy())

  expect(window.history.length).toBe(before + 1)
  expect(started).toEqual(['push'])
})
