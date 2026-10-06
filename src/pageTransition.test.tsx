// @vitest-environment happy-dom
import { act, fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { newId } from './training/model'
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
  fireEvent.click($(`main a[href="/workouts/${w.id}"]`))
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

it('raises the profile as a sheet and lowers it again', async () => {
  app.renderAt('/')

  fireEvent.click($('[data-testid=settings-link]'))
  fireEvent.click(within(screen.getByRole('dialog')).getByTitle('Stäng'))

  expect(window.location.pathname).toBe('/')
  expect(started).toEqual(['sheet-open', 'sheet-close'])
})

it('shows the templates in the library from planning, and pushes and pops a template there', async () => {
  const template = { id: newId(), name: 'Ben', exercises: [] }
  await app.repository.save('template', template.id, template)
  app.renderAt('/')

  // Another tab: no move. Inside it, a template pushes and pops.
  fireEvent.click($('[data-testid=edit-templates]'))
  fireEvent.click($(`main a[href="/templates/${template.id}"]`))
  fireEvent.click(screen.getByTitle('Mallar'))
  fireEvent.click(screen.getByTitle('Bibliotek'))

  expect(window.location.pathname).toBe('/library')
  expect(started).toEqual(['push', 'pop', 'pop'])
})

it('pushes a workout opened from the calendar inside the calendar tab', async () => {
  const w = await seed(workout({ date: TODAY, exercises: [entry({ exerciseId: BENCH.id })] }))
  app.renderAt('/')

  fireEvent.click($('[data-testid=tab-calendar]'))
  fireEvent.click($(`main a[href^="/workouts/${w.id}"]`))

  expect(screen.queryByRole('dialog')).toBeNull()
  expect($('[data-testid=details]')).toBeTruthy()
  // A change of tab does not move; a page pushed inside one does.
  expect(started).toEqual(['push'])
})

it('shows another tab as it was left, without a transition, scrolled as it was', async () => {
  const scrolled: number[] = []
  vi.spyOn(window, 'scrollTo').mockImplementation(((options: ScrollToOptions) => {
    scrolled.push(options.top ?? 0)
  }) as typeof window.scrollTo)
  vi.spyOn(window, 'scrollY', 'get').mockReturnValue(420)
  app.renderAt('/')

  fireEvent.click($('[data-testid=tab-stats]'))
  vi.spyOn(window, 'scrollY', 'get').mockReturnValue(0)
  fireEvent.click($('[data-testid=tab-training]'))

  expect(window.location.pathname).toBe('/')
  expect(started).toEqual([])
  expect(scrolled.at(-1)).toBe(420)
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
  const row = $(`main a[href="/workouts/${w.id}"]`)
  const before = window.history.length

  fireEvent.click(row)
  fireEvent.click(row)
  await vi.waitFor(() => expect($('[data-testid=details]')).toBeTruthy())

  expect(window.history.length).toBe(before + 1)
  expect(started).toEqual(['push'])
})

it('keeps where the list was scrolled when coming back to it', async () => {
  const scrolled: number[] = []
  vi.spyOn(window, 'scrollTo').mockImplementation(((options: ScrollToOptions) => {
    scrolled.push(options.top ?? 0)
  }) as typeof window.scrollTo)
  vi.spyOn(window, 'scrollY', 'get').mockReturnValue(640)
  await openFromHome()
  vi.spyOn(window, 'scrollY', 'get').mockReturnValue(0)

  fireEvent.click($('[data-testid=back]'))

  expect(window.location.pathname).toBe('/')
  // Opened at the top, back where it was left.
  expect(scrolled.at(-1)).toBe(640)
  expect(scrolled).toContain(0)
})
