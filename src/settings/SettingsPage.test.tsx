// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AggregateTypes } from '../sync/protocol'
import { SETTINGS_ID, type Workout } from '../training/model'
import { createTestApp, TODAY } from '../test/render'

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
  const sheet = screen.getByRole('dialog')
  expect(within(sheet).queryByTestId('templates-link')).toBeNull()
  expect(within(sheet).queryByTestId('exercises-link')).toBeNull()
  expect(within(sheet).queryByTestId('trash-link')).toBeNull()
})

it('has seven a week as the most', async () => {
  const app = createTestApp()
  await app.repository.save('settings', SETTINGS_ID, { id: SETTINGS_ID, sessionsPerWeek: 7 })
  app.renderAt('/settings')

  expect((await screen.findByTestId('increase')).hasAttribute('disabled')).toBe(true)
  expect(screen.getByTestId('settings-effect').textContent).toContain('dagen efter')
})

describe('export and import', () => {
  const workout: Workout = { id: crypto.randomUUID(), date: '2026-09-21', status: 'Planned', exercises: [] }

  /** Exports from a device holding workout, through its preview, and returns the file shared. */
  async function exported(): Promise<File> {
    const app = createTestApp()
    await app.repository.save('workout', workout.id, workout)
    const share = vi.fn<(data: ShareData) => Promise<void>>(async () => {})
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator) as Navigator, { canShare: () => true, share }))
    app.renderAt('/settings')

    fireEvent.click(await screen.findByTestId('export-data'))
    fireEvent.click(await screen.findByTestId('confirm-export'))
    await waitFor(() => expect(share).toHaveBeenCalledOnce())
    cleanup()
    vi.unstubAllGlobals()
    return share.mock.calls[0]![0].files![0]!
  }

  const choose = (file: File) => fireEvent.change(screen.getByTestId('import-file'), { target: { files: [file] } })

  it('shows what the export holds before it shares it', async () => {
    const app = createTestApp()
    await app.repository.save('workout', workout.id, workout)
    await app.repository.save('workout', crypto.randomUUID(), {
      ...workout,
      id: crypto.randomUUID(),
      date: '2026-09-23',
    })
    app.renderAt('/settings')

    fireEvent.click(await screen.findByTestId('export-data'))

    const sheet = await screen.findByTestId('export-sheet')
    const summary = within(sheet).getByTestId('export-summary').textContent
    expect(summary).toBe('Pass21 sep. 2026 – 23 sep. 20262Övningar0Mallar0')
    expect(sheet.textContent).toContain(`Sparas som kropp-${TODAY}.json.`)
    expect(sheet.textContent).toContain('2 ändringar som inte är synkade än kommer med.')
  })

  it('hands every aggregate to the share sheet as a file named by the day', async () => {
    const file = await exported()

    expect(file.name).toBe(`kropp-${TODAY}.json`)
    expect(JSON.parse(await file.text())).toMatchObject({
      format: 'kropp',
      version: 1,
      records: [{ type: 'workout', id: workout.id }],
    })
  })

  it('downloads the file where there is no share sheet', async () => {
    const app = createTestApp()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    app.renderAt('/settings')

    fireEvent.click(await screen.findByTestId('export-data'))
    fireEvent.click(await screen.findByTestId('confirm-export'))

    await waitFor(() => expect(click).toHaveBeenCalledOnce())
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe(`kropp-${TODAY}.json`)
    expect(screen.queryByTestId('export-sheet')).toBeNull()
  })

  it('shows what an import would do, then imports and saves to sync it', async () => {
    const file = await exported()
    const app = createTestApp()
    app.renderAt('/settings')

    choose(file)
    const summary = await screen.findByTestId('import-summary')
    expect(summary.textContent).toBe('Nya1Finns redan0Krockar0')
    expect(screen.queryByTestId('conflicts')).toBeNull()
    fireEvent.click(screen.getByTestId('confirm-import'))

    await waitFor(() => expect(screen.getByTestId('backup-message').textContent).toBe('Importerade 1.'))
    expect(app.repository.peek('workout', workout.id)).toEqual(workout)
    expect((await app.store.getPending()).map((r) => r.id)).toEqual([workout.id])
  })

  it("keeps the newer copy of a conflict, and lists each on a page of its own to choose the file's", async () => {
    const file = await exported()
    const app = createTestApp()
    vi.setSystemTime(new Date('2026-09-24T10:00:00Z'))
    await app.repository.save('workout', workout.id, { ...workout, note: 'Newer here' })
    app.renderAt('/settings')

    choose(file)
    // Only the summary on the first page, however many conflicts.
    const showConflicts = await screen.findByTestId('show-conflicts')
    expect(screen.queryByTestId('conflict')).toBeNull()
    expect(showConflicts.textContent).toContain('0 av 1 från filen')
    expect(screen.getByTestId<HTMLButtonElement>('confirm-import').disabled).toBe(true)

    fireEvent.click(showConflicts)
    const list = await screen.findByTestId('conflicts')
    expect(within(list).getByRole('heading').textContent).toBe('Pass')
    const conflict = within(list).getByTestId('conflict')
    expect(conflict.textContent).toContain('21 sep. 2026')
    expect(conflict.textContent).toContain('Nyare här')
    fireEvent.click(within(conflict).getByRole('radio', { name: 'Filen' }))

    // Back on the first page, the choice holds.
    fireEvent.click(screen.getByTestId('sheet-back'))
    expect((await screen.findByTestId('show-conflicts')).textContent).toContain('1 av 1 från filen')
    expect(screen.getByTestId('confirm-import').textContent).toBe('Importera 1')
    fireEvent.click(screen.getByTestId('confirm-import'))

    await waitFor(() => expect(app.repository.peek('workout', workout.id)?.note).toBeUndefined())
  })

  it('chooses for every conflict at once', async () => {
    const file = await exported()
    const app = createTestApp()
    vi.setSystemTime(new Date('2026-09-24T10:00:00Z'))
    await app.repository.save('workout', workout.id, { ...workout, note: 'Newer here' })
    app.renderAt('/settings')

    choose(file)
    const all = await screen.findByTestId('choose-all')
    fireEvent.click(within(all).getByRole('radio', { name: 'Filen' }))

    expect(screen.getByTestId('show-conflicts').textContent).toContain('1 av 1 från filen')
    fireEvent.click(screen.getByTestId('show-conflicts'))
    const conflict = await screen.findByTestId('conflict')
    expect(within(conflict).getByRole('radio', { name: 'Filen' }).getAttribute('aria-checked')).toBe('true')
  })

  it('imports nothing when the sheet is closed', async () => {
    const file = await exported()
    const app = createTestApp()
    app.renderAt('/settings')

    choose(file)
    await screen.findByTestId('import-sheet')
    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByTestId('import-sheet')).toBeNull())
    expect(app.repository.peekAll('workout')).toEqual([])
  })

  it('says so for a file that is not an export, without a preview', async () => {
    createTestApp().renderAt('/settings')

    choose(new File(['{"hello":1}'], 'other.json', { type: 'application/json' }))

    expect((await screen.findByRole('alert')).textContent).toBe('Filen är ingen export från den här appen.')
    expect(screen.queryByTestId('import-sheet')).toBeNull()
  })
})
