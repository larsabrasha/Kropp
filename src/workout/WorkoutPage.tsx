import { useEffect, useRef, useState } from 'react'
import { formatDate, t } from '../i18n/i18n'
import { picture, prefetch, slugFor } from '../illustrations/illustrations'
import { navigate, useLocation } from '../route'
import { useLocalChange, useRemoteChange, useRepository } from '../services'
import type { LocalRepository } from '../sync/localRepo'
import { iconFor, workoutName, type ExerciseMap } from '../training/categories'
import { isDateOnly, today } from '../training/dates'
import { opensLocked as opensLockedOn, statusOf, withDerivedStatus } from '../training/editing'
import { isInRange, Limits } from '../training/limits'
import { DEFAULT_SETTINGS, SETTINGS_ID, type Exercise, type Workout } from '../training/model'
import { invariant, parseInt0 } from '../training/text'
import { moveToTrash } from '../training/trash'
import { BackLink, BarItem, DoneButton } from '../ui/Layout'
import { MenuButton } from '../ui/Menu'
import { StatusBadge } from '../ui/StatusBadge'
import { ActionSheet } from '../ui/ActionSheet'
import { DateRow, NumberRow, TextRow } from '../ui/Form'
import { ModalSheet } from '../ui/ModalSheet'
import { button } from '../ui/styles'
import { cheerFor } from '../stats/journey'
import { logged } from '../stats/stats'
import { CheerCard } from './CheerCard'
import { ExerciseList } from './ExerciseList'
import { Picture } from '../ui/Picture'

// Only the calendar or an exercise's statistics of this app, never a URL from elsewhere.
const CALENDAR_BACK =
  /^\/?(calendar\?(month=\d{4}-\d{2}|day=\d{4}-\d{2}-\d{2})|stats\/exercises\/[0-9a-fA-F-]{36}(\?from=library)?)$/

/** The pictures of a workout's exercises: only the ones in use, never the whole catalog. */
function picturesOf(workout: Workout | undefined, exercises: ExerciseMap): string[] {
  if (!workout) return []
  const slugs = workout.exercises
    .map((e) => slugFor(exercises.get(e.exerciseId)))
    .filter((s): s is string => s !== undefined)
  return [...new Set(slugs)].map(picture)
}

// Loads a workout's pictures while there is a network, so the service worker has them when
// there is none.
async function prefetchIllustrations(workout: Workout | undefined, exercises: ExerciseMap) {
  const urls = picturesOf(workout, exercises)
  if (urls.length === 0) return
  try {
    await prefetch(urls)
  } catch (error) {
    console.debug('Could not prefetch illustrations', error)
  }
}

const sameExercises = (a: Workout, b: Workout) => {
  const ids = new Set(a.exercises.map((e) => e.exerciseId))
  const other = new Set(b.exercises.map((e) => e.exerciseId))
  return ids.size === other.size && [...ids].every((id) => other.has(id))
}

/**
 * The workout, every workout (for last time and the praise) and the exercises, from the
 * repository's memory, and the week's goal.
 */
function read(repository: LocalRepository, id: string) {
  try {
    const all = repository.peekAll('workout')
    const exercises: ReadonlyMap<string, Exercise> = new Map(repository.peekAll('exercise').map((e) => [e.id, e]))
    const goal = (repository.peek('settings', SETTINGS_ID) ?? DEFAULT_SETTINGS).sessionsPerWeek
    return { all, exercises, goal, workout: all.find((w) => w.id === id) }
  } catch (e) {
    console.error(`Could not read workout ${id}`, e)
    return {
      all: [],
      exercises: new Map<string, Exercise>(),
      goal: DEFAULT_SETTINGS.sessionsPerWeek,
      workout: undefined,
      error: t('Home.LoadFailed'),
    }
  }
}

// The menu's symbols, drawn as SF Symbols' outlines.
const PENCIL = 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4'
const LOCK = 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3'
const LOCK_OPEN = 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 6.8-1.2'
const TRASH = 'M5 7h14M10 11v6M14 11v6M7 7l1 13h8l1-13M9.5 7V4.5h5V7'
const LIST = 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01'

const Symbol = ({ d }: { d: string }) => (
  <svg
    className="size-5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={d} />
  </svg>
)

export function WorkoutPage({ id }: { id: string }) {
  const repository = useRepository()
  const { query } = useLocation()
  const safeBack = CALENDAR_BACK.exec(query.get('back') ?? '')?.[1]

  // Read during the first render, so the page never shows without its data.
  const [initial] = useState(() => {
    const found = read(repository, id)
    return { ...found, lock: found.workout !== undefined && opensLockedOn(found.workout, today()) }
  })
  const [workout, setWorkout] = useState<Workout | undefined>(initial.workout)
  const [workouts, setWorkouts] = useState<Workout[]>(initial.all)
  const [exercises, setExercises] = useState<ReadonlyMap<string, Exercise>>(initial.exercises)
  const [goal, setGoal] = useState(initial.goal)
  // Finished by a save on this page just now, so its praise rises into view.
  const [justDone, setJustDone] = useState(false)
  const cheerRef = useRef<HTMLDivElement>(null)
  const [editingDetails, setEditingDetails] = useState(false)
  const [opensLocked, setOpensLocked] = useState(initial.lock)
  const [locked, setLocked] = useState(initial.lock)
  // The exercise list's edit mode; it ends by itself with the last exercise.
  const [editingList, setEditingList] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | undefined>(initial.error)

  // The latest exercises, for a save that follows creating one before the page renders again.
  const exercisesNow = useRef(exercises)
  // Decided once per workout opened, so a reload after a sync does not lock it again mid-edit.
  const lockDecidedFor = useRef<string | undefined>(initial.workout?.id)
  // The workout whose first render has been scrolled to the top: a reload lets the browser
  // restore an old position, and a workout should open at its top.
  const scrolledFor = useRef<string>(undefined)
  const deletingNow = useRef(false)

  // After a sync: what it brought, without locking a workout the user has unlocked meanwhile.
  const load = () => {
    const found = read(repository, id)
    if (found.error !== undefined) return setError(found.error)
    exercisesNow.current = found.exercises
    setWorkouts(found.all)
    setExercises(found.exercises)
    setGoal(found.goal)
    setWorkout(found.workout)
    if (found.workout && lockDecidedFor.current !== found.workout.id) {
      lockDecidedFor.current = found.workout.id
      const lock = opensLockedOn(found.workout, today())
      setLocked(lock)
      setOpensLocked(lock)
    }
  }

  useRemoteChange(load)
  // An exercise changed in a card's sheet: its name and picture follow on the cards at once. Only
  // the exercises, and only when one was saved: the workout itself is this page's own.
  useLocalChange('exercise', () => {
    const next = new Map(repository.peekAll('exercise').map((e) => [e.id, e]))
    exercisesNow.current = next
    setExercises(next)
  })

  useEffect(() => {
    if (justDone) cheerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [justDone])

  useEffect(() => {
    if (scrolledFor.current === id) return
    scrolledFor.current = id
    void prefetchIllustrations(workout, exercises)
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [id, workout, exercises])

  const closeDetails = () => setEditingDetails(false)

  const lock = () => {
    setLocked(true)
    setEditingDetails(false)
    setConfirmingDelete(false)
  }

  // Saved at once and locally; sync picks it up a few seconds later.
  async function save(edited: Workout) {
    // The disabled controls are the lock; this keeps anything that slips past them from saving.
    if (locked) return
    const next = withDerivedStatus(edited, today())
    const exercisesChanged = !workout || !sameExercises(workout, next)
    const previous = workout
    setJustDone(next.status === 'Done' && previous?.status !== 'Done')
    setWorkout(next)
    setWorkouts((all) => [...all.filter((w) => w.id !== next.id), next])
    setError(undefined)
    try {
      await repository.save('workout', next.id, next)
      if (exercisesChanged) await prefetchIllustrations(next, exercisesNow.current)
    } catch (e) {
      console.error(`Could not save workout ${next.id}`, e)
      setWorkout(previous)
      setError(t('Home.SaveFailed'))
    }
  }

  async function saveExercise(exercise: Exercise) {
    if (locked) return
    try {
      await repository.save('exercise', exercise.id, exercise)
      const map = new Map(exercisesNow.current).set(exercise.id, exercise)
      exercisesNow.current = map
      setExercises(map)
      await prefetchIllustrations(workout, map)
    } catch (e) {
      console.error(`Could not save exercise ${exercise.id}`, e)
      setError(t('Home.SaveFailed'))
    }
  }

  async function remove() {
    if (deletingNow.current || locked) return
    deletingNow.current = true
    setDeleting(true)
    try {
      if (workout) await moveToTrash(repository, workout)
      navigate('/')
    } catch (e) {
      console.error('Could not delete workout', e)
      setError(t('Home.SaveFailed'))
    } finally {
      deletingNow.current = false
      setDeleting(false)
    }
  }

  const name = workout ? workoutName(workout, exercises) : undefined
  const title = name ?? workout?.note ?? t('Home.Heading')

  /** After the day, as in the list: the exercises, then the number and a note not already the title. */
  const metaParts: string[] = []
  if (workout) {
    metaParts.push(
      workout.exercises.length === 1 ? t('Home.ExerciseCountOne') : t('Home.ExerciseCount', workout.exercises.length),
    )
    if (workout.sessionNumber !== undefined) metaParts.push(t('Home.SessionShort', workout.sessionNumber))
    if (name !== undefined && workout.note?.trim()) metaParts.push(workout.note)
  }

  const icon = workout ? iconFor(workout, exercises) : undefined
  const day = today()
  const cheer =
    workout && statusOf(workout, day) === 'Done' ? cheerFor(workout, logged(workouts, day), goal) : undefined
  const editing = editingList && !locked && (workout?.exercises.length ?? 0) > 0
  if (editingList && !editing) setEditingList(false)

  return (
    <>
      <BackLink
        href={safeBack ? `/${safeBack}` : '/'}
        label={
          safeBack === undefined
            ? t('Workout.Back')
            : safeBack.startsWith('stats')
              ? safeBack.endsWith('from=library')
                ? t('Library.Heading')
                : t('Stats.Heading')
              : t('Calendar.Heading')
        }
        testId="back"
      />

      {/* The workout's own actions, as iOS gathers a page's: behind "⋯" in the bar. In the list's
          edit mode, Done takes its place. */}
      {workout && editing && (
        <BarItem side="trailing">
          <DoneButton onClick={() => setEditingList(false)} testId="done-editing" />
        </BarItem>
      )}
      {workout && !editing && (
        <BarItem side="trailing">
          <MenuButton
            label={t('Workout.Actions')}
            testId="workout-menu"
            groups={[
              [
                {
                  label: t('Workout.EditDetails'),
                  icon: <Symbol d={PENCIL} />,
                  onSelect: () => setEditingDetails(true),
                  disabled: locked,
                  testId: 'edit-details',
                },
                {
                  label: t('Workout.EditExercises'),
                  icon: <Symbol d={LIST} />,
                  onSelect: () => setEditingList(true),
                  disabled: locked || workout.exercises.length === 0,
                  testId: 'edit-exercises',
                },
                locked
                  ? {
                      label: t('Workout.Unlock'),
                      icon: <Symbol d={LOCK_OPEN} />,
                      onSelect: () => setLocked(false),
                      testId: 'menu-unlock',
                    }
                  : opensLocked
                    ? { label: t('Workout.Lock'), icon: <Symbol d={LOCK} />, onSelect: lock, testId: 'lock' }
                    : undefined,
              ].filter((item) => item !== undefined),
              [
                {
                  label: t('Workout.Delete'),
                  icon: <Symbol d={TRASH} />,
                  onSelect: () => setConfirmingDelete(true),
                  destructive: true,
                  disabled: locked,
                  testId: 'delete-workout',
                },
              ],
            ]}
          />
        </BarItem>
      )}

      {!workout ? (
        <div
          className="flex flex-col items-center gap-3 px-6 py-14 text-center text-[1.0625rem] text-label-2"
          data-testid="not-found"
        >
          <svg
            className="size-12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-4-4" />
          </svg>
          <p>{t('Workout.NotFound')}</p>
        </div>
      ) : (
        <>
          {/* The same as the workout's row in the list: picture, name, day, exercises and status. The
              grey line, with the number and note too, opens the details for editing. */}
          <div className="mt-2 flex items-center gap-3" data-testid="details">
            <Picture slug={icon} size="header" imageTestId="workout-icon" />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <h1 className="min-w-0 text-[1.75rem] leading-tight font-bold break-words">{title}</h1>
                <span className="mt-1.5">
                  <StatusBadge status={statusOf(workout, today())} />
                </span>
              </div>
              <p className="mt-1 text-[0.9375rem] text-label-2" data-testid="workout-meta">
                <span className="inline-block first-letter:uppercase">{formatDate(workout.date, 'dddd d MMM')}</span>
                {metaParts.map((p) => ' · ' + p).join('')}
              </p>
            </div>
          </div>

          {locked && (
            <section className="mt-4 flex items-center gap-3 rounded-[1.375rem] bg-cell p-3" data-testid="locked">
              <svg
                className="size-5 shrink-0 text-gray-500 dark:text-gray-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="5" y="11" width="14" height="10" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
              <p className="min-w-0 flex-1 text-sm text-gray-600 dark:text-gray-300">{t('Workout.Locked')}</p>
              <button
                type="button"
                onClick={() => setLocked(false)}
                data-testid="unlock"
                className={button('gray', 'small')}
              >
                {t('Workout.Unlock')}
              </button>
            </section>
          )}

          {/* The details are a task of their own, as on iOS: a sheet over the workout. */}
          {editingDetails && (
            <ModalSheet
              title={t('Workout.Details')}
              onClose={closeDetails}
              testId="details-sheet"
              closeTestId="close-details"
              confirm
              fit
            >
              <ul className="ios-list overflow-hidden rounded-[1.625rem] bg-cell" data-testid="details-editor">
                <DateRow
                  label={t('Home.Date')}
                  value={workout.date}
                  text={formatDate(workout.date, 'dddd d MMM yyyy')}
                  min={Limits.firstDate}
                  max={Limits.lastDate}
                  onChange={(value) => {
                    if (isDateOnly(value) && isInRange(value)) void save({ ...workout, date: value })
                  }}
                />
                <NumberRow
                  label={t('Workout.SessionNumber')}
                  value={invariant(workout.sessionNumber)}
                  max={Limits.sessionNumber}
                  onChange={(v) => {
                    const n = parseInt0(v)
                    void save({
                      ...workout,
                      sessionNumber: n === undefined ? undefined : Math.min(Math.max(n, 0), Limits.sessionNumber),
                    })
                  }}
                />
                <TextRow
                  label={t('Home.Note')}
                  value={workout.note}
                  maxLength={Limits.longText}
                  onChange={(v) => void save({ ...workout, note: v })}
                />
              </ul>
            </ModalSheet>
          )}

          {error !== undefined && (
            <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          )}

          {/* A locked workout still reads the same, but every control in it is disabled. */}
          <fieldset disabled={locked} className="m-0 min-w-0 border-0 p-0" data-testid="workout-body">
            <div className="mt-6">
              <ExerciseList
                key={workout.id}
                owner={workout}
                editing={editing}
                exercises={exercises}
                history={workouts}
                onChange={save}
                onExerciseChange={saveExercise}
              />
            </div>

            {cheer && (
              <div ref={cheerRef} className="mt-6">
                <CheerCard cheer={cheer} date={workout.date} fresh={justDone} />
              </div>
            )}

            {confirmingDelete && (
              <ActionSheet
                message={t('Workout.DeleteConfirm')}
                action={t('Workout.Delete')}
                busy={deleting}
                onAction={() => void remove()}
                onCancel={() => setConfirmingDelete(false)}
              />
            )}
          </fieldset>
        </>
      )}
    </>
  )
}
