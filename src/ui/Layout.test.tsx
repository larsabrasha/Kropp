// @vitest-environment happy-dom
import { screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { createTestApp } from '../test/render'

it('shows the header with its links and the sync status on every page', async () => {
  createTestApp().renderAt('/settings')

  expect(screen.getByTestId('home-link').getAttribute('href')).toBe('/')
  expect(screen.getByTestId('calendar-link').getAttribute('aria-label')).toBe('Kalender')
  expect(screen.getByTestId('sync-status').textContent).toBe('Inte synkad än')
})

it('sends an unknown path home', async () => {
  createTestApp().renderAt('/nope')

  expect(window.location.pathname).toBe('/')
})
