import { useEffect, useRef, useState } from 'react'
import { compareText, lower, t } from '../i18n/i18n'
import { picture, slugFor } from '../illustrations/illustrations'
import { Limits } from '../training/limits'
import { EXERCISE_KINDS, type BodyArea, type Exercise, type ExerciseKind } from '../training/model'
import { CategoryChips } from '../ui/CategoryChips'

export interface NewExercise {
  name: string
  kind: ExerciseKind
  categories: BodyArea[]
}

/** Search the register to add an exercise, or create one by the name searched for. */
export function ExercisePicker({
  exercises,
  onPick,
  onCreate,
  onCancel,
}: {
  exercises: readonly Exercise[]
  onPick: (exercise: Exercise) => void
  onCreate: (request: NewExercise) => void
  onCancel: () => void
}) {
  const [query, setQuery] = useState('')
  const [newKind, setNewKind] = useState<ExerciseKind>('Strength')
  const [newCategories, setNewCategories] = useState<BodyArea[]>([])
  const searchInput = useRef<HTMLInputElement>(null)

  useEffect(() => searchInput.current?.focus(), [])

  const wanted = lower(query.trim())
  const matches = exercises
    .filter((e) => !e.isArchived && lower(e.name).includes(wanted))
    .sort((a, b) => compareText(a.name, b.name))
  const exactMatch = exercises.some((e) => lower(e.name.trim()) === wanted)
  const blank = query.trim() === ''

  const create = () => {
    if (newCategories.length > 0) onCreate({ name: query.trim(), kind: newKind, categories: newCategories })
  }

  return (
    <div
      className="rounded-xl border border-blue-300 bg-white p-4 dark:border-blue-800 dark:bg-gray-900"
      data-testid="exercise-picker"
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="pl-inset">{t('Picker.Search')}</span>
        <input
          ref={searchInput}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          maxLength={Limits.search}
          placeholder={t('Picker.SearchPlaceholder')}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-base dark:border-gray-700 dark:bg-gray-900"
        />
      </label>

      <ul className="mt-3 flex max-h-72 flex-col gap-1 overflow-y-auto">
        {matches.map((exercise) => {
          const slug = slugFor(exercise)
          return (
            <li key={exercise.id}>
              <button
                type="button"
                onClick={() => onPick(exercise)}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:bg-gray-800"
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
                      data-testid="picker-thumbnail"
                    />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate">{exercise.name}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">{t(`Exercise.Kind.${exercise.kind}`)}</span>
              </button>
            </li>
          )
        })}
      </ul>

      {matches.length === 0 && blank && (
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{t('Picker.NoExercises')}</p>
      )}

      {!blank && !exactMatch && (
        <div className="mt-3 flex flex-col gap-2 border-t border-gray-200 pt-3 dark:border-gray-800">
          <p className="pl-inset text-sm text-gray-600 dark:text-gray-400">{t('Picker.Categories')}</p>
          <CategoryChips selected={newCategories} onChange={setNewCategories} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="pl-inset">{t('Picker.Kind')}</span>
            <select
              value={newKind}
              onChange={(e) => setNewKind(e.target.value as ExerciseKind)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-base dark:border-gray-700 dark:bg-gray-900"
            >
              {EXERCISE_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {t(`Exercise.Kind.${kind}`)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={create}
            data-testid="create-exercise"
            disabled={newCategories.length === 0}
            className="rounded-lg bg-accent-600 px-4 py-2 font-medium text-white hover:bg-accent-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50"
          >
            {t('Picker.Create', query.trim())}
          </button>
        </div>
      )}

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          {t('Common.Cancel')}
        </button>
      </div>
    </div>
  )
}
