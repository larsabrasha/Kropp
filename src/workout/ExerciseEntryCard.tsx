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
import { DoneRow } from '../ui/EditorActions'
import { ModalSheet } from '../ui/ModalSheet'
import { button } from '../ui/styles'
import { EntryCardio } from './EntryCardio'
import { EntryContextLines } from './EntryContextLines'
import { EntryEditor } from './EntryEditor'
import { EntrySets } from './EntrySets'

// Compact by default: the name and plan on one line, the set buttons, one grey line of context.
// Everything else opens in place on a tap and closes with Klar: one editor under the name, opened
// from the plan beside it, except a set's fields, which open under the sets. At the gym, with a plan that
// was right, the set buttons are all that gets touched — so they stay large and always first.

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
   * sets, and its next set pulses: the rest show their plan dashed, so there is one place to tap.
   * Done sets and "+" stay tappable everywhere, for corrections and an extra set.
   */
  current: boolean
  /** Whether this card may show an open panel; the page lets one card at a time. */
  active: boolean
  onActivate: () => void
  /** In a template: only the plan, no sets, no comment and no "last time". */
  forTemplate: boolean
  onChange: (entry: WorkoutExercise) => void
  onRemove: () => void
}) {
  const { path } = useLocation()
  const [openPanel, setOpenPanel] = useState<Panel>('None')
  const [setIndex, setSetIndex] = useState(0)

  const slug = slugFor(exercise)
  // The exercise's own page, with the way back to this workout or template.
  const exerciseHref = `/exercises/${exercise?.id}?back=${encodeURIComponent(path.replace(/^\//, ''))}`
  const weightStep = exercise?.weightStepKg ?? DEFAULT_WEIGHT_STEP_KG
  const panel: Panel = active ? openPanel : 'None'
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

  // The picture takes the card's place below the header, sets and all; the set and cardio editors
  // open under what they edit. The editor is a sheet over the card, which stays as it is.
  const hidesResults = panel === 'Illustration'

  // Only the top row, on an exercise that is neither the one the user is on nor done in any
  // part: the rest of the list stays quiet. One skipped whole is struck through at that row;
  // one skipped part way shows its sets, with the skipped ones struck through.
  const collapsed = !forTemplate && !current && !hasResult(entry)
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
      <div className="flex items-center gap-1">
        <span
          className="drag-handle -my-1 -ml-1 flex shrink-0 cursor-grab touch-none items-center self-stretch px-1 text-gray-300 active:cursor-grabbing dark:text-gray-600"
          title={t('Entry.Drag')}
          aria-hidden="true"
          data-testid="drag-handle"
        >
          <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="9" cy="6" r="1.5" />
            <circle cx="15" cy="6" r="1.5" />
            <circle cx="9" cy="12" r="1.5" />
            <circle cx="15" cy="12" r="1.5" />
            <circle cx="9" cy="18" r="1.5" />
            <circle cx="15" cy="18" r="1.5" />
          </svg>
        </span>
        <button
          type="button"
          onClick={() => toggle('Illustration')}
          aria-expanded={expanded('Illustration')}
          aria-label={t('Illustration.Show', exercise?.name ?? '')}
          title={t('Illustration.Show', exercise?.name ?? '')}
          data-testid="thumbnail"
          className={`size-10 shrink-0 overflow-hidden rounded-lg ${slug === undefined ? 'border border-dashed border-gray-300 text-gray-400 dark:border-gray-700' : 'bg-gray-100 dark:bg-gray-800'}`}
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
        <h3
          className={`min-w-0 flex-1 font-semibold ${current ? 'break-words' : 'truncate'} ${whollySkipped ? 'text-gray-400 line-through dark:text-gray-500' : ''}`}
          data-skipped={whollySkipped ? 'true' : 'false'}
        >
          {exercise?.name ?? t('Exercise.Unknown')}
          {whollySkipped && <span className="sr-only">({t('Entry.Skipped')})</span>}
        </h3>
        <button
          type="button"
          onClick={() => toggle('Edit')}
          aria-expanded={expanded('Edit')}
          title={t('Entry.Edit')}
          data-testid="edit"
          className="flex h-8 shrink-0 items-center rounded-full bg-fill px-3 text-[0.9375rem] font-medium text-gray-900 tabular-nums active:opacity-60 focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-white"
        >
          <span
            className={whollySkipped ? 'text-gray-400 line-through dark:text-gray-500' : undefined}
            data-testid="target"
          >
            {targetText}
          </span>
        </button>
      </div>

      {/* Editing is a task of its own, as on iOS: a sheet over the workout, the card unchanged under it. */}
      {panel === 'Edit' && (
        <ModalSheet
          title={exercise?.name ?? t('Exercise.Unknown')}
          onClose={close}
          testId="entry-sheet"
          closeTestId="close-editor"
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

      {/* Only to look at here; the picture belongs to the exercise and is changed on its page. */}
      {panel === 'Illustration' && (
        <div className="mt-3" data-testid="illustration">
          {slug !== undefined ? (
            <div
              className="mx-auto aspect-square w-full max-w-64 rounded-lg bg-gray-100 p-2 dark:bg-gray-800"
              data-testid="illustration-large"
            >
              <img src={picture(slug)} alt={nameOf(slug)} className="illustration size-full object-contain" />
            </div>
          ) : (
            <p className="py-2 text-center text-sm text-gray-500 dark:text-gray-400">{t('Illustration.None')}</p>
          )}
          <DoneRow onDone={close}>
            {exercise && (
              <Link href={exerciseHref} className={button('tinted', 'small')} data-testid="edit-exercise">
                {t('Entry.EditExercise')}
              </Link>
            )}
          </DoneRow>
        </div>
      )}

      {kind === 'Cardio' && !forTemplate && !collapsed && !hidesResults && (
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

      {kind !== 'Cardio' && !forTemplate && !collapsed && !hidesResults && (
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

      {/* Only with nothing open: an open panel ends the card, so its "Stäng" is the last thing in it. */}
      {(panel === 'None' || panel === 'Edit') && !collapsed && (
        <EntryContextLines
          entry={entry}
          kind={kind}
          forTemplate={forTemplate}
          lastTime={lastTime}
          measuredLastTime={measured(lastTime)}
          lastTimeDate={lastTimeDate}
          settingsParts={settingsParts}
          onOpenEditor={() => toggle('Edit')}
        />
      )}
    </article>
  )
}
