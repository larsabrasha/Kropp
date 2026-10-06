import { capitalize, formatDate, t } from '../i18n/i18n'
import { slugFor } from '../illustrations/illustrations'
import { Link } from '../route'
import { iconFor, workoutName, type ExerciseMap } from '../training/categories'
import { hasResult, statusOf } from '../training/editing'
import type { DateOnly, Workout } from '../training/model'
import { target } from '../training/text'
import { Picture } from '../ui/Picture'

// The workout up next, as the large card at the top of the home page: what it is called and when,
// its exercises with their plan, when it was done last, and one large button into it. The card is
// what the app is opened for, so it shows enough to start without opening anything first; as
// iOS's Fitness shows the workout at hand on a card of its own. The whole card is the link.

/** As many exercises as the card lists; the rest are counted. */
const SHOWN = 3

export function NextWorkoutCard({
  workout,
  exercises,
  history,
  day,
}: {
  workout: Workout
  exercises: ExerciseMap
  /** Every workout, for the last time this one's template was done. */
  history: readonly Workout[]
  day: DateOnly
}) {
  const status = statusOf(workout, day)
  const count = workout.exercises.length
  // The day itself; how far away it is heads the section above the card (HomePage).
  const meta = [
    capitalize(formatDate(workout.date, 'dddd d MMM')),
    workout.sessionNumber !== undefined ? t('Home.SessionShort', workout.sessionNumber) : undefined,
    count === 1 ? t('Home.ExerciseCountOne') : t('Home.ExerciseCount', count),
  ].filter((x) => x !== undefined)

  // The last time the same template was done, before this one.
  const last =
    workout.templateId === undefined
      ? undefined
      : history
          .filter((w) => w.id !== workout.id && w.templateId === workout.templateId && w.date < workout.date)
          .filter((w) => statusOf(w, day) === 'Done')
          .reduce<Workout | undefined>((a, b) => (a === undefined || b.date > a.date ? b : a), undefined)

  const action = status === 'InProgress' ? t('Next.Continue') : workout.date === day ? t('Next.Start') : t('Next.Open')

  return (
    <Link
      href={`/workouts/${workout.id}`}
      className="block rounded-[1.625rem] bg-green-50 p-4 ring-1 ring-green-600/15 ring-inset active:bg-green-100 focus-visible:outline-2 focus-visible:outline-blue-500 dark:bg-green-950/50 dark:ring-green-400/20 dark:active:bg-green-900/60"
      data-testid="upcoming"
    >
      <span className="flex items-center gap-3">
        <Picture slug={iconFor(workout, exercises)} size="plan" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-2xl leading-tight font-bold">
            {workoutName(workout, exercises) ?? t('Home.Heading')}
          </span>
          <span className="block text-[0.9375rem] text-green-800 dark:text-green-300" data-testid="upcoming-meta">
            {meta.join(' · ')}
          </span>
        </span>
      </span>

      {count > 0 && (
        <span className="mt-3 block rounded-2xl bg-white px-3 dark:bg-gray-900" data-testid="upcoming-exercises">
          {workout.exercises.slice(0, SHOWN).map((entry, i) => {
            const exercise = exercises.get(entry.exerciseId)
            const kind = exercise?.kind ?? 'Strength'
            // Begun: how far it has come; else its plan.
            const detail =
              status === 'InProgress' && entry.targetSets !== undefined && kind !== 'Cardio'
                ? t('Next.SetsDone', entry.sets.length, entry.targetSets)
                : status === 'InProgress' && hasResult(entry)
                  ? t('Workout.Status.Done')
                  : target(entry, kind)
            const slug = slugFor(exercise)
            return (
              <span
                key={i}
                className={`flex items-center gap-3 py-1.5 text-[0.9375rem] ${i > 0 ? 'border-t-[0.5px] border-separator' : ''}`}
                data-testid="upcoming-exercise"
              >
                {/* The exercise's picture, as on its card in the workout: what to do, at a glance. */}
                <Picture slug={slug} size="list" />
                <span className="min-w-0 flex-1 truncate">{exercise?.name ?? t('Exercise.Unknown')}</span>
                <span className="shrink-0 text-label-2 tabular-nums">{detail}</span>
              </span>
            )
          })}
          {count > SHOWN && (
            <span className="block border-t-[0.5px] border-separator py-2 pl-12 text-[0.9375rem] text-label-2">
              {count - SHOWN === 1 ? t('Next.MoreExercisesOne') : t('Next.MoreExercises', count - SHOWN)}
            </span>
          )}
        </span>
      )}

      {last !== undefined && (
        <span className="mt-3 block text-[0.9375rem] text-green-800 dark:text-green-300" data-testid="upcoming-last">
          {t('Entry.LastTime', formatDate(last.date, 'ddd d MMM').replaceAll('.', ''))}
        </span>
      )}

      {/* Not a button of its own: the card is the link, this only says what a tap does. */}
      {/* green-700 under the white text, not green-600: 17pt is not large text, so it needs 4.5:1. */}
      <span
        className="mt-4 flex min-h-[3.25rem] w-full items-center justify-center rounded-full bg-green-700 px-6 text-[1.0625rem] font-semibold text-white"
        data-testid="upcoming-action"
      >
        {action}
      </span>
    </Link>
  )
}
