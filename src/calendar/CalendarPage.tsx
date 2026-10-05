import { useCallback, useEffect, useState } from 'react'
import { WorkoutRow } from '../home/WorkoutRow'
import { formatDate, shortestDayNames, t } from '../i18n/i18n'
import { navigate, useLocation } from '../route'
import { useAnyChange, useRepository } from '../services'
import type { LocalRepository } from '../sync/localRepo'
import { addDays, addMonths, dayOf, isDateOnly, mondayOf, today, weekNumber } from '../training/dates'
import { compareOptional, statusOf } from '../training/editing'
import { isInRange, Limits } from '../training/limits'
import type { DateOnly, Exercise, Workout, WorkoutStatus } from '../training/model'
import { BackLink } from '../ui/Layout'

interface Data {
  workouts: Workout[]
  byDay: Map<DateOnly, Workout[]>
  exercises: Map<string, Exercise>
  error?: string
}

const firstOfMonth = (date: DateOnly): DateOnly => `${date.slice(0, 7)}-01`

const FIRST_MONTH = firstOfMonth(Limits.firstDate)
const LAST_MONTH = firstOfMonth(Limits.lastDate)

/** The month and day in the address (?day=, ?month=): a valid day wins over a month. */
function fromQuery(query: URLSearchParams, day: DateOnly): { month: DateOnly; selected: DateOnly | undefined } {
  const dayParameter = query.get('day')
  if (dayParameter !== null && isDateOnly(dayParameter) && isInRange(dayParameter))
    return { month: firstOfMonth(dayParameter), selected: dayParameter }
  const monthParameter = query.get('month')
  if (monthParameter !== null && /^\d{4}-\d{2}$/.test(monthParameter)) {
    const first = `${monthParameter}-01`
    if (isDateOnly(first) && isInRange(first)) return { month: first, selected: undefined }
  }
  return { month: firstOfMonth(day), selected: undefined }
}

function dotColour(status: WorkoutStatus): string {
  switch (status) {
    case 'InProgress':
      return 'bg-amber-500'
    case 'Done':
      return 'bg-green-600 dark:bg-green-500'
    default:
      return 'bg-blue-500'
  }
}

async function read(repository: LocalRepository): Promise<Data> {
  const exercises = new Map((await repository.getAll('exercise')).map((e) => [e.id, e]))
  const workouts = (await repository.getAll('workout')).sort(
    (a, b) => a.date.localeCompare(b.date) || compareOptional(a.sessionNumber, b.sessionNumber),
  )
  const byDay = new Map<DateOnly, Workout[]>()
  for (const w of workouts) {
    const list = byDay.get(w.date)
    if (list) list.push(w)
    else byDay.set(w.date, [w])
  }
  return { workouts, byDay, exercises }
}

export function CalendarPage() {
  const repository = useRepository()
  const { query } = useLocation()
  const day = today()
  // The month and the day are in the address, so that the way back from a workout lands here again.
  const { month, selected } = fromQuery(query, day)
  const [data, setData] = useState<Data | null>(null)

  const load = useCallback(
    () =>
      read(repository).then(setData, (e: unknown) => {
        console.error('Could not read workouts', e)
        setData((d) => ({
          workouts: [],
          byDay: new Map(),
          exercises: d?.exercises ?? new Map(),
          error: t('Home.LoadFailed'),
        }))
      }),
    [repository],
  )

  useEffect(() => {
    void load()
  }, [load])
  useAnyChange(() => void load())

  const workouts = data?.workouts
  const byDay = data?.byDay ?? new Map<DateOnly, Workout[]>()
  const exercises = data?.exercises ?? new Map<string, Exercise>()

  /** The workouts under the calendar: the chosen day's, or the whole month's. */
  const shown =
    selected !== undefined
      ? (byDay.get(selected) ?? [])
      : (workouts ?? []).filter((w) => w.date.slice(0, 7) === month.slice(0, 7))

  // Weeks run Monday to Sunday, as on the home page.
  const mondays: DateOnly[] = []
  const last = addDays(addMonths(month, 1), -1)
  for (let monday = mondayOf(month); monday <= last; monday = addDays(monday, 7)) mondays.push(monday)

  const show = (first: DateOnly, selectedDay: DateOnly | undefined) => {
    // Replace, not push: stepping through months should not fill the history.
    const next = new URLSearchParams(window.location.search)
    if (selectedDay === undefined && first !== firstOfMonth(day)) next.set('month', first.slice(0, 7))
    else next.delete('month')
    if (selectedDay !== undefined) next.set('day', selectedDay)
    else next.delete('day')
    const search = next.toString()
    navigate(window.location.pathname + (search ? `?${search}` : ''), { replace: true })
  }

  const step = (months: number) => {
    const target = addMonths(month, months)
    show(target < FIRST_MONTH ? FIRST_MONTH : target > LAST_MONTH ? LAST_MONTH : target, undefined)
  }

  const toggle = (date: DateOnly) => show(month, selected === date ? undefined : date)

  const workoutHref = (workout: Workout) =>
    `/workouts/${workout.id}?back=${encodeURIComponent(
      selected !== undefined ? `calendar?day=${selected}` : `calendar?month=${month.slice(0, 7)}`,
    )}`

  const stepButton = (months: number, label: string, path: string, testId: string) => {
    const disabled = months < 0 ? month <= FIRST_MONTH : month >= LAST_MONTH
    return (
      <button
        type="button"
        onClick={() => step(months)}
        disabled={disabled}
        aria-label={label}
        title={label}
        data-testid={testId}
        className="flex size-11 shrink-0 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-200 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-30 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        <svg
          className="size-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d={path} />
        </svg>
      </button>
    )
  }

  /** A day: a button when it has workouts, plain text when it has none or lies outside the month. */
  const renderDay = (date: DateOnly) => {
    const inMonth = date.slice(0, 7) === month.slice(0, 7)
    const dayWorkouts = inMonth ? byDay.get(date) : undefined
    const todayRing = date === day ? 'ring-2 ring-inset ring-accent-600' : ''
    if (dayWorkouts !== undefined && dayWorkouts.length > 0) {
      const on = selected === date
      const label = `${formatDate(date, 'dddd d MMMM')}: ${
        dayWorkouts.length === 1 ? t('Calendar.OneWorkout') : t('Calendar.Workouts', dayWorkouts.length)
      }`
      return (
        <span key={date} role="gridcell" className="flex justify-center">
          <button
            type="button"
            onClick={() => toggle(date)}
            aria-pressed={on ? 'true' : 'false'}
            aria-label={label}
            data-testid="day"
            data-date={date}
            className={`flex h-12 w-full max-w-12 flex-col items-center justify-center gap-1 rounded-lg font-semibold focus-visible:outline-2 focus-visible:outline-blue-500 ${todayRing} ${on ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900' : 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700'}`}
          >
            <span className="text-sm leading-none">{dayOf(date)}</span>
            <span className="flex gap-0.5" aria-hidden="true">
              {dayWorkouts.slice(0, 3).map((workout) => {
                const status = statusOf(workout, day)
                return (
                  <span
                    key={workout.id}
                    className={`size-1.5 rounded-full ${dotColour(status)}`}
                    data-status={status}
                  />
                )
              })}
            </span>
          </button>
        </span>
      )
    }
    return (
      <span key={date} role="gridcell" className="flex justify-center">
        <span
          className={`flex h-12 w-full max-w-12 items-center justify-center rounded-lg text-sm ${todayRing} ${inMonth ? 'text-gray-700 dark:text-gray-300' : 'text-gray-300 dark:text-gray-700'}`}
        >
          {dayOf(date)}
        </span>
      </span>
    )
  }

  const monthName = formatDate(month, 'MMMM yyyy')

  return (
    <>
      <BackLink href="/" />
      <h1 className="sr-only">{t('Calendar.Heading')}</h1>

      {/* Year and month steppers around the month's name; "today" returns to the current month. */}
      <div className="flex items-center gap-1" data-testid="calendar-nav">
        {stepButton(-12, t('Calendar.PreviousYear'), 'M18 17l-5-5 5-5M11 17l-5-5 5-5', 'previous-year')}
        {stepButton(-1, t('Calendar.PreviousMonth'), 'M15 18l-6-6 6-6', 'previous-month')}
        <h2
          className="min-w-0 flex-1 truncate text-center text-lg font-semibold first-letter:uppercase"
          aria-live="polite"
          data-testid="month"
        >
          {monthName}
        </h2>
        {stepButton(1, t('Calendar.NextMonth'), 'M9 18l6-6-6-6', 'next-month')}
        {stepButton(12, t('Calendar.NextYear'), 'M6 17l5-5-5-5M13 17l5-5-5-5', 'next-year')}
      </div>
      {month !== firstOfMonth(day) && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => show(firstOfMonth(day), undefined)}
            data-testid="this-month"
            className="min-h-9 rounded-lg px-3 text-sm font-medium text-blue-700 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-blue-300 dark:hover:bg-blue-950"
          >
            {t('Calendar.ThisMonth')}
          </button>
        </div>
      )}

      <div className="mt-2 rounded-xl border border-gray-200 bg-white p-2 dark:border-gray-800 dark:bg-gray-900">
        <div
          className="grid grid-cols-[1.75rem_repeat(7,minmax(0,1fr))] gap-y-1 text-center"
          role="grid"
          aria-label={monthName}
          data-testid="calendar"
        >
          <div role="row" className="contents">
            <span role="columnheader" className="py-1 text-xs text-gray-400 dark:text-gray-500">
              {t('Calendar.WeekShort')}
            </span>
            {shortestDayNames().map((name, i) => (
              <span key={i} role="columnheader" className="py-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                {name}
              </span>
            ))}
          </div>
          {mondays.map((monday) => (
            <div role="row" className="contents" key={monday}>
              <span
                role="rowheader"
                className="flex items-center justify-center text-xs text-gray-400 dark:text-gray-500"
              >
                {weekNumber(monday)}
              </span>
              {Array.from({ length: 7 }, (_, i) => renderDay(addDays(monday, i)))}
            </div>
          ))}
        </div>
      </div>

      <section className="mt-5">
        {workouts === undefined ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('Common.Loading')}</p>
        ) : data?.error !== undefined ? (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {data.error}
          </p>
        ) : shown.length === 0 ? (
          <div
            className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-gray-300 px-4 py-8 text-center text-gray-500 dark:border-gray-700 dark:text-gray-400"
            data-testid="calendar-empty"
          >
            <svg
              className="size-10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M3 10h18M8 3v4M16 3v4" />
            </svg>
            <p>{t('Calendar.Empty', formatDate(month, 'MMMM'))}</p>
          </div>
        ) : (
          <>
            <div className="mb-2 flex min-h-9 items-center justify-between gap-2 pl-inset">
              <h3 className="text-sm font-semibold first-letter:uppercase" data-testid="shown-heading">
                {selected !== undefined
                  ? formatDate(selected, 'dddd d MMMM')
                  : t('Calendar.AllInMonth', formatDate(month, 'MMMM'), shown.length)}
              </h3>
              {selected !== undefined && (
                <button
                  type="button"
                  onClick={() => show(month, undefined)}
                  data-testid="whole-month"
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-blue-300 dark:hover:bg-blue-950"
                >
                  {t('Calendar.WholeMonth')}
                </button>
              )}
            </div>
            <ul className="flex flex-col gap-2" data-testid="calendar-workouts">
              {shown.map((workout) => (
                <li key={workout.id}>
                  <WorkoutRow workout={workout} exercises={exercises} today={day} href={workoutHref(workout)} />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  )
}
