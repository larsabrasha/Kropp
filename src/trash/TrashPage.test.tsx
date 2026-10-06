// @vitest-environment happy-dom
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { newId, type Workout } from '../training/model'
import { moveToTrash } from '../training/trash'
import { createTestApp, type TestApp } from '../test/render'

const DAY_MS = 86_400_000

let app: TestApp

beforeEach(() => {
  app = createTestApp()
})

async function trash(note: string): Promise<Workout> {
  const workout: Workout = { id: newId(), date: '2026-09-21', status: 'Planned', note, exercises: [] }
  await app.repository.save('workout', workout.id, workout)
  await moveToTrash(app.repository, workout)
  return workout
}

const advanceDays = (days: number) => vi.setSystemTime(Date.now() + days * DAY_MS)

it('says so when nothing was deleted lately', async () => {
  app.renderAt('/trash')

  expect((await screen.findByTestId('trash-empty')).textContent).toContain('Inga nyligen raderade pass')
})

it('is reached from the end of the calendar, and leads back to it', async () => {
  app.renderAt('/calendar')

  fireEvent.click(screen.getByTestId('trash-link'))

  expect(window.location.pathname).toBe('/trash')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Nyligen raderade')
  expect(screen.getByTestId('tab-calendar').getAttribute('aria-current')).toBe('page')
  expect(screen.getByTitle('Kalender').getAttribute('href')).toBe('/calendar')
})

it('shows when a trashed workout goes, and can restore it', async () => {
  const workout = await trash('Ben')
  advanceDays(10)
  app.renderAt('/trash')

  expect((await screen.findByTestId('trashed-name')).textContent).toBe('Ben')
  expect(screen.getByTestId('deleted-for-good').textContent).toBe('Raderas för gott om 20 dagar')

  fireEvent.click(screen.getByTestId('restore'))

  await screen.findByTestId('trash-empty')
  expect((await app.repository.get('workout', workout.id))?.note).toBe('Ben')
})

it('asks before deleting now', async () => {
  const workout = await trash('Ben')
  app.renderAt('/trash')

  fireEvent.click(await screen.findByTestId('delete-now'))
  expect(await app.repository.get('trashedWorkout', workout.id)).toBeDefined()
  fireEvent.click(screen.getByTestId('confirm-delete'))

  await screen.findByTestId('trash-empty')
  expect(await app.repository.get('trashedWorkout', workout.id)).toBeUndefined()
  expect(await app.repository.get('workout', workout.id)).toBeUndefined()
})

it('deletes what has been there 30 days when opened', async () => {
  await trash('Gammalt')
  advanceDays(20)
  await trash('Nytt')
  advanceDays(10)

  app.renderAt('/trash')

  await waitFor(() => expect(screen.getAllByTestId('trashed-name').map((e) => e.textContent)).toEqual(['Nytt']))
})
