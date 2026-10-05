import { formatDate, t } from '../i18n/i18n'
import { picture } from '../illustrations/illustrations'
import { Link } from '../route'
import { iconFor, workoutName, type ExerciseMap } from '../training/categories'
import { statusOf } from '../training/editing'
import type { DateOnly, Workout } from '../training/model'
import { Chevron } from '../ui/List'
import { StatusBadge } from '../ui/StatusBadge'
import { PICTURE_ROW, THUMB } from '../ui/styles'

// One workout as a row of a grouped list (List.tsx), the same on the home page and in the
// calendar; the chevron says it opens the workout.

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
    <Link href={href ?? `/workouts/${workout.id}`} className={PICTURE_ROW}>
      <span className={`size-11 ${THUMB}`} aria-hidden="true">
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
        <span className="block truncate text-[1.0625rem] font-semibold" data-testid="workout-name">
          {name ?? workout.note ?? t('Home.Heading')}
        </span>
        <span className="block truncate text-[0.9375rem] text-label-2" data-testid="workout-meta">
          <span className="first-letter:uppercase inline-block">{formatDate(workout.date, 'dddd d MMM')}</span>
          <span> · {count === 1 ? t('Home.ExerciseCountOne') : t('Home.ExerciseCount', count)}</span>
          {name !== undefined && !!workout.note?.trim() && <span> · {workout.note}</span>}
        </span>
      </span>
      <StatusBadge status={status} />
      <Chevron />
    </Link>
  )
}
