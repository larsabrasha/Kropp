import { useCallback, useEffect, useRef, useState } from 'react'
import { formatDate, t } from '../i18n/i18n'
import { useRemoteChange, useRepository } from '../services'
import type { LocalRepository } from '../sync/localRepo'
import { workoutName, type ExerciseMap } from '../training/categories'
import type { Exercise, TrashedWorkout } from '../training/model'
import { deleteForGood, deletedForGoodAt, purge, restore } from '../training/trash'
import { BackLink } from '../ui/Layout'

const DAY_MS = 86_400_000

function deletedForGoodText(item: TrashedWorkout): string {
  const days = Math.ceil((deletedForGoodAt(item).getTime() - Date.now()) / DAY_MS)
  return days <= 1 ? t('Trash.DeletedSoon') : t('Trash.DeletedInDays', days)
}

/** The exercises, for the workouts' names, and what is left in the trash after the purge. */
async function read(repository: LocalRepository) {
  const exercises: ExerciseMap = new Map((await repository.getAll('exercise')).map((e) => [e.id, e]))
  return { exercises, trashed: await purge(repository) }
}

export function TrashPage() {
  const repository = useRepository()
  const [trashed, setTrashed] = useState<TrashedWorkout[] | null>(null)
  const [exercises, setExercises] = useState<ExerciseMap>(new Map<string, Exercise>())
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Guards against a second click before the first one's state has rendered.
  const busy = useRef(false)

  const load = useCallback(
    () =>
      read(repository).then(
        (found) => {
          setExercises(found.exercises)
          setTrashed(found.trashed)
        },
        (e) => {
          console.error('Could not read the trash', e)
          setTrashed([])
          setError(t('Home.LoadFailed'))
        },
      ),
    [repository],
  )

  useEffect(() => {
    void load()
  }, [load])
  useRemoteChange(() => void load())

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
      <BackLink href="/settings" label={t('Settings.Heading')} />
      <h1 className="text-xl font-semibold">{t('Trash.Heading')}</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('Trash.Help')}</p>

      {error !== null && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

      {trashed === null ? (
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">{t('Common.Loading')}</p>
      ) : trashed.length === 0 ? (
        <div
          className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-300 px-4 py-10 text-center text-gray-500 dark:border-gray-700 dark:text-gray-400"
          data-testid="trash-empty"
        >
          <svg
            className="size-10"
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
          <p>{t('Trash.Empty')}</p>
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-2" data-testid="trash">
          {trashed.map((item) => {
            const workout = item.workout
            const name = workoutName(workout, exercises)
            const isBusy = busyId === item.id
            return (
              <li
                key={item.id}
                className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900"
                data-testid="trashed-workout"
              >
                <span className="block truncate font-semibold" data-testid="trashed-name">
                  {name ?? workout.note ?? t('Home.Heading')}
                </span>
                <span className="block truncate text-sm text-gray-500 dark:text-gray-400">
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
                <span className="mt-0.5 block text-sm text-gray-500 dark:text-gray-400" data-testid="deleted-for-good">
                  {deletedForGoodText(item)}
                </span>

                {confirmingId === item.id ? (
                  <div
                    className="mt-3 flex flex-wrap items-center gap-2"
                    role="alertdialog"
                    aria-label={t('Trash.DeleteConfirm')}
                  >
                    <span className="w-full text-sm">{t('Trash.DeleteConfirm')}</span>
                    <button
                      type="button"
                      onClick={() => void deleteItem(item)}
                      disabled={isBusy}
                      data-testid="confirm-delete"
                      className="rounded-lg bg-red-600 px-4 py-2.5 font-medium text-white hover:bg-red-700 disabled:opacity-60"
                    >
                      {isBusy ? t('Common.Loading') : t('Trash.DeleteNow')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingId(null)}
                      className="rounded-lg px-4 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                      {t('Common.Cancel')}
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmingId(item.id)}
                      disabled={busyId !== null}
                      data-testid="delete-now"
                      className="rounded-lg px-3 py-2.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:text-red-400 dark:hover:bg-red-950"
                    >
                      {t('Trash.DeleteNow')}
                    </button>
                    <button
                      type="button"
                      onClick={() => void restoreItem(item)}
                      disabled={busyId !== null}
                      data-testid="restore"
                      className="ml-auto rounded-lg bg-accent-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-700 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-60"
                    >
                      {isBusy ? t('Common.Loading') : t('Trash.Restore')}
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
