// @vitest-environment happy-dom
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { expect, it } from 'vitest'
import { AggregateTypes } from '../sync/protocol'
import { SETTINGS_ID } from '../training/model'
import { createTestApp } from '../test/render'

it('starts sessions a week at three and saves them when changed', async () => {
  const app = createTestApp()
  app.renderAt('/settings')

  const input = (await screen.findByTestId('stepper')).querySelector('input')!
  expect(input.value).toBe('3')
  expect(screen.getByTestId('settings-effect').textContent).toContain('2 dagar')

  fireEvent.click(screen.getByTestId('decrease'))

  await waitFor(() => expect(screen.getByTestId('settings-effect').textContent).toContain('3 dagar'))
  await waitFor(async () => expect((await app.repository.get('settings', SETTINGS_ID))?.sessionsPerWeek).toBe(2))
  const pending = await app.store.getPending()
  expect(pending.map((r) => r.type)).toEqual([AggregateTypes.settings])
})

it('is named the profile, and holds planning and sync alone', async () => {
  createTestApp().renderAt('/settings')

  expect(within(screen.getByRole('dialog')).getByRole('heading', { level: 1 }).textContent).toBe('Profil')
  // Templates, exercises and the recently deleted live where they are used.
  expect(screen.queryByTestId('templates-link')).toBeNull()
  expect(screen.queryByTestId('exercises-link')).toBeNull()
  expect(screen.queryByTestId('trash-link')).toBeNull()
})

it('has seven a week as the most', async () => {
  const app = createTestApp()
  await app.repository.save('settings', SETTINGS_ID, { id: SETTINGS_ID, sessionsPerWeek: 7 })
  app.renderAt('/settings')

  expect((await screen.findByTestId('increase')).hasAttribute('disabled')).toBe(true)
  expect(screen.getByTestId('settings-effect').textContent).toContain('dagen efter')
})
