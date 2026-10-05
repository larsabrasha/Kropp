import { addDays, mondayOf } from './dates'
import {
  cardioTargetKm,
  cardioTargetMinutes,
  compareOptional,
  hasHappened,
  lastTime,
  statusOf,
  type FindExercise,
} from './editing'
import { daysBetweenSessions, type DateOnly, type UserSettings, type Workout, type WorkoutTemplate } from './model'

// What to do next and when: templates, the suggested next template and the suggested day.

/** A workout counts as one of a template's when this share of their exercises match. */
const SIMILARITY_THRESHOLD = 0.5

/**
 * A planned workout from a template. Each exercise starts from what it was last time, so the
 * plan continues where training left off; the template's targets are for exercises never done.
 */
export function planFrom(
  template: WorkoutTemplate,
  id: string,
  date: DateOnly,
  sessionNumber: number,
  history: readonly Workout[],
): Workout {
  const plan: Workout = { id, date, sessionNumber, status: 'Planned', templateId: template.id, exercises: [] }
  return {
    ...plan,
    exercises: template.exercises.map((entry, i) => {
      const last = lastTime(history, plan, entry.exerciseId)
      return {
        ...entry,
        order: i,
        sets: [],
        comment: undefined,
        targetSets: last?.targetSets ?? entry.targetSets,
        targetReps: last?.targetReps ?? entry.targetReps,
        targetWeightKg: last?.targetWeightKg ?? entry.targetWeightKg,
        targetSeconds: last?.targetSeconds ?? entry.targetSeconds,
        targetDurationMinutes: last?.targetDurationMinutes ?? cardioTargetMinutes(entry),
        targetDistanceKm: last?.targetDistanceKm ?? cardioTargetKm(entry),
        settings: last?.settings ?? entry.settings,
        // A plan has nothing done yet, whatever the template holds.
        isSkipped: false,
        durationMinutes: undefined,
        distanceKm: undefined,
        avgHeartRate: undefined,
      }
    }),
  }
}

/**
 * When the template was last done: by the template it was planned from, or for older workouts
 * by how many exercises they share with it. Cardio is left out of the comparison, as in naming.
 */
export function lastDone(
  template: WorkoutTemplate,
  workouts: readonly Workout[],
  exercise: FindExercise,
): DateOnly | undefined {
  const templateCore = core(template.exercises, exercise)
  return maxOf(
    workouts
      .filter(hasHappened)
      .filter(
        (w) =>
          w.templateId === template.id ||
          (w.templateId === undefined && similarity(templateCore, core(w.exercises, exercise)) >= SIMILARITY_THRESHOLD),
      )
      .map((w) => w.date),
  )
}

/**
 * The template done longest ago; one never done comes first. Ties keep the given order. A template
 * something is already planned from counts as used on that plan's day, so it is not suggested twice.
 */
export function suggestTemplate(
  templates: readonly WorkoutTemplate[],
  workouts: readonly Workout[],
  exercise: FindExercise,
  today: DateOnly,
): WorkoutTemplate | undefined {
  const planned = workouts.filter(
    (w) => w.templateId !== undefined && statusOf(w, today) === 'Planned' && w.date >= today,
  )
  const plannedFor = (t: WorkoutTemplate) => maxOf(planned.filter((w) => w.templateId === t.id).map((w) => w.date))
  return templates
    .map((t, i) => ({ t, i, last: maxOf([lastDone(t, workouts, exercise), plannedFor(t)]) ?? '' }))
    .sort((a, b) => a.last.localeCompare(b.last) || a.i - b.i)[0]?.t
}

/**
 * daysBetweenSessions after the last session, but not before today. When that week already holds
 * sessionsPerWeek sessions, the Monday after it.
 */
export function suggestDate(workouts: readonly Workout[], today: DateOnly, settings: UserSettings): DateOnly {
  const done = workouts.filter(hasHappened).map((w) => w.date)
  const last = maxOf(done)
  const next = last !== undefined ? addDays(last, daysBetweenSessions(settings)) : today
  const candidate = next > today ? next : today

  const monday = mondayOf(candidate)
  const sunday = addDays(monday, 7)
  const inWeek = done.filter((d) => d >= monday && d < sunday).length
  return inWeek >= settings.sessionsPerWeek ? sunday : candidate
}

/**
 * The day for a workout planned while upcoming is already planned: the usual suggestion, but no
 * sooner than the days between sessions after that plan.
 */
export function suggestDateAfter(
  upcomingPlan: Workout,
  workouts: readonly Workout[],
  today: DateOnly,
  settings: UserSettings,
): DateOnly {
  const usual = suggestDate(workouts, today, settings)
  const afterPlan = addDays(upcomingPlan.date, daysBetweenSessions(settings))
  return usual > afterPlan ? usual : afterPlan
}

/** The earliest planned workout from today on, which the suggestion then is. */
export function upcoming(workouts: readonly Workout[], today: DateOnly): Workout | undefined {
  return workouts
    .filter((w) => {
      if (w.date < today) return false
      const status = statusOf(w, today)
      return status === 'Planned' || status === 'InProgress'
    })
    .sort((a, b) => a.date.localeCompare(b.date) || compareOptional(a.sessionNumber, b.sessionNumber))[0]
}

function maxOf(dates: readonly (DateOnly | undefined)[]): DateOnly | undefined {
  let max: DateOnly | undefined
  for (const d of dates) if (d !== undefined && (max === undefined || d > max)) max = d
  return max
}

function core(entries: readonly { exerciseId: string }[], exercise: FindExercise): Set<string> {
  return new Set(entries.filter((e) => exercise(e.exerciseId)?.kind !== 'Cardio').map((e) => e.exerciseId))
}

function similarity(a: Set<string>, b: Set<string>): number {
  const union = new Set([...a, ...b]).size
  if (union === 0) return 0
  return [...a].filter((x) => b.has(x)).length / union
}
