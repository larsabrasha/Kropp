import { expect, it } from 'vitest'
import { formatOrdinal, setLanguage } from '../i18n/i18n'
import type { Workout } from '../training/model'
import { cheerFor, isMilestone } from './journey'

let next = 0
const workout = (date: string): Workout => ({
  id: `w${String(next++).padStart(3, '0')}`,
  date,
  status: 'Done',
  exercises: [{ exerciseId: 'bench', order: 0, sets: [{ reps: 10, weightKg: 50 }], isSkipped: false }],
})

it('praises the first workout, then by what is true on its own day', () => {
  const [a, b, c, d] = [workout('2026-09-01'), workout('2026-09-03'), workout('2026-09-05'), workout('2026-09-08')]
  const all = [d, c, b, a]

  expect(cheerFor(a, all, 3)).toEqual({ kind: 'first', number: 1, inMonth: 1 })
  expect(cheerFor(b, all, 3)).toEqual({ kind: 'more', number: 2, inMonth: 2 })
  // The third of its week: the goal of three is reached by it, not by the ones before.
  expect(cheerFor(c, all, 3)).toEqual({ kind: 'goal', number: 3, inMonth: 3 })
  expect(cheerFor(d, all, 3)).toEqual({ kind: 'more', number: 4, inMonth: 4 })
})

it('welcomes back after three weeks or more, and never counts what came after', () => {
  const [a, b, c] = [workout('2026-08-01'), workout('2026-08-22'), workout('2026-08-25')]

  expect(cheerFor(b, [a, b, c], 5)?.kind).toBe('back')
  expect(cheerFor(c, [a, b, c], 5)?.kind).toBe('more')
  expect(cheerFor(b, [a, b, c], 5)?.number).toBe(2)
})

it('gives two workouts on one day a place each, and nothing to a workout not logged', () => {
  const [a, b] = [workout('2026-09-01'), workout('2026-09-01')]

  expect([cheerFor(a, [b, a], 3)?.number, cheerFor(b, [b, a], 3)?.number]).toEqual([1, 2])
  expect(cheerFor(workout('2026-09-02'), [a, b], 3)).toBeUndefined()
})

it('marks the round numbers as milestones, ahead of any other praise', () => {
  expect([1, 9, 10, 25, 50, 75, 100, 125, 150, 1000].filter(isMilestone)).toEqual([10, 25, 50, 75, 100, 150, 1000])
  const nine = Array.from({ length: 9 }, (_, i) => workout(`2026-01-${String(i + 1).padStart(2, '0')}`))
  const ten = [...nine, workout('2026-06-01')]

  // The tenth comes back after months, but the milestone is the bigger news.
  expect(cheerFor(ten[9]!, ten, 3)?.kind).toBe('milestone')
})

it('writes ordinals in both languages', () => {
  setLanguage('sv')
  expect([1, 2, 3, 11, 12, 21, 22, 101, 214].map(formatOrdinal)).toEqual([
    '1:a',
    '2:a',
    '3:e',
    '11:e',
    '12:e',
    '21:a',
    '22:a',
    '101:a',
    '214:e',
  ])
  setLanguage('en')
  expect([1, 2, 3, 4, 11, 12, 13, 21, 112].map(formatOrdinal)).toEqual([
    '1st',
    '2nd',
    '3rd',
    '4th',
    '11th',
    '12th',
    '13th',
    '21st',
    '112th',
  ])
  setLanguage('sv')
})
