import { useState, type ReactNode } from 'react'
import { formatDate, t } from '../i18n/i18n'
import { nameOf, picture, slugFor } from '../illustrations/illustrations'
import { Link, useLocation } from '../route'
import { daysBetween, today } from '../training/dates'
import {
  cardioTargetKm,
  cardioTargetMinutes,
  clearCardio,
  completeCardio,
  completeNextSet,
  hasResult,
  MAX_SETS,
  removeSet,
  replaceSet,
} from '../training/editing'
import { Limits } from '../training/limits'
import {
  DEFAULT_WEIGHT_STEP_KG,
  type DateOnly,
  type Exercise,
  type ExerciseKind,
  type SetResult,
  type WorkoutExercise,
} from '../training/model'
import { isShort, num, result, setMain, setText, setWeight, target } from '../training/text'
import { EditorActions, DoneRow } from '../ui/EditorActions'
import { Stepper } from '../ui/Stepper'
import { TextField } from '../ui/TextField'

// Compact by default: the name and plan on one line, the set buttons, one grey line of context.
// Everything else opens in place on a tap and closes with Klar: one editor under the name, opened
// from the plan beside it, except a set's fields, which open under the sets. At the gym, with a plan that
// was right, the set buttons are all that gets touched — so they stay large and always first.

type Panel = 'None' | 'Edit' | 'Set' | 'Illustration' | 'CardioResult'

/** A whole number, rounded half to even as .NET's Math.Round does. */
function toInt(value: number | undefined): number | undefined {
  if (value === undefined) return undefined
  const rounded = Math.round(value)
  return Math.abs(value % 1) === 0.5 && rounded % 2 !== 0 ? rounded - 1 : rounded
}

/** "mån 21 sep": the language's short names, without the full stop Swedish puts after them. */
const shortDate = (date: DateOnly) => formatDate(date, 'ddd d MMM').replaceAll('.', '')

function ago(date: DateOnly): string {
  const days = daysBetween(date, today())
  return days <= 0 ? t('Entry.AgoToday') : days === 1 ? t('Entry.AgoYesterday') : t('Entry.AgoDays', days)
}

const CHECK = (
  <span
    className="flex size-5 shrink-0 items-center justify-center rounded-full bg-white/90 text-green-700 dark:bg-white/85"
    aria-hidden="true"
    data-testid="check"
  >
    <svg
      className="size-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12l5 5L20 7" />
    </svg>
  </span>
)

const SPEECH_BUBBLE =
  'M12 3C6.5 3 2 6.8 2 11.5c0 2.6 1.4 4.9 3.6 6.5-.2 1.3-.8 2.5-1.8 3.4-.2.2 0 .6.3.6 2 0 3.7-.8 4.9-1.7 1 .3 2 .4 3 .4 5.5 0 10-3.8 10-8.5S17.5 3 12 3z'

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

  // The editor and the picture take the card's place below the header, sets and all; the set
  // and cardio editors open under what they edit.
  const hidesResults = panel === 'Edit' || panel === 'Illustration'

  // Only the top row, on an exercise that is neither the one the user is on nor done in any
  // part: the rest of the list stays quiet. One skipped whole is struck through at that row;
  // one skipped part way shows its sets, with the skipped ones struck through.
  const collapsed = !forTemplate && !current && !hasResult(entry)
  const whollySkipped = !forTemplate && entry.isSkipped && !hasResult(entry)

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

  const lastTimeLabel = (shown: WorkoutExercise) =>
    lastTimeDate ? `${shortDate(lastTimeDate)} (${ago(lastTimeDate)}), ${result(shown, kind)}` : result(shown, kind)

  const expanded = (p: Panel, index = 0) => panel === p && (p !== 'Set' || setIndex === index)

  function toggle(p: Panel, index = 0) {
    const isOpen = expanded(p, index)
    setOpenPanel(isOpen ? 'None' : p)
    setSetIndex(index)
    if (!isOpen) onActivate()
  }

  const close = () => setOpenPanel('None')
  const change = (next: WorkoutExercise) => onChange(next)

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

  function cardioSection() {
    // Cardio has no sets, so one large button finishes it, like the set buttons do. With what was
    // done open for correcting, it steps aside: two buttons would compete.
    if (panel === 'CardioResult')
      return (
        <div className="mt-3" data-testid="cardio-editor">
          <div className="flex flex-col gap-2">
            <Stepper
              label={t('Entry.Minutes')}
              value={entry.durationMinutes}
              step={0.5}
              max={Limits.minutes}
              start={entry.targetDurationMinutes ?? 5}
              onChange={(v) => change({ ...entry, durationMinutes: v })}
            />
            {!timeOnly && (
              <>
                <Stepper
                  label={t('Entry.Km')}
                  value={entry.distanceKm}
                  step={0.1}
                  max={Limits.distanceKm}
                  start={entry.targetDistanceKm ?? 1}
                  onChange={(v) => change({ ...entry, distanceKm: v })}
                />
                <Stepper
                  label={t('Entry.Pulse')}
                  value={entry.avgHeartRate}
                  start={120}
                  max={Limits.heartRate}
                  onChange={(v) => change({ ...entry, avgHeartRate: toInt(v) })}
                />
              </>
            )}
          </div>
          <div className="mt-5">
            {hasResult(entry) ? (
              <EditorActions
                onDone={close}
                onDelete={clearCardioResult}
                deleteLabel={t('Entry.ClearResult')}
                deleteTestId="clear-cardio"
              />
            ) : (
              <EditorActions onDone={close} />
            )}
          </div>
        </div>
      )

    if (hasResult(entry)) {
      const done = result(measured(entry), kind)
      return (
        <div className="mt-4 flex" data-testid="cardio">
          <button
            type="button"
            onClick={() => toggle('CardioResult')}
            aria-expanded="false"
            aria-label={t('Entry.CardioDone', done)}
            className="relative inline-flex min-h-14 flex-1 items-center justify-center rounded-xl bg-green-600 px-3 text-lg font-semibold text-white tabular-nums hover:bg-green-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-500"
            data-testid="cardio-done"
          >
            <span className="flex items-center gap-2">
              {CHECK}
              <span>{done}</span>
            </span>
          </button>
        </div>
      )
    }

    const planned = completeCardio(measured(entry), measured(lastTime))
    const label = hasResult(planned) ? t('Entry.CardioFinishAt', result(planned, kind)) : t('Entry.Finish')
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
            onClick={finishCardio}
            aria-label={label}
            data-testid="cardio-next"
            className="inline-flex min-h-14 flex-1 flex-col items-center justify-center rounded-xl border-2 border-green-600 px-3 text-green-700 tabular-nums hover:bg-green-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-500 active:bg-green-100 motion-safe:animate-next-set dark:border-green-500 dark:text-green-300 dark:hover:bg-green-950"
          >
            {content}
          </button>
        ) : (
          <span
            className={`inline-flex min-h-14 flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 px-3 text-gray-400 tabular-nums dark:border-gray-700 ${entry.isSkipped ? 'line-through' : ''}`}
            aria-label={entry.isSkipped ? t('Entry.Skipped') : label}
            data-testid="cardio-planned"
          >
            {content}
          </span>
        )}
      </div>
    )
  }

  function setsSection() {
    const editing = panel === 'Set' && setIndex < entry.sets.length ? setIndex : undefined
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
              const open = expanded('Set', index)
              const ring = open
                ? (shortSet
                    ? 'ring-3 ring-amber-600 ring-offset-2 dark:ring-amber-400'
                    : 'ring-3 ring-green-800 ring-offset-2 dark:ring-green-400') + ' dark:ring-offset-gray-900'
                : ''
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => toggle('Set', index)}
                  aria-expanded={open}
                  aria-label={t('Entry.SetDone', index + 1, setText(set, kind))}
                  className={`relative inline-flex min-h-14 min-w-0 flex-col items-center justify-center rounded-xl px-1 whitespace-nowrap tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 ${shortSet ? 'bg-amber-300 text-gray-900 hover:bg-amber-400 focus-visible:outline-amber-500' : 'bg-green-600 text-white hover:bg-green-700 focus-visible:outline-green-500'} ${ring}`}
                  data-testid="set-done"
                  data-open={open ? 'true' : 'false'}
                  data-short={shortSet ? 'true' : 'false'}
                >
                  <span className="flex items-center gap-1.5">
                    {CHECK}
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
                  onClick={completeNext}
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
                  onChange={(v) => change(replaceSet(entry, editing, { ...edited, seconds: toInt(v) }))}
                />
              ) : (
                <Stepper
                  label={t('Entry.Reps')}
                  value={edited.reps}
                  max={Limits.reps}
                  onChange={(v) => change(replaceSet(entry, editing, { ...edited, reps: toInt(v) }))}
                />
              )}
              {kind === 'Strength' && (
                <Stepper
                  label={t('Entry.Kg')}
                  value={edited.weightKg}
                  step={weightStep}
                  max={Limits.weightKg}
                  onChange={(v) => change(replaceSet(entry, editing, { ...edited, weightKg: v }))}
                />
              )}
            </div>
            <div className="mt-5">
              <EditorActions
                onDone={close}
                onDelete={() => removeSetAt(editing)}
                deleteLabel={t('Entry.RemoveSet')}
                deleteTestId="remove-set"
              />
            </div>
          </div>
        )}
      </>
    )
  }

  function lastTimeLines(last: WorkoutExercise) {
    const shown = measured(last)
    const first = shown.sets[0]?.weightKg
    const uniform = kind === 'Strength' && shown.sets.every((x) => x.weightKg === first) ? first : undefined
    return (
      <>
        <button
          type="button"
          onClick={() => toggle('Edit')}
          aria-label={t('Entry.LastTime', lastTimeLabel(shown))}
          data-testid="last-time"
          className="mt-4 flex w-full items-start gap-2 rounded-md px-1.5 text-left text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden="true">
            <svg
              className="size-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
              <path d="M3 3v5h5" />
              <path d="M12 7v5l3 2" />
            </svg>
          </span>
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {lastTimeDate && (
              <span data-testid="last-time-date">
                {shortDate(lastTimeDate)} ({ago(lastTimeDate)})
              </span>
            )}
            {kind === 'Cardio' || shown.sets.length === 0 ? (
              <span className="tabular-nums">{result(shown, kind)}</span>
            ) : (
              <span className="flex flex-wrap items-center gap-1" data-testid="last-sets">
                {shown.sets.map((set, i) => {
                  const shortSet = isShort(set, shown, kind)
                  return (
                    <span
                      key={i}
                      className={`rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums ${shortSet ? 'bg-amber-200 text-gray-900 dark:bg-amber-400' : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}
                      data-short={shortSet ? 'true' : 'false'}
                    >
                      {uniform === undefined && kind === 'Strength' ? setText(set, kind) : setMain(set, kind)}
                    </span>
                  )
                })}
                {uniform !== undefined && <span className="text-xs tabular-nums">× {num(uniform)} kg</span>}
              </span>
            )}
          </span>
        </button>
        {last.comment?.trim() && (
          <button
            type="button"
            onClick={() => toggle('Edit')}
            aria-label={`${t('Entry.LastComment')}: ${last.comment}`}
            data-testid="last-comment"
            className="mt-1 flex w-full items-start gap-2 rounded-md px-1.5 text-left text-sm text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
          >
            <span className="flex h-5 w-5 shrink-0 items-start justify-center" aria-hidden="true">
              <svg
                className="size-4 text-gray-300 dark:text-gray-600"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M8 2v9a4 4 0 0 0 4 4h8" />
              </svg>
            </span>
            <span className="-ml-1 flex h-5 w-4 shrink-0 items-center justify-center" aria-hidden="true">
              <svg className="size-4 text-gray-300 dark:text-gray-600" viewBox="0 0 24 24" fill="currentColor">
                <path d={SPEECH_BUBBLE} />
              </svg>
            </span>
            <span className="min-w-0 break-words whitespace-pre-line">{last.comment}</span>
          </button>
        )}
      </>
    )
  }

  return (
    <article
      className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900"
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
          className="flex shrink-0 items-center rounded-lg px-2 py-1.5 text-sm text-gray-700 tabular-nums hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          <span
            className={
              whollySkipped
                ? 'text-gray-400 line-through dark:text-gray-500'
                : 'underline decoration-gray-300 decoration-dotted underline-offset-4 dark:decoration-gray-600'
            }
            data-testid="target"
          >
            {targetText}
          </span>
        </button>
      </div>

      {/* One place to change this exercise in this workout: the plan first, as it is what changes
          most, then the notes, skipping and the actions. Every field has its label above. */}
      {panel === 'Edit' && (
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
                  onChange={(v) => changeCardioPlan({ ...plan, targetDurationMinutes: v })}
                />
                {!timeOnly && (
                  <Stepper
                    label={t('Entry.Km')}
                    value={plan.targetDistanceKm}
                    step={0.1}
                    start={1}
                    max={Limits.distanceKm}
                    onChange={(v) => changeCardioPlan({ ...plan, targetDistanceKm: v })}
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
                    change({ ...entry, targetSets: n === undefined ? undefined : Math.min(n, MAX_SETS) })
                  }}
                />
                {kind === 'Timed' ? (
                  <Stepper
                    label={t('Entry.Seconds')}
                    value={entry.targetSeconds}
                    step={5}
                    max={Limits.seconds}
                    onChange={(v) => change({ ...entry, targetSeconds: toInt(v) })}
                  />
                ) : (
                  <Stepper
                    label={t('Entry.Reps')}
                    value={entry.targetReps}
                    max={Limits.reps}
                    onChange={(v) => change({ ...entry, targetReps: toInt(v) })}
                  />
                )}
                {kind === 'Strength' && (
                  <Stepper
                    label={t('Entry.Kg')}
                    value={entry.targetWeightKg}
                    step={weightStep}
                    max={Limits.weightKg}
                    onChange={(v) => change({ ...entry, targetWeightKg: v })}
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
              onChange={(v) => change({ ...entry, settings: v })}
            />
            {!forTemplate && (
              <TextField
                label={t('Entry.Comment')}
                value={entry.comment}
                maxLength={Limits.longText}
                placeholder={t('Entry.CommentPlaceholder')}
                multiline
                onChange={(v) => change({ ...entry, comment: v })}
              />
            )}
          </div>
          {skipLabel !== undefined && (
            <button
              type="button"
              onClick={toggleSkipped}
              data-testid={entry.isSkipped ? 'unskip' : 'skip'}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              {skipLabel}
            </button>
          )}
          {/* 20px above the actions in every editor: the column's gap plus this. */}
          <div className="mt-2">
            <EditorActions onDone={close} onDelete={onRemove} deleteLabel={t('Entry.Remove')} deleteTestId="remove" />
          </div>
        </div>
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
              <Link
                href={exerciseHref}
                className="rounded-lg px-3 py-2 text-sm text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950"
                data-testid="edit-exercise"
              >
                {t('Entry.EditExercise')}
              </Link>
            )}
          </DoneRow>
        </div>
      )}

      {kind === 'Cardio' && !forTemplate && !collapsed && !hidesResults && cardioSection()}

      {kind !== 'Cardio' && !forTemplate && !collapsed && !hidesResults && setsSection()}

      {/* Below the sets, one line each, every one opening the editor: how it went last time and what
          was said then, the settings to use, and what is said this time. Only with nothing open: an
          open panel ends the card, so its "Stäng" is the last thing in it. The lines under the
          buttons stand in by half the buttons' corner radius (px-1.5), where the eye sees the
          rounded edge begin; flush with it they look crowded, a whole radius in. */}
      {panel === 'None' && !collapsed && (
        <>
          {lastTime && lastTimeLines(lastTime)}
          {settingsParts.length > 0 && (
            <button
              type="button"
              onClick={() => toggle('Edit')}
              aria-label={`${t('Entry.Settings')}: ${settingsParts.join(', ')}`}
              data-testid="settings-line"
              className="mt-1.5 flex w-full items-start gap-2 rounded-md px-1.5 text-left text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden="true">
                <svg
                  className="size-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
                  <circle cx="16" cy="6" r="2" />
                  <circle cx="10" cy="12" r="2" />
                  <circle cx="18" cy="18" r="2" />
                </svg>
              </span>
              <span className="min-w-0 break-words">{settingsParts.join(' · ')}</span>
            </button>
          )}
          {!forTemplate && entry.comment?.trim() && (
            <button
              type="button"
              onClick={() => toggle('Edit')}
              aria-label={`${t('Entry.Comment')}: ${entry.comment}`}
              data-testid="comment"
              className="mt-1.5 flex w-full items-start gap-2 rounded-md px-1.5 text-left text-sm text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden="true">
                <svg className="size-[18px] text-gray-500 dark:text-gray-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d={SPEECH_BUBBLE} />
                </svg>
              </span>
              <span className="min-w-0 break-words whitespace-pre-line">{entry.comment}</span>
            </button>
          )}
        </>
      )}
    </article>
  )
}
