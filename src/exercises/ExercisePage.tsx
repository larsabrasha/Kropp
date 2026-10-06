import { useCallback, useState } from 'react'
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
import { ModalSheet } from '../ui/ModalSheet'
import { BackLink } from '../ui/Layout'
import { FreeRow, SelectRow, SwitchRow, TextRow } from '../ui/Form'
import { Group } from '../ui/List'
import { ROW } from '../ui/styles'
import { IllustrationPicker } from './IllustrationPicker'

// What belongs to the exercise itself and holds in every workout and template that uses it.
// What belongs to one occasion stays on the workout's card.

const MAX_NAME = 200

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

/** The exercise, and the number of workouts that use it, from the repository's memory. */
function read(repository: LocalRepository, id: string): { exercise?: Exercise; usedIn: number; error?: string } {
  try {
    const exercise = repository.peek('exercise', id)
    const usedIn = repository.peekAll('workout').filter((w) => w.exercises.some((e) => e.exerciseId === id)).length
    return { exercise, usedIn }
  } catch (e) {
    console.error(`Could not read exercise ${id}`, e)
    return { usedIn: 0, error: t('Home.LoadFailed') }
  }
}

/** The exercise as a page of its own, in a sheet over the page it was opened from. */
export function ExercisePage({ id }: { id: string }) {
  const back = safeBack(useLocation().query.get('back'))
  return (
    <>
      <BackLink href={back ?? '/'} label={t('Common.Back')} testId="back" />
      <ExerciseDetails id={id} />
    </>
  )
}

/**
 * What belongs to the exercise, saved as it changes: on its own page (ExercisePage), and pushed
 * inside the sheet of an exercise's card, where the sheet's bar has its name instead of a large
 * title (heading false).
 */
export function ExerciseDetails({ id: routeId, heading = true }: { id: string; heading?: boolean }) {
  const id = routeId.toLowerCase()
  const repository = useRepository()

  // Read during the first render, so the page never shows without its data.
  const [initial] = useState(() => read(repository, id))
  const [exercise, setExercise] = useState<Exercise | undefined>(initial.exercise)
  const [usedIn, setUsedIn] = useState(initial.usedIn)
  const [choosingIllustration, setChoosingIllustration] = useState(false)
  const [error, setError] = useState<string | null>(initial.error ?? null)
  // Bumped to put the stored name back in the field after a name that was refused.
  const [nameKey, setNameKey] = useState(0)

  const load = useCallback(() => {
    const found = read(repository, id)
    if (found.error !== undefined) return setError(found.error)
    setExercise(found.exercise)
    setUsedIn(found.usedIn)
  }, [repository, id])

  useRemoteChange(load)

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

  const closeChoice = useCallback(() => setChoosingIllustration(false), [])
  const pickIllustration = (slug: string) => {
    setChoosingIllustration(false)
    if (exercise) void save({ ...exercise, illustration: slug })
  }

  const slug = slugFor(exercise)

  return (
    <>
      {!exercise ? (
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
          <p>{t('Exercises.NotFound')}</p>
        </div>
      ) : (
        <>
          {heading && <h1 className="large-title">{exercise.name}</h1>}
          <p className={`text-[0.9375rem] text-label-2 ${heading ? '' : 'px-4'}`} data-testid="usage">
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

          {/* An iOS form: the fields as rows of grouped lists, help as the lists' footers. */}
          <Group className="mt-5">
            <TextRow
              key={nameKey}
              label={t('Exercises.Name')}
              value={exercise.name}
              maxLength={Limits.name}
              onChange={rename}
            />
            <TextRow
              label={t('Exercises.SettingsNote')}
              value={exercise.settingsNote}
              maxLength={Limits.shortText}
              placeholder={t('Exercises.SettingsNotePlaceholder')}
              onChange={(v) => void save({ ...exercise, settingsNote: v })}
            />
          </Group>

          <Group className="mt-section" footer={t('Exercises.KindHelp')}>
            <SelectRow
              label={t('Exercises.Kind')}
              value={exercise.kind}
              onChange={(e) => changeKind(e.target.value)}
              data-testid="kind"
            >
              {EXERCISE_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {t(`Exercise.Kind.${kind}`)}
                </option>
              ))}
            </SelectRow>
            {exercise.kind === 'Strength' && (
              <SelectRow
                label={t('Exercises.WeightStep')}
                value={invariant(exercise.weightStepKg ?? DEFAULT_WEIGHT_STEP_KG)}
                onChange={(e) => changeWeightStep(e.target.value)}
                data-testid="weight-step"
              >
                {WEIGHT_STEPS.map((step) => (
                  <option key={step} value={invariant(step)}>
                    {num(step)} kg
                  </option>
                ))}
              </SelectRow>
            )}
            {exercise.kind === 'Cardio' && (
              <SwitchRow
                label={t('Exercises.TimeOnly')}
                checked={exercise.measuresTimeOnly}
                onChange={(on) => void save({ ...exercise, measuresTimeOnly: on })}
                testId="time-only"
              />
            )}
          </Group>

          <Group className="mt-section" header={t('Entry.Categories')}>
            <FreeRow>
              <CategoryChips
                selected={categoriesOf(exercise)}
                onChange={(areas) => void save({ ...exercise, categories: areas })}
              />
            </FreeRow>
          </Group>

          {/* A short label on the row and what it means under it, as iOS explains a switch in its
              group's footer. */}
          <Group className="mt-section" footer={t('Exercises.ArchivedHelp')}>
            <SwitchRow
              label={t('Exercises.Archived')}
              checked={exercise.isArchived}
              onChange={(on) => void save({ ...exercise, isArchived: on })}
              testId="archived"
            />
          </Group>

          <div className="mt-section" data-testid="illustration">
            <Group header={t('Exercises.Picture')}>
              <FreeRow>
                {slug !== undefined ? (
                  <div
                    className="mx-auto aspect-square w-full max-w-48 rounded-[0.875rem] bg-fill p-2"
                    data-testid="illustration-large"
                  >
                    <img src={picture(slug)} alt={nameOf(slug)} className="illustration size-full object-contain" />
                  </div>
                ) : (
                  <p className="text-[0.9375rem] text-label-2">{t('Illustration.None')}</p>
                )}
              </FreeRow>
              <li>
                <button
                  type="button"
                  onClick={() => setChoosingIllustration(true)}
                  aria-haspopup="dialog"
                  data-testid="change-illustration"
                  className={`${ROW} w-full text-[1.0625rem] text-tint`}
                >
                  {t('Illustration.Change')}
                </button>
              </li>
            </Group>
          </div>

          {/* Choosing a picture is a task of its own, in a sheet, never in the page. */}
          {choosingIllustration && (
            <ModalSheet title={t('Illustration.Change')} onClose={closeChoice} testId="illustration-sheet">
              <IllustrationPicker selected={slug} onPick={pickIllustration} />
            </ModalSheet>
          )}
        </>
      )}
    </>
  )
}
