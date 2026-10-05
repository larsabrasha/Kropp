// @vitest-environment happy-dom
import { waitFor } from '@testing-library/react'
import { expect, it } from 'vitest'
import {
  $,
  $$,
  app,
  BENCH,
  change,
  click,
  entry,
  marks,
  open,
  reload,
  saveExercise,
  saveWorkout,
  seed,
  stepperFor,
  text,
  waitForElement,
  waitForElements,
  workout,
} from '../test/workoutPage'
import { newId, type SetResult, type WorkoutTemplate } from '../training/model'

// The set buttons of a strength, bodyweight or timed exercise, the plan's editor, and skipping.

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
  expect($$('button', kg.children[1]!.children[1]).map((b) => b.getAttribute('data-testid'))).toEqual([
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
