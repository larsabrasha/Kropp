import { t } from '../i18n/i18n'
import { MAX_SETS } from '../training/editing'
import { Limits } from '../training/limits'
import type { ExerciseKind, WorkoutExercise } from '../training/model'
import { EditorActions } from '../ui/EditorActions'
import { Stepper } from '../ui/Stepper'
import { TextField } from '../ui/TextField'
import { toInt } from './toInt'

/**
 * One place to change this exercise in this workout: the plan first, as it is what changes most,
 * then the notes, skipping and the actions. Every field has its label above.
 */
export function EntryEditor({
  entry,
  plan,
  kind,
  timeOnly,
  forTemplate,
  weightStep,
  skipLabel,
  onToggleSkipped,
  onChange,
  onChangeCardioPlan,
  onClose,
  onRemove,
}: {
  entry: WorkoutExercise
  /** The entry with cardio's plan as it is shown and edited (see ExerciseEntryCard). */
  plan: WorkoutExercise
  kind: ExerciseKind
  timeOnly: boolean
  forTemplate: boolean
  weightStep: number
  /** "Hoppa över" or "Ångra", or undefined for no skip button. */
  skipLabel: string | undefined
  onToggleSkipped: () => void
  onChange: (entry: WorkoutExercise) => void
  onChangeCardioPlan: (entry: WorkoutExercise) => void
  onClose: () => void
  onRemove: () => void
}) {
  return (
    <div className="mt-3 flex flex-col gap-3" data-testid="editor">
      <div className="flex flex-col gap-3" data-testid="target-editor">
        {kind === 'Cardio' ? (
          <>
            <Stepper
              label={t('Entry.Minutes')}
              value={plan.targetDurationMinutes}
              step={0.5}
              start={5}
              max={Limits.minutes}
              onChange={(v) => onChangeCardioPlan({ ...plan, targetDurationMinutes: v })}
            />
            {!timeOnly && (
              <Stepper
                label={t('Entry.Km')}
                value={plan.targetDistanceKm}
                step={0.1}
                start={1}
                max={Limits.distanceKm}
                onChange={(v) => onChangeCardioPlan({ ...plan, targetDistanceKm: v })}
              />
            )}
          </>
        ) : (
          <>
            <Stepper
              label={t('Entry.Sets')}
              value={entry.targetSets}
              max={MAX_SETS}
              onChange={(v) => {
                const n = toInt(v)
                onChange({ ...entry, targetSets: n === undefined ? undefined : Math.min(n, MAX_SETS) })
              }}
            />
            {kind === 'Timed' ? (
              <Stepper
                label={t('Entry.Seconds')}
                value={entry.targetSeconds}
                step={5}
                max={Limits.seconds}
                onChange={(v) => onChange({ ...entry, targetSeconds: toInt(v) })}
              />
            ) : (
              <Stepper
                label={t('Entry.Reps')}
                value={entry.targetReps}
                max={Limits.reps}
                onChange={(v) => onChange({ ...entry, targetReps: toInt(v) })}
              />
            )}
            {kind === 'Strength' && (
              <Stepper
                label={t('Entry.Kg')}
                value={entry.targetWeightKg}
                step={weightStep}
                max={Limits.weightKg}
                onChange={(v) => onChange({ ...entry, targetWeightKg: v })}
              />
            )}
          </>
        )}
      </div>
      <div className="flex flex-col gap-3" data-testid="notes-editor">
        <TextField
          label={t('Entry.Settings')}
          value={entry.settings}
          maxLength={Limits.shortText}
          placeholder={t('Entry.SettingsPlaceholder')}
          onChange={(v) => onChange({ ...entry, settings: v })}
        />
        {!forTemplate && (
          <TextField
            label={t('Entry.Comment')}
            value={entry.comment}
            maxLength={Limits.longText}
            placeholder={t('Entry.CommentPlaceholder')}
            multiline
            onChange={(v) => onChange({ ...entry, comment: v })}
          />
        )}
      </div>
      {skipLabel !== undefined && (
        <button
          type="button"
          onClick={onToggleSkipped}
          data-testid={entry.isSkipped ? 'unskip' : 'skip'}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          {skipLabel}
        </button>
      )}
      {/* 20px above the actions in every editor: the column's gap plus this. */}
      <div className="mt-2">
        <EditorActions onDone={onClose} onDelete={onRemove} deleteLabel={t('Entry.Remove')} deleteTestId="remove" />
      </div>
    </div>
  )
}
