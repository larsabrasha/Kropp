import { useCallback, useRef, useState } from 'react'
import { compareText, t } from '../i18n/i18n'
import { Link, navigate } from '../route'
import { useRemoteChange, useRepository } from '../services'
import type { LocalRepository } from '../sync/localRepo'
import { iconFor } from '../training/categories'
import { newId, type Exercise, type WorkoutTemplate } from '../training/model'
import { BackLink } from '../ui/Layout'
import { PlanIcon } from '../ui/PlanIcon'

/** The templates by name and the exercises, from the repository's memory. */
function read(repository: LocalRepository) {
  try {
    return {
      templates: repository.peekAll('template').sort((a, b) => compareText(a.name, b.name)),
      exercises: new Map(repository.peekAll('exercise').map((e) => [e.id, e])) as ReadonlyMap<string, Exercise>,
    }
  } catch (e) {
    console.error('Could not read templates', e)
    return { templates: [], exercises: new Map<string, Exercise>(), error: t('Home.LoadFailed') }
  }
}

export function TemplatesPage() {
  const repository = useRepository()
  // Read during the first render, so the page never shows without its data.
  const [initial] = useState(() => read(repository))
  const [templates, setTemplates] = useState<WorkoutTemplate[]>(initial.templates)
  const [exercises, setExercises] = useState<ReadonlyMap<string, Exercise>>(initial.exercises)
  const [error, setError] = useState<string | undefined>(initial.error)
  const [creating, setCreating] = useState(false)
  const creatingNow = useRef(false)

  const load = useCallback(() => {
    const found = read(repository)
    setTemplates(found.templates)
    setExercises(found.exercises)
    if (found.error !== undefined) setError(found.error)
  }, [repository])

  useRemoteChange(load)

  /** An empty template named "Ny mall", opened at once to add exercises and a name. */
  async function create() {
    if (creatingNow.current) return
    creatingNow.current = true
    setCreating(true)
    try {
      const template: WorkoutTemplate = { id: newId(), name: t('Templates.New'), exercises: [] }
      await repository.save('template', template.id, template)
      navigate(`/templates/${template.id}`)
    } catch (e) {
      console.error('Could not create template', e)
      setError(t('Home.SaveFailed'))
    } finally {
      creatingNow.current = false
      setCreating(false)
    }
  }

  return (
    <>
      <BackLink href="/settings" label={t('Settings.Heading')} />
      <h1 className="text-xl font-semibold">{t('Templates.Heading')}</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('Templates.Help')}</p>

      <button
        type="button"
        onClick={() => void create()}
        disabled={creating}
        data-testid="new-template"
        className="mt-4 w-full rounded-xl border-2 border-dashed border-blue-300 px-4 py-4 font-medium text-blue-700 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-60 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-950"
      >
        {creating ? t('Common.Loading') : '+ ' + t('Templates.New')}
      </button>

      {error !== undefined && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

      {templates.length === 0 ? (
        <div
          className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-300 px-4 py-10 text-center text-gray-500 dark:border-gray-700 dark:text-gray-400"
          data-testid="templates-empty"
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
            <rect x="5" y="3" width="14" height="18" rx="2" />
            <path d="M9 8h6M9 12h6M9 16h3" />
          </svg>
          <p>{t('Next.NoTemplates')}</p>
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-2" data-testid="templates">
          {templates.map((template) => (
            <li key={template.id}>
              <Link
                href={`/templates/${template.id}`}
                className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800"
              >
                <PlanIcon
                  slug={iconFor(
                    { id: template.id, date: '0001-01-01', status: 'Planned', exercises: template.exercises },
                    exercises,
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{template.name}</span>
                  <span className="block truncate text-sm text-gray-500 dark:text-gray-400">
                    {template.exercises
                      .map((e) => exercises.get(e.exerciseId)?.name ?? t('Exercise.Unknown'))
                      .join(', ')}
                  </span>
                </span>
                <svg
                  className="size-5 shrink-0 text-gray-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
