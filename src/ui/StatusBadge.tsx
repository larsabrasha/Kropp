import { t } from '../i18n/i18n'
import type { WorkoutStatus } from '../training/model'

/**
 * A workout's status as a symbol, as iOS marks state: a blue clock for a plan, a half-filled amber
 * circle for a workout begun, a filled green check for one done. The word is there for screen
 * readers and as a tooltip.
 */
export function StatusBadge({ status }: { status: WorkoutStatus }) {
  // Skipped is no longer derived; a workout stored with it reads as the plan it is.
  const shown = status === 'Skipped' ? 'Planned' : status
  const name = t(`Workout.Status.${shown}`)
  return (
    <span className="shrink-0" title={name} data-testid="status" data-status={status}>
      <svg className="size-[1.375rem]" viewBox="0 0 24 24" aria-hidden="true">
        {shown === 'Done' ? (
          <>
            <circle cx="12" cy="12" r="10" className="fill-green-600 dark:fill-green-500" />
            <path
              d="M7.5 12.3l3 3 6-6.3"
              fill="none"
              stroke="white"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        ) : shown === 'InProgress' ? (
          <g className="text-amber-500 dark:text-amber-400">
            <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M12 5.5a6.5 6.5 0 0 1 0 13z" fill="currentColor" />
          </g>
        ) : (
          <g
            className="text-tint"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7.5V12l3 2" />
          </g>
        )}
      </svg>
      <span className="sr-only">{name}</span>
    </span>
  )
}
