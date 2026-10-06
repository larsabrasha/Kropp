import { useCallback, useState } from 'react'
import { WorkoutRow } from '../home/WorkoutRow'
import { formatDate, shortestDayNames, t } from '../i18n/i18n'
import { navigate, useLocation } from '../route'
import { useAnyChange, useRepository } from '../services'
import type { LocalRepository } from '../sync/localRepo'
import { addDays, addMonths, dayOf, isDateOnly, mondayOf, today, weekNumber } from '../training/dates'
import { compareOptional, statusOf } from '../training/editing'
import { isInRange, Limits } from '../training/limits'
import type { DateOnly, Exercise, Workout, WorkoutStatus } from '../training/model'
import { BackLink, BarItem, GLASS_CAPSULE } from '../ui/Layout'
import { Group } from '../ui/List'
import { useMonthSwipe } from './useMonthSwipe'

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

/** The workouts by day, from the repository's memory, or a message when it could not be read. */
function read(repository: LocalRepository): Data {
  try {
    return readWorkouts(repository)
  } catch (e) {
    console.error('Could not read workouts', e)
    return { workouts: [], byDay: new Map(), exercises: new Map(), error: t('Home.LoadFailed') }
  }
}

function readWorkouts(repository: LocalRepository): Data {
  const exercises = new Map(repository.peekAll('exercise').map((e) => [e.id, e]))
  const workouts = repository
    .peekAll('workout')
    .sort((a, b) => a.date.localeCompare(b.date) || compareOptional(a.sessionNumber, b.sessionNumber))
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
  // Read during the first render, so the page never shows without its data.
  const [data, setData] = useState(() => read(repository))
  const load = useCallback(() => setData(read(repository)), [repository])
  useAnyChange(load)

  const { workouts, byDay, exercises } = data

  /** The workouts under the calendar: the chosen day's, or the whole month's. */
  const shown =
    selected !== undefined
      ? (byDay.get(selected) ?? [])
      : workouts.filter((w) => w.date.slice(0, 7) === month.slice(0, 7))

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

  const swipe = useMonthSwipe(step, (direction) => (direction < 0 ? month > FIRST_MONTH : month < LAST_MONTH))

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
        className="flex size-11 shrink-0 items-center justify-center rounded-full text-tint active:bg-fill focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-30"
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

  /**
   * A day of shownMonth: a button when it has workouts, plain text when it has none or lies outside
   * the month. Only the month on screen (live) is named for tests and tools; its neighbours are
   * drawn only to be swiped in.
   */
  const renderDay = (date: DateOnly, shownMonth: DateOnly, live: boolean) => {
    const inMonth = date.slice(0, 7) === shownMonth.slice(0, 7)
    const dayWorkouts = inMonth ? byDay.get(date) : undefined
    const isToday = date === day && inMonth
    // As iOS's calendar marks days: today's number red, the chosen day's in a filled circle, red
    // when it is today, else black (white in dark mode). Workouts are dots under the number.
    const number = (on: boolean) =>
      `flex size-[2.125rem] items-center justify-center rounded-full text-[1.0625rem] leading-none ${
        on
          ? isToday
            ? 'bg-red-600 font-semibold text-white'
            : 'bg-gray-900 font-semibold text-white dark:bg-white dark:text-black'
          : isToday
            ? 'font-semibold text-red-600 dark:text-red-400'
            : inMonth
              ? ''
              : 'text-label-2'
      }`
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
            data-testid={live ? 'day' : undefined}
            data-date={date}
            className="flex h-12 w-full max-w-12 flex-col items-center justify-start gap-1 rounded-xl pt-0.5 active:bg-fill focus-visible:outline-2 focus-visible:outline-blue-500"
          >
            <span className={number(on)}>{dayOf(date)}</span>
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
        <span className="flex h-12 w-full max-w-12 flex-col items-center justify-start pt-0.5">
          <span className={number(false)}>{dayOf(date)}</span>
        </span>
      </span>
    )
  }

  /** The grid of a month's weeks, with week numbers. */
  const grid = (shownMonth: DateOnly, live: boolean) => {
    const mondays: DateOnly[] = []
    const last = addDays(addMonths(shownMonth, 1), -1)
    for (let monday = mondayOf(shownMonth); monday <= last; monday = addDays(monday, 7)) mondays.push(monday)
    return (
      <div
        className="grid grid-cols-[1.75rem_repeat(7,minmax(0,1fr))] gap-y-1 text-center"
        role="grid"
        aria-label={formatDate(shownMonth, 'MMMM yyyy')}
        data-testid={live ? 'calendar' : undefined}
      >
        <div role="row" className="contents">
          <span role="columnheader" className="py-1 text-xs text-label-2">
            {t('Calendar.WeekShort')}
          </span>
          {shortestDayNames().map((name, i) => (
            <span key={i} role="columnheader" className="py-1 text-xs font-medium text-label-2">
              {name}
            </span>
          ))}
        </div>
        {mondays.map((monday) => (
          <div role="row" className="contents" key={monday}>
            <span
              role="rowheader"
              className="flex items-center justify-center text-xs font-medium text-label-2 tabular-nums"
            >
              {weekNumber(monday)}
            </span>
            {Array.from({ length: 7 }, (_, i) => renderDay(addDays(monday, i), shownMonth, live))}
          </div>
        ))}
      </div>
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
        // In the bar, as iOS's calendar has its Today: there it never moves the month below.
        <BarItem>
          <button
            type="button"
            onClick={() => show(firstOfMonth(day), undefined)}
            data-testid="this-month"
            aria-label={t('Calendar.ThisMonth')}
            title={t('Calendar.ThisMonth')}
            className={`${GLASS_CAPSULE} motion-safe:animate-[fade-in_200ms_ease-out]`}
          >
            {t('Next.Today')}
          </button>
        </BarItem>
      )}

      {/* Swiped sideways, the month turns (useMonthSwipe). The months before and after lie ready on
          either side, so a swipe always shows a month; the card clips them. */}
      <div className="mt-3 overflow-hidden rounded-[1.625rem] bg-cell">
        <div {...swipe} className="relative touch-pan-y select-none">
          {month > FIRST_MONTH && (
            <div className="absolute top-0 right-full w-full p-2" inert aria-hidden="true">
              {grid(addMonths(month, -1), false)}
            </div>
          )}
          <div className="p-2">{grid(month, true)}</div>
          {month < LAST_MONTH && (
            <div className="absolute top-0 left-full w-full p-2" inert aria-hidden="true">
              {grid(addMonths(month, 1), false)}
            </div>
          )}
        </div>
      </div>

      <section className="mt-5">
        {data.error !== undefined ? (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {data.error}
          </p>
        ) : shown.length === 0 ? (
          <div
            className="flex flex-col items-center gap-3 px-6 py-14 text-center text-[1.0625rem] text-label-2"
            data-testid="calendar-empty"
          >
            <svg
              className="size-12"
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
            {/* The list's header: the month, or the chosen day as a filter, as iOS's Mail and Photos
                show one: a tinted capsule with a cross, which a tap removes to show the whole month
                again. The line keeps one height either way, so the list never moves. */}
            <h3
              className="flex min-h-11 items-center px-4 pb-1 text-[1.0625rem] font-semibold text-label-2"
              data-testid="shown-heading"
            >
              {selected === undefined ? (
                t('Calendar.AllInMonth', formatDate(month, 'MMMM'), shown.length)
              ) : (
                <button
                  type="button"
                  onClick={() => show(month, undefined)}
                  aria-label={`${formatDate(selected, 'dddd d MMMM')}, ${t('Calendar.WholeMonth')}`}
                  title={t('Calendar.WholeMonth')}
                  data-testid="whole-month"
                  className="-ml-1 inline-flex h-9 items-center gap-1.5 rounded-full bg-tint/15 pr-2 pl-3.5 text-tint active:opacity-60 focus-visible:outline-2 focus-visible:outline-blue-500"
                >
                  <span className="inline-block first-letter:uppercase">{formatDate(selected, 'dddd d MMMM')}</span>
                  <svg className="size-[1.125rem]" viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.25" />
                    <path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </h3>
            <Group testId="calendar-workouts" separatorInset="4.25rem">
              {shown.map((workout) => (
                <li key={workout.id}>
                  <WorkoutRow workout={workout} exercises={exercises} today={day} href={workoutHref(workout)} />
                </li>
              ))}
            </Group>
          </>
        )}
      </section>
    </>
  )
}
