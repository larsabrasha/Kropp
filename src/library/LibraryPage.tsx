import { useCallback, useState } from 'react'
import { compareText, t, type MessageKey } from '../i18n/i18n'
import { slugFor } from '../illustrations/illustrations'
import { Link } from '../route'
import { useAnyChange, useRepository } from '../services'
import type { LocalRepository } from '../sync/localRepo'
import { Chevron, Group } from '../ui/List'
import { Picture } from '../ui/Picture'
import { SectionHeader } from '../ui/SectionHeader'
import { CARD, ROW } from '../ui/styles'
import { logged, occasionsOf } from '../stats/stats'
import { today } from '../training/dates'
import type { Exercise } from '../training/model'

// What workouts are built from, as Music's library lists what is in it: a row for the templates
// and a row for the exercises, each with how many there are, each a list of its own pushed in.
// Under them, as Music shows what was added lately as covers, the exercises done most, as cards
// with their pictures, each a tap from its progress.

/** How many exercises the cards show: three rows of two. */
const MOST = 6

interface Data {
  templates: number
  exercises: number
  /** The exercises done most, with how many workouts each was done in. */
  most: { exercise: Exercise; times: number }[]
  error?: string
}

function read(repository: LocalRepository): Data {
  try {
    const exercises = repository.peekAll('exercise')
    const workouts = logged(repository.peekAll('workout'), today())
    const most = exercises
      .filter((e) => !e.isArchived)
      .map((exercise) => ({ exercise, times: occasionsOf(workouts, exercise.id).length }))
      .filter((x) => x.times > 0)
      .sort((a, b) => b.times - a.times || compareText(a.exercise.name, b.exercise.name))
      .slice(0, MOST)
    return { templates: repository.peekAll('template').length, exercises: exercises.length, most }
  } catch (e) {
    console.error('Could not read the library', e)
    return { templates: 0, exercises: 0, most: [], error: t('Home.LoadFailed') }
  }
}

// A list of templates, and a dumbbell, drawn as the tab bar's symbols are.
const TEMPLATES = 'M8.5 6.5h11M8.5 12h11M8.5 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01'
const EXERCISES = 'M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11'

export function LibraryPage() {
  const repository = useRepository()
  // Read during the first render, so the page never shows without its data.
  const [data, setData] = useState(() => read(repository))
  const load = useCallback(() => setData(read(repository)), [repository])
  useAnyChange(load)

  const row = (href: string, icon: string, label: MessageKey, count: number, testId: string) => (
    <li>
      <Link href={href} className={ROW} data-testid={testId}>
        <svg
          className="size-6 shrink-0 text-tint"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d={icon} />
        </svg>
        <span className="min-w-0 flex-1 text-[1.0625rem]">{t(label)}</span>
        <span className="text-[1.0625rem] text-label-2 tabular-nums">{count}</span>
        <Chevron />
      </Link>
    </li>
  )

  return (
    <>
      <h1 className="large-title">{t('Library.Heading')}</h1>
      {data.error !== undefined && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
          {data.error}
        </p>
      )}
      <Group className="mt-4" separatorInset="3.25rem">
        {row('/templates', TEMPLATES, 'Library.Templates', data.templates, 'templates-link')}
        {row('/exercises', EXERCISES, 'Library.Exercises', data.exercises, 'exercises-link')}
      </Group>

      {data.most.length > 0 && (
        <section className="mt-section" data-testid="most-done">
          <SectionHeader>{t('Library.MostDone')}</SectionHeader>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {data.most.map(({ exercise, times }) => (
              <li key={exercise.id}>
                <Link
                  href={`/stats/exercises/${exercise.id}?from=library`}
                  className={`${CARD} block p-3 transition-transform duration-150 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-blue-500`}
                >
                  <Picture slug={slugFor(exercise)} size="grid" />
                  <span className="mt-2 block truncate text-[0.9375rem] font-semibold">{exercise.name}</span>
                  <span className="block text-[0.8125rem] text-label-2">
                    {times === 1 ? t('Calendar.OneWorkout') : t('Calendar.Workouts', times)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
