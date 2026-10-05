import { t } from '../i18n/i18n'
import { iconFor, type ExerciseMap } from '../training/categories'
import { Limits } from '../training/limits'
import { EMPTY_ID, type DateOnly, type Workout, type WorkoutTemplate } from '../training/model'
import { Chevron } from '../ui/List'
import { PlanIcon } from '../ui/PlanIcon'
import { PICTURE_ROW } from '../ui/styles'
import { useCommit } from '../ui/useCommit'

// Planning a workout as an iOS list: the day on a row of its own, then every template as a row,
// the suggested one first and marked, an empty workout last. One tap on a row plans it and opens
// it, so the suggestion is one tap away. On the home page when nothing is planned, and in the
// sheet behind the plus button when something is.

const GROUP = 'ios-list overflow-hidden rounded-[1.625rem] bg-cell'

const asWorkout = (template: WorkoutTemplate): Workout => ({
  id: template.id,
  date: '0001-01-01',
  status: 'Planned',
  exercises: template.exercises,
})

export function PlanList({
  title,
  choices,
  suggestedId,
  noTemplates,
  exercises,
  date,
  dateText,
  dateNote,
  onDate,
  planning,
  onPlan,
  error,
}: {
  /** The list's header, when it stands on a page rather than in a sheet with a title of its own. */
  title?: string
  /** The templates in the order shown, the empty workout last. */
  choices: WorkoutTemplate[]
  suggestedId: string
  noTemplates: boolean
  exercises: ExerciseMap
  date: DateOnly
  dateText: string
  /** How far the day is from today, under the row's label, when the day itself does not say. */
  dateNote: string | undefined
  onDate: (date: DateOnly) => void
  /** The template being planned now, whose row shows that it is busy. */
  planning: string | undefined
  onPlan: (template: WorkoutTemplate) => void
  error: string | undefined
}) {
  const commitDate = useCommit<HTMLInputElement>((value) => onDate(value))

  return (
    <section data-testid="plan-card">
      {title !== undefined && <h2 className="px-4 pb-2 text-[1.0625rem] font-semibold text-label-2">{title}</h2>}

      <ul className={GROUP}>
        <li className="flex min-h-12 items-center justify-between gap-3 px-4">
          <span className="flex flex-col py-1.5">
            <span className="text-[1.0625rem]">{t('Home.Date')}</span>
            {dateNote !== undefined && (
              <span className="text-[0.9375rem] text-label-2" data-testid="plan-days">
                {dateNote}
              </span>
            )}
          </span>
          {/* iOS's compact date picker: the day in a grey pill, a transparent date input over it. A
              click on a date input's text only focuses a part of the date in desktop browsers, so
              the click opens the picker itself. */}
          <label className="relative inline-flex min-h-9 cursor-pointer items-center rounded-lg bg-fill px-3 text-[1.0625rem] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-blue-500">
            <span className="inline-block whitespace-nowrap first-letter:uppercase" data-testid="next-date">
              {dateText}
            </span>
            <input
              type="date"
              key={date}
              defaultValue={date}
              min={Limits.firstDate}
              max={Limits.lastDate}
              ref={commitDate}
              aria-label={t('Next.ChangeDay')}
              onClick={(e) => {
                try {
                  e.currentTarget.showPicker()
                } catch {
                  // Not every browser has showPicker; the input still opens on its own there.
                }
              }}
              data-testid="plan-date"
              className="absolute inset-0 size-full cursor-pointer opacity-0"
            />
          </label>
        </li>
      </ul>

      {!noTemplates && (
        <h3 className="mt-5 px-4 pb-2 text-[1.0625rem] font-semibold text-label-2">{t('Next.FromTemplate')}</h3>
      )}
      <ul
        className={`${GROUP} ${noTemplates ? 'mt-3' : ''}`}
        style={{ '--separator-inset': '4.5rem' } as React.CSSProperties}
        data-testid="template-choices"
      >
        {choices.map((template) => {
          const suggested = template.id === suggestedId
          const busy = planning === template.id
          const names = template.exercises.map((e) => exercises.get(e.exerciseId)?.name ?? t('Exercise.Unknown'))
          return (
            <li key={template.id}>
              <button
                type="button"
                onClick={() => onPlan(template)}
                disabled={planning !== undefined}
                data-testid={suggested ? 'plan' : 'plan-template'}
                data-template={template.id === EMPTY_ID ? 'empty' : template.id}
                data-suggested={suggested ? 'true' : undefined}
                className={`${PICTURE_ROW} w-full text-left disabled:opacity-100`}
              >
                {template.id === EMPTY_ID ? (
                  <span
                    className="flex size-12 shrink-0 items-center justify-center rounded-[0.875rem] border-[1.5px] border-dashed border-label-3 text-label-2"
                    aria-hidden="true"
                  >
                    <svg
                      className="size-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    >
                      <path d="M12 6v12M6 12h12" />
                    </svg>
                  </span>
                ) : (
                  <PlanIcon slug={iconFor(asWorkout(template), exercises)} />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[1.0625rem] font-semibold">{template.name}</span>
                  {(suggested || names.length > 0) && (
                    <span className="block truncate text-[0.9375rem] text-label-2">
                      {suggested && <span className="font-medium text-tint">{t('Next.Suggested')}</span>}
                      {suggested && names.length > 0 && ' · '}
                      {names.join(', ')}
                    </span>
                  )}
                </span>
                {busy ? (
                  <svg
                    className="size-5 shrink-0 animate-spin text-label-2"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeDasharray="42 100" />
                  </svg>
                ) : (
                  <Chevron />
                )}
              </button>
            </li>
          )
        })}
      </ul>
      {noTemplates && (
        <p className="px-4 pt-1.5 text-[0.8125rem] text-label-2" data-testid="no-templates">
          {t('Next.NoTemplates')}
        </p>
      )}

      {error !== undefined && (
        <p className="mt-3 px-4 text-[0.9375rem] text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
