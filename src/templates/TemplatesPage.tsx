import { useCallback, useRef, useState } from 'react'
import { compareText, t } from '../i18n/i18n'
import { Link, navigate } from '../route'
import { useRemoteChange, useRepository } from '../services'
import type { LocalRepository } from '../sync/localRepo'
import { iconFor } from '../training/categories'
import { newId, type Exercise, type WorkoutTemplate } from '../training/model'
import { BackLink, BarItem, GLASS_CIRCLE } from '../ui/Layout'
import { Chevron, Group } from '../ui/List'
import { PICTURE_ROW } from '../ui/styles'
import { ActionSheet } from '../ui/ActionSheet'
import { Picture } from '../ui/Picture'
import { SwipeActions } from '../ui/SwipeActions'
import { TrashSymbol } from '../ui/symbols'

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
  // The template a swipe asked to delete, until the user confirms.
  const [deleting, setDeleting] = useState<WorkoutTemplate>()
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

  async function remove(template: WorkoutTemplate) {
    setDeleting(undefined)
    try {
      await repository.delete('template', template.id)
      setTemplates((all) => all.filter((x) => x.id !== template.id))
    } catch (e) {
      console.error('Could not delete template', e)
      setError(t('Home.SaveFailed'))
    }
  }

  return (
    <>
      <BackLink href="/library" label={t('Library.Heading')} />
      <h1 className="large-title">{t('Templates.Heading')}</h1>

      {/* Adding, as iOS places it: a plus on glass at the right of the bar. */}
      <BarItem side="trailing">
        <button
          type="button"
          onClick={() => void create()}
          disabled={creating}
          data-testid="new-template"
          aria-label={t('Templates.New')}
          title={t('Templates.New')}
          className={`${GLASS_CIRCLE} disabled:opacity-50`}
        >
          {creating ? (
            <svg className="size-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeDasharray="42 100" />
            </svg>
          ) : (
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
          )}
        </button>
      </BarItem>

      {error !== undefined && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

      {templates.length === 0 ? (
        <div
          className="mt-4 flex flex-col items-center gap-3 px-6 py-14 text-center text-[1.0625rem] text-label-2"
          data-testid="templates-empty"
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
            <rect x="5" y="3" width="14" height="18" rx="2" />
            <path d="M9 8h6M9 12h6M9 16h3" />
          </svg>
          <p className="text-[1.375rem] font-bold text-gray-900 dark:text-white">{t('Next.NoTemplates')}</p>
          <p className="text-[0.9375rem]">{t('Templates.Help')}</p>
        </div>
      ) : (
        <Group className="mt-5" testId="templates" separatorInset="4.5rem" footer={t('Templates.Help')}>
          {templates.map((template) => (
            <li key={template.id}>
              {/* Swiped, it offers to delete, as ⋯ does inside the template. */}
              <SwipeActions
                actions={[
                  {
                    label: t('Common.Delete'),
                    icon: <TrashSymbol />,
                    destructive: true,
                    onAction: () => setDeleting(template),
                    testId: 'swipe-delete',
                  },
                ]}
              >
                <Link href={`/templates/${template.id}`} className={PICTURE_ROW}>
                  <Picture
                    size="plan"
                    slug={iconFor(
                      { id: template.id, date: '0001-01-01', status: 'Planned', exercises: template.exercises },
                      exercises,
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[1.0625rem] font-semibold">{template.name}</span>
                    <span className="block truncate text-[0.9375rem] text-label-2">
                      {template.exercises
                        .map((e) => exercises.get(e.exerciseId)?.name ?? t('Exercise.Unknown'))
                        .join(', ')}
                    </span>
                  </span>
                  <Chevron />
                </Link>
              </SwipeActions>
            </li>
          ))}
        </Group>
      )}

      {deleting && (
        <ActionSheet
          message={t('Templates.DeleteConfirm')}
          action={t('Templates.Delete')}
          onAction={() => void remove(deleting)}
          onCancel={() => setDeleting(undefined)}
          actionTestId="confirm-delete"
        />
      )}
    </>
  )
}
