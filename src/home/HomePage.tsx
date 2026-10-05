import { useCallback, useRef, useState } from 'react'
import { compareText, formatDate, t } from '../i18n/i18n'
import { Link, navigate } from '../route'
import { useAnyChange, useRepository } from '../services'
import type { LocalRepository } from '../sync/localRepo'
import { iconFor, workoutName } from '../training/categories'
import { addDays, dayOf, isDateOnly, mondayOf, monthOf, today, weekNumber } from '../training/dates'
import { compareOptional, nextSessionNumber, withDerivedStatus } from '../training/editing'
import { isInRange, Limits } from '../training/limits'
import {
  DEFAULT_SETTINGS,
  EMPTY_ID,
  newId,
  SETTINGS_ID,
  type DateOnly,
  type Exercise,
  type Workout,
  type WorkoutTemplate,
} from '../training/model'
import { planFrom, suggestDate, suggestDateAfter, suggestTemplate, upcoming as upcomingOf } from '../training/planning'
import { chipStyle } from '../ui/chipStyle'
import { PlanIcon } from '../ui/PlanIcon'
import { useCommit } from '../ui/useCommit'
import { WorkoutRow } from './WorkoutRow'

interface Data {
  workouts: Workout[]
  exercises: Map<string, Exercise>
  templates: WorkoutTemplate[]
  upcoming: Workout | undefined
}

const NO_DATA: Data = { workouts: [], exercises: new Map(), templates: [], upcoming: undefined }

// The list opens with the latest weeks; older ones are a tap away. All of it is local already,
// so this only keeps the page short.
const WEEKS_PER_PAGE = 4

interface Week {
  key: string
  number: number
  monday: DateOnly
  workouts: Workout[]
}

// Weeks run Monday to Sunday and are numbered by ISO 8601, as Swedish calendars are.
function weeksOf(workouts: readonly Workout[]): Week[] {
  const groups = new Map<DateOnly, Workout[]>()
  for (const w of workouts) {
    const monday = mondayOf(w.date)
    const group = groups.get(monday)
    if (group) group.push(w)
    else groups.set(monday, [w])
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([monday, ws]) => ({ key: monday, number: weekNumber(monday), monday, workouts: ws }))
}

function weekRange(monday: DateOnly): string {
  const sunday = addDays(monday, 6)
  return monthOf(monday) === monthOf(sunday)
    ? `${dayOf(monday)}–${dayOf(sunday)} ${formatDate(sunday, 'MMMM')}`
    : `${formatDate(monday, 'd MMM')} – ${formatDate(sunday, 'd MMM')}`
}

function dayText(date: DateOnly, day: DateOnly): string {
  if (date === day) return t('Next.Today')
  if (date === addDays(day, 1)) return t('Next.Tomorrow', formatDate(date, 'd MMM'))
  return formatDate(date, 'dddd d MMM')
}

const asWorkout = (template: WorkoutTemplate): Workout => ({
  id: template.id,
  date: '0001-01-01',
  status: 'Planned',
  exercises: template.exercises,
})

/** Everything the page shows, and the day to plan on, from the repository's memory. */
function read(repository: LocalRepository): Data & { planDate: DateOnly } {
  const all = repository.peekAll('workout')
  const exercises = new Map(repository.peekAll('exercise').map((e) => [e.id, e]))
  const workouts = [...all].sort(
    (a, b) => b.date.localeCompare(a.date) || compareOptional(b.sessionNumber, a.sessionNumber),
  )
  const templates = repository.peekAll('template').sort((a, b) => compareText(a.name, b.name))
  const now = today()
  const upcoming = upcomingOf(all, now)
  const settings = repository.peek('settings', SETTINGS_ID) ?? DEFAULT_SETTINGS
  const planDate =
    upcoming === undefined ? suggestDate(all, now, settings) : suggestDateAfter(upcoming, all, now, settings)
  return { workouts, exercises, templates, upcoming, planDate }
}

/** read, or nothing and a message when the device's data could not be read. */
function readOrFail(repository: LocalRepository): { data: Data; planDate?: DateOnly; error?: string } {
  try {
    const { planDate, ...data } = read(repository)
    return { data, planDate }
  } catch (e) {
    console.error('Could not read workouts', e)
    return { data: NO_DATA, error: t('Home.LoadFailed') }
  }
}

export function HomePage() {
  const repository = useRepository()
  const day = today()
  // Read during the first render, so the page never shows without its data.
  const [initial] = useState(() => readOrFail(repository))
  const [data, setData] = useState<Data>(initial.data)
  const [chosenId, setChosenId] = useState<string>()
  const [planningOpen, setPlanningOpen] = useState(false)
  const [planDate, setPlanDate] = useState<DateOnly>(initial.planDate ?? day)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [error, setError] = useState<string | undefined>(initial.error)
  const [weeksShown, setWeeksShown] = useState(WEEKS_PER_PAGE)

  const load = useCallback(() => {
    const next = readOrFail(repository)
    setData(next.data)
    if (next.planDate !== undefined) setPlanDate(next.planDate)
    if (next.error !== undefined) setError(next.error)
  }, [repository])

  useAnyChange(load)

  const commitDate = useCommit<HTMLInputElement>((value) => {
    if (isDateOnly(value) && isInRange(value)) setPlanDate(value)
  })

  const { workouts, exercises, templates, upcoming } = data

  // An empty workout is offered as one more choice, last, with no exercises; it is never the
  // suggestion unless there are no templates at all.
  const emptyTemplate: WorkoutTemplate = { id: EMPTY_ID, name: t('Next.Empty'), exercises: [] }

  // The chosen template, or the suggested one until another is tapped.
  const chosen =
    chosenId === EMPTY_ID
      ? emptyTemplate
      : (templates.find((tp) => tp.id === chosenId) ??
        suggestTemplate(templates, workouts, (id) => exercises.get(id), day) ??
        emptyTemplate)

  const plan = async () => {
    if (savingRef.current) return
    const template = chosen
    savingRef.current = true
    setSaving(true)
    setError(undefined)
    try {
      const history = workouts
      let planned = planFrom(template, newId(), planDate, nextSessionNumber(history), history)
      if (template.id === EMPTY_ID) planned = { ...planned, templateId: undefined }
      planned = withDerivedStatus(planned, today())
      await repository.save('workout', planned.id, planned)
      navigate(`/workouts/${planned.id}`)
    } catch (e) {
      console.error('Could not plan from template', e)
      setError(t('Home.SaveFailed'))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const weeks = weeksOf(workouts)

  /** The planning card: at the top when nothing is planned, above the list otherwise. */
  const planCard = () => (
    <section
      className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/30"
      data-testid="plan-card"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {upcoming === undefined ? t('Next.PlanNext') : t('Next.Another')}
        </h2>
        {upcoming !== undefined && (
          <button
            type="button"
            onClick={() => setPlanningOpen(false)}
            aria-label={t('Next.HidePlanning')}
            title={t('Next.HidePlanning')}
            aria-expanded="true"
            data-testid="close-planning"
            className="-my-2 -mr-2 flex size-9 items-center justify-center rounded-lg text-gray-500 hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-gray-400 dark:hover:bg-blue-900"
          >
            <svg
              className="size-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <PlanIcon slug={iconFor(asWorkout(chosen), exercises)} />
        <span className="min-w-0 flex-1">
          <span
            className="block truncate text-lg font-semibold text-gray-900 dark:text-gray-50"
            data-testid="next-name"
          >
            {chosen.name}
          </span>
          {/* The whole day is the date picker: a transparent input over the text. A click on a date
              input's text only focuses a part of the date in desktop browsers, so the click opens the
              picker itself. */}
          <label className="relative mt-1 inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-2.5 text-sm text-gray-700 hover:bg-blue-50 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-blue-500 dark:border-blue-900 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800">
            <svg
              className="size-4 shrink-0 text-blue-700 dark:text-blue-300"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M3 10h18M8 3v4M16 3v4" />
            </svg>
            <span className="first-letter:uppercase inline-block whitespace-nowrap" data-testid="next-date">
              {dayText(planDate, day)}
            </span>
            <svg
              className="size-4 shrink-0 text-gray-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
            <input
              type="date"
              key={planDate}
              defaultValue={planDate}
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
        </span>
        <button
          type="button"
          onClick={() => void plan()}
          disabled={saving}
          data-testid="plan"
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-accent-600 px-4 py-2.5 font-medium text-white hover:bg-accent-700 disabled:opacity-60"
        >
          {saving && (
            <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" strokeDasharray="42 100" />
            </svg>
          )}
          {t('Next.Plan')}
        </button>
      </div>
      {templates.length > 0 && (
        <div
          className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]"
          role="radiogroup"
          aria-label={t('Next.Templates')}
          data-testid="template-choices"
        >
          {[...templates, emptyTemplate].map((template) => {
            const on = template.id === chosen.id
            return (
              <button
                key={template.id}
                type="button"
                role="radio"
                aria-checked={on ? 'true' : 'false'}
                onClick={() => setChosenId(template.id)}
                data-template={template.id === EMPTY_ID ? 'empty' : template.id}
                className={chipStyle(on)}
              >
                {template.name}
              </button>
            )
          })}
        </div>
      )}
      {templates.length === 0 && (
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-300" data-testid="no-templates">
          {t('Next.NoTemplates')}
        </p>
      )}

      {error !== undefined && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
    </section>
  )

  return (
    <>
      <h1 className="sr-only">{t('Home.Heading')}</h1>

      {/* Colour follows priority: only the action (Planera/Öppna) is blue; the name reads first in
          weight, the day second; template choices and links stay neutral so they do not compete. */}
      {/* Two cards: what is next (green, when a plan exists) and planning (blue). Only their actions
          carry the accent colour; everything else in them stays neutral. */}
      {upcoming !== undefined && (
        <section
          className="mb-3 rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/30"
          data-testid="next"
        >
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {t('Next.Heading')}
          </h2>
          <Link href={`/workouts/${upcoming.id}`} className="flex items-center gap-3" data-testid="upcoming">
            <PlanIcon slug={iconFor(upcoming, exercises)} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-lg font-semibold">
                {workoutName(upcoming, exercises) ?? t('Home.Heading')}
              </span>
              <span className="block text-sm text-gray-600 first-letter:uppercase dark:text-gray-300">
                {dayText(upcoming.date, day)}
              </span>
            </span>
            <span className="shrink-0 rounded-lg bg-green-600 px-4 py-2.5 font-medium text-white hover:bg-green-700">
              {t('Next.Open')}
            </span>
          </Link>
        </section>
      )}

      {upcoming === undefined && planCard()}

      <section className="mt-6">
        {/* With a workout already planned, adding another is the exception: it waits behind a quiet
            button above the list instead of competing with the green card. */}
        {upcoming !== undefined && (
          <div className="mb-5">
            {planningOpen ? (
              planCard()
            ) : (
              <button
                type="button"
                onClick={() => setPlanningOpen(true)}
                aria-expanded="false"
                data-testid="open-planning"
                className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-gray-300 px-4 text-sm font-medium text-gray-600 hover:bg-white focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
              >
                <svg
                  className="size-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
                {t('Next.PlanAnother')}
              </button>
            )}
          </div>
        )}

        {workouts.length === 0 && (
          <div
            className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-300 px-4 py-10 text-center text-gray-500 dark:border-gray-700 dark:text-gray-400"
            data-testid="empty-state"
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
              <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" />
            </svg>
            <p>{t('Home.Empty')}</p>
          </div>
        )}
        {workouts.length > 0 && (
          <div className="flex flex-col gap-5" data-testid="workout-list">
            {weeks.slice(0, weeksShown).map((week) => (
              <section key={week.key} data-testid="week">
                <h3 className="mb-2 flex items-baseline gap-2 pl-inset text-sm">
                  <span className="font-semibold">{t('Home.Week', week.number)}</span>
                  <span className="text-gray-500 dark:text-gray-400">{weekRange(week.monday)}</span>
                </h3>
                <ul className="flex flex-col gap-2">
                  {week.workouts.map((workout) => (
                    <li key={workout.id}>
                      <WorkoutRow workout={workout} exercises={exercises} today={day} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {weeks.length > weeksShown && (
              <button
                type="button"
                onClick={() => setWeeksShown((n) => n + WEEKS_PER_PAGE)}
                data-testid="more-weeks"
                className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                {t('Home.MoreWeeks', weeks.length - weeksShown)}
              </button>
            )}
          </div>
        )}
      </section>
    </>
  )
}
