import { useCallback, useState } from 'react'
import { t } from '../i18n/i18n'
import { navigate } from '../route'
import { useRemoteChange, useRepository } from '../services'
import type { LocalRepository } from '../sync/localRepo'
import { Limits } from '../training/limits'
import type { Exercise, Workout, WorkoutTemplate } from '../training/model'
import { BackLink, BarItem } from '../ui/Layout'
import { MenuButton } from '../ui/Menu'
import { ActionSheet } from '../ui/ActionSheet'
import { TextRow } from '../ui/Form'
import { Group } from '../ui/List'
import { ExerciseList } from '../workout/ExerciseList'

// The editing helpers work on a workout's entry list; a template is the same list without results.
const asWorkout = (template: WorkoutTemplate): Workout => ({
  id: template.id,
  date: '9999-12-31',
  status: 'Planned',
  exercises: template.exercises,
})

/** The template, the exercises and every workout, from the repository's memory. */
function read(repository: LocalRepository, id: string) {
  try {
    return {
      template: repository.peek('template', id),
      exercises: new Map(repository.peekAll('exercise').map((e) => [e.id, e])) as ReadonlyMap<string, Exercise>,
      workouts: repository.peekAll('workout'),
    }
  } catch (e) {
    console.error(`Could not read template ${id}`, e)
    return { template: undefined, exercises: new Map<string, Exercise>(), workouts: [], error: t('Home.LoadFailed') }
  }
}

const TrashSymbol = () => (
  <svg
    className="size-5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M5 7h14M10 11v6M14 11v6M7 7l1 13h8l1-13M9.5 7V4.5h5V7" />
  </svg>
)

export function TemplatePage({ id }: { id: string }) {
  const repository = useRepository()
  // Read during the first render, so the page never shows without its data.
  const [initial] = useState(() => read(repository, id))
  const [template, setTemplate] = useState<WorkoutTemplate | undefined>(initial.template)
  const [exercises, setExercises] = useState<ReadonlyMap<string, Exercise>>(initial.exercises)
  const [workouts, setWorkouts] = useState<Workout[]>(initial.workouts)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [error, setError] = useState<string | undefined>(initial.error)

  const load = useCallback(() => {
    const found = read(repository, id)
    if (found.error !== undefined) return setError(found.error)
    setExercises(found.exercises)
    setWorkouts(found.workouts)
    setTemplate(found.template)
  }, [repository, id])

  useRemoteChange(load)

  async function save(next: WorkoutTemplate) {
    const previous = template
    setTemplate(next)
    setError(undefined)
    try {
      await repository.save('template', next.id, next)
    } catch (e) {
      console.error(`Could not save template ${next.id}`, e)
      setTemplate(previous)
      setError(t('Home.SaveFailed'))
    }
  }

  const rename = (name: string | undefined) => {
    if (name?.trim() && template) void save({ ...template, name: name.trim() })
  }

  async function saveExercise(exercise: Exercise) {
    try {
      await repository.save('exercise', exercise.id, exercise)
      setExercises((all) => new Map(all).set(exercise.id, exercise))
    } catch (e) {
      console.error(`Could not save exercise ${exercise.id}`, e)
      setError(t('Home.SaveFailed'))
    }
  }

  async function remove() {
    try {
      await repository.delete('template', id)
      navigate('/templates')
    } catch (e) {
      console.error('Could not delete template', e)
      setError(t('Home.SaveFailed'))
    }
  }

  return (
    <>
      <BackLink href="/templates" label={t('Templates.Heading')} />

      {/* The template's actions behind "⋯" in the bar, as the workout's. */}
      {template && (
        <BarItem side="trailing">
          <MenuButton
            label={t('Workout.Actions')}
            testId="template-menu"
            groups={[
              [
                {
                  label: t('Templates.DeleteTemplate'),
                  icon: <TrashSymbol />,
                  onSelect: () => setConfirmingDelete(true),
                  destructive: true,
                  testId: 'delete-template',
                },
              ],
            ]}
          />
        </BarItem>
      )}

      {!template ? (
        <div
          className="flex flex-col items-center gap-3 px-6 py-14 text-center text-[1.0625rem] text-label-2"
          data-testid="not-found"
        >
          <p>{t('Templates.NotFound')}</p>
        </div>
      ) : (
        <>
          <h1 className="sr-only">{template.name}</h1>
          <Group>
            <TextRow label={t('Templates.Name')} value={template.name} maxLength={Limits.name} onChange={rename} />
          </Group>

          {error !== undefined && (
            <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          )}

          <div className="mt-6">
            <ExerciseList
              key={template.id}
              owner={asWorkout(template)}
              exercises={exercises}
              history={workouts}
              forTemplate
              onChange={(edited) => save({ ...template, exercises: edited.exercises })}
              onExerciseChange={saveExercise}
            />
          </div>

          {confirmingDelete && (
            <ActionSheet
              message={t('Templates.DeleteConfirm')}
              action={t('Templates.Delete')}
              onAction={() => void remove()}
              onCancel={() => setConfirmingDelete(false)}
            />
          )}
        </>
      )}
    </>
  )
}
