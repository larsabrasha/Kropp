import { formatDate, t } from '../i18n/i18n'
import { type SyncChange, stampTime } from '../sync/protocol'
import { workoutName, type ExerciseMap } from '../training/categories'
import { dateOf } from '../training/dates'
import {
  readExercise,
  readTemplate,
  readTrashedWorkout,
  readWorkout,
  type DateOnly,
  type Workout,
} from '../training/model'

// How the previews of an export and an import name what they hold.

/** The day of an instant in the device's own time zone. */
export function localDate(stamp: string): DateOnly {
  const d = new Date(stampTime(stamp))
  return dateOf(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

const workoutLine = (w: Workout, exercises: ExerciseMap) => {
  const name = workoutName(w, exercises)
  const date = formatDate(w.date, 'd MMM yyyy')
  return name === undefined ? date : `${date} · ${name}`
}

/** A line that tells which aggregate a change is: a workout by its day and name, the rest by name. */
export function describe(change: SyncChange, exercises: ExerciseMap): string {
  const json = JSON.parse(change.data ?? '{}') as Record<string, unknown>
  switch (change.type) {
    case 'workout':
      return workoutLine(readWorkout(json), exercises)
    case 'trashedWorkout':
      return t('Backup.Trashed', workoutLine(readTrashedWorkout(json).workout, exercises))
    case 'exercise':
      return readExercise(json).name
    case 'template':
      return t('Backup.Template', readTemplate(json).name)
    default:
      return t('Backup.Settings')
  }
}

/** "3 sep 2024 – 6 okt 2026", or one day, or undefined without workouts. */
export function dateRange(dates: readonly DateOnly[]): string | undefined {
  if (dates.length === 0) return undefined
  const sorted = [...dates].sort()
  const first = formatDate(sorted[0]!, 'd MMM yyyy')
  const last = formatDate(sorted.at(-1)!, 'd MMM yyyy')
  return first === last ? first : `${first} – ${last}`
}
