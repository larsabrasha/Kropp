// @vitest-environment happy-dom
import { act, fireEvent, waitFor } from '@testing-library/react'
import Sortable from 'sortablejs'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { picture, prefetch } from '../illustrations/illustrations'
import { keyOf } from '../sync/localStore'
import { createTestApp, type TestApp } from '../test/render'
import {
  newId,
  type Exercise,
  type SetResult,
  type Workout,
  type WorkoutExercise,
  type WorkoutTemplate,
} from '../training/model'

// Pictures are fetched for the service worker in the app; here the call is only recorded.
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

const workout = (w: Partial<Workout> & { date: string }): Workout => ({
  id: newId(),
  status: 'Planned',
  exercises: [],
  ...w,
})

const BENCH = exercise({ name: 'Bröst maskin', settingsNote: 'Sitthöjd 11' })
const walk = (e: Partial<Exercise> = {}) => exercise({ name: 'Gång i maskin', kind: 'Cardio', ...e })

let app: TestApp

beforeEach(() => {
  app = createTestApp()
  vi.mocked(prefetch).mockClear()
})

afterEach(() => vi.restoreAllMocks())

async function seed(w: Workout) {
  await app.repository.save('exercise', BENCH.id, BENCH)
  await app.repository.save('workout', w.id, w)
  return w
}

const saveExercise = (e: Exercise) => app.repository.save('exercise', e.id, e)
const saveWorkout = (w: Workout) => app.repository.save('workout', w.id, w)
const reload = async (id: string) => (await app.repository.get('workout', id))!
const open = (id: string) => app.renderAt(`/workouts/${id}`)

const $ = <E extends Element = HTMLElement>(selector: string, scope: ParentNode = document) => {
  const found = scope.querySelector<E>(selector)
  if (!found) throw new Error(`No ${selector}`)
  return found
}
const $$ = <E extends Element = HTMLElement>(selector: string, scope: ParentNode = document) => [
  ...scope.querySelectorAll<E>(selector),
]
const waitForElement = <E extends Element = HTMLElement>(selector: string) => waitFor(() => $<E>(selector))
const waitForElements = (selector: string) =>
  waitFor(() => {
    const found = $$(selector)
    expect(found.length).toBeGreaterThan(0)
    return found
  })
const text = (e: Element) => e.textContent!.trim()
const click = (e: Element) => fireEvent.click(e)
const change = (e: Element, value: string) => fireEvent.change(e, { target: { value } })

const stepperFor = (scope: ParentNode, label: string) =>
  $$('[data-testid=stepper]', scope).find((s) => s.getAttribute('data-label') === label)!

const marks = () => $$('[data-testid=exercise-entry]').map((c) => c.getAttribute('data-current'))
const names = () => $$('[data-testid=exercise-entry] h3').map((h) => h.textContent)

it('shows not found for an unknown id', async () => {
  open(newId())

  await waitForElement('[data-testid=not-found]')
})

it('records the next set at the planned values when it is tapped', async () => {
  const w = await seed(
    workout({
      date: '2026-09-23',
      exercises: [entry({ exerciseId: BENCH.id, targetSets: 3, targetReps: 8, targetWeightKg: 22.5 })],
    }),
  )
  open(w.id)

  click(await waitForElement('[data-testid=set-next]'))
  click(await waitForElement('[data-testid=set-next]'))

  await waitFor(() => expect($$('[data-testid=set-done]')).toHaveLength(2))
  const first = $$('[data-testid=set-done]')[0]!
  expect(
    $$('span', first)
      .filter((x) => x.children.length === 0)
      .map(text)
      .filter((t) => t !== ''),
  ).toEqual(['8', '22,5 kg'])
  expect(first.getAttribute('aria-label')).toBe('Set 1 klart: 8 × 22,5')
  await waitFor(async () =>
    expect((await reload(w.id)).exercises[0]!.sets).toEqual([
      { reps: 8, weightKg: 22.5 },
      { reps: 8, weightKg: 22.5 },
    ]),
  )
})

it('shows no input fields on a card until something is tapped', async () => {
  const w = await seed(
    workout({
      date: '2026-09-23',
      exercises: [
        entry({
          exerciseId: BENCH.id,
          targetSets: 3,
          targetReps: 8,
          targetWeightKg: 22.5,
          settings: '45 grader',
          comment: 'tungt',
        }),
      ],
    }),
  )
  open(w.id)

  const card = await waitForElement('[data-testid=exercise-entry]')
  expect($$('input', card)).toEqual([])
  expect(text($('[data-testid=target]'))).toBe('3 × 8 @ 22,5 kg')
  expect(text($('[data-testid=settings-line]'))).toBe('Sitthöjd 11 · 45 grader')
  expect(text($('[data-testid=comment]'))).toBe('tungt')
  expect($$('[data-testid=set-next]')).toHaveLength(1)
})

it('opens the fields when the target is tapped, and saves a change', async () => {
  const w = await seed(
    workout({
      date: '2026-09-23',
      exercises: [entry({ exerciseId: BENCH.id, targetSets: 3, targetReps: 8, targetWeightKg: 20 })],
    }),
  )
  open(w.id)

  click(await waitForElement('[data-testid=edit]'))
  expect($$('[data-testid=editor] h4')).toEqual([])
  expect($$('label', $('[data-testid=notes-editor]')).map((l) => $('span', l).textContent)).toEqual([
    'Inställning',
    'Kommentar',
  ])
  const kg = stepperFor($('[data-testid=target-editor]'), 'kg')
  expect(kg.children[0]!.textContent).toBe('kg')
  expect([...kg.children[1]!.children].map((c) => c.tagName)).toEqual(['INPUT', 'DIV'])
  expect($$('button', kg.children[1]!.children[1]!).map((b) => b.getAttribute('data-testid'))).toEqual([
    'decrease',
    'increase',
  ])
  change($$('[data-testid=target-editor] input')[2]!, '25')
  expect(text($('[data-testid=close-editor]'))).toBe('Stäng')
  click($('[data-testid=close-editor]'))

  await waitFor(() => expect(text($('[data-testid=target]'))).toBe('3 × 8 @ 25 kg'))
  expect($$('[data-testid=editor]')).toEqual([])
  await waitFor(async () => expect((await reload(w.id)).exercises[0]!.targetWeightKg).toBe(25))
})

it('keeps typed values within the limits and gives texts a length', async () => {
  const w = await seed(
    workout({
      date: '2026-09-23',
      exercises: [entry({ exerciseId: BENCH.id, targetSets: 3, targetReps: 8, targetWeightKg: 20 })],
    }),
  )
  open(w.id)
  click(await waitForElement('[data-testid=edit]'))
  const editor = $('[data-testid=target-editor]')

  expect($('input', stepperFor(editor, 'Rep')).getAttribute('max')).toBe('100')
  change($('input', stepperFor(editor, 'Rep')), '800')
  change($('input', stepperFor($('[data-testid=target-editor]'), 'kg')), '-5')

  await waitFor(async () => {
    const saved = (await reload(w.id)).exercises[0]!
    // A negative weight is not a number the field takes, so it is cleared.
    expect([saved.targetReps, saved.targetWeightKg]).toEqual([100, undefined])
  })
  expect($('[data-testid=notes-editor] input').getAttribute('maxlength')).toBe('200')
  expect($('[data-testid=notes-editor] textarea').getAttribute('maxlength')).toBe('1000')
})

it('adjusts the plan by one rep and the exercise weight step with plus and minus', async () => {
  const w = await seed(
    workout({
      date: '2026-09-23',
      exercises: [entry({ exerciseId: BENCH.id, targetSets: 3, targetReps: 8, targetWeightKg: 20 })],
    }),
  )
  open(w.id)
  click(await waitForElement('[data-testid=edit]'))

  click($('[data-testid=increase]', stepperFor($('[data-testid=target-editor]'), 'Rep')))
  await waitFor(() => expect(text($('[data-testid=target]'))).toBe('3 × 9 @ 20 kg'))

  click($('[data-testid=increase]', stepperFor($('[data-testid=target-editor]'), 'kg')))
  await waitFor(() => expect(text($('[data-testid=target]'))).toBe('3 × 9 @ 22,5 kg'))

  click($('[data-testid=decrease]', stepperFor($('[data-testid=target-editor]'), 'kg')))
  click($('[data-testid=decrease]', stepperFor($('[data-testid=target-editor]'), 'kg')))
  await waitFor(() => expect(text($('[data-testid=target]'))).toBe('3 × 9 @ 17,5 kg'))

  await waitFor(async () => {
    const saved = (await reload(w.id)).exercises[0]!
    expect([saved.targetReps, saved.targetWeightKg]).toEqual([9, 17.5])
  })
})

it('plans cardio at the top and corrects what was done on its button', async () => {
  const machine = walk()
  await saveExercise(machine)
  const w = await seed(
    workout({
      date: '2026-09-23',
      exercises: [entry({ exerciseId: machine.id, targetDurationMinutes: 5, settings: '60' })],
    }),
  )
  open(w.id)

  expect(text(await waitForElement('[data-testid=target]'))).toBe('5 min · 60')
  click($('[data-testid=edit]'))
  const editor = $('[data-testid=target-editor]')
  expect($$('[data-testid=stepper]', editor).map((s) => s.getAttribute('data-label'))).toEqual(['Minuter', 'km'])
  click($('[data-testid=increase]', stepperFor(editor, 'Minuter')))

  await waitFor(() => expect(text($('[data-testid=target]'))).toBe('5,5 min · 60'))
  await waitFor(async () => expect((await reload(w.id)).exercises[0]!.targetDurationMinutes).toBe(5.5))
  expect((await reload(w.id)).status).toBe('Planned')
  expect($$('[data-testid=cardio]')).toEqual([])

  click($('[data-testid=close-editor]'))
  click($('[data-testid=cardio-next]'))
  click(await waitForElement('[data-testid=cardio-done]'))
  click($('[data-testid=increase]', stepperFor($('[data-testid=cardio-editor]'), 'Snittpuls')))

  await waitFor(async () => {
    const saved = await reload(w.id)
    expect([saved.exercises[0]!.durationMinutes, saved.exercises[0]!.avgHeartRate, saved.status]).toEqual([
      5.5,
      120,
      'Done',
    ])
  })
})

it('corrects a done set with the same buttons', async () => {
  const w = await seed(
    workout({
      date: '2026-09-23',
      exercises: [
        entry({
          exerciseId: BENCH.id,
          targetSets: 3,
          targetReps: 8,
          targetWeightKg: 20,
          sets: [{ reps: 8, weightKg: 20 }],
        }),
      ],
    }),
  )
  open(w.id)

  click(await waitForElement('[data-testid=set-done]'))
  click($('[data-testid=decrease]', stepperFor($('[data-testid=set-editor]'), 'Rep')))
  click($('[data-testid=decrease]', stepperFor($('[data-testid=set-editor]'), 'Rep')))

  await waitFor(() => expect(text($('[data-testid=set-done] [data-testid=set-main]'))).toBe('6'))
  await waitFor(async () => expect((await reload(w.id)).exercises[0]!.sets[0]!.reps).toBe(6))
})

it('has an open panel on only one card at a time', async () => {
  const w = await seed(
    workout({
      date: '2026-09-23',
      exercises: [
        entry({ exerciseId: BENCH.id, targetSets: 3, targetReps: 8 }),
        entry({ exerciseId: BENCH.id, order: 1, targetSets: 2, targetReps: 10 }),
      ],
    }),
  )
  open(w.id)

  click((await waitForElements('[data-testid=edit]'))[0]!)
  click($$('[data-testid=edit]')[1]!)

  expect($$('[data-testid=target-editor]')).toHaveLength(1)
  expect($$('[data-testid=exercise-entry]')[1]!.querySelector('[data-testid=target-editor]')).not.toBeNull()
})

it('saves the new order when an exercise is dropped', async () => {
  const other = exercise({ name: 'Vader', kind: 'Bodyweight' })
  await saveExercise(other)
  const w = await seed(
    workout({
      date: '2026-09-23',
      exercises: [entry({ exerciseId: BENCH.id }), entry({ exerciseId: other.id, order: 1 })],
    }),
  )
  open(w.id)
  await waitFor(() => expect($$('[data-testid=drag-handle]')).toHaveLength(2))
  const list = $('[data-testid=entry-list]')
  await waitFor(() => expect(Sortable.get(list)).toBeDefined())

  // What SortableJS does when a card is dropped at a new position: it moves the card, then calls onEnd.
  act(() => {
    const item = list.children[1] as HTMLElement
    list.insertBefore(item, list.children[0]!)
    Sortable.get(list)!.option('onEnd')!({ oldIndex: 1, newIndex: 0, item, from: list } as Sortable.SortableEvent)
  })

  await waitFor(() => expect(names()).toEqual(['Vader', 'Bröst maskin']))
  await waitFor(async () => {
    const saved = (await reload(w.id)).exercises
    expect(saved.map((e) => e.exerciseId)).toEqual([other.id, BENCH.id])
    expect(saved.map((e) => e.order)).toEqual([0, 1])
  })
})

it('removes an exercise from the menu', async () => {
  const other = exercise({ name: 'Vader', kind: 'Bodyweight' })
  await saveExercise(other)
  const w = await seed(
    workout({
      date: '2026-09-23',
      exercises: [entry({ exerciseId: BENCH.id }), entry({ exerciseId: other.id, order: 1 })],
    }),
  )
  open(w.id)

  click((await waitForElements('[data-testid=edit]'))[0]!)
  expect(text($('[data-testid=editor] [data-testid=remove]'))).toBe('Radera övning')
  click($('[data-testid=editor] [data-testid=remove]'))

  await waitFor(() => expect(names()).toEqual(['Vader']))
  await waitFor(async () => expect((await reload(w.id)).exercises.map((e) => e.exerciseId)).toEqual([other.id]))
})

it('shows the picture small and large and links to the exercise', async () => {
  const w = await seed(
    workout({ date: '2026-09-23', exercises: [entry({ exerciseId: BENCH.id, targetSets: 3, targetReps: 8 })] }),
  )
  open(w.id)

  const thumbnail = await waitForElement('[data-testid=thumbnail]')
  const image = picture('machine-chest-press')
  expect($('img', thumbnail).getAttribute('src')).toBe(image)

  click(thumbnail)
  expect($('[data-testid=illustration-large] img').getAttribute('src')).toBe(image)
  expect($$('[data-testid=illustration-picker]')).toEqual([])
  expect($('[data-testid=illustration]').textContent).not.toContain('Bryl Lim')
  expect($('[data-testid=illustration] [data-testid=edit-exercise]').getAttribute('href')).toBe(
    `/exercises/${BENCH.id}?back=workouts%2F${w.id}`,
  )
})

it('changes only the occasion on the card and links to the exercise for the rest', async () => {
  const w = await seed(
    workout({
      date: '2026-09-23',
      exercises: [entry({ exerciseId: BENCH.id, targetSets: 3, targetReps: 8, targetWeightKg: 20 })],
    }),
  )
  open(w.id)

  click(await waitForElement('[data-testid=edit]'))
  expect($$('[data-testid=editor] [data-testid=category-chips]')).toEqual([])
  expect($$('[data-testid=editor] [data-testid=edit-exercise]')).toEqual([])

  click($('[data-testid=edit]'))
  expect($$('[data-testid=weight-step]')).toEqual([])
})

it('adds the weight step of the exercise with plus', async () => {
  await saveExercise({ ...BENCH, weightStepKg: 1 })
  const w = workout({
    date: '2026-09-23',
    exercises: [entry({ exerciseId: BENCH.id, targetSets: 3, targetReps: 8, targetWeightKg: 20 })],
  })
  await saveWorkout(w)
  open(w.id)

  click(await waitForElement('[data-testid=edit]'))
  click($('[data-testid=increase]', stepperFor($('[data-testid=target-editor]'), 'kg')))

  await waitFor(() => expect(text($('[data-testid=target]'))).toBe('3 × 8 @ 21 kg'))
})

it('prefetches only the pictures a workout uses', async () => {
  const w = await seed(workout({ date: '2026-09-23', exercises: [entry({ exerciseId: BENCH.id })] }))

  open(w.id)

  await waitFor(() => expect(prefetch).toHaveBeenCalled())
  expect(vi.mocked(prefetch).mock.calls[0]![0]).toEqual([picture('machine-chest-press')])
})

it('corrects a done set', async () => {
  const w = await seed(
    workout({
      date: '2026-09-23',
      exercises: [
        entry({
          exerciseId: BENCH.id,
          targetSets: 3,
          targetReps: 8,
          targetWeightKg: 60,
          sets: [{ reps: 8, weightKg: 60 }],
        }),
      ],
    }),
  )
  open(w.id)

  click(await waitForElement('[data-testid=set-done]'))
  change($('[data-testid=set-editor] input'), '6')

  await waitFor(() => expect(text($('[data-testid=set-done] [data-testid=set-main]'))).toBe('6'))
  expect($('[data-testid=set-done]').getAttribute('data-short')).toBe('true')
  await waitFor(async () => expect((await reload(w.id)).exercises[0]!.sets[0]!.reps).toBe(6))
})

it('always shows the weight on a done set', async () => {
  const w = await seed(
    workout({
      date: '2026-09-23',
      exercises: [
        entry({
          exerciseId: BENCH.id,
          targetSets: 3,
          targetReps: 8,
          targetWeightKg: 20,
          sets: [
            { reps: 8, weightKg: 20 },
            { reps: 10, weightKg: 17.5 },
          ],
        }),
      ],
    }),
  )
  open(w.id)

  const sets = await waitForElements('[data-testid=set-done]')
  expect($('[data-testid=set-weight]', sets[0]).textContent).toBe('20 kg')
  expect($('[data-testid=set-weight]', sets[1]).textContent).toBe('17,5 kg')
  expect(sets.map((b) => b.getAttribute('data-short'))).toEqual(['false', 'false'])
})

it('shows what was done last time', async () => {
  await seed(
    workout({
      date: '2026-09-21',
      status: 'Done',
      exercises: [
        entry({
          exerciseId: BENCH.id,
          sets: [
            { reps: 8, weightKg: 60 },
            { reps: 8, weightKg: 60 },
            { reps: 10, weightKg: 60 },
          ],
        }),
      ],
    }),
  )
  const today = await seed(
    workout({ date: '2026-09-23', exercises: [entry({ exerciseId: BENCH.id, targetSets: 3, targetReps: 8 })] }),
  )

  open(today.id)

  const last = await waitForElement('[data-testid=last-time]')
  expect($('[data-testid=last-time-date]', last).textContent).toBe('mån 21 sep (2 dagar sedan)')
  expect($$('[data-testid=last-sets] > span', last).map(text)).toEqual(['8', '8', '10', '× 60 kg'])
  expect(last.getAttribute('aria-label')).toBe('Förra gången: mån 21 sep (2 dagar sedan), 8, 8, 10 × 60 kg')
})

it('marks the sets that fell short last time and shows what was said', async () => {
  await seed(
    workout({
      date: '2026-09-22',
      status: 'Done',
      exercises: [
        entry({
          exerciseId: BENCH.id,
          targetSets: 3,
          targetReps: 8,
          targetWeightKg: 10,
          comment: 'För tungt',
          sets: [
            { reps: 8, weightKg: 10 },
            { reps: 8, weightKg: 12.5 },
            { reps: 3, weightKg: 10 },
          ],
        }),
      ],
    }),
  )
  const today = await seed(
    workout({ date: '2026-09-23', exercises: [entry({ exerciseId: BENCH.id, targetSets: 3, targetReps: 8 })] }),
  )

  open(today.id)

  const chips = await waitForElements('[data-testid=last-sets] > span')
  expect(chips.map(text)).toEqual(['8 × 10', '8 × 12,5', '3 × 10'])
  expect(chips.map((x) => x.getAttribute('data-short'))).toEqual(['false', 'false', 'true'])
  expect($('[data-testid=last-time-date]').textContent).toBe('tis 22 sep (i går)')
  expect(text($('[data-testid=last-comment]'))).toBe('För tungt')
  expect($$('svg', $('[data-testid=last-comment]'))).toHaveLength(2)
  expect($$('[data-testid=comment]')).toEqual([])
})

it('creates a new exercise from the picker and adds it', async () => {
  const w = await seed(workout({ date: '2026-09-23' }))
  open(w.id)

  click(await waitForElement('[data-testid=add-exercise]'))
  fireEvent.input($('[data-testid=exercise-picker] input[type=search]'), { target: { value: 'Plankan' } })
  change($('[data-testid=exercise-picker] select'), 'Timed')
  expect($('[data-testid=create-exercise]').hasAttribute('disabled')).toBe(true)
  click($('[data-testid=exercise-picker] [data-area=Core]'))
  click($('[data-testid=create-exercise]'))

  await waitFor(() => expect($('[data-testid=exercise-entry] h3').textContent).toBe('Plankan'))
  const plank = (await app.repository.getAll('exercise')).find((e) => e.name === 'Plankan')!
  expect(plank.kind).toBe('Timed')
  expect(plank.categories).toEqual(['Core'])
  await waitFor(async () => {
    const saved = (await reload(w.id)).exercises
    expect(saved).toHaveLength(1)
    expect(saved[0]!.exerciseId).toBe(plank.id)
    expect(saved[0]!.targetSeconds).toBe(30)
  })
})

it('picks an existing exercise', async () => {
  const w = await seed(workout({ date: '2026-09-23' }))
  open(w.id)

  click(await waitForElement('[data-testid=add-exercise]'))
  fireEvent.input($('[data-testid=exercise-picker] input[type=search]'), { target: { value: 'bröst' } })
  expect($$('[data-testid=exercise-picker] li')).toHaveLength(1)
  expect($('[data-testid=exercise-picker] li [data-testid=picker-thumbnail]').getAttribute('src')).toBe(
    picture('machine-chest-press'),
  )
  click($('[data-testid=exercise-picker] li button'))

  await waitFor(() => expect($('[data-testid=exercise-entry] h3').textContent).toBe('Bröst maskin'))
  await waitFor(async () => expect((await reload(w.id)).exercises.map((e) => e.exerciseId)).toEqual([BENCH.id]))
})

it('shows the details as text until tapped, and then as fields', async () => {
  const w = await seed(workout({ date: '2026-09-21', sessionNumber: 101 }))
  open(w.id)

  const meta = await waitForElement('[data-testid=workout-meta]')
  expect(text(meta)).toBe('måndag 21 sep. · 0 övningar · Nr 101')
  expect($('h1').textContent).toBe('Träningspass')
  expect($$('input[type=date]')).toEqual([])

  click($('[data-testid=unlock]'))
  click($('[data-testid=workout-meta]'))
  change($('[data-testid=details-editor] input[type=text]'), 'Ben och bröst')
  click($('[data-testid=details-editor] button'))

  await waitFor(() => expect($('h1').textContent).toBe('Ben och bröst'))
  expect($$('[data-testid=details-editor]')).toEqual([])
  await waitFor(async () => expect((await reload(w.id)).note).toBe('Ben och bröst'))
})

it('shows what its row in the list shows, with the same badge', async () => {
  const w = await seed(
    workout({
      date: '2026-09-23',
      sessionNumber: 102,
      note: 'lätt',
      exercises: [entry({ exerciseId: BENCH.id, targetSets: 1, targetReps: 8, sets: [{ reps: 8 }] })],
    }),
  )
  open(w.id)

  expect((await waitForElement('h1')).textContent).toBe('Bröst')
  expect(text($('[data-testid=workout-meta]'))).toBe('onsdag 23 sep. · 1 övning · Nr 102 · lätt')
  $('[data-testid=details] [data-testid=workout-icon]')
  const badge = $('[data-testid=details] [data-testid=status]')
  expect([badge.textContent, badge.getAttribute('data-status')]).toEqual(['Genomfört', 'Done'])
  expect(badge.classList).toContain('bg-green-100')
})

it('opens a workout scrolled to the top, also when the page is reused', async () => {
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  const first = await seed(workout({ date: '2026-09-21' }))
  const second = await seed(workout({ date: '2026-09-23' }))

  open(first.id)
  await waitFor(() => expect(scroll).toHaveBeenCalledTimes(1))

  // Another workout in the same app, without navigate (which scrolls on its own).
  act(() => {
    window.history.replaceState(null, '', `/workouts/${second.id}`)
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await waitFor(() => expect(scroll).toHaveBeenCalledTimes(2))

  act(() => window.dispatchEvent(new PopStateEvent('popstate')))
  await act(() => app.repository.getAll('workout'))
  expect(scroll).toHaveBeenCalledTimes(2)
})

it('derives the status from the sets, with no switch for it', async () => {
  const w = await seed(
    workout({
      date: '2026-09-23',
      status: 'Planned',
      exercises: [entry({ exerciseId: BENCH.id, targetSets: 3, targetReps: 8 })],
    }),
  )
  open(w.id)

  expect((await waitForElement('[data-testid=details]')).textContent).toContain('Planerat')
  expect($$('[role=radio]')).toEqual([])

  click($('[data-testid=set-next]'))

  await waitFor(() => expect($('[data-testid=details]').textContent).toContain('Påbörjat'))
  await waitFor(async () => expect((await reload(w.id)).status).toBe('InProgress'))

  click($('[data-testid=set-next]'))
  click(await waitForElement('[data-testid=set-next]'))
  await waitFor(() => expect($('[data-testid=details]').textContent).toContain('Genomfört'))
  await waitFor(async () => expect((await reload(w.id)).status).toBe('Done'))

  click($('[data-testid=set-done]'))
  click($('[data-testid=set-editor] [data-testid=remove-set]'))
  await waitFor(() => expect($('[data-testid=details]').textContent).toContain('Påbörjat'))
  click($('[data-testid=set-done]'))
  click($('[data-testid=set-editor] [data-testid=remove-set]'))
  click($('[data-testid=set-done]'))
  expect(text($('[data-testid=set-editor] [data-testid=remove-set]'))).toBe('Radera set')
  click($('[data-testid=set-editor] [data-testid=remove-set]'))

  await waitFor(() => expect($('[data-testid=details]').textContent).toContain('Planerat'))
  await waitFor(async () => expect((await reload(w.id)).status).toBe('Planned'))
})

it('asks before deleting, and then moves the workout to the trash', async () => {
  const w = await seed(workout({ date: '2026-09-23' }))
  open(w.id)

  const del = await waitFor(() => {
    const found = $$('button').filter((b) => text(b) === 'Ta bort passet')
    expect(found).toHaveLength(1)
    return found[0]!
  })
  click(del)
  expect(await app.repository.getAll('workout')).not.toEqual([])
  click($('[role=alertdialog] button'))

  await waitFor(async () => expect(await app.repository.getAll('workout')).toEqual([]))
  expect((await app.store.get(keyOf('workout', w.id)))?.isDeleted).toBe(true)
  expect((await app.repository.get('trashedWorkout', w.id))?.workout.id).toBe(w.id)
})

it('marks the first unfinished exercise today, and moves the mark on', async () => {
  const w = await seed(
    workout({
      date: '2026-09-23',
      exercises: [
        entry({ exerciseId: BENCH.id, order: 0, targetSets: 1, targetReps: 8 }),
        entry({ exerciseId: BENCH.id, order: 1, targetSets: 1, targetReps: 8 }),
      ],
    }),
  )
  open(w.id)

  await waitFor(() => expect(marks()).toEqual(['true', 'false']))
  expect($$('[data-testid=exercise-entry]')[0]!.getAttribute('aria-current')).toBe('step')

  click($$('[data-testid=set-next]')[0]!)

  await waitFor(() => expect(marks()).toEqual(['false', 'true']))
})

it('marks the exercise of a workout on another day too, so it can be logged afterwards', async () => {
  const w = await seed(
    workout({ date: '2026-09-21', exercises: [entry({ exerciseId: BENCH.id, targetSets: 3, targetReps: 8 })] }),
  )
  open(w.id)

  expect((await waitForElement('[data-testid=exercise-entry]')).getAttribute('data-current')).toBe('true')
  click($('[data-testid=unlock]'))
  click($('[data-testid=set-next]'))

  await waitFor(async () => expect((await reload(w.id)).exercises[0]!.sets).toHaveLength(1))
})

it("finishes cardio with one tap at last time's values, and clears it", async () => {
  const machine = walk()
  await saveExercise(machine)
  await saveWorkout(
    workout({
      date: '2026-09-21',
      status: 'Done',
      exercises: [entry({ exerciseId: machine.id, durationMinutes: 3.5, avgHeartRate: 130 })],
    }),
  )
  const w = await seed(
    workout({
      date: '2026-09-23',
      exercises: [
        entry({ exerciseId: machine.id, order: 0, settings: '60' }),
        entry({ exerciseId: BENCH.id, order: 1, targetSets: 3, targetReps: 8 }),
      ],
    }),
  )
  open(w.id)

  click(await waitForElement('[data-testid=cardio-next]'))

  await waitFor(() => expect(text($('[data-testid=cardio-done]'))).toBe('3,5 min · 130 bpm'))
  expect(marks()).toEqual(['false', 'true'])
  await waitFor(async () => {
    const saved = (await reload(w.id)).exercises[0]!
    expect([saved.durationMinutes, saved.distanceKm, saved.avgHeartRate]).toEqual([3.5, undefined, 130])
  })

  click($('[data-testid=cardio-done]'))
  click($('[data-testid=cardio-editor] [data-testid=clear-cardio]'))

  await waitForElement('[data-testid=cardio-next]')
  await waitFor(async () => expect((await reload(w.id)).exercises[0]!.durationMinutes).toBeUndefined())
})

it('opens the fields to finish cardio with nothing planned or done before', async () => {
  const machine = walk()
  await saveExercise(machine)
  const w = await seed(workout({ date: '2026-09-23', exercises: [entry({ exerciseId: machine.id })] }))
  open(w.id)

  click(await waitForElement('[data-testid=cardio-next]'))

  await waitForElement('[data-testid=cardio-editor]')
  expect($$('[data-testid=cardio-next]')).toEqual([])
  expect((await reload(w.id)).exercises[0]!.durationMinutes).toBeUndefined()

  click($('[data-testid=cardio-editor] [data-testid=close-editor]'))
  await waitForElement('[data-testid=cardio-next]')
})

it('records the plan before last time when cardio is finished', async () => {
  const machine = walk()
  await saveExercise(machine)
  await saveWorkout(
    workout({
      date: '2026-09-21',
      status: 'Done',
      exercises: [entry({ exerciseId: machine.id, durationMinutes: 3.5, distanceKm: 0.3, avgHeartRate: 130 })],
    }),
  )
  const w = await seed(
    workout({ date: '2026-09-23', exercises: [entry({ exerciseId: machine.id, targetDurationMinutes: 5 })] }),
  )
  open(w.id)

  click(await waitForElement('[data-testid=cardio-next]'))

  await waitFor(() => expect(text($('[data-testid=cardio-done]'))).toBe('5 min · 0,3 km · 130 bpm'))
})

it.each([
  ['thumbnail', 'illustration'],
  ['edit', 'editor'],
  ['set-done', 'set-editor'],
])('ends the card with the panel %s opens, so its close button is last', async (tap, panel) => {
  const w = await seed(
    workout({
      date: '2026-09-23',
      exercises: [entry({ exerciseId: BENCH.id, targetSets: 3, targetReps: 8, comment: 'tungt', sets: [{ reps: 8 }] })],
    }),
  )
  open(w.id)
  await waitForElement('[data-testid=comment]')

  click($(`[data-testid=${tap}]`))

  const card = $('[data-testid=exercise-entry]')
  expect([...card.children].at(-1)!.getAttribute('data-testid')).toBe(panel)
  expect($$('[data-testid=comment]', card)).toEqual([])
  expect(text($$('button', card).at(-1)!)).toBe('Stäng')
  if (panel === 'set-editor') expect($('[data-testid=set-done]', card).getAttribute('data-open')).toBe('true')
})

it('wraps sets three to a row and stops at ten', async () => {
  const sets: SetResult[] = Array.from({ length: 10 }, () => ({ reps: 8 }))
  const w = await seed(
    workout({ date: '2026-09-23', exercises: [entry({ exerciseId: BENCH.id, targetSets: 10, targetReps: 8, sets })] }),
  )
  open(w.id)

  expect((await waitForElement('[data-testid=sets]')).classList).toContain('grid-cols-3')
  expect($$('[data-testid=set-done]')).toHaveLength(10)

  click($('[data-testid=edit]'))
  expect(
    $('[data-testid=increase]', stepperFor($('[data-testid=target-editor]'), 'Set')).hasAttribute('disabled'),
  ).toBe(true)
})

it('shows on sets not yet done the plan they record', async () => {
  const w = await seed(
    workout({
      date: '2026-09-23',
      exercises: [
        entry({
          exerciseId: BENCH.id,
          targetSets: 3,
          targetReps: 8,
          targetWeightKg: 10,
          sets: [{ reps: 8, weightKg: 12.5 }],
        }),
      ],
    }),
  )
  open(w.id)

  const next = await waitForElement('[data-testid=set-next]')
  expect($$('span', next).map((x) => x.textContent)).toEqual(['8', '10 kg'])
  expect(next.getAttribute('aria-label')).toBe('Set 2: 8 × 10')
  expect($$('span', $('[data-testid=set-planned]')).map((x) => x.textContent)).toEqual(['8', '10 kg'])
})

it('just numbers a set with nothing planned', async () => {
  const w = await seed(workout({ date: '2026-09-23', exercises: [entry({ exerciseId: BENCH.id, targetSets: 2 })] }))
  open(w.id)

  expect(text(await waitForElement('[data-testid=set-next]'))).toBe('Set 1')
  expect(text($('[data-testid=set-planned]'))).toBe('Set 2')
})

it('shows on cardio not yet done the plan it records', async () => {
  const machine = walk()
  await saveExercise(machine)
  const w = await seed(
    workout({
      date: '2026-09-23',
      exercises: [
        entry({ exerciseId: machine.id, targetDurationMinutes: 5, targetDistanceKm: 0.4 }),
        entry({ exerciseId: machine.id, order: 1 }),
      ],
    }),
  )
  open(w.id)

  const next = await waitForElement('[data-testid=cardio-next]')
  expect($$('span', next).map((x) => x.textContent)).toEqual(['5 min', '0,4 km'])
  expect(next.getAttribute('aria-label')).toBe('Klar med 5 min · 0,4 km')
  expect($$('[data-testid=cardio-next]')).toHaveLength(1)
  expect($$('[data-testid=cardio]')).toHaveLength(1)
})

it('takes new sets only on the current exercise, while done sets and plus stay tappable', async () => {
  const w = await seed(
    workout({
      date: '2026-09-23',
      exercises: [
        entry({ exerciseId: BENCH.id, order: 0, targetSets: 1, targetReps: 8, sets: [{ reps: 8 }] }),
        entry({ exerciseId: BENCH.id, order: 1, targetSets: 2, targetReps: 8 }),
        entry({ exerciseId: BENCH.id, order: 2, targetSets: 2, targetReps: 8 }),
      ],
    }),
  )
  open(w.id)

  await waitFor(() => expect(marks()).toEqual(['false', 'true', 'false']))
  const cards = $$('[data-testid=exercise-entry]')
  expect($$('[data-testid=set-next]', cards[1])).toHaveLength(1)
  expect($$('[data-testid=sets]', cards[2])).toEqual([])
  expect($$('[data-testid=set-next]', cards[2])).toEqual([])

  // Another set is planned with Set in the editor, and the exercise is the current one again.
  click($('[data-testid=edit]', cards[0]))
  click($('[data-testid=increase]', stepperFor($('[data-testid=target-editor]'), 'Set')))
  click($('[data-testid=close-editor]'))
  click(await waitForElement('[data-testid=set-next]'))
  await waitFor(async () => expect((await reload(w.id)).exercises[0]!.sets).toHaveLength(2))
  click($('[data-testid=set-done]', $$('[data-testid=exercise-entry]')[0]))
  await waitForElement('[data-testid=set-editor]')
})

it('shows last time as the plan of cardio with no plan of its own', async () => {
  const machine = walk()
  await saveExercise(machine)
  await saveWorkout(
    workout({
      date: '2026-09-21',
      status: 'Done',
      exercises: [entry({ exerciseId: machine.id, durationMinutes: 3.5, distanceKm: 0.3, avgHeartRate: 130 })],
    }),
  )
  const w = await seed(workout({ date: '2026-09-23', exercises: [entry({ exerciseId: machine.id, settings: '60' })] }))
  open(w.id)

  expect(text(await waitForElement('[data-testid=target]'))).toBe('3,5 min · 0,3 km · 60')
  click($('[data-testid=edit]'))
  const editor = $('[data-testid=target-editor]')
  expect($('input', stepperFor(editor, 'Minuter')).getAttribute('value')).toBe('3.5')
  expect($('input', stepperFor(editor, 'km')).getAttribute('value')).toBe('0.3')

  click($('[data-testid=increase]', stepperFor(editor, 'Minuter')))

  await waitFor(async () => {
    const saved = (await reload(w.id)).exercises[0]!
    expect([saved.targetDurationMinutes, saved.targetDistanceKm, saved.durationMinutes]).toEqual([4, 0.3, undefined])
  })
})

it('skips the rest of an exercise to move on, and undoes the skip', async () => {
  const w = await seed(
    workout({
      date: '2026-09-23',
      exercises: [
        entry({ exerciseId: BENCH.id, order: 0, targetSets: 3, targetReps: 8, sets: [{ reps: 8 }] }),
        entry({ exerciseId: BENCH.id, order: 1, targetSets: 3, targetReps: 8 }),
      ],
    }),
  )
  open(w.id)

  expect($$('[data-testid=skip]')).toEqual([])
  click((await waitForElements('[data-testid=edit]'))[0]!)
  const skip = await waitForElement('[data-testid=skip]')
  expect(text(skip)).toBe('Hoppa över resten')
  expect($$('[data-testid=skip]')).toHaveLength(1)
  click(skip)

  await waitFor(() => expect(marks()).toEqual(['false', 'true']))
  const first = $$('[data-testid=exercise-entry]')[0]!
  expect($$('[data-testid=set-planned]', first).map((x) => x.getAttribute('data-skipped'))).toEqual(['true', 'true'])
  click($$('[data-testid=edit]')[1]!)
  expect(text($('[data-testid=skip]', $$('[data-testid=exercise-entry]')[1]))).toBe('Hoppa över övningen')
  await waitFor(async () => {
    const saved = (await reload(w.id)).exercises[0]!
    expect([saved.isSkipped, saved.targetSets, saved.sets.length]).toEqual([true, 3, 1])
  })

  click($$('[data-testid=edit]')[0]!)
  click($('[data-testid=unskip]', $$('[data-testid=exercise-entry]')[0]))

  await waitFor(() => expect(marks()).toEqual(['true', 'false']))
  await waitFor(async () => expect((await reload(w.id)).exercises[0]!.isSkipped).toBe(false))
})

it('offers no skip in a template', async () => {
  const template: WorkoutTemplate = {
    id: newId(),
    name: 'Bröst',
    exercises: [entry({ exerciseId: BENCH.id, targetSets: 3, targetReps: 8 })],
  }
  await saveExercise(BENCH)
  await app.repository.save('template', template.id, template)

  app.renderAt(`/templates/${template.id}`)

  await waitForElement('[data-testid=exercise-entry]')
  expect($$('[data-testid=skip]')).toEqual([])
})

it('writes the comment in a text area over several lines', async () => {
  const w = await seed(
    workout({
      date: '2026-09-23',
      exercises: [entry({ exerciseId: BENCH.id, targetSets: 3, targetReps: 8, comment: 'tungt' })],
    }),
  )
  open(w.id)

  click(await waitForElement('[data-testid=edit]'))
  const comment = $<HTMLTextAreaElement>('[data-testid=editor] textarea')
  expect(comment.value).toBe('tungt')
  change(comment, 'tungt\nsista setet kort')

  await waitFor(async () => expect((await reload(w.id)).exercises[0]!.comment).toBe('tungt\nsista setet kort'))
})

it('keeps a comment when leaving its field by tapping a button that saves too', async () => {
  const w = await seed(
    workout({
      date: '2026-09-23',
      exercises: [entry({ exerciseId: BENCH.id, targetSets: 3, targetReps: 8 })],
    }),
  )
  open(w.id)
  click(await waitForElement('[data-testid=edit]'))

  // Tapping + moves focus out of the comment: its change fires first, then the click, with no
  // render between them unless the change forces one. Dispatched as the browser does, not through
  // fireEvent, whose act() would render in between and hide the problem.
  const comment = $<HTMLTextAreaElement>('[data-testid=editor] textarea')
  comment.value = 'tungt'
  comment.dispatchEvent(new Event('change', { bubbles: true }))
  click($('[data-testid=increase]', stepperFor($('[data-testid=target-editor]'), 'Rep')))

  await waitFor(async () => {
    const saved = (await reload(w.id)).exercises[0]!
    expect([saved.comment, saved.targetReps]).toEqual(['tungt', 9])
  })
})

it('shows only the top row of exercises neither current nor done', async () => {
  const w = await seed(
    workout({
      date: '2026-09-23',
      exercises: [
        entry({ exerciseId: BENCH.id, order: 0, targetSets: 2, targetReps: 8, sets: [{ reps: 8 }, { reps: 8 }] }),
        entry({ exerciseId: BENCH.id, order: 1, targetSets: 3, targetReps: 8, sets: [{ reps: 8 }], isSkipped: true }),
        entry({ exerciseId: BENCH.id, order: 2, targetSets: 3, targetReps: 8 }),
        entry({ exerciseId: BENCH.id, order: 3, targetSets: 3, targetReps: 8, comment: 'tungt' }),
      ],
    }),
  )
  open(w.id)

  await waitFor(() =>
    expect($$('[data-testid=exercise-entry]').map((c) => c.querySelector('[data-testid=sets]') !== null)).toEqual([
      true,
      true,
      true,
      false,
    ]),
  )
  const quiet = $$('[data-testid=exercise-entry]')[3]!
  expect(quiet.querySelector('[data-testid=comment]')).toBeNull()
  expect(text($('[data-testid=target]', quiet))).toBe('3 × 8')

  click($('[data-testid=edit]', quiet))
  expect($$('[data-testid=exercise-entry]')[3]!.querySelector('[data-testid=editor]')).not.toBeNull()
})

it('shows only the struck top row of an exercise skipped whole', async () => {
  const w = await seed(
    workout({
      date: '2026-09-23',
      exercises: [
        entry({ exerciseId: BENCH.id, order: 0, targetSets: 3, targetReps: 8, isSkipped: true }),
        entry({ exerciseId: BENCH.id, order: 1, targetSets: 3, targetReps: 8, sets: [{ reps: 8 }], isSkipped: true }),
        entry({ exerciseId: BENCH.id, order: 2, targetSets: 3, targetReps: 8 }),
      ],
    }),
  )
  open(w.id)

  const cards = await waitForElements('[data-testid=exercise-entry]')
  expect(cards[0]!.querySelector('[data-testid=sets]')).toBeNull()
  expect($('h3', cards[0]).getAttribute('data-skipped')).toBe('true')
  expect($('h3', cards[0]).textContent).toContain('Överhoppad')
  expect($('[data-testid=target]', cards[0]).classList).toContain('line-through')

  expect($('h3', cards[1]).getAttribute('data-skipped')).toBe('false')
  expect($$('[data-testid=set-planned]', cards[1]).map((x) => x.getAttribute('data-skipped'))).toEqual(['true', 'true'])
})

it('moves the sets aside while the editor is open', async () => {
  const w = await seed(
    workout({ date: '2026-09-23', exercises: [entry({ exerciseId: BENCH.id, targetSets: 3, targetReps: 8 })] }),
  )
  open(w.id)

  await waitForElement('[data-testid=sets]')
  click($('[data-testid=edit]'))
  expect($$('[data-testid=sets]')).toEqual([])

  click($('[data-testid=close-editor]'))
  await waitForElement('[data-testid=sets]')

  click($('[data-testid=settings-line]'))
  $('[data-testid=editor]')
  expect($$('[data-testid=sets]')).toEqual([])
})

it('has the check of a done set beside the number', async () => {
  const w = await seed(
    workout({
      date: '2026-09-23',
      exercises: [entry({ exerciseId: BENCH.id, targetSets: 2, targetReps: 8, sets: [{ reps: 8 }] })],
    }),
  )
  open(w.id)

  const check = await waitForElement('[data-testid=set-done] [data-testid=check]')
  expect(check.classList).not.toContain('absolute')
  expect(text(check.parentElement!)).toBe('8')
})

it('shows and records only minutes for cardio measured by time alone', async () => {
  const machine = walk({ measuresTimeOnly: true })
  await saveExercise(machine)
  await saveWorkout(
    workout({
      date: '2026-09-21',
      status: 'Done',
      exercises: [entry({ exerciseId: machine.id, durationMinutes: 3.5, distanceKm: 0, avgHeartRate: 130 })],
    }),
  )
  const w = await seed(workout({ date: '2026-09-23', exercises: [entry({ exerciseId: machine.id, settings: '60' })] }))
  open(w.id)

  expect(text(await waitForElement('[data-testid=target]'))).toBe('3,5 min · 60')
  expect($('[data-testid=last-time]').getAttribute('aria-label')).toBe(
    'Förra gången: mån 21 sep (2 dagar sedan), 3,5 min',
  )
  expect($$('span', $('[data-testid=cardio-next]')).map((x) => x.textContent)).toEqual(['3,5 min'])

  click($('[data-testid=cardio-next]'))
  await waitFor(async () => {
    const saved = (await reload(w.id)).exercises[0]!
    expect([saved.durationMinutes, saved.distanceKm, saved.avgHeartRate]).toEqual([3.5, undefined, undefined])
  })

  click($('[data-testid=cardio-done]'))
  expect(
    $$('[data-testid=stepper]', $('[data-testid=cardio-editor]')).map((x) => x.getAttribute('data-label')),
  ).toEqual(['Minuter'])
  click($('[data-testid=cardio-editor] [data-testid=close-editor]'))
  click($('[data-testid=edit]'))
  expect(
    $$('[data-testid=stepper]', $('[data-testid=target-editor]')).map((x) => x.getAttribute('data-label')),
  ).toEqual(['Minuter'])
})

it('wraps the name of the current exercise only', async () => {
  const w = await seed(
    workout({
      date: '2026-09-23',
      exercises: [
        entry({ exerciseId: BENCH.id, order: 0, targetSets: 3, targetReps: 8 }),
        entry({ exerciseId: BENCH.id, order: 1, targetSets: 3, targetReps: 8 }),
      ],
    }),
  )
  open(w.id)

  await waitFor(() =>
    expect($$('[data-testid=exercise-entry] h3').map((h) => h.classList.contains('truncate'))).toEqual([false, true]),
  )
})

it('gives the comment a line of its own that opens the editor', async () => {
  const w = await seed(
    workout({
      date: '2026-09-23',
      exercises: [entry({ exerciseId: BENCH.id, targetSets: 3, targetReps: 8, comment: 'tungt\nsista kort' })],
    }),
  )
  open(w.id)

  const comment = await waitForElement('[data-testid=comment]')
  expect(text(comment)).toBe('tungt\nsista kort')
  expect(comment.querySelector('svg')).not.toBeNull()
  expect($('[data-testid=settings-line]').textContent).not.toContain('tungt')

  click(comment)
  $('[data-testid=editor]')
  expect($$('[data-testid=comment]')).toEqual([])
})

it('opens a workout of an earlier day locked, and saves nothing until it is unlocked', async () => {
  const w = await seed(
    workout({ date: '2026-09-22', exercises: [entry({ exerciseId: BENCH.id, targetSets: 3, targetReps: 8 })] }),
  )
  open(w.id)

  expect((await waitForElement('[data-testid=locked]')).textContent).toContain(
    'Passet är från en tidigare dag och är låst.',
  )
  expect($('[data-testid=workout-body]').hasAttribute('disabled')).toBe(true)
  expect($('[data-testid=workout-meta]').hasAttribute('disabled')).toBe(true)
  // The browser does not click a disabled button; the page refuses to save if it happens anyway.
  click($('[data-testid=set-next]'))
  click($('[data-testid=workout-meta]'))
  expect($$('[data-testid=details-editor]')).toEqual([])
  expect((await reload(w.id)).exercises[0]!.sets).toEqual([])

  click($('[data-testid=unlock]'))

  expect($$('[data-testid=locked]')).toEqual([])
  expect($('[data-testid=workout-body]').hasAttribute('disabled')).toBe(false)
  click($('[data-testid=set-next]'))
  await waitFor(async () => expect((await reload(w.id)).exercises[0]!.sets).toHaveLength(1))

  click($('[data-testid=lock]'))
  expect($('[data-testid=workout-body]').hasAttribute('disabled')).toBe(true)
})

it.each([23, 25])('does not lock today or a later day (%i September)', async (day) => {
  const w = await seed(workout({ date: `2026-09-${day}` }))
  open(w.id)

  expect((await waitForElement('[data-testid=workout-body]')).hasAttribute('disabled')).toBe(false)
  expect($$('[data-testid=locked]')).toEqual([])
  expect($$('[data-testid=lock]')).toEqual([])
})

it('keeps an unlocked workout unlocked when a sync reloads it', async () => {
  const w = await seed(workout({ date: '2026-09-21' }))
  open(w.id)
  click(await waitForElement('[data-testid=unlock]'))

  await act(() => app.engine.sync())

  expect($('[data-testid=workout-body]').hasAttribute('disabled')).toBe(false)
})
