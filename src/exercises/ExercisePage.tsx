import { useCallback, useEffect, useState } from 'react'
import { t } from '../i18n/i18n'
import { nameOf, picture, slugFor } from '../illustrations/illustrations'
import { useLocation } from '../route'
import { useRemoteChange, useRepository } from '../services'
import type { LocalRepository } from '../sync/localRepo'
import { categoriesOf } from '../training/categories'
import { Limits } from '../training/limits'
import {
  DEFAULT_WEIGHT_STEP_KG,
  EXERCISE_KINDS,
  WEIGHT_STEPS,
  type Exercise,
  type ExerciseKind,
} from '../training/model'
import { invariant, num, parseDecimal } from '../training/text'
import { CategoryChips } from '../ui/CategoryChips'
import { DoneRow } from '../ui/EditorActions'
import { BackLink } from '../ui/Layout'
import { TextField } from '../ui/TextField'
import { IllustrationPicker } from './IllustrationPicker'

// What belongs to the exercise itself and holds in every workout and template that uses it.
// What belongs to one occasion stays on the workout's card.

const MAX_NAME = 200

const SELECT =
  'rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100'

/**
 * The workout or template the user came from, to go back to it. Only a workout or a template of
 * this app, never a URL from elsewhere. The leading slash is optional: links from before 2026-10-05
 * were relative.
 */
function safeBack(back: string | null): string | undefined {
  return back !== null && /^\/?(workouts|templates)\/[0-9a-fA-F-]{36}$/.test(back)
    ? `/${back.replace(/^\//, '')}`
    : undefined
}

/** The exercise, and the number of workouts that use it. */
async function read(repository: LocalRepository, id: string) {
  const exercise = await repository.get('exercise', id)
  const usedIn = (await repository.getAll('workout')).filter((w) => w.exercises.some((e) => e.exerciseId === id)).length
  return { exercise, usedIn }
}

export function ExercisePage({ id: routeId }: { id: string }) {
  const id = routeId.toLowerCase()
  const repository = useRepository()
  const back = safeBack(useLocation().query.get('back'))

  const [exercise, setExercise] = useState<Exercise | undefined>()
  const [usedIn, setUsedIn] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [choosingIllustration, setChoosingIllustration] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Bumped to put the stored name back in the field after a name that was refused.
  const [nameKey, setNameKey] = useState(0)

  const load = useCallback(
    () =>
      read(repository, id).then(
        (found) => {
          setExercise(found.exercise)
          setUsedIn(found.usedIn)
          setLoaded(true)
        },
        (e) => {
          console.error(`Could not read exercise ${id}`, e)
          setError(t('Home.LoadFailed'))
          setLoaded(true)
        },
      ),
    [repository, id],
  )

  useEffect(() => {
    void load()
  }, [load])
  useRemoteChange(() => void load())

  const save = async (next: Exercise) => {
    const previous = exercise
    setExercise(next)
    setError(null)
    try {
      await repository.save('exercise', next.id, next)
    } catch (e) {
      console.error(`Could not save exercise ${next.id}`, e)
      setExercise(previous)
      setError(t('Home.SaveFailed'))
    }
  }

  const rename = (name: string | undefined) => {
    if (!exercise) return
    if (name === undefined || name.trim() === '' || name.trim().length > MAX_NAME) {
      setError(
        name === undefined || name.trim() === '' ? t('Exercises.NameRequired') : t('Exercises.NameTooLong', MAX_NAME),
      )
      setNameKey((k) => k + 1)
      return
    }
    void save({ ...exercise, name: name.trim() })
  }

  // A kind set wrong at import, like Sit ups taken for weights. What is stored stays; it is shown
  // by the new kind, so a weight on a bodyweight exercise is simply not shown.
  const changeKind = (value: string) => {
    if (exercise && (EXERCISE_KINDS as readonly string[]).includes(value))
      void save({ ...exercise, kind: value as ExerciseKind })
  }

  const changeWeightStep = (value: string) => {
    const step = parseDecimal(value)
    if (exercise && step !== undefined && (WEIGHT_STEPS as readonly number[]).includes(step))
      void save({ ...exercise, weightStepKg: step === DEFAULT_WEIGHT_STEP_KG ? undefined : step })
  }

  const pickIllustration = (slug: string) => {
    setChoosingIllustration(false)
    if (exercise) void save({ ...exercise, illustration: slug })
  }

  const slug = slugFor(exercise)

  return (
    <>
      <BackLink href={back ?? '/exercises'} label={back ? t('Common.Back') : t('Exercises.Heading')} testId="back" />

      {!loaded ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('Common.Loading')}</p>
      ) : !exercise ? (
        <div
          className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-300 px-4 py-10 text-center text-gray-500 dark:border-gray-700 dark:text-gray-400"
          data-testid="not-found"
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
          <p>{t('Exercises.NotFound')}</p>
        </div>
      ) : (
        <>
          <h1 className="text-xl font-semibold">{exercise.name}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400" data-testid="usage">
            {t(`Exercise.Kind.${exercise.kind}`)} ·{' '}
            {usedIn === 0
              ? t('Exercises.UsedInNone')
              : usedIn === 1
                ? t('Exercises.UsedInOne')
                : t('Exercises.UsedIn', usedIn)}
          </p>

          {error !== null && (
            <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          )}

          <section className="mt-4 flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            <TextField
              key={nameKey}
              label={t('Exercises.Name')}
              value={exercise.name}
              maxLength={Limits.name}
              onChange={rename}
            />
            <label className="flex flex-col gap-1 text-xs text-gray-600 dark:text-gray-400">
              <span className="pl-inset">{t('Exercises.Kind')}</span>
              <select
                value={exercise.kind}
                onChange={(e) => changeKind(e.target.value)}
                data-testid="kind"
                className={SELECT}
              >
                {EXERCISE_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {t(`Exercise.Kind.${kind}`)}
                  </option>
                ))}
              </select>
              <span className="pl-inset">{t('Exercises.KindHelp')}</span>
            </label>
            <TextField
              label={t('Exercises.SettingsNote')}
              value={exercise.settingsNote}
              maxLength={Limits.shortText}
              placeholder={t('Exercises.SettingsNotePlaceholder')}
              onChange={(v) => void save({ ...exercise, settingsNote: v })}
            />

            <div className="flex flex-col gap-1 text-xs text-gray-600 dark:text-gray-400">
              <span className="pl-inset">{t('Entry.Categories')}</span>
              <CategoryChips
                selected={categoriesOf(exercise)}
                onChange={(areas) => void save({ ...exercise, categories: areas })}
              />
            </div>

            {exercise.kind === 'Strength' && (
              <label className="flex flex-col gap-1 text-xs text-gray-600 dark:text-gray-400">
                <span className="pl-inset">{t('Exercises.WeightStep')}</span>
                <select
                  value={invariant(exercise.weightStepKg ?? DEFAULT_WEIGHT_STEP_KG)}
                  onChange={(e) => changeWeightStep(e.target.value)}
                  data-testid="weight-step"
                  className={`w-32 ${SELECT}`}
                >
                  {WEIGHT_STEPS.map((step) => (
                    <option key={step} value={invariant(step)}>
                      {num(step)} kg
                    </option>
                  ))}
                </select>
              </label>
            )}

            {exercise.kind === 'Cardio' && (
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={exercise.measuresTimeOnly}
                  onChange={(e) => void save({ ...exercise, measuresTimeOnly: e.target.checked })}
                  data-testid="time-only"
                  className="mt-0.5 size-5 shrink-0 rounded border-gray-300 dark:border-gray-700"
                />
                <span>{t('Exercises.TimeOnly')}</span>
              </label>
            )}

            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={exercise.isArchived}
                onChange={(e) => void save({ ...exercise, isArchived: e.target.checked })}
                data-testid="archived"
                className="mt-0.5 size-5 shrink-0 rounded border-gray-300 dark:border-gray-700"
              />
              <span>{t('Exercises.Archived')}</span>
            </label>
          </section>

          <section
            className="mt-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
            data-testid="illustration"
          >
            <h2 className="mb-2 text-base font-semibold">{t('Exercises.Picture')}</h2>
            {choosingIllustration ? (
              <>
                <IllustrationPicker selected={slug} onPick={pickIllustration} />
                <DoneRow onDone={() => setChoosingIllustration(false)} />
              </>
            ) : (
              <>
                {slug !== undefined ? (
                  <div
                    className="mx-auto aspect-square w-full max-w-48 rounded-lg bg-gray-100 p-2 dark:bg-gray-800"
                    data-testid="illustration-large"
                  >
                    <img src={picture(slug)} alt={nameOf(slug)} className="illustration size-full object-contain" />
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">{t('Illustration.None')}</p>
                )}
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setChoosingIllustration(true)}
                    data-testid="change-illustration"
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
                  >
                    {t('Illustration.Change')}
                  </button>
                </div>
              </>
            )}
          </section>
        </>
      )}
    </>
  )
}
