// @vitest-environment happy-dom
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { expect, it } from 'vitest'
import { newId } from '../training/model'
import { createTestApp } from '../test/render'

it('names the home page for what it holds, with the tabs below and settings in the bar', async () => {
  const app = createTestApp()
  app.renderAt('/')

  expect(screen.getByTestId('title').textContent).toBe('Träning')
  const tabs = within(screen.getByTestId('tab-bar')).getAllByRole('link')
  expect(tabs.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
    ['Träning', '/'],
    ['Kalender', '/calendar'],
    ['Statistik', '/stats'],
  ])
  expect(screen.getByTestId('tab-training').getAttribute('aria-current')).toBe('page')
  // Settings behind a picture of the user, as Health has the account; named for what it opens.
  const settings = screen.getByTestId('settings-link')
  expect(settings.getAttribute('aria-label')).toBe('Profil')
  expect(within(settings).getByTestId('profile-picture')).toBeTruthy()
  // Sync keeps out of the way, in the settings.
  expect(screen.queryByTestId('sync-status')).toBeNull()
})

it('shows the calendar and the statistics as tabs, not sheets, each with settings in its bar', () => {
  const app = createTestApp()
  app.renderAt('/')

  fireEvent.click(screen.getByTestId('tab-calendar'))
  expect(window.location.pathname).toBe('/calendar')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByTestId('tab-calendar').getAttribute('aria-current')).toBe('page')
  expect(screen.getByTestId('settings-link')).toBeTruthy()

  fireEvent.click(screen.getByTestId('tab-stats'))
  expect(window.location.pathname).toBe('/stats')
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('keeps where each tab was, and takes a tab back to its first page when tapped again', async () => {
  const app = createTestApp()
  const id = newId()
  await app.repository.save('workout', id, { id, date: '2026-09-21', status: 'Planned', exercises: [] })
  app.renderAt(`/workouts/${id}`)
  // Settings belong to a tab's first page only.
  expect(screen.queryByTestId('settings-link')).toBeNull()

  fireEvent.click(screen.getByTestId('tab-calendar'))
  expect(window.location.pathname).toBe('/calendar')
  // Back on Träning, the workout is still open.
  expect(screen.getByTestId('tab-training').getAttribute('href')).toBe(`/workouts/${id}`)
  fireEvent.click(screen.getByTestId('tab-training'))
  expect(window.location.pathname).toBe(`/workouts/${id}`)

  fireEvent.click(screen.getByTestId('tab-training'))
  expect(window.location.pathname).toBe('/')
})

it('opens settings as a sheet over the page below, which takes no input meanwhile', () => {
  createTestApp().renderAt('/settings')

  const sheet = screen.getByRole('dialog')
  expect(within(sheet).getByTestId('sync-status').textContent).toBe('Inte synkad än')
  expect(within(sheet).getByTestId('sync-now').textContent).toBe('Synka nu')
  expect(within(sheet).getByRole('heading', { level: 1 }).textContent).toBe('Profil')
  // Below it the list, as it was, inert.
  expect(screen.getByTestId('title').closest('[inert]')).not.toBeNull()
  // Its way out is a cross that leads back to the page below.
  const close = within(sheet).getByTitle('Stäng')
  expect(close.getAttribute('href')).toBe('/')

  fireEvent.click(close)

  expect(window.location.pathname).toBe('/')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByTestId('title').closest('[inert]')).toBeNull()
})

it('sends an unknown path home', async () => {
  createTestApp().renderAt('/nope')

  expect(window.location.pathname).toBe('/')
})

it('leaves the home page title out of the bar when scrolled, but not a page further in', async () => {
  // happy-dom lays nothing out, so every h1 counts as scrolled under the bar.
  const barTitle = (bar: string) => document.querySelector(`.${bar} span.truncate`)!.textContent
  createTestApp().renderAt('/templates')

  expect(screen.getByTestId('title').textContent).toBe('Träning')
  await waitFor(() => expect(barTitle('sheet-navbar')).toBe('Mallar'))
  expect(barTitle('app-navbar')).toBe('')
})
