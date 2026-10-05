import { useCallback, useState } from 'react'
import { compareText, lower, t } from '../i18n/i18n'
import { picture, slugFor } from '../illustrations/illustrations'
import { Link } from '../route'
import { useRemoteChange, useRepository } from '../services'
import type { LocalRepository } from '../sync/localRepo'
import { categoriesOf } from '../training/categories'
import { Limits } from '../training/limits'
import type { Exercise } from '../training/model'
import { BackLink } from '../ui/Layout'
import { Chevron, Group } from '../ui/List'
import { SearchField } from '../ui/SearchField'
import { PICTURE_ROW, THUMB } from '../ui/styles'

function summary(exercise: Exercise): string {
  const parts = [t(`Exercise.Kind.${exercise.kind}`), ...categoriesOf(exercise).map((a) => t(`BodyArea.${a}`))]
  if (exercise.isArchived) parts.push(t('Exercises.Hidden'))
  return parts.join(' · ')
}

/** Every exercise, from the repository's memory, or a message when it could not be read. */
function read(repository: LocalRepository): { exercises: Exercise[]; error?: string } {
  try {
    return { exercises: repository.peekAll('exercise') }
  } catch (e) {
    console.error('Could not read exercises', e)
    return { exercises: [], error: t('Home.LoadFailed') }
  }
}

export function ExercisesPage() {
  const repository = useRepository()
  // Read during the first render, so the page never shows without its data.
  const [initial] = useState(() => read(repository))
  const [exercises, setExercises] = useState<Exercise[]>(initial.exercises)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(initial.error ?? null)

  const load = useCallback(() => {
    const found = read(repository)
    setExercises(found.exercises)
    if (found.error !== undefined) setError(found.error)
  }, [repository])

  useRemoteChange(load)

  // Hidden exercises last: they are kept for history, not for picking.
  const wanted = lower(query.trim())
  const matches = exercises
    .filter((e) => lower(e.name).includes(wanted))
    .sort((a, b) => Number(a.isArchived) - Number(b.isArchived) || compareText(a.name, b.name))

  return (
    <>
      <BackLink href="/settings" label={t('Settings.Heading')} />
      <h1 className="large-title">{t('Exercises.Heading')}</h1>

      {error !== null && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

      {exercises.length === 0 ? (
        <div
          className="mt-4 flex flex-col items-center gap-3 px-6 py-14 text-center text-[1.0625rem] text-label-2"
          data-testid="exercises-empty"
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
            <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" />
          </svg>
          <p className="text-[1.375rem] font-bold text-gray-900 dark:text-white">{t('Exercises.Empty')}</p>
          <p className="text-[0.9375rem]">{t('Exercises.Help')}</p>
        </div>
      ) : (
        <>
          <SearchField
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('Exercises.Search')}
            maxLength={Limits.search}
            data-testid="exercise-search"
            className="mt-4"
          />

          {matches.length === 0 ? (
            <div
              className="mt-3 flex flex-col items-center gap-3 px-6 py-14 text-center text-[1.0625rem] text-label-2"
              data-testid="exercises-no-match"
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
              <p>{t('Exercises.NoMatches')}</p>
            </div>
          ) : (
            <Group className="mt-4" testId="exercises" separatorInset="3.75rem" footer={t('Exercises.Help')}>
              {matches.map((exercise) => {
                const slug = slugFor(exercise)
                return (
                  <li key={exercise.id}>
                    <Link
                      href={`/exercises/${exercise.id}`}
                      className={`${PICTURE_ROW} ${exercise.isArchived ? 'opacity-60' : ''}`}
                    >
                      <span className={`size-9 ${THUMB}`} aria-hidden="true">
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
                        <span className="block truncate text-[1.0625rem] font-semibold">{exercise.name}</span>
                        <span className="block truncate text-[0.9375rem] text-label-2">{summary(exercise)}</span>
                      </span>
                      <Chevron />
                    </Link>
                  </li>
                )
              })}
            </Group>
          )}
        </>
      )}
    </>
  )
}
