import { t } from '../i18n/i18n'
import { completeCardio, hasResult } from '../training/editing'
import { Limits } from '../training/limits'
import type { WorkoutExercise } from '../training/model'
import { num, result } from '../training/text'
import { EditorActions } from '../ui/EditorActions'
import { Stepper } from '../ui/Stepper'
import { CheckMark } from './CheckMark'
import { toInt } from './toInt'

/**
 * Cardio has no sets, so one large button finishes it, like the set buttons do. With what was done
 * open for correcting, it steps aside: two buttons would compete.
 */
export function EntryCardio({
  entry,
  measuredEntry,
  measuredLastTime,
  current,
  timeOnly,
  editing,
  onToggle,
  onFinish,
  onChange,
  onClose,
  onClear,
}: {
  entry: WorkoutExercise
  /** entry and last time as far as the exercise measures them (see ExerciseEntryCard). */
  measuredEntry: WorkoutExercise
  measuredLastTime: WorkoutExercise | undefined
  current: boolean
  /** Measured by time alone: no distance, no pulse. */
  timeOnly: boolean
  /** Whether what was done is open for correcting. */
  editing: boolean
  onToggle: () => void
  onFinish: () => void
  onChange: (entry: WorkoutExercise) => void
  onClose: () => void
  onClear: () => void
}) {
  if (editing)
    return (
      <div className="mt-3" data-testid="cardio-editor">
        <div className="flex flex-col gap-2">
          <Stepper
            label={t('Entry.Minutes')}
            value={entry.durationMinutes}
            step={0.5}
            max={Limits.minutes}
            start={entry.targetDurationMinutes ?? 5}
            onChange={(v) => onChange({ ...entry, durationMinutes: v })}
          />
          {!timeOnly && (
            <>
              <Stepper
                label={t('Entry.Km')}
                value={entry.distanceKm}
                step={0.1}
                max={Limits.distanceKm}
                start={entry.targetDistanceKm ?? 1}
                onChange={(v) => onChange({ ...entry, distanceKm: v })}
              />
              <Stepper
                label={t('Entry.Pulse')}
                value={entry.avgHeartRate}
                start={120}
                max={Limits.heartRate}
                onChange={(v) => onChange({ ...entry, avgHeartRate: toInt(v) })}
              />
            </>
          )}
        </div>
        <div className="mt-5">
          {hasResult(entry) ? (
            <EditorActions
              onDone={onClose}
              onDelete={onClear}
              deleteLabel={t('Entry.ClearResult')}
              deleteTestId="clear-cardio"
            />
          ) : (
            <EditorActions onDone={onClose} />
          )}
        </div>
      </div>
    )

  if (hasResult(entry)) {
    const done = result(measuredEntry, 'Cardio')
    return (
      <div className="mt-4 flex" data-testid="cardio">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded="false"
          aria-label={t('Entry.CardioDone', done)}
          className="relative inline-flex min-h-14 flex-1 items-center justify-center rounded-xl bg-green-600 px-3 text-lg font-semibold text-white tabular-nums hover:bg-green-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-500"
          data-testid="cardio-done"
        >
          <span className="flex items-center gap-2">
            <CheckMark />
            <span>{done}</span>
          </span>
        </button>
      </div>
    )
  }

  const planned = completeCardio(measuredEntry, measuredLastTime)
  const label = hasResult(planned) ? t('Entry.CardioFinishAt', result(planned, 'Cardio')) : t('Entry.Finish')
  const content =
    planned.durationMinutes !== undefined ? (
      <>
        <span className="text-xl leading-tight font-semibold">{num(planned.durationMinutes)} min</span>
        {planned.distanceKm !== undefined && (
          <span className="text-xs leading-tight font-medium opacity-90">{num(planned.distanceKm)} km</span>
        )}
      </>
    ) : planned.distanceKm !== undefined ? (
      <span className="text-xl leading-tight font-semibold">{num(planned.distanceKm)} km</span>
    ) : (
      <span className="text-base font-semibold">{t('Entry.Finish')}</span>
    )
  return (
    <div className="mt-4 flex" data-testid="cardio">
      {current ? (
        <button
          type="button"
          onClick={onFinish}
          aria-label={label}
          data-testid="cardio-next"
          className="inline-flex min-h-14 flex-1 flex-col items-center justify-center rounded-xl bg-green-100 px-3 text-green-800 tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-500 active:bg-green-200 dark:bg-green-900/50 dark:text-green-300 dark:active:bg-green-900/80"
        >
          {content}
        </button>
      ) : (
        <span
          className={`inline-flex min-h-14 flex-1 flex-col items-center justify-center rounded-xl bg-fill px-3 text-label-2 tabular-nums ${entry.isSkipped ? 'line-through' : ''}`}
          aria-label={entry.isSkipped ? t('Entry.Skipped') : label}
          data-testid="cardio-planned"
        >
          {content}
        </span>
      )}
    </div>
  )
}
