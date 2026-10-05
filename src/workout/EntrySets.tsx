import type { ReactNode } from 'react'
import { t } from '../i18n/i18n'
import { completeNextSet, replaceSet } from '../training/editing'
import { Limits } from '../training/limits'
import type { ExerciseKind, SetResult, WorkoutExercise } from '../training/model'
import { isShort, num, setMain, setText, setWeight } from '../training/text'
import { EditorActions } from '../ui/EditorActions'
import { Stepper } from '../ui/Stepper'
import { CheckMark } from './CheckMark'
import { toInt } from './toInt'

/**
 * The set buttons of a strength, bodyweight or timed exercise, and under them the fields of the
 * done set open for correcting. A done set is solid, the next one pulses on the current exercise,
 * and the rest show their plan dashed.
 */
export function EntrySets({
  entry,
  kind,
  current,
  weightStep,
  openSet,
  onToggleSet,
  onCompleteNext,
  onChange,
  onClose,
  onRemoveSet,
}: {
  entry: WorkoutExercise
  kind: ExerciseKind
  current: boolean
  weightStep: number
  /** The set whose panel is open, if any. */
  openSet: number | undefined
  onToggleSet: (index: number) => void
  onCompleteNext: () => void
  onChange: (entry: WorkoutExercise) => void
  onClose: () => void
  onRemoveSet: (index: number) => void
}) {
  const plannedSlots = Math.max(entry.targetSets ?? 0, entry.sets.length)

  // Three to a row on a phone whatever the count, since three sets is the common case.
  const setColumns =
    plannedSlots <= 1
      ? 'grid-cols-1'
      : plannedSlots === 2
        ? 'grid-cols-2'
        : plannedSlots === 3
          ? 'grid-cols-3'
          : 'grid-cols-3 sm:grid-cols-4'

  /** What a tap on a set not yet done records: the plan, like the one-tap case does. */
  const plannedSet = completeNextSet(entry, kind).sets.at(-1)!
  const hasPlan = (set: SetResult) => (kind === 'Timed' ? set.seconds !== undefined : set.reps !== undefined)
  const setLabel = (index: number) =>
    hasPlan(plannedSet) ? `${t('Entry.SetN', index + 1)}: ${setText(plannedSet, kind)}` : t('Entry.SetN', index + 1)

  /** The planned reps (or seconds) large and the weight small, as on a done set; "Set 2" with no plan. */
  function plannedSetContent(index: number): ReactNode {
    const set = plannedSet
    if (!hasPlan(set)) return <span className="text-base font-semibold">{t('Entry.SetN', index + 1)}</span>
    return (
      <>
        <span className="text-xl leading-tight font-semibold">{setMain(set, kind)}</span>
        {kind === 'Strength' && set.weightKg !== undefined && (
          <span className="text-xs leading-tight font-medium opacity-90">{num(set.weightKg)} kg</span>
        )}
      </>
    )
  }

  const editing = openSet !== undefined && openSet < entry.sets.length ? openSet : undefined
  const edited = editing !== undefined ? entry.sets[editing]! : undefined
  return (
    <>
      {/* The sets wrap in equal columns, never narrower than a set's number and weight need: at most
          three to a row on a phone, four on a wider screen. There is no "+": another set is planned
          with Set in the editor, which makes the exercise the current one again. */}
      <div className={`mt-4 grid gap-2 ${setColumns}`} data-testid="sets">
        {Array.from({ length: plannedSlots }, (_, index) => {
          if (index < entry.sets.length) {
            const set = entry.sets[index]!
            const weight = setWeight(set, kind)
            const shortSet = isShort(set, entry, kind)
            // The set open for correcting is ringed, so it is clear which one the fields below change.
            const open = openSet === index
            const ring = open
              ? (shortSet
                  ? 'ring-3 ring-amber-600 ring-offset-2 dark:ring-amber-400'
                  : 'ring-3 ring-green-800 ring-offset-2 dark:ring-green-400') + ' dark:ring-offset-gray-900'
              : ''
            return (
              <button
                key={index}
                type="button"
                onClick={() => onToggleSet(index)}
                aria-expanded={open}
                aria-label={t('Entry.SetDone', index + 1, setText(set, kind))}
                className={`relative inline-flex min-h-14 min-w-0 flex-col items-center justify-center rounded-xl px-1 whitespace-nowrap tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 ${shortSet ? 'bg-amber-300 text-gray-900 hover:bg-amber-400 focus-visible:outline-amber-500' : 'bg-green-600 text-white hover:bg-green-700 focus-visible:outline-green-500'} ${ring}`}
                data-testid="set-done"
                data-open={open ? 'true' : 'false'}
                data-short={shortSet ? 'true' : 'false'}
              >
                <span className="flex items-center gap-1.5">
                  <CheckMark />
                  <span className="text-xl leading-tight font-semibold" data-testid="set-main">
                    {setMain(set, kind)}
                  </span>
                </span>
                {weight !== undefined && (
                  <span className="text-xs leading-tight font-medium opacity-90" data-testid="set-weight">
                    {weight}
                  </span>
                )}
              </button>
            )
          }
          if (index === entry.sets.length && current)
            return (
              <button
                key={index}
                type="button"
                onClick={onCompleteNext}
                aria-label={setLabel(index)}
                className="inline-flex min-h-14 min-w-0 flex-col items-center justify-center rounded-xl border-2 border-green-600 px-1 whitespace-nowrap text-green-700 tabular-nums hover:bg-green-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-500 active:bg-green-100 motion-safe:animate-next-set dark:border-green-500 dark:text-green-300 dark:hover:bg-green-950"
                data-testid="set-next"
              >
                {plannedSetContent(index)}
              </button>
            )
          return (
            <span
              key={index}
              className={`inline-flex min-h-14 min-w-0 flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 px-1 whitespace-nowrap text-gray-400 tabular-nums dark:border-gray-700 ${entry.isSkipped ? 'line-through' : ''}`}
              aria-label={entry.isSkipped ? t('Entry.SetSkipped', index + 1) : setLabel(index)}
              data-testid="set-planned"
              data-skipped={entry.isSkipped ? 'true' : 'false'}
            >
              {plannedSetContent(index)}
            </span>
          )
        })}
      </div>

      {editing !== undefined && edited && (
        <div className="mt-3" data-testid="set-editor">
          <div className="flex flex-col gap-2">
            {kind === 'Timed' ? (
              <Stepper
                label={t('Entry.Seconds')}
                value={edited.seconds}
                step={5}
                max={Limits.seconds}
                onChange={(v) => onChange(replaceSet(entry, editing, { ...edited, seconds: toInt(v) }))}
              />
            ) : (
              <Stepper
                label={t('Entry.Reps')}
                value={edited.reps}
                max={Limits.reps}
                onChange={(v) => onChange(replaceSet(entry, editing, { ...edited, reps: toInt(v) }))}
              />
            )}
            {kind === 'Strength' && (
              <Stepper
                label={t('Entry.Kg')}
                value={edited.weightKg}
                step={weightStep}
                max={Limits.weightKg}
                onChange={(v) => onChange(replaceSet(entry, editing, { ...edited, weightKg: v }))}
              />
            )}
          </div>
          <div className="mt-5">
            <EditorActions
              onDone={onClose}
              onDelete={() => onRemoveSet(editing)}
              deleteLabel={t('Entry.RemoveSet')}
              deleteTestId="remove-set"
            />
          </div>
        </div>
      )}
    </>
  )
}
