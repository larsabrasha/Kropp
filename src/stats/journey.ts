import { daysBetween, mondayOf } from '../training/dates'
import type { Workout } from '../training/model'

// Training as a long journey: why each workout is worth a word of praise. Only what was done
// counts, and only to add: nothing here can ever go down or tell the user what they did not do.
// It takes the logged workouts (stats.ts, logged).

/** Why a workout is worth praise, the first that holds: first, a milestone, back, the week's goal, or one more. */
export type CheerKind = 'first' | 'milestone' | 'back' | 'goal' | 'more'

export interface Cheer {
  kind: CheerKind
  /** Which workout it is of all, from 1. */
  number: number
  /** Which it is in its month, from 1. */
  inMonth: number
}

/** Days since the workout before after which a workout is a return. */
export const BACK_AFTER_DAYS = 21

/** The round numbers of workouts worth a milestone: 10, 25, 50, 75, then every 50. */
export const isMilestone = (n: number) => n === 10 || n === 25 || n === 75 || (n >= 50 && n % 50 === 0)

// Workouts on one day go by id, so each has its own place however the store returns them.
const before = (a: Workout, b: Workout) => a.date < b.date || (a.date === b.date && a.id < b.id)

/**
 * The praise for a workout, by what was true on its own day: the 87th workout stays the 87th when
 * opened a year later. Undefined for a workout not among the logged.
 */
export function cheerFor(workout: Workout, logged: readonly Workout[], goal: number): Cheer | undefined {
  if (!logged.some((w) => w.id === workout.id)) return undefined
  const upTo = logged.filter((w) => w.id === workout.id || before(w, workout))
  const previous = upTo
    .filter((w) => w.id !== workout.id)
    .reduce<Workout | undefined>((last, w) => (last === undefined || before(last, w) ? w : last), undefined)
  const number = upTo.length
  const inWeek = upTo.filter((w) => mondayOf(w.date) === mondayOf(workout.date)).length
  const inMonth = upTo.filter((w) => w.date.slice(0, 7) === workout.date.slice(0, 7)).length
  const kind: CheerKind =
    number === 1
      ? 'first'
      : isMilestone(number)
        ? 'milestone'
        : previous !== undefined && daysBetween(previous.date, workout.date) >= BACK_AFTER_DAYS
          ? 'back'
          : inWeek === goal
            ? 'goal'
            : 'more'
  return { kind, number, inMonth }
}
