import { useCallback, useState } from 'react'
import { compareText, formatDate, lower, t } from '../i18n/i18n'
import { slugFor } from '../illustrations/illustrations'
import { Link } from '../route'
import { useAnyChange, useRepository } from '../services'
import type { LocalRepository } from '../sync/localRepo'
import { today } from '../training/dates'
import { Limits } from '../training/limits'
import { newId, type Exercise, type Workout } from '../training/model'
import { ActionSheet } from '../ui/ActionSheet'
import { BackLink, BarItem, GLASS_CIRCLE } from '../ui/Layout'
import { ModalSheet } from '../ui/ModalSheet'
import { SwipeActions } from '../ui/SwipeActions'
import { EyeSlashSymbol, EyeSymbol, TrashSymbol } from '../ui/symbols'
import { isInUse } from '../training/usage'
import { NewExerciseForm, type NewExercise } from '../workout/ExercisePicker'
import { Chevron, Group } from '../ui/List'
import { Picture } from '../ui/Picture'
import { SearchField } from '../ui/SearchField'
import { PICTURE_ROW } from '../ui/styles'
import { logged, occasionsOf } from '../stats/stats'

// Every exercise, in the library: the ones logged by the latest done, then the rest by name,
// hidden ones last, searchable by name. Each leads to its progress, the same page as in the
// statistics, and behind Ändra there to what it is.

// The search, kept while the app runs: back from an exercise, the list is still filtered as it
// was left, as iOS keeps a search on the page below.
let rememberedSearch = ''

function read(repository: LocalRepository): {
  exercises: Exercise[]
  workouts: Workout[]
  /** The exercises a workout or a template refers to: these are hidden, never deleted. */
  inUse: ReadonlySet<string>
  error?: string
} {
  try {
    const exercises = repository.peekAll('exercise')
    const inUse = new Set(exercises.filter((e) => isInUse(repository, e.id)).map((e) => e.id))
    return { exercises, workouts: logged(repository.peekAll('workout'), today()), inUse }
  } catch (e) {
    console.error('Could not read exercises', e)
    return { exercises: [], workouts: [], inUse: new Set(), error: t('Home.LoadFailed') }
  }
}

export function ExerciseListPage() {
  const repository = useRepository()
  // Read during the first render, so the page never shows without its data.
  const [data, setData] = useState(() => read(repository))
  const load = useCallback(() => setData(read(repository)), [repository])
  useAnyChange(load)
  const [search, setSearch] = useState(rememberedSearch)
  const changeSearch = (value: string) => {
    rememberedSearch = value
    setSearch(value)
  }

  const [creating, setCreating] = useState(false)
  // The exercise a swipe asked to delete, until the user confirms.
  const [deleting, setDeleting] = useState<Exercise>()
  const [failed, setFailed] = useState<string>()
  const stopCreating = useCallback(() => setCreating(false), [])

  const save = async (exercise: Exercise) => {
    setFailed(undefined)
    try {
      await repository.save('exercise', exercise.id, exercise)
    } catch (e) {
      console.error(`Could not save exercise ${exercise.id}`, e)
      setFailed(t('Home.SaveFailed'))
    }
  }
  const create = async (request: NewExercise) => {
    setCreating(false)
    await save({ id: newId(), ...request, isArchived: false, measuresTimeOnly: false })
  }
  const remove = async (exercise: Exercise) => {
    setDeleting(undefined)
    try {
      await repository.delete('exercise', exercise.id)
    } catch (e) {
      console.error(`Could not delete exercise ${exercise.id}`, e)
      setFailed(t('Home.SaveFailed'))
    }
  }

  const { exercises, workouts, inUse } = data
  const error = failed ?? data.error
  const all = exercises
    .map((exercise) => ({ exercise, occasions: occasionsOf(workouts, exercise.id) }))
    .sort(
      (a, b) =>
        Number(a.exercise.isArchived) - Number(b.exercise.isArchived) ||
        Number(a.occasions.length === 0) - Number(b.occasions.length === 0) ||
        (b.occasions.at(-1)?.date ?? '').localeCompare(a.occasions.at(-1)?.date ?? '') ||
        compareText(a.exercise.name, b.exercise.name),
    )
  const wanted = lower(search.trim())
  const shown = all.filter(({ exercise }) => lower(exercise.name).includes(wanted))

  return (
    <>
      <BackLink href="/library" label={t('Library.Heading')} testId="back" />
      <h1 className="large-title">{t('Library.Exercises')}</h1>
      {/* Adding, as iOS places it: a plus on glass at the right of the bar. */}
      <BarItem side="trailing">
        <button
          type="button"
          onClick={() => setCreating(true)}
          aria-haspopup="dialog"
          aria-label={t('Exercises.New')}
          title={t('Exercises.New')}
          data-testid="new-exercise"
          className={GLASS_CIRCLE}
        >
          <svg
            className="size-[1.375rem]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </BarItem>
      {creating && (
        <ModalSheet title={t('Exercises.New')} onClose={stopCreating} testId="new-exercise-sheet">
          <NewExerciseForm initialName="" onCreate={(request) => void create(request)} action={t('Exercises.Create')} />
        </ModalSheet>
      )}
      {deleting && (
        <ActionSheet
          message={t('Exercises.DeleteConfirm')}
          action={t('Common.Delete')}
          onAction={() => void remove(deleting)}
          onCancel={() => setDeleting(undefined)}
          actionTestId="confirm-delete"
        />
      )}

      {error !== undefined && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

      {all.length === 0 ? (
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
          <p>{t('Stats.NoExercises')}</p>
        </div>
      ) : (
        <>
          <SearchField
            value={search}
            onChange={(e) => changeSearch(e.target.value)}
            placeholder={t('Exercises.Search')}
            maxLength={Limits.search}
            data-testid="stats-search"
            className="mt-4"
          />
          {shown.length === 0 ? (
            <div
              className="flex flex-col items-center gap-3 px-6 py-10 text-center text-[1.0625rem] text-label-2"
              data-testid="stats-no-match"
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
            <Group className="mt-4" separatorInset="3.75rem" testId="stats-exercises">
              {shown.map(({ exercise, occasions }) => (
                <li key={exercise.id}>
                  {/* Swiped: hidden or shown again, and deleted when nothing refers to it, as its
                      own page offers. */}
                  <SwipeActions
                    actions={[
                      {
                        label: exercise.isArchived ? t('Exercises.Show') : t('Exercises.Hide'),
                        icon: exercise.isArchived ? <EyeSymbol /> : <EyeSlashSymbol />,
                        onAction: () => void save({ ...exercise, isArchived: !exercise.isArchived }),
                        testId: 'swipe-hide',
                      },
                      ...(inUse.has(exercise.id)
                        ? []
                        : [
                            {
                              label: t('Common.Delete'),
                              icon: <TrashSymbol />,
                              destructive: true,
                              onAction: () => setDeleting(exercise),
                              testId: 'swipe-delete',
                            },
                          ]),
                    ]}
                  >
                    <ExerciseLink
                      exercise={exercise}
                      href={`/stats/exercises/${exercise.id}?from=library`}
                      detail={[
                        occasions.length === 0
                          ? `${t(`Exercise.Kind.${exercise.kind}`)} · ${t('Stats.NotLogged')}`
                          : occasions.length === 1
                            ? t('Stats.ExerciseMetaOne', formatDate(occasions[0]!.date, 'd MMM yyyy'))
                            : t(
                                'Stats.ExerciseMeta',
                                occasions.length,
                                formatDate(occasions.at(-1)!.date, 'd MMM yyyy'),
                              ),
                        ...(exercise.isArchived ? [t('Exercises.Hidden')] : []),
                      ].join(' · ')}
                      dimmed={exercise.isArchived}
                    />
                  </SwipeActions>
                </li>
              ))}
            </Group>
          )}
        </>
      )}
    </>
  )
}

export function ExerciseLink({
  exercise,
  href,
  detail,
  trailing,
  gain,
  dimmed = false,
}: {
  exercise: Exercise
  href: string
  detail: string
  trailing?: string
  /** What trailing improved by, in green under it: "+10 kg". */
  gain?: string
  /** A hidden exercise, kept for its history. */
  dimmed?: boolean
}) {
  const slug = slugFor(exercise)
  return (
    <Link href={href} className={`${PICTURE_ROW} ${dimmed ? 'opacity-60' : ''}`}>
      <Picture slug={slug} size="list" lazy />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[1.0625rem] font-semibold">{exercise.name}</span>
        <span className="block truncate text-[0.9375rem] text-label-2">{detail}</span>
      </span>
      {trailing !== undefined && (
        <span className="shrink-0 text-right tabular-nums">
          <span className="block text-[1.0625rem] font-semibold" data-testid="record-value">
            {trailing}
          </span>
          {gain !== undefined && (
            <span
              className="block text-[0.9375rem] font-semibold text-green-700 dark:text-green-400"
              data-testid="record-gain"
            >
              {gain}
            </span>
          )}
        </span>
      )}
      <Chevron />
    </Link>
  )
}
