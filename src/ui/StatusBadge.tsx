import { t } from '../i18n/i18n'
import type { WorkoutStatus } from '../training/model'

/** A workout's status: blue for a plan, amber for a workout begun, green for one done. */
export function StatusBadge({ status }: { status: WorkoutStatus }) {
  // Skipped is no longer derived; a workout stored with it reads as the plan it is.
  const shown = status === 'Skipped' ? 'Planned' : status
  const colours =
    shown === 'InProgress'
      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
      : shown === 'Done'
        ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
        : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${colours}`}
      data-testid="status"
      data-status={status}
    >
      {t(`Workout.Status.${shown}`)}
    </span>
  )
}
