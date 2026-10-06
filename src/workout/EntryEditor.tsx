import { useState, type ReactNode } from 'react'
import { t } from '../i18n/i18n'
import { MAX_SETS } from '../training/editing'
import { Limits } from '../training/limits'
import type { ExerciseKind, WorkoutExercise } from '../training/model'
import { Chevron } from '../ui/List'
import { Stepper } from '../ui/Stepper'
import { ActionSheet } from '../ui/ActionSheet'
import { TextRow } from '../ui/Form'
import { GROUP, ROW } from '../ui/styles'
import { toInt } from './toInt'

/**
 * One place for this exercise in this workout, opened by a tap anywhere on its row: its picture,
 * the plan, as it is what changes most, then the notes, the way to the exercise itself (name,
 * picture, categories, which hold in every workout), skipping and removing. Drawn for a sheet (ModalSheet, which closes it): grouped
 * lists as an iOS form, the label at the left, the value and its − and + at the right.
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
  onRemove,
  picture,
  onOpenExercise,
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
  onRemove: () => void
  /** The exercise's picture, large, first in the sheet. */
  picture?: ReactNode
  /** Pushes the exercise itself, what holds in every workout; none for an exercise not found. */
  onOpenExercise?: () => void
}) {
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  return (
    <div className="flex flex-col gap-section" data-testid="editor">
      {picture}
      <ul className={GROUP} data-testid="target-editor">
        {kind === 'Cardio' ? (
          <>
            <li>
              <Stepper
                row
                label={t('Entry.Minutes')}
                value={plan.targetDurationMinutes}
                step={0.5}
                start={5}
                max={Limits.minutes}
                onChange={(v) => onChangeCardioPlan({ ...plan, targetDurationMinutes: v })}
              />
            </li>
            {!timeOnly && (
              <li>
                <Stepper
                  row
                  label={t('Entry.Km')}
                  value={plan.targetDistanceKm}
                  step={0.1}
                  start={1}
                  max={Limits.distanceKm}
                  onChange={(v) => onChangeCardioPlan({ ...plan, targetDistanceKm: v })}
                />
              </li>
            )}
          </>
        ) : (
          <>
            <li>
              <Stepper
                row
                label={t('Entry.Sets')}
                value={entry.targetSets}
                max={MAX_SETS}
                onChange={(v) => {
                  const n = toInt(v)
                  onChange({ ...entry, targetSets: n === undefined ? undefined : Math.min(n, MAX_SETS) })
                }}
              />
            </li>
            {kind === 'Timed' ? (
              <li>
                <Stepper
                  row
                  label={t('Entry.Seconds')}
                  value={entry.targetSeconds}
                  step={5}
                  max={Limits.seconds}
                  onChange={(v) => onChange({ ...entry, targetSeconds: toInt(v) })}
                />
              </li>
            ) : (
              <li>
                <Stepper
                  row
                  label={t('Entry.Reps')}
                  value={entry.targetReps}
                  max={Limits.reps}
                  onChange={(v) => onChange({ ...entry, targetReps: toInt(v) })}
                />
              </li>
            )}
            {kind === 'Strength' && (
              <li>
                <Stepper
                  row
                  label={t('Entry.Kg')}
                  value={entry.targetWeightKg}
                  step={weightStep}
                  max={Limits.weightKg}
                  onChange={(v) => onChange({ ...entry, targetWeightKg: v })}
                />
              </li>
            )}
          </>
        )}
      </ul>
      <ul className={GROUP} data-testid="notes-editor">
        <TextRow
          label={t('Entry.Settings')}
          value={entry.settings}
          maxLength={Limits.shortText}
          placeholder={t('Entry.SettingsPlaceholder')}
          onChange={(v) => onChange({ ...entry, settings: v })}
        />
        {!forTemplate && (
          <TextRow
            label={t('Entry.Comment')}
            value={entry.comment}
            maxLength={Limits.longText}
            placeholder={t('Entry.CommentPlaceholder')}
            multiline
            onChange={(v) => onChange({ ...entry, comment: v })}
          />
        )}
      </ul>
      {onOpenExercise !== undefined && (
        <ul className={GROUP}>
          <li>
            <button
              type="button"
              onClick={onOpenExercise}
              className={`${ROW} w-full text-left text-[1.0625rem]`}
              data-testid="edit-exercise"
            >
              <span className="min-w-0 flex-1">{t('Entry.EditExercise')}</span>
              <Chevron />
            </button>
          </li>
        </ul>
      )}
      <ul className={GROUP}>
        {skipLabel !== undefined && (
          <li>
            <button
              type="button"
              onClick={onToggleSkipped}
              data-testid={entry.isSkipped ? 'unskip' : 'skip'}
              className={`${ROW} w-full text-[1.0625rem] text-tint`}
            >
              {skipLabel}
            </button>
          </li>
        )}
        <li>
          <button
            type="button"
            onClick={() => setConfirmingRemove(true)}
            data-testid="remove"
            className={`${ROW} w-full text-[1.0625rem] text-red-600 dark:text-red-500`}
          >
            {t('Entry.Remove')}
          </button>
        </li>
      </ul>
      {/* Asked first, as iOS asks before anything that cannot be undone. */}
      {confirmingRemove && (
        <ActionSheet
          message={forTemplate ? t('Entry.RemoveConfirmTemplate') : t('Entry.RemoveConfirm')}
          action={t('Entry.Remove')}
          onAction={onRemove}
          onCancel={() => setConfirmingRemove(false)}
          actionTestId="confirm-remove"
        />
      )}
    </div>
  )
}
