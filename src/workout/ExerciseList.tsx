import { useCallback, useEffect, useRef, useState } from 'react'
import Sortable from 'sortablejs'
import { t } from '../i18n/i18n'
import type { ExerciseMap } from '../training/categories'
import { ModalSheet } from '../ui/ModalSheet'
import { button } from '../ui/styles'
import {
  addExercise,
  currentEntry as currentEntryOf,
  lastTime,
  lastTimeOn,
  moveEntry,
  removeEntry,
  replaceEntry,
} from '../training/editing'
import { newId, type Exercise, type Workout } from '../training/model'
import { ExerciseEntryCard } from './ExerciseEntryCard'
import { ExercisePicker, NewExerciseForm, type NewExercise } from './ExercisePicker'

// The exercises of a workout or a template: the cards, drag and drop, and adding from the
// register. Shared by the workout page and the template page, which only differ in what they
// show around it and how they save. Edits are raised as a whole new list for the page to save.
//
// The page keys the list by the owner's id, so another workout starts with everything closed.

export function ExerciseList({
  owner,
  exercises,
  history,
  forTemplate = false,
  editing = false,
  onChange,
  onExerciseChange,
}: {
  /** The list as a workout; a template passes its exercises in one. */
  owner: Workout
  exercises: ExerciseMap
  /** Every workout, for "last time" and for the targets an added exercise starts from. */
  history: readonly Workout[]
  forTemplate?: boolean
  /**
   * Edit mode, as iOS edits a list: only the rows, each with a minus and a handle. Dragging is
   * only then, so a touch on a card outside it is always a tap or a scroll. The page turns it on
   * from its menu and off with Done in its bar.
   */
  editing?: boolean
  onChange: (workout: Workout) => void | Promise<void>
  /** Called with an exercise created in the register, for the page to save. */
  onExerciseChange: (exercise: Exercise) => void | Promise<void>
}) {
  const [activeEntry, setActiveEntry] = useState<number>()
  const [picking, setPicking] = useState(false)
  // The picker's search, kept while a new exercise's form is pushed over it.
  const [query, setQuery] = useState('')
  // The name a new exercise's form starts from, while the form is pushed inside the sheet.
  const [newName, setNewName] = useState<string>()
  const stopPicking = useCallback(() => {
    setPicking(false)
    setQuery('')
    setNewName(undefined)
  }, [])
  const entryList = useRef<HTMLDivElement>(null)

  const currentEntry = forTemplate ? undefined : currentEntryOf(owner)

  // What a drop does, kept current for the Sortable made once below.
  const reordered = useRef<(from: number, to: number) => void>(() => {})
  useEffect(() => {
    reordered.current = (from, to) => {
      setActiveEntry(undefined)
      void onChange(moveEntry(owner, from, to))
    }
  })

  // Drag-and-drop reordering with SortableJS, in edit mode: drag by the handle, a short delay on touch so a swipe
  // still scrolls, and the DOM put back after the drop so React alone decides the order when it
  // renders again.
  const sortable = useRef<Sortable>(undefined)
  useEffect(() => {
    const list = entryList.current
    if (!list) return
    try {
      sortable.current = Sortable.create(list, {
        disabled: true,
        animation: 150,
        handle: '.drag-handle',
        delay: 150,
        delayOnTouchOnly: true,
        touchStartThreshold: 5,
        ghostClass: 'opacity-0',
        onEnd(evt) {
          const { oldIndex, newIndex } = evt
          if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) return
          const parent = evt.from
          parent.insertBefore(evt.item, parent.children[oldIndex < newIndex ? oldIndex : oldIndex + 1] ?? null)
          reordered.current(oldIndex, newIndex)
        },
      })
    } catch (error) {
      console.warn('Could not start drag and drop', error)
      return
    }
    return () => {
      sortable.current?.destroy()
      sortable.current = undefined
    }
  }, [])
  useEffect(() => sortable.current?.option('disabled', !editing), [editing])
  // Entering edit mode closes what was open, so Done does not bring it back.
  const [wasEditing, setWasEditing] = useState(editing)
  if (wasEditing !== editing) {
    setWasEditing(editing)
    if (editing) setActiveEntry(undefined)
  }

  const remove = (index: number) => {
    setActiveEntry(undefined)
    return onChange(removeEntry(owner, index))
  }

  const add = (exercise: Exercise) => {
    stopPicking()
    return onChange(addExercise(owner, exercise, lastTime(history, owner, exercise.id)))
  }

  const create = async (request: NewExercise) => {
    const exercise: Exercise = {
      id: newId(),
      name: request.name,
      kind: request.kind,
      categories: request.categories,
      isArchived: false,
      measuresTimeOnly: false,
    }
    await onExerciseChange(exercise)
    await add(exercise)
  }

  return (
    <section className="flex flex-col gap-5">
      {owner.exercises.length === 0 && !picking && (
        <div
          className="flex flex-col items-center gap-3 px-6 py-14 text-center text-[1.0625rem] text-label-2"
          data-testid="no-exercises"
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
          <p>{t('Workout.NoExercises')}</p>
        </div>
      )}

      <div ref={entryList} className="flex flex-col gap-5" data-testid="entry-list">
        {owner.exercises.map((entry, index) => {
          const last = forTemplate ? undefined : lastTimeOn(history, owner, entry.exerciseId)
          return (
            <ExerciseEntryCard
              key={`${entry.exerciseId}:${entry.order}`}
              forTemplate={forTemplate}
              editing={editing}
              entry={entry}
              exercise={exercises.get(entry.exerciseId)}
              lastTime={last?.entry}
              lastTimeDate={last?.date}
              current={index === currentEntry}
              active={activeEntry === index}
              onActivate={() => setActiveEntry(index)}
              onChange={(next) => void onChange(replaceEntry(owner, index, next))}
              onRemove={() => void remove(index)}
            />
          )
        })}
      </div>

      <button
        type="button"
        onClick={() => setPicking(true)}
        data-testid="add-exercise"
        className={button('tinted', 'large')}
      >
        + {t('Workout.AddExercise')}
      </button>
      {/* Choosing the exercise is a task of its own, in a sheet over the workout. */}
      {picking && (
        <ModalSheet
          title={t('Workout.AddExercise')}
          onClose={stopPicking}
          testId="exercise-sheet"
          pushed={
            newName !== undefined
              ? {
                  title: t('Picker.New'),
                  content: <NewExerciseForm initialName={newName} onCreate={(request) => void create(request)} />,
                  onBack: () => setNewName(undefined),
                }
              : undefined
          }
        >
          <ExercisePicker
            exercises={[...exercises.values()]}
            query={query}
            onQuery={setQuery}
            onPick={(exercise) => void add(exercise)}
            onNew={setNewName}
          />
        </ModalSheet>
      )}
    </section>
  )
}
