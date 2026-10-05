import { useCallback, useEffect, useState } from 'react'
import { t } from '../i18n/i18n'
import { navigate } from '../route'
import { useRemoteChange, useRepository } from '../services'
import { Limits } from '../training/limits'
import type { Exercise, Workout, WorkoutTemplate } from '../training/model'
import { BackLink } from '../ui/Layout'
import { TextField } from '../ui/TextField'
import { ExerciseList } from '../workout/ExerciseList'

// The editing helpers work on a workout's entry list; a template is the same list without results.
const asWorkout = (template: WorkoutTemplate): Workout => ({
  id: template.id,
  date: '9999-12-31',
  status: 'Planned',
  exercises: template.exercises,
})

export function TemplatePage({ id }: { id: string }) {
  const repository = useRepository()
  const [loaded, setLoaded] = useState(false)
  const [template, setTemplate] = useState<WorkoutTemplate>()
  const [exercises, setExercises] = useState<ReadonlyMap<string, Exercise>>(new Map())
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [error, setError] = useState<string>()

  // Read first and set state in the callbacks: the effect below then never sets state synchronously.
  const load = useCallback(
    () =>
      Promise.all([repository.getAll('exercise'), repository.getAll('workout'), repository.get('template', id)])
        .then(
          ([list, all, found]) => {
            setExercises(new Map(list.map((e) => [e.id, e])))
            setWorkouts(all)
            setTemplate(found)
          },
          (e) => {
            console.error(`Could not read template ${id}`, e)
            setError(t('Home.LoadFailed'))
          },
        )
        .then(() => setLoaded(true)),
    [repository, id],
  )

  useEffect(() => {
    void load()
  }, [load])
  useRemoteChange(() => void load())

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

      {!loaded ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('Common.Loading')}</p>
      ) : !template ? (
        <div
          className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-300 px-4 py-10 text-center text-gray-500 dark:border-gray-700 dark:text-gray-400"
          data-testid="not-found"
        >
          <p>{t('Templates.NotFound')}</p>
        </div>
      ) : (
        <>
          <h1 className="sr-only">{template.name}</h1>
          <TextField label={t('Templates.Name')} value={template.name} maxLength={Limits.name} onChange={rename} />

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

          <section className="mt-8 flex justify-end border-t border-gray-200 pt-4 dark:border-gray-800">
            {confirmingDelete ? (
              <div className="flex items-center gap-2" role="alertdialog" aria-label={t('Templates.DeleteConfirm')}>
                <span className="text-sm">{t('Templates.DeleteConfirm')}</span>
                <button
                  type="button"
                  onClick={() => void remove()}
                  className="rounded-lg bg-red-600 px-4 py-2.5 font-medium text-white hover:bg-red-700"
                >
                  {t('Templates.Delete')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="rounded-lg px-4 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  {t('Common.Cancel')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="rounded-lg px-4 py-2.5 font-medium text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
              >
                {t('Templates.DeleteTemplate')}
              </button>
            )}
          </section>
        </>
      )}
    </>
  )
}
