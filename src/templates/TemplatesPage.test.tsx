// @vitest-environment happy-dom
import { act, fireEvent, waitFor } from '@testing-library/react'
import Sortable from 'sortablejs'
import { beforeEach, expect, it, vi } from 'vitest'
import { createTestApp, type TestApp } from '../test/render'
import { newId, type Exercise, type WorkoutExercise, type WorkoutTemplate } from '../training/model'

vi.mock('../illustrations/illustrations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../illustrations/illustrations')>()),
  prefetch: vi.fn(() => Promise.resolve()),
}))

const exercise = (e: Partial<Exercise> & { name: string }): Exercise => ({
  id: newId(),
  kind: 'Strength',
  isArchived: false,
  categories: [],
  measuresTimeOnly: false,
  ...e,
})

const entry = (e: Partial<WorkoutExercise> & { exerciseId: string }): WorkoutExercise => ({
  order: 0,
  sets: [],
  isSkipped: false,
  ...e,
})

const BENCH = exercise({ name: 'Bröst maskin' })
const CURL = exercise({ name: 'Biceps hantlar' })

let app: TestApp

beforeEach(() => {
  app = createTestApp()
})

async function seed() {
  await app.repository.save('exercise', BENCH.id, BENCH)
  await app.repository.save('exercise', CURL.id, CURL)
  const template: WorkoutTemplate = {
    id: newId(),
    name: 'Bröst',
    exercises: [entry({ exerciseId: BENCH.id, targetSets: 3, targetReps: 8, targetWeightKg: 60 })],
  }
  await app.repository.save('template', template.id, template)
  return template
}

const reload = async (id: string) => (await app.repository.get('template', id))!

const $ = <E extends Element = HTMLElement>(selector: string, scope: ParentNode = document) => {
  const found = scope.querySelector<E>(selector)
  if (!found) throw new Error(`No ${selector}`)
  return found
}
const $$ = (selector: string, scope: ParentNode = document) => [...scope.querySelectorAll<HTMLElement>(selector)]
const waitForElement = (selector: string) => waitFor(() => $(selector))
const text = (e: Element) => e.textContent!.trim()
const click = (e: Element) => fireEvent.click(e)

const stepperFor = (scope: ParentNode, label: string) =>
  $$('[data-testid=stepper]', scope).find((s) => s.getAttribute('data-label') === label)!

it('explains how to make a template when there are none', async () => {
  app.renderAt('/templates')

  await waitForElement('[data-testid=templates-empty]')
})

it('links each template in the list to its page', async () => {
  const template = await seed()

  app.renderAt('/templates')

  const link = await waitForElement('[data-testid=templates] a')
  expect(link.getAttribute('href')).toBe(`/templates/${template.id}`)
  expect(link.textContent).toContain('Bröst maskin')
})

it('edits a template with the same cards as a workout, but without sets', async () => {
  const template = await seed()
  app.renderAt(`/templates/${template.id}`)

  await waitForElement('[data-testid=exercise-entry]')
  expect($$('[data-testid=sets]')).toEqual([])
  expect($$('[data-testid=last-time]')).toEqual([])

  click($('[data-testid=edit]'))
  // The list is in its template mode: the editor has no comment, only the setting.
  expect($$('[data-testid=notes-editor] textarea')).toEqual([])
  click($('[data-testid=increase]', stepperFor($('[data-testid=target-editor]'), 'kg')))

  await waitFor(() => expect(text($('[data-testid=target]'))).toBe('3 × 8 @ 62,5 kg'))
  await waitFor(async () => expect((await reload(template.id)).exercises[0]!.targetWeightKg).toBe(62.5))
})

it('adds and reorders exercises, and renames the template', async () => {
  const template = await seed()
  app.renderAt(`/templates/${template.id}`)

  click(await waitForElement('[data-testid=add-exercise]'))
  fireEvent.input($('[data-testid=exercise-picker] input[type=search]'), { target: { value: 'biceps' } })
  click($('[data-testid=exercise-picker] li button'))
  await waitFor(() => expect($$('[data-testid=exercise-entry] h3')).toHaveLength(2))

  // What SortableJS does when a card is dropped at a new position: it moves the card, then calls onEnd.
  const list = $('[data-testid=entry-list]')
  act(() => {
    const item = list.children[1] as HTMLElement
    list.insertBefore(item, list.children[0]!)
    Sortable.get(list)!.option('onEnd')!({ oldIndex: 1, newIndex: 0, item, from: list } as Sortable.SortableEvent)
  })
  fireEvent.change($('input[type=text]'), { target: { value: 'Överkropp' } })

  await waitFor(() =>
    expect($$('[data-testid=exercise-entry] h3').map((h) => h.textContent)).toEqual(['Biceps hantlar', 'Bröst maskin']),
  )
  await waitFor(async () => {
    const saved = await reload(template.id)
    expect(saved.name).toBe('Överkropp')
    expect(saved.exercises.map((e) => e.exerciseId)).toEqual([CURL.id, BENCH.id])
    expect(saved.exercises.every((e) => e.sets.length === 0)).toBe(true)
  })
})

it('asks before deleting, and returns to the list', async () => {
  const template = await seed()
  app.renderAt(`/templates/${template.id}`)

  const del = await waitFor(() => {
    const found = $$('button').filter((b) => text(b) === 'Ta bort mallen')
    expect(found).toHaveLength(1)
    return found[0]!
  })
  click(del)
  click($('[role=alertdialog] button'))

  await waitFor(() => expect(window.location.pathname).toBe('/templates'))
  expect(await app.repository.get('template', template.id)).toBeUndefined()
})

it('shows not found for an unknown template', async () => {
  app.renderAt(`/templates/${newId()}`)

  await waitForElement('[data-testid=not-found]')
})

it('creates a new template empty and opens it', async () => {
  app.renderAt('/templates')
  await waitForElement('[data-testid=templates-empty]')

  click($('[data-testid=new-template]'))

  const template = await waitFor(async () => {
    const all = await app.repository.getAll('template')
    expect(all).toHaveLength(1)
    return all[0]!
  })
  expect([template.name, template.exercises.length]).toEqual(['Ny mall', 0])
  await waitFor(() => expect(window.location.pathname).toBe(`/templates/${template.id}`))
})

it('makes cardio minutes in a template a plan, and moves old ones there', async () => {
  const walk = exercise({ name: 'Gång i maskin', kind: 'Cardio' })
  await app.repository.save('exercise', walk.id, walk)
  const template: WorkoutTemplate = {
    id: newId(),
    name: 'Armar',
    exercises: [entry({ exerciseId: walk.id, durationMinutes: 5 })],
  }
  await app.repository.save('template', template.id, template)
  app.renderAt(`/templates/${template.id}`)

  expect(text(await waitForElement('[data-testid=target]'))).toBe('5 min')
  expect($$('[data-testid=cardio]')).toEqual([])
  click($('[data-testid=edit]'))
  click($('[data-testid=increase]', stepperFor($('[data-testid=target-editor]'), 'Minuter')))

  await waitFor(async () => {
    const saved = (await reload(template.id)).exercises[0]!
    expect([saved.targetDurationMinutes, saved.durationMinutes]).toEqual([5.5, undefined])
  })
})
