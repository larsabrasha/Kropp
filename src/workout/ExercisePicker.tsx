import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { compareText, lower, t } from '../i18n/i18n'
import { picture, slugFor } from '../illustrations/illustrations'
import { Limits } from '../training/limits'
import { EXERCISE_KINDS, type BodyArea, type Exercise, type ExerciseKind } from '../training/model'
import { CategoryChips } from '../ui/CategoryChips'
import { SearchField } from '../ui/SearchField'
import { button, PICTURE_ROW, THUMB } from '../ui/styles'

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
}: {
  exercises: readonly Exercise[]
  onPick: (exercise: Exercise) => void
  onCreate: (request: NewExercise) => void
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

  // Drawn for a sheet (ModalSheet): a search field as iOS's, the exercises as rows of a grouped
  // list, and creating one by the name searched for in a card of its own below.
  return (
    <div data-testid="exercise-picker">
      <SearchField
        ref={searchInput}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        maxLength={Limits.search}
        placeholder={t('Picker.SearchPlaceholder')}
      />

      {matches.length > 0 && (
        <ul
          className="ios-list mt-4 overflow-hidden rounded-[1.625rem] bg-cell"
          style={{ '--separator-inset': '3.75rem' } as CSSProperties}
        >
          {matches.map((exercise) => {
            const slug = slugFor(exercise)
            return (
              <li key={exercise.id}>
                <button type="button" onClick={() => onPick(exercise)} className={`${PICTURE_ROW} w-full text-left`}>
                  <span className={`size-9 ${THUMB}`} aria-hidden="true">
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
                  <span className="min-w-0 flex-1 truncate text-[1.0625rem]">{exercise.name}</span>
                  <span className="text-[0.9375rem] text-label-2">{t(`Exercise.Kind.${exercise.kind}`)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {matches.length === 0 && blank && (
        <p className="px-4 py-10 text-center text-[0.9375rem] text-label-2">{t('Picker.NoExercises')}</p>
      )}

      {!blank && !exactMatch && (
        <div className="mt-4 flex flex-col gap-3 rounded-[1.625rem] bg-cell p-4">
          <p className="pl-inset text-[0.8125rem] text-label-2">{t('Picker.Categories')}</p>
          <CategoryChips selected={newCategories} onChange={setNewCategories} />
          <label className="flex flex-col gap-1 text-[0.8125rem] text-label-2">
            <span className="pl-inset">{t('Picker.Kind')}</span>
            <select
              value={newKind}
              onChange={(e) => setNewKind(e.target.value as ExerciseKind)}
              className="rounded-xl bg-fill px-3 py-2.5 text-base text-gray-900 dark:text-white"
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
            className={`mt-1 w-full ${button('filled', 'large')}`}
          >
            {t('Picker.Create', query.trim())}
          </button>
        </div>
      )}
    </div>
  )
}
