import { t } from '../i18n/i18n'
import { completeCardio, hasResult } from '../training/editing'
import { Limits } from '../training/limits'
import type { WorkoutExercise } from '../training/model'
import { num, result } from '../training/text'
import { ModalSheet } from '../ui/ModalSheet'
import { Stepper } from '../ui/Stepper'
import { GROUP, ROW } from '../ui/styles'
import { CheckMark } from './CheckMark'
import { SkipMark } from './SkipMark'
import { toInt } from './toInt'

/**
 * Cardio has no sets, so one large button finishes it, like the set buttons do. What was done is
 * corrected in a sheet over it.
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
  // Correcting what was done is a task of its own, as for a set: a small sheet over the workout.
  const editor = editing && (
    <ModalSheet
      title={t('Entry.Result')}
      onClose={onClose}
      testId="cardio-editor"
      closeTestId="close-editor"
      confirm
      fit
      portal={false}
    >
      <div className="flex flex-col gap-section">
        <ul className={GROUP}>
          <li>
            <Stepper
              row
              label={t('Entry.Minutes')}
              value={entry.durationMinutes}
              step={0.5}
              max={Limits.minutes}
              start={entry.targetDurationMinutes ?? 5}
              onChange={(v) => onChange({ ...entry, durationMinutes: v })}
            />
          </li>
          {!timeOnly && (
            <>
              <li>
                <Stepper
                  row
                  label={t('Entry.Km')}
                  value={entry.distanceKm}
                  step={0.1}
                  max={Limits.distanceKm}
                  start={entry.targetDistanceKm ?? 1}
                  onChange={(v) => onChange({ ...entry, distanceKm: v })}
                />
              </li>
              <li>
                <Stepper
                  row
                  label={t('Entry.Pulse')}
                  value={entry.avgHeartRate}
                  start={120}
                  max={Limits.heartRate}
                  onChange={(v) => onChange({ ...entry, avgHeartRate: toInt(v) })}
                />
              </li>
            </>
          )}
        </ul>
        {hasResult(entry) && (
          <ul className={GROUP}>
            <li>
              <button
                type="button"
                onClick={onClear}
                data-testid="clear-cardio"
                className={`${ROW} w-full text-[1.0625rem] text-red-600 dark:text-red-500`}
              >
                {t('Entry.ClearResult')}
              </button>
            </li>
          </ul>
        )}
      </div>
    </ModalSheet>
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
          className="relative inline-flex min-h-14 flex-1 items-center justify-center rounded-xl bg-green-700 px-3 text-lg font-semibold text-white tabular-nums hover:bg-green-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-500"
          data-testid="cardio-done"
        >
          <span className="flex items-center gap-2">
            <CheckMark />
            <span>{done}</span>
          </span>
        </button>
        {editor}
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
          className={`inline-flex min-h-14 flex-1 flex-col items-center justify-center rounded-xl bg-fill px-3 tabular-nums ${entry.isSkipped ? 'text-label-3' : 'text-label-2'}`}
          aria-label={entry.isSkipped ? t('Entry.Skipped') : label}
          data-testid="cardio-planned"
        >
          {entry.isSkipped ? <SkipMark /> : content}
        </span>
      )}
      {editor}
    </div>
  )
}
