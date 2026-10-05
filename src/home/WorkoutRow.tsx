import { formatDate, t } from '../i18n/i18n'
import { picture } from '../illustrations/illustrations'
import { Link } from '../route'
import { iconFor, workoutName, type ExerciseMap } from '../training/categories'
import { statusOf } from '../training/editing'
import type { DateOnly, Workout } from '../training/model'
import { StatusBadge } from '../ui/StatusBadge'

// One workout as a link, the same row on the home page and in the calendar.

export interface WorkoutRowProps {
  workout: Workout
  exercises: ExerciseMap
  today: DateOnly
  /** Where the row leads; the workout itself unless given. */
  href?: string
}

export function WorkoutRow({ workout, exercises, today, href }: WorkoutRowProps) {
  const name = workoutName(workout, exercises)
  const icon = iconFor(workout, exercises)
  const status = statusOf(workout, today)
  const count = workout.exercises.length

  return (
    <Link
      href={href ?? `/workouts/${workout.id}`}
      className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800"
    >
      <span className="size-12 shrink-0 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800" aria-hidden="true">
        {icon !== undefined && (
          <img
            src={picture(icon)}
            alt=""
            className="illustration size-full object-contain p-1"
            data-testid="workout-icon"
          />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate font-semibold" data-testid="workout-name">
            {name ?? workout.note ?? t('Home.Heading')}
          </span>
          <StatusBadge status={status} />
        </span>
        <span className="block truncate text-sm text-gray-500 dark:text-gray-400" data-testid="workout-meta">
          <span className="first-letter:uppercase inline-block">{formatDate(workout.date, 'dddd d MMM')}</span>
          <span> · {count === 1 ? t('Home.ExerciseCountOne') : t('Home.ExerciseCount', count)}</span>
          {name !== undefined && !!workout.note?.trim() && <span> · {workout.note}</span>}
        </span>
      </span>
    </Link>
  )
}
