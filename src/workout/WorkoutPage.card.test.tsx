// @vitest-environment happy-dom
import { waitFor } from '@testing-library/react'
import { expect, it } from 'vitest'
import { picture } from '../illustrations/illustrations'
import {
  $,
  $$,
  BENCH,
  change,
  click,
  entry,
  open,
  reload,
  seed,
  stepperFor,
  text,
  waitForElement,
  waitForElements,
  workout,
} from '../test/workoutPage'

// What a card shows besides its sets: the picture, last time, settings and comments, and how quiet
// the cards not yet reached stay.

it('shows the picture small on the row and large in the sheet the row opens, with the way to the exercise', async () => {
  const w = await seed(
    workout({ date: '2026-09-23', exercises: [entry({ exerciseId: BENCH.id, targetSets: 3, targetReps: 8 })] }),
  )
  open(w.id)

  const thumbnail = await waitForElement('[data-testid=thumbnail]')
  const image = picture('machine-chest-press')
  expect($('img', thumbnail).getAttribute('src')).toBe(image)

  // Only part of the row: a tap anywhere on it opens the one sheet.
  expect(thumbnail.tagName).toBe('SPAN')
  click($('[data-testid=edit]'))
  expect($('[data-testid=entry-sheet] [data-testid=illustration-large] img').getAttribute('src')).toBe(image)
  expect($$('[data-testid=illustration-picker]')).toEqual([])
  expect($('[data-testid=entry-sheet]').textContent).not.toContain('Bryl Lim')
  // The exercise itself is pushed inside the same sheet, never a sheet over it.
  click($('[data-testid=entry-sheet] [data-testid=edit-exercise]'))
  expect($$('[role=dialog]')).toHaveLength(1)
  expect(text($('[data-testid=entry-sheet] h2'))).toBe(BENCH.name)
  expect($('[data-testid=entry-sheet] [data-testid=usage]')).toBeTruthy()
  expect($$('[data-testid=entry-sheet] [data-testid=target-editor]')).toEqual([])
  expect(window.location.pathname).toBe(`/workouts/${w.id}`)

  // Renamed there, the card has the new name at once; the way back is the sheet's own.
  const name = $<HTMLInputElement>('[data-testid=entry-sheet] input[type=text]')
  change(name, 'Bröstpress')
  await waitFor(() => expect(text($('[data-testid=exercise-entry] h3'))).toBe('Bröstpress'))
  click($('[data-testid=sheet-back]'))
  expect($('[data-testid=entry-sheet] [data-testid=target-editor]')).toBeTruthy()
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
  expect(text($('[data-testid=editor] [data-testid=edit-exercise]'))).toBe('Redigera Bröst maskin')

  click($('[data-testid=edit]'))
  expect($$('[data-testid=weight-step]')).toEqual([])
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
  expect(text($('[data-testid=last-sets]', last))).toBe('8, 8, 10 × 60 kg')
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
  expect(text($('[data-testid=skipped]', cards[0]))).toBe('Överhoppad ·')
  expect($$('.line-through', cards[0])).toEqual([])

  expect($('h3', cards[1]).getAttribute('data-skipped')).toBe('false')
  expect($$('[data-testid=set-planned]', cards[1]).map((x) => x.getAttribute('data-skipped'))).toEqual(['true', 'true'])
  expect($$('[data-testid=set-planned] [data-testid=skip-mark]', cards[1])).toHaveLength(2)
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

it('gives the comment a line of its own, to read', async () => {
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

  expect(comment.tagName).toBe('P')
  // The editor is a sheet over the card, which keeps its comment line under it.
  click($('[data-testid=edit]'))
  $('[data-testid=entry-sheet] [data-testid=editor]')
  expect($$('[data-testid=comment]')).toHaveLength(1)
})
