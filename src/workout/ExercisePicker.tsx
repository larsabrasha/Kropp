import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { compareText, lower, t } from '../i18n/i18n'
import { slugFor } from '../illustrations/illustrations'
import { Limits } from '../training/limits'
import { EXERCISE_KINDS, type BodyArea, type Exercise, type ExerciseKind } from '../training/model'
import { CategoryChips } from '../ui/CategoryChips'
import { FreeRow, SelectRow } from '../ui/Form'
import { Group } from '../ui/List'
import { SearchField } from '../ui/SearchField'
import { button, PICTURE_ROW } from '../ui/styles'
import { Picture } from '../ui/Picture'

export interface NewExercise {
  name: string
  kind: ExerciseKind
  categories: BodyArea[]
}

/**
 * Search the register to add an exercise, drawn for a sheet (ModalSheet): a search field as
 * iOS's, the exercises as rows of a grouped list, and last a row for a new one, which pushes its
 * form inside the sheet (NewExerciseForm) rather than growing one in the list. query lives with
 * the sheet, so the search is still there on the way back from the form.
 */
export function ExercisePicker({
  exercises,
  query,
  onQuery,
  onPick,
  onNew,
}: {
  exercises: readonly Exercise[]
  query: string
  onQuery: (query: string) => void
  onPick: (exercise: Exercise) => void
  /** Opens the form for a new exercise, named as searched for unless that name exists. */
  onNew: (name: string) => void
}) {
  const searchInput = useRef<HTMLInputElement>(null)
  useEffect(() => searchInput.current?.focus(), [])

  const wanted = lower(query.trim())
  const matches = exercises
    .filter((e) => !e.isArchived && lower(e.name).includes(wanted))
    .sort((a, b) => compareText(a.name, b.name))
  const exactMatch = exercises.some((e) => lower(e.name.trim()) === wanted)
  const newName = wanted === '' || exactMatch ? '' : query.trim()

  return (
    <div data-testid="exercise-picker">
      <SearchField
        ref={searchInput}
        value={query}
        onChange={(e) => onQuery(e.target.value)}
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
                  <Picture slug={slug} size="list" lazy imageTestId="picker-thumbnail" />
                  <span className="min-w-0 flex-1 truncate text-[1.0625rem]">{exercise.name}</span>
                  <span className="text-[0.9375rem] text-label-2">{t(`Exercise.Kind.${exercise.kind}`)}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {matches.length === 0 && (
        <p className="px-4 pt-6 pb-2 text-center text-[0.9375rem] text-label-2" data-testid="picker-empty">
          {wanted === '' ? t('Picker.NoExercises') : t('Exercises.NoMatches')}
        </p>
      )}

      {/* A new exercise, last, as iOS adds to its own lists: in the tint, with a plus. */}
      <ul className="ios-list mt-4 overflow-hidden rounded-[1.625rem] bg-cell">
        <li>
          <button
            type="button"
            onClick={() => onNew(newName)}
            data-testid="new-exercise"
            className={`${PICTURE_ROW} w-full text-left text-[1.0625rem] text-tint`}
          >
            <span className="flex size-9 shrink-0 items-center justify-center" aria-hidden="true">
              <svg
                className="size-6"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
            <span className="min-w-0 flex-1 truncate">
              {newName === '' ? t('Picker.New') : t('Picker.NewNamed', newName)}
            </span>
          </button>
        </li>
      </ul>
    </div>
  )
}

/**
 * A new exercise, pushed inside the picker's sheet: its name, kind and what it trains, as rows of
 * an iOS form, and the one action large and blue under them, as planning ends. It needs a name and
 * at least one area, which the button waits for.
 */
export function NewExerciseForm({
  initialName,
  onCreate,
  action = t('Picker.Create'),
}: {
  initialName: string
  onCreate: (request: NewExercise) => void
  /** The button's word: "Skapa och lägg till" in a workout, "Skapa" in the library. */
  action?: string
}) {
  const [name, setName] = useState(initialName)
  const [kind, setKind] = useState<ExerciseKind>('Strength')
  const [categories, setCategories] = useState<BodyArea[]>([])
  const nameInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (initialName === '') nameInput.current?.focus()
  }, [initialName])

  const ready = name.trim() !== '' && categories.length > 0
  const create = () => {
    if (ready) onCreate({ name: name.trim(), kind, categories })
  }

  return (
    <div className="flex flex-col gap-section" data-testid="new-exercise-form">
      <Group>
        <li>
          <label className="flex min-h-[3.25rem] items-center gap-4 px-4">
            <span className="shrink-0 text-[1.0625rem]">{t('Exercises.Name')}</span>
            <input
              ref={nameInput}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={Limits.name}
              placeholder={t('Picker.NamePlaceholder')}
              data-testid="new-exercise-name"
              className="min-w-0 flex-1 bg-transparent py-2.5 text-right text-[1.0625rem] outline-none placeholder:text-label-3"
            />
          </label>
        </li>
        <SelectRow
          label={t('Picker.Kind')}
          value={kind}
          onChange={(e) => setKind(e.target.value as ExerciseKind)}
          data-testid="new-exercise-kind"
        >
          {EXERCISE_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`Exercise.Kind.${k}`)}
            </option>
          ))}
        </SelectRow>
      </Group>

      <Group header={t('Picker.Categories')}>
        <FreeRow>
          <CategoryChips selected={categories} onChange={setCategories} />
        </FreeRow>
      </Group>

      <button
        type="button"
        onClick={create}
        disabled={!ready}
        data-testid="create-exercise"
        className={`w-full ${button('filled', 'large')}`}
      >
        {action}
      </button>
    </div>
  )
}
