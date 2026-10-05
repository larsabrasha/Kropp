// @vitest-environment happy-dom
import { fireEvent, screen, within } from '@testing-library/react'
import { expect, it } from 'vitest'
import { createTestApp } from '../test/render'

it('shows the app name on the home page only, and the bar buttons on every page', async () => {
  const app = createTestApp()
  app.renderAt('/')

  expect(screen.getByTestId('brand').textContent).toBe('Kropp')
  expect(screen.getByTestId('calendar-link').getAttribute('aria-label')).toBe('Kalender')
  expect(screen.getByTestId('settings-link').getAttribute('aria-label')).toBe('Inställningar')
  // Sync keeps out of the way, in the settings.
  expect(screen.queryByTestId('sync-status')).toBeNull()
})

it('opens settings as a sheet over the page below, which takes no input meanwhile', () => {
  createTestApp().renderAt('/settings')

  const sheet = screen.getByRole('dialog')
  expect(within(sheet).getByTestId('sync-status').textContent).toBe('Inte synkad än')
  expect(within(sheet).getByTestId('sync-now').textContent).toBe('Synka nu')
  expect(within(sheet).getByRole('heading', { level: 1 }).textContent).toBe('Inställningar')
  // Below it the list, as it was, inert.
  expect(screen.getByTestId('brand').closest('[inert]')).not.toBeNull()
  // Its way out is a cross that leads back to the page below.
  const close = within(sheet).getByTitle('Stäng')
  expect(close.getAttribute('href')).toBe('/')

  fireEvent.click(close)

  expect(window.location.pathname).toBe('/')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByTestId('brand').closest('[inert]')).toBeNull()
})

it('sends an unknown path home', async () => {
  createTestApp().renderAt('/nope')

  expect(window.location.pathname).toBe('/')
})
