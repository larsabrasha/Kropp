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

it('pushes the templates from planning onto the training tab, and pops back to it', async () => {
  const template = { id: newId(), name: 'Ben', exercises: [] }
  await app.repository.save('template', template.id, template)
  app.renderAt('/')

  fireEvent.click($('[data-testid=edit-templates]'))
  expect(screen.getByTestId('tab-training').getAttribute('aria-current')).toBe('page')
  fireEvent.click($(`main a[href="/templates/${template.id}?from=training"]`))
  fireEvent.click(screen.getByTitle('Mallar'))
  fireEvent.click(screen.getByTitle('Träning'))

  expect(window.location.pathname).toBe('/')
  expect(started).toEqual(['push', 'push', 'pop', 'pop'])
})

it('pushes the week from the home page onto the training tab, and keeps it there as it moves', async () => {
  const w = await seed(workout({ date: TODAY, exercises: [entry({ exerciseId: BENCH.id })] }))
  app.renderAt('/')

  fireEvent.click($('[data-testid=week-link]'))
  expect(window.location.search).toContain('from=training')
  expect(screen.getByTestId('tab-training').getAttribute('aria-current')).toBe('page')

  // Another month is still the training tab's calendar, and so is a workout opened from it.
  fireEvent.click($('[data-testid=next-month]'))
  expect(window.location.search).toContain('from=training')
  fireEvent.click($('[data-testid=previous-month]'))
  fireEvent.click($(`main a[href^="/workouts/${w.id}"]`))
  expect(screen.getByTestId('tab-training').getAttribute('aria-current')).toBe('page')
  fireEvent.click($('[data-testid=back]'))
  fireEvent.click(screen.getByTitle('Träning'))

  expect(window.location.pathname).toBe('/')
  expect(started).toEqual(['push', 'push', 'pop', 'pop'])
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

/** A sheet as tall as a phone's, as happy-dom lays nothing out. */
function phoneHeight() {
  const height = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 780 })
  return () => {
    if (height) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', height)
  }
}

const pull = (on: Element, ys: number[]) => {
  fireEvent.pointerDown(on, { pointerType: 'mouse', button: 0, clientX: 100, clientY: ys[0] })
  for (const y of ys.slice(1)) fireEvent.pointerMove(window, { pointerType: 'mouse', clientX: 100, clientY: y })
}

it('closes a sheet thrown down without a second animation, the page below brightening with it', async () => {
  const restore = phoneHeight()
  try {
    app.renderAt('/')
    fireEvent.click($('[data-testid=settings-link]'))
    const sheet = screen.getByRole('dialog')

    pull(sheet.querySelector('header')!, [100, 110, 300])
    // Halfway pulled, the page below is halfway to its full brightness.
    expect(Number(document.documentElement.style.getPropertyValue('--sheet-pull'))).toBeCloseTo(200 / 780)
    fireEvent.pointerUp(window, { pointerType: 'mouse', clientX: 100, clientY: 300 })

    await vi.waitFor(() => expect(window.location.pathname).toBe('/'))
    // Opened as a sheet; closed by the pull itself, never by the view transition's close.
    expect(started).toEqual(['sheet-open'])
    expect(screen.queryByRole('dialog')).toBeNull()
  } finally {
    restore()
  }
})

it('springs a sheet back when let go slowly, short of halfway', async () => {
  const restore = phoneHeight()
  try {
    app.renderAt('/settings')
    const sheet = screen.getByRole('dialog')
    const header = sheet.querySelector('header')!

    pull(header, [100, 110, 150])
    // Slowly at the end: the speed at letting go is what counts, not the quick start.
    expect(sheet.style.transform).toBe('translateY(50px)')
    await new Promise((r) => setTimeout(r, 120))
    fireEvent.pointerMove(window, { pointerType: 'mouse', clientX: 100, clientY: 152 })
    await new Promise((r) => setTimeout(r, 120))
    fireEvent.pointerMove(window, { pointerType: 'mouse', clientX: 100, clientY: 154 })
    fireEvent.pointerUp(window, { pointerType: 'mouse', clientX: 100, clientY: 154 })
    await new Promise((r) => setTimeout(r, 400))

    expect(window.location.pathname).toBe('/settings')
    expect(sheet.style.transform).toBe('')
    expect(document.documentElement.style.getPropertyValue('--sheet-pull')).toBe('0')
  } finally {
    restore()
  }
})
