import { useState } from 'react'
import { t } from '../i18n/i18n'
import { nameOf, picture, slugFor } from '../illustrations/illustrations'
import { Link, useLocation } from '../route'
import {
  cardioTargetKm,
  cardioTargetMinutes,
  clearCardio,
  completeCardio,
  completeNextSet,
  hasResult,
  removeSet,
} from '../training/editing'
import {
  DEFAULT_WEIGHT_STEP_KG,
  type DateOnly,
  type Exercise,
  type ExerciseKind,
  type WorkoutExercise,
} from '../training/model'
import { target } from '../training/text'
import { ActionSheet } from '../ui/ActionSheet'
import { ModalSheet } from '../ui/ModalSheet'
import { Chevron } from '../ui/List'
import { button } from '../ui/styles'
import { EntryCardio } from './EntryCardio'
import { EntryContextLines } from './EntryContextLines'
import { EntryEditor } from './EntryEditor'
import { EntrySets } from './EntrySets'

// Compact by default: the name with the plan under it, the set buttons, one grey line of context.
// Everything else opens in a sheet over the card, never in it, as iOS opens a task: the editor from
// the name's row, the picture from the thumbnail, a done set's fields from the set. At the gym, with
// a plan that was right, the set buttons are all that gets touched — so they stay large and first.

type Panel = 'None' | 'Edit' | 'Set' | 'Illustration' | 'CardioResult'

export function ExerciseEntryCard({
  entry,
  exercise,
  lastTime,
  lastTimeDate,
  current,
  active,
  onActivate,
  forTemplate,
  editing,
  onChange,
  onRemove,
}: {
  entry: WorkoutExercise
  exercise: Exercise | undefined
  lastTime?: WorkoutExercise
  /** The day of lastTime. */
  lastTimeDate?: DateOnly
  /**
   * Whether this is the exercise the user is on, the first one not finished. Only it takes new
   * sets, and its next set is tinted: the rest show their plan in grey, so there is one place to tap.
   * Done sets and "+" stay tappable everywhere, for corrections and an extra set.
   */
  current: boolean
  /** Whether this card may show an open panel; the page lets one card at a time. */
  active: boolean
  onActivate: () => void
  /** In a template: only the plan, no sets, no comment and no "last time". */
  forTemplate: boolean
  /** The list's edit mode: only the top row, with a minus to remove and a handle to reorder. */
  editing: boolean
  onChange: (entry: WorkoutExercise) => void
  onRemove: () => void
}) {
  const { path } = useLocation()
  const [openPanel, setOpenPanel] = useState<Panel>('None')
  const [setIndex, setSetIndex] = useState(0)
  const [confirmingRemove, setConfirmingRemove] = useState(false)

  const slug = slugFor(exercise)
  // The exercise's own page, with the way back to this workout or template.
  const exerciseHref = `/exercises/${exercise?.id}?back=${encodeURIComponent(path.replace(/^\//, ''))}`
  const weightStep = exercise?.weightStepKg ?? DEFAULT_WEIGHT_STEP_KG
  const panel: Panel = active && !editing ? openPanel : 'None'
  const kind: ExerciseKind = exercise?.kind ?? 'Strength'
  const timeOnly = kind === 'Cardio' && exercise?.measuresTimeOnly === true

  /**
   * The entry as far as the exercise measures it: for cardio by time alone, without distance
   * and pulse, also when older workouts recorded them.
   */
  function measured(e: WorkoutExercise): WorkoutExercise
  function measured(e: WorkoutExercise | undefined): WorkoutExercise | undefined
  function measured(e: WorkoutExercise | undefined) {
    return timeOnly && e ? { ...e, distanceKm: undefined, avgHeartRate: undefined, targetDistanceKm: undefined } : e
  }

  // Only the top row, on an exercise that is neither the one the user is on nor done in any
  // part: the rest of the list stays quiet. One skipped whole says so in that row; one skipped
  // part way shows its sets, the skipped ones with a skip symbol.
  const collapsed = editing || (!forTemplate && !current && !hasResult(entry))
  const whollySkipped = !forTemplate && entry.isSkipped && !hasResult(entry)

  /**
   * The entry with cardio's plan as it is shown and edited. In a workout, what is not planned is
   * last time's, which is also what "Klar" records. A template made before cardio had targets
   * holds its minutes in the result fields, which a template never uses for anything else.
   */
  const plan: WorkoutExercise =
    kind !== 'Cardio'
      ? entry
      : forTemplate
        ? { ...entry, targetDurationMinutes: cardioTargetMinutes(entry), targetDistanceKm: cardioTargetKm(entry) }
        : {
            ...entry,
            targetDurationMinutes: entry.targetDurationMinutes ?? lastTime?.durationMinutes,
            targetDistanceKm: entry.targetDistanceKm ?? lastTime?.distanceKm,
          }

  let targetText = target(measured(plan), kind)
  if (kind === 'Cardio' && entry.settings?.trim())
    targetText = targetText ? `${targetText} · ${entry.settings}` : entry.settings
  if (!targetText.trim()) targetText = t('Entry.SetTarget')

  /** The settings to use: the exercise's own, then this time's. Cardio's is on the plan. */
  const settingsParts: string[] = []
  if (exercise?.settingsNote?.trim()) settingsParts.push(exercise.settingsNote)
  if (kind !== 'Cardio' && entry.settings?.trim()) settingsParts.push(entry.settings)

  const expanded = (p: Panel, index = 0) => panel === p && (p !== 'Set' || setIndex === index)

  function toggle(p: Panel, index = 0) {
    const isOpen = expanded(p, index)
    setOpenPanel(isOpen ? 'None' : p)
    setSetIndex(index)
    if (!isOpen) onActivate()
  }

  const close = () => setOpenPanel('None')
  const change = (next: WorkoutExercise) => onChange(next)

  /**
   * "Hoppa över" in the editor of the exercise the user is on, so a set not done does not hold up
   * the rest; "Ångra" on one that was skipped. Undefined where neither applies.
   */
  const skipLabel = forTemplate
    ? undefined
    : entry.isSkipped
      ? t('Entry.Unskip')
      : !current
        ? undefined
        : hasResult(entry)
          ? t('Entry.SkipRest')
          : t('Entry.SkipExercise')

  function toggleSkipped() {
    setOpenPanel('None')
    change({ ...entry, isSkipped: !entry.isSkipped })
  }

  function completeNext() {
    setOpenPanel('None')
    change(completeNextSet(entry, kind))
  }

  const changeCardioPlan = (next: WorkoutExercise) =>
    change(forTemplate ? { ...next, durationMinutes: undefined, distanceKm: undefined, avgHeartRate: undefined } : next)

  /** One tap at the plan, or last time's values; with nothing to go on, the fields open instead. */
  function finishCardio() {
    const done = completeCardio(measured(entry), measured(lastTime))
    if (!hasResult(done)) return toggle('CardioResult')
    setOpenPanel('None')
    change(done)
  }

  function clearCardioResult() {
    setOpenPanel('None')
    change(clearCardio(entry))
  }

  /** Asked first only when something done would go with it; a plan alone goes at once, as on iOS. */
  function requestRemove() {
    if (hasResult(entry)) setConfirmingRemove(true)
    else onRemove()
  }

  function removeSetAt(index: number) {
    setOpenPanel('None')
    change(removeSet(entry, index))
  }

  return (
    <article
      className="rounded-[1.375rem] bg-cell p-3"
      aria-current={current ? 'step' : undefined}
      data-testid="exercise-entry"
      data-current={current ? 'true' : 'false'}
    >
      {/* The name with the plan in grey under it, the whole row opening the editor, as an iOS row
          that leads further in. In edit mode the row only reorders and removes: a red minus at its
          left, the handle at its right, as iOS edits a list. */}
      <div className="relative flex items-center gap-3">
        {editing && (
          <button
            type="button"
            onClick={requestRemove}
            aria-label={`${t('Entry.Remove')}: ${exercise?.name ?? t('Exercise.Unknown')}`}
            title={t('Entry.Remove')}
            data-testid="remove-in-edit"
            className="-mr-1 flex size-7 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-blue-500"
          >
            <svg className="size-[1.375rem]" viewBox="0 0 22 22" aria-hidden="true">
              <circle cx="11" cy="11" r="11" className="fill-red-500" />
              <path d="M6.5 11h9" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
        )}
        <button
          type="button"
          onClick={() => toggle('Illustration')}
          disabled={editing}
          aria-haspopup="dialog"
          aria-label={t('Illustration.Show', exercise?.name ?? '')}
          title={t('Illustration.Show', exercise?.name ?? '')}
          data-testid="thumbnail"
          className={`relative z-10 size-10 shrink-0 overflow-hidden rounded-lg ${slug === undefined ? 'bg-fill text-label-2' : 'bg-gray-100 dark:bg-gray-800'}`}
        >
          {slug !== undefined ? (
            <img src={picture(slug)} alt="" className="illustration size-full object-contain p-0.5" />
          ) : (
            <svg
              className="m-auto size-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <rect x="4" y="4" width="16" height="16" rx="2" />
              <path d="M4 16l4-4 4 4 3-3 5 5" />
            </svg>
          )}
        </button>
        <div className="min-w-0 flex-1">
          <h3
            className={`font-semibold ${current && !editing ? 'break-words' : 'truncate'} ${whollySkipped ? 'text-label-2' : ''}`}
            data-skipped={whollySkipped ? 'true' : 'false'}
          >
            {exercise?.name ?? t('Exercise.Unknown')}
          </h3>
          {/* Skipped whole, it says so first in the grey line, where iOS would never strike it through. */}
          <p className="truncate text-[0.9375rem] text-label-2 tabular-nums">
            {whollySkipped && <span data-testid="skipped">{t('Entry.Skipped')} · </span>}
            <span data-testid="target">{targetText}</span>
          </p>
        </div>
        {editing ? (
          <span
            className="drag-handle -my-2 -mr-1 flex shrink-0 cursor-grab touch-none items-center self-stretch px-2 text-label-3 active:cursor-grabbing"
            title={t('Entry.Drag')}
            aria-hidden="true"
            data-testid="drag-handle"
          >
            <svg className="size-5" viewBox="0 0 20 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M3.5 6.5h13M3.5 10h13M3.5 13.5h13" />
            </svg>
          </span>
        ) : (
          <>
            <Chevron />
            {/* Over the whole row, under the picture's own button. */}
            <button
              type="button"
              onClick={() => toggle('Edit')}
              aria-expanded={expanded('Edit')}
              aria-label={`${t('Entry.Edit')}: ${exercise?.name ?? t('Exercise.Unknown')}, ${targetText}`}
              title={t('Entry.Edit')}
              data-testid="edit"
              className="absolute -inset-1.5 rounded-xl active:bg-black/5 focus-visible:outline-2 focus-visible:outline-blue-500 dark:active:bg-white/10"
            />
          </>
        )}
      </div>

      {confirmingRemove && (
        <ActionSheet
          message={t('Entry.RemoveConfirm')}
          action={t('Entry.Remove')}
          onAction={onRemove}
          onCancel={() => setConfirmingRemove(false)}
          actionTestId="confirm-remove"
        />
      )}

      {/* Editing is a task of its own, as on iOS: a sheet over the workout, the card unchanged under it. */}
      {panel === 'Edit' && (
        <ModalSheet
          title={exercise?.name ?? t('Exercise.Unknown')}
          onClose={close}
          testId="entry-sheet"
          closeTestId="close-editor"
          confirm
          fit
          portal={false}
        >
          <EntryEditor
            entry={entry}
            plan={plan}
            kind={kind}
            timeOnly={timeOnly}
            forTemplate={forTemplate}
            weightStep={weightStep}
            skipLabel={skipLabel}
            onToggleSkipped={toggleSkipped}
            onChange={change}
            onChangeCardioPlan={changeCardioPlan}
            onRemove={onRemove}
          />
        </ModalSheet>
      )}

      {/* The picture large, in a sheet over the card, as everything opened from a card is. Only to
          look at here; the picture belongs to the exercise and is changed on its page. */}
      {panel === 'Illustration' && (
        <ModalSheet
          title={exercise?.name ?? t('Exercise.Unknown')}
          onClose={close}
          testId="illustration"
          fit
          portal={false}
        >
          <div className="flex flex-col gap-section">
            {slug !== undefined ? (
              <div
                className="mx-auto aspect-square w-full max-w-64 rounded-[1.625rem] bg-cell p-3"
                data-testid="illustration-large"
              >
                <img src={picture(slug)} alt={nameOf(slug)} className="illustration size-full object-contain" />
              </div>
            ) : (
              <p className="py-2 text-center text-[1.0625rem] text-label-2">{t('Illustration.None')}</p>
            )}
            {exercise && (
              <Link href={exerciseHref} className={`${button('tinted', 'large')} w-full`} data-testid="edit-exercise">
                {t('Entry.EditExercise')}
              </Link>
            )}
          </div>
        </ModalSheet>
      )}

      {kind === 'Cardio' && !forTemplate && !collapsed && (
        <EntryCardio
          entry={entry}
          measuredEntry={measured(entry)}
          measuredLastTime={measured(lastTime)}
          current={current}
          timeOnly={timeOnly}
          editing={panel === 'CardioResult'}
          onToggle={() => toggle('CardioResult')}
          onFinish={finishCardio}
          onChange={change}
          onClose={close}
          onClear={clearCardioResult}
        />
      )}

      {kind !== 'Cardio' && !forTemplate && !collapsed && (
        <EntrySets
          entry={entry}
          kind={kind}
          current={current}
          weightStep={weightStep}
          openSet={panel === 'Set' ? setIndex : undefined}
          onToggleSet={(index) => toggle('Set', index)}
          onCompleteNext={completeNext}
          onChange={change}
          onClose={close}
          onRemoveSet={removeSetAt}
        />
      )}

      {!collapsed && (
        <EntryContextLines
          entry={entry}
          kind={kind}
          forTemplate={forTemplate}
          lastTime={lastTime}
          measuredLastTime={measured(lastTime)}
          lastTimeDate={lastTimeDate}
          settingsParts={settingsParts}
        />
      )}
    </article>
  )
}
