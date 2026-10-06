import { useCallback, useEffect, useRef, useState } from 'react'
import { formatDate, t } from '../i18n/i18n'
import { useRemoteChange, useRepository } from '../services'
import type { LocalRepository } from '../sync/localRepo'
import { workoutName, type ExerciseMap } from '../training/categories'
import type { Exercise, TrashedWorkout } from '../training/model'
import { deleteForGood, deletedForGoodAt, inTrash, purge, restore } from '../training/trash'
import { BackLink } from '../ui/Layout'
import { ActionSheet } from '../ui/ActionSheet'
import { Group } from '../ui/List'
import { button } from '../ui/styles'

const DAY_MS = 86_400_000

function deletedForGoodText(item: TrashedWorkout): string {
  const days = Math.ceil((deletedForGoodAt(item).getTime() - Date.now()) / DAY_MS)
  return days <= 1 ? t('Trash.DeletedSoon') : t('Trash.DeletedInDays', days)
}

/** The exercises, for the workouts' names, and what the trash shows, from the repository's memory. */
function read(repository: LocalRepository) {
  try {
    const exercises: ExerciseMap = new Map(repository.peekAll('exercise').map((e) => [e.id, e]))
    return { exercises, trashed: inTrash(repository.peekAll('trashedWorkout'), repository.peekAll('workout')) }
  } catch (e) {
    console.error('Could not read the trash', e)
    return { exercises: new Map<string, Exercise>() as ExerciseMap, trashed: [], error: t('Home.LoadFailed') }
  }
}

export function TrashPage() {
  const repository = useRepository()
  // Read during the first render, so the page never shows without its data.
  const [initial] = useState(() => read(repository))
  const [trashed, setTrashed] = useState<TrashedWorkout[]>(initial.trashed)
  const [exercises, setExercises] = useState<ExerciseMap>(initial.exercises)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(initial.error ?? null)
  // Guards against a second click before the first one's state has rendered.
  const busy = useRef(false)

  const load = useCallback(() => {
    const found = read(repository)
    setExercises(found.exercises)
    setTrashed(found.trashed)
    if (found.error !== undefined) setError(found.error)
  }, [repository])

  // What is due goes for good when the trash is opened; the page already leaves it out.
  useEffect(() => {
    purge(repository).catch((e: unknown) => console.error('Could not empty the trash', e))
  }, [repository])
  useRemoteChange(load)

  const run = async (item: TrashedWorkout, action: () => Promise<void>, failure: string) => {
    if (busy.current) return
    busy.current = true
    setBusyId(item.id)
    setError(null)
    try {
      await action()
      setTrashed((current) => current && current.filter((x) => x.id !== item.id))
      setConfirmingId(null)
    } catch (e) {
      console.error(failure, e)
      setError(t('Home.SaveFailed'))
    } finally {
      busy.current = false
      setBusyId(null)
    }
  }

  const restoreItem = (item: TrashedWorkout) => run(item, () => restore(repository, item), 'Could not restore workout')
  const deleteItem = (item: TrashedWorkout) =>
    run(item, () => deleteForGood(repository, item.id), 'Could not delete workout for good')

  return (
    <>
      <BackLink href="/calendar" label={t('Calendar.Heading')} />
      <h1 className="large-title">{t('Trash.Heading')}</h1>

      {error !== null && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

      {trashed.length === 0 ? (
        <div
          className="mt-4 flex flex-col items-center gap-3 px-6 py-14 text-center text-[1.0625rem] text-label-2"
          data-testid="trash-empty"
        >
          <svg
            className="size-12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3" />
          </svg>
          <p className="text-[1.375rem] font-bold text-gray-900 dark:text-white">{t('Trash.Empty')}</p>
          <p className="text-[0.9375rem]">{t('Trash.Help')}</p>
        </div>
      ) : (
        <Group className="mt-5" testId="trash" footer={t('Trash.Help')}>
          {trashed.map((item) => {
            const workout = item.workout
            const name = workoutName(workout, exercises)
            const isBusy = busyId === item.id
            return (
              <li key={item.id} className="px-4 py-3" data-testid="trashed-workout">
                <span className="block truncate text-[1.0625rem] font-semibold" data-testid="trashed-name">
                  {name ?? workout.note ?? t('Home.Heading')}
                </span>
                <span className="block truncate text-[0.9375rem] text-label-2">
                  <span className="inline-block first-letter:uppercase">
                    {formatDate(workout.date, 'dddd d MMM yyyy')}
                  </span>
                  <span>
                    {' · '}
                    {workout.exercises.length === 1
                      ? t('Home.ExerciseCountOne')
                      : t('Home.ExerciseCount', workout.exercises.length)}
                  </span>
                </span>
                <span className="mt-0.5 block text-[0.9375rem] text-label-2" data-testid="deleted-for-good">
                  {deletedForGoodText(item)}
                </span>

                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmingId(item.id)}
                    disabled={busyId !== null}
                    data-testid="delete-now"
                    className={button('destructive', 'small')}
                  >
                    {t('Trash.DeleteNow')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void restoreItem(item)}
                    disabled={busyId !== null}
                    data-testid="restore"
                    className={`ml-auto ${button('filled', 'small')}`}
                  >
                    {isBusy && confirmingId !== item.id ? t('Common.Loading') : t('Trash.Restore')}
                  </button>
                </div>
                {confirmingId === item.id && (
                  <ActionSheet
                    message={t('Trash.DeleteConfirm')}
                    action={t('Trash.DeleteNow')}
                    busy={isBusy}
                    onAction={() => void deleteItem(item)}
                    onCancel={() => setConfirmingId(null)}
                    actionTestId="confirm-delete"
                  />
                )}
              </li>
            )
          })}
        </Group>
      )}
    </>
  )
}
