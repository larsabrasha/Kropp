import { useCallback, useRef, useState } from 'react'
import { compareText, formatDate, t } from '../i18n/i18n'
import { Link, navigate } from '../route'
import { useAnyChange, useRepository } from '../services'
import type { LocalRepository } from '../sync/localRepo'
import { iconFor, workoutName } from '../training/categories'
import { addDays, dayOf, daysBetween, isDateOnly, mondayOf, monthOf, today, weekNumber } from '../training/dates'
import { compareOptional, nextSessionNumber, statusOf, withDerivedStatus } from '../training/editing'
import { isInRange } from '../training/limits'
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
import { Chevron, Group } from '../ui/List'
import { ModalSheet } from '../ui/ModalSheet'
import { PlanIcon } from '../ui/PlanIcon'
import { StatusBadge } from '../ui/StatusBadge'
import { button } from '../ui/styles'
import { PlanList } from './PlanList'
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

/**
 * How far the day is from today, for planning: "Om 3 dagar". Nothing for today and tomorrow, which
 * dayText already says.
 */
function daysAway(date: DateOnly, day: DateOnly): string | undefined {
  const days = daysBetween(day, date)
  if (days === 0 || days === 1) return undefined
  if (days === -1) return t('Next.Yesterday')
  return days > 0 ? t('Next.InDays', days) : t('Next.DaysAgo', -days)
}

function dayText(date: DateOnly, day: DateOnly): string {
  if (date === day) return t('Next.Today')
  if (date === addDays(day, 1)) return t('Next.Tomorrow', formatDate(date, 'd MMM'))
  return formatDate(date, 'dddd d MMM')
}

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
  const [planningOpen, setPlanningOpen] = useState(false)
  const [planDate, setPlanDate] = useState<DateOnly>(initial.planDate ?? day)
  // The template being planned, while it saves.
  const [planning, setPlanning] = useState<string>()
  const planningRef = useRef(false)
  const [error, setError] = useState<string | undefined>(initial.error)
  const [weeksShown, setWeeksShown] = useState(WEEKS_PER_PAGE)

  const load = useCallback(() => {
    const next = readOrFail(repository)
    setData(next.data)
    if (next.planDate !== undefined) setPlanDate(next.planDate)
    if (next.error !== undefined) setError(next.error)
  }, [repository])

  useAnyChange(load)

  const changeDate = (value: string) => {
    if (isDateOnly(value) && isInRange(value)) setPlanDate(value)
  }
  const closePlanning = useCallback(() => setPlanningOpen(false), [])

  const { workouts, exercises, templates, upcoming } = data

  // An empty workout is offered as one more choice, last, with no exercises; it is never the
  // suggestion unless there are no templates at all.
  const emptyTemplate: WorkoutTemplate = { id: EMPTY_ID, name: t('Next.Empty'), exercises: [] }

  // The suggestion first, then the other templates by name, the empty workout last; without
  // templates the empty workout alone, and suggested.
  const suggested = suggestTemplate(templates, workouts, (id) => exercises.get(id), day) ?? emptyTemplate
  const choices = [
    suggested,
    ...templates.filter((tp) => tp.id !== suggested.id),
    ...(suggested.id === EMPTY_ID ? [] : [emptyTemplate]),
  ]

  // One tap plans the template on the day shown and opens the new workout.
  const plan = async (template: WorkoutTemplate) => {
    if (planningRef.current) return
    planningRef.current = true
    setPlanning(template.id)
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
      planningRef.current = false
      setPlanning(undefined)
    }
  }

  const weeks = weeksOf(workouts)

  const planList = (title?: string) => (
    <PlanList
      title={title}
      choices={choices}
      suggestedId={suggested.id}
      noTemplates={templates.length === 0}
      exercises={exercises}
      date={planDate}
      dateText={dayText(planDate, day)}
      dateNote={daysAway(planDate, day)}
      onDate={changeDate}
      planning={planning}
      onPlan={(template) => void plan(template)}
      error={error}
    />
  )

  return (
    <>
      {/* The page everything starts from is named for what it holds, as Apple names its own apps'
          first page; the app's name and mark are on the home screen. */}
      <h1 className="large-title mb-4" data-testid="title">
        {t('Home.Title')}
      </h1>

      {/* What is next, lifted out of the list: a larger green row of its own that opens it, with a
          chevron like every row that leads further in. */}
      {upcoming !== undefined && (
        <section data-testid="next">
          <h2 className="px-4 pb-2 text-[1.0625rem] font-semibold text-green-700 dark:text-green-400">
            {t('Next.Heading')}
          </h2>
          <Link
            href={`/workouts/${upcoming.id}`}
            className="flex items-center gap-3 rounded-[1.625rem] bg-green-50 p-3 pr-4 ring-1 ring-green-600/15 ring-inset active:bg-green-100 focus-visible:outline-2 focus-visible:outline-blue-500 dark:bg-green-950/50 dark:ring-green-400/20 dark:active:bg-green-900/60"
            data-testid="upcoming"
          >
            <PlanIcon
              slug={iconFor(upcoming, exercises)}
              className="shrink-0 overflow-hidden rounded-[0.875rem] bg-white dark:bg-gray-900"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xl font-bold">
                {workoutName(upcoming, exercises) ?? t('Home.Heading')}
              </span>
              <span className="block text-[0.9375rem] font-medium text-green-800 first-letter:uppercase dark:text-green-300">
                {dayText(upcoming.date, day)}
              </span>
            </span>
            <StatusBadge status={statusOf(upcoming, day)} />
            <Chevron />
          </Link>
        </section>
      )}

      {upcoming === undefined && planList(t('Next.PlanNext'))}

      <section className="mt-5">
        {workouts.length === 0 && (
          <div
            className="flex flex-col items-center gap-3 px-6 py-14 text-center text-[1.0625rem] text-label-2"
            data-testid="empty-state"
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
            <p>{t('Home.Empty')}</p>
          </div>
        )}
        {workouts.length > 0 && (
          <div className="flex flex-col gap-5" data-testid="workout-list">
            {weeks.slice(0, weeksShown).map((week) => (
              <div key={week.key} data-testid="week">
                <Group
                  separatorInset="4.25rem"
                  header={
                    <>
                      <span>{t('Home.Week', week.number)}</span>
                      <span className="ml-2 font-normal text-label-2">{weekRange(week.monday)}</span>
                    </>
                  }
                >
                  {week.workouts.map((workout) => (
                    <li key={workout.id}>
                      <WorkoutRow workout={workout} exercises={exercises} today={day} />
                    </li>
                  ))}
                </Group>
              </div>
            ))}
            {weeks.length > weeksShown && (
              <button
                type="button"
                onClick={() => setWeeksShown((n) => n + WEEKS_PER_PAGE)}
                data-testid="more-weeks"
                className={`${button('gray')} w-full`}
              >
                {t('Home.MoreWeeks', weeks.length - weeksShown)}
              </button>
            )}
          </div>
        )}
      </section>

      {/* With a workout already planned, adding another is the exception: a floating plus button at
          the bottom right opens the templates in a sheet. */}
      {upcoming !== undefined && (
        <>
          <div className="h-20" aria-hidden="true" />
          {planningOpen && (
            <ModalSheet title={t('Next.Another')} onClose={closePlanning} testId="planning-sheet" fit>
              {planList()}
            </ModalSheet>
          )}
          <button
            type="button"
            onClick={() => setPlanningOpen(true)}
            aria-expanded={planningOpen}
            data-testid="open-planning"
            className="fab fixed right-4 z-40 flex size-14 items-center justify-center rounded-full bg-accent-600 text-white shadow-[0_8px_24px_rgb(0_0_0/0.25)] transition-transform duration-200 active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          >
            <svg
              className="size-7"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span className="sr-only">{t('Next.PlanAnother')}</span>
          </button>
        </>
      )}
    </>
  )
}
