import { fireEvent, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, vi } from 'vitest'
import { newId, type Exercise, type Workout, type WorkoutExercise } from '../training/model'
import { createTestApp, type TestApp } from './render'

// Shared by the workout page's tests (src/workout/WorkoutPage*.test.tsx): data to seed, and short
// ways to find and tap things on the page. Importing it gives each test a fresh app in `app`.

export const exercise = (e: Partial<Exercise> & { name: string }): Exercise => ({
  id: newId(),
  kind: 'Strength',
  isArchived: false,
  categories: [],
  measuresTimeOnly: false,
  ...e,
})

export const entry = (e: Partial<WorkoutExercise> & { exerciseId: string }): WorkoutExercise => ({
  order: 0,
  sets: [],
  isSkipped: false,
  ...e,
})

export const workout = (w: Partial<Workout> & { date: string }): Workout => ({
  id: newId(),
  status: 'Planned',
  exercises: [],
  ...w,
})

export const BENCH = exercise({ name: 'Bröst maskin', settingsNote: 'Sitthöjd 11' })
export const walk = (e: Partial<Exercise> = {}) => exercise({ name: 'Gång i maskin', kind: 'Cardio', ...e })

export let app: TestApp

beforeEach(() => {
  app = createTestApp()
})

afterEach(() => vi.restoreAllMocks())

/** Saves BENCH and the workout. */
export async function seed(w: Workout) {
  await app.repository.save('exercise', BENCH.id, BENCH)
  await app.repository.save('workout', w.id, w)
  return w
}

export const saveExercise = (e: Exercise) => app.repository.save('exercise', e.id, e)
export const saveWorkout = (w: Workout) => app.repository.save('workout', w.id, w)
export const reload = async (id: string) => (await app.repository.get('workout', id))!
export const open = (id: string) => app.renderAt(`/workouts/${id}`)

export const $ = <E extends Element = HTMLElement>(selector: string, scope: ParentNode = document) => {
  const found = scope.querySelector<E>(selector)
  if (!found) throw new Error(`No ${selector}`)
  return found
}
export const $$ = <E extends Element = HTMLElement>(selector: string, scope: ParentNode = document) => [
  ...scope.querySelectorAll<E>(selector),
]
export const waitForElement = <E extends Element = HTMLElement>(selector: string) => waitFor(() => $<E>(selector))
export const waitForElements = (selector: string) =>
  waitFor(() => {
    const found = $$(selector)
    expect(found.length).toBeGreaterThan(0)
    return found
  })
export const text = (e: Element) => e.textContent.trim()
export const click = (e: Element) => fireEvent.click(e)
export const change = (e: Element, value: string) => fireEvent.change(e, { target: { value } })

export const stepperFor = (scope: ParentNode, label: string) =>
  $$('[data-testid=stepper]', scope).find((s) => s.getAttribute('data-label') === label)!

/** data-current of each card, in order. */
export const marks = () => $$('[data-testid=exercise-entry]').map((c) => c.getAttribute('data-current'))
export const names = () => $$('[data-testid=exercise-entry] h3').map((h) => h.textContent)
