import { useCallback, useEffect, useState } from 'react'
import { compareText, lower, t } from '../i18n/i18n'
import { picture, slugFor } from '../illustrations/illustrations'
import { Link } from '../route'
import { useRemoteChange, useRepository } from '../services'
import { categoriesOf } from '../training/categories'
import { Limits } from '../training/limits'
import type { Exercise } from '../training/model'
import { BackLink } from '../ui/Layout'

function summary(exercise: Exercise): string {
  const parts = [t(`Exercise.Kind.${exercise.kind}`), ...categoriesOf(exercise).map((a) => t(`BodyArea.${a}`))]
  if (exercise.isArchived) parts.push(t('Exercises.Hidden'))
  return parts.join(' · ')
}

export function ExercisesPage() {
  const repository = useRepository()
  const [exercises, setExercises] = useState<Exercise[] | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    () =>
      repository.getAll('exercise').then(setExercises, (e) => {
        console.error('Could not read exercises', e)
        setExercises([])
        setError(t('Home.LoadFailed'))
      }),
    [repository],
  )

  useEffect(() => {
    void load()
  }, [load])
  useRemoteChange(() => void load())

  // Hidden exercises last: they are kept for history, not for picking.
  const wanted = lower(query.trim())
  const matches = (exercises ?? [])
    .filter((e) => lower(e.name).includes(wanted))
    .sort((a, b) => Number(a.isArchived) - Number(b.isArchived) || compareText(a.name, b.name))

  return (
    <>
      <BackLink href="/settings" label={t('Settings.Heading')} />
      <h1 className="text-xl font-semibold">{t('Exercises.Heading')}</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('Exercises.Help')}</p>

      {error !== null && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

      {exercises === null ? (
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">{t('Common.Loading')}</p>
      ) : exercises.length === 0 ? (
        <div
          className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-300 px-4 py-10 text-center text-gray-500 dark:border-gray-700 dark:text-gray-400"
          data-testid="exercises-empty"
        >
          <svg
            className="size-10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" />
          </svg>
          <p>{t('Exercises.Empty')}</p>
        </div>
      ) : (
        <>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('Exercises.Search')}
            aria-label={t('Exercises.Search')}
            autoComplete="off"
            maxLength={Limits.search}
            data-testid="exercise-search"
            className="mt-4 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base dark:border-gray-700 dark:bg-gray-900"
          />

          {matches.length === 0 ? (
            <div
              className="mt-3 flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-gray-500 dark:border-gray-700 dark:text-gray-400"
              data-testid="exercises-no-match"
            >
              <svg
                className="size-10"
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
              <p>{t('Exercises.NoMatches')}</p>
            </div>
          ) : (
            <ul className="mt-3 flex flex-col gap-2" data-testid="exercises">
              {matches.map((exercise) => {
                const slug = slugFor(exercise)
                return (
                  <li key={exercise.id}>
                    <Link
                      href={`/exercises/${exercise.id}`}
                      className={`flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800 ${exercise.isArchived ? 'opacity-60' : ''}`}
                    >
                      <span
                        className="size-10 shrink-0 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800"
                        aria-hidden="true"
                      >
                        {slug !== undefined && (
                          <img
                            src={picture(slug)}
                            alt=""
                            loading="lazy"
                            className="illustration size-full object-contain p-0.5"
                          />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{exercise.name}</span>
                        <span className="block truncate text-sm text-gray-500 dark:text-gray-400">
                          {summary(exercise)}
                        </span>
                      </span>
                      <svg
                        className="size-5 shrink-0 text-gray-400"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        aria-hidden="true"
                      >
                        <path d="M9 6l6 6-6 6" />
                      </svg>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </>
  )
}
