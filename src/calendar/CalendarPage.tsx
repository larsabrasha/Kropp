import { useCallback, useState } from 'react'
import { WorkoutRow } from '../home/WorkoutRow'
import { formatDate, shortestDayNames, t } from '../i18n/i18n'
import { Link, navigate, useLocation } from '../route'
import { useAnyChange, useRepository } from '../services'
import type { LocalRepository } from '../sync/localRepo'
import { addDays, addMonths, dayOf, isDateOnly, mondayOf, today, weekNumber } from '../training/dates'
import { compareOptional, statusOf } from '../training/editing'
import { isInRange, Limits } from '../training/limits'
import type { DateOnly, Exercise, Workout, WorkoutStatus } from '../training/model'
import { BarItem, GLASS_CAPSULE } from '../ui/Layout'
import { ModalSheet } from '../ui/ModalSheet'
import { Chevron, Group } from '../ui/List'
import { ROW } from '../ui/styles'
import { usePresence } from '../ui/usePresence'
import { useMonthSwipe } from './useMonthSwipe'
import { weekRange } from './weekRange'

interface Data {
  workouts: Workout[]
  byDay: Map<DateOnly, Workout[]>
  exercises: Map<string, Exercise>
  error?: string
}

const firstOfMonth = (date: DateOnly): DateOnly => `${date.slice(0, 7)}-01`

const FIRST_MONTH = firstOfMonth(Limits.firstDate)
const LAST_MONTH = firstOfMonth(Limits.lastDate)

/** What is chosen under the calendar: a day, a whole week (by its Monday), or nothing (the month). */
type Selection = { day: DateOnly } | { week: DateOnly } | undefined

/**
 * The month and the choice in the address (?day=, ?week=, ?month=). A valid day or week wins, and
 * shows its own month unless a month is given too (a week that begins in the month before).
 */
function fromQuery(query: URLSearchParams, day: DateOnly): { month: DateOnly; selected: Selection } {
  const monthParameter = query.get('month')
  const first = monthParameter !== null && /^\d{4}-\d{2}$/.test(monthParameter) ? `${monthParameter}-01` : undefined
  const month = first !== undefined && isDateOnly(first) && isInRange(first) ? first : undefined
  const dayParameter = query.get('day')
  if (dayParameter !== null && isDateOnly(dayParameter) && isInRange(dayParameter))
    return { month: month ?? firstOfMonth(dayParameter), selected: { day: dayParameter } }
  const weekParameter = query.get('week')
  if (
    weekParameter !== null &&
    isDateOnly(weekParameter) &&
    isInRange(weekParameter) &&
    mondayOf(weekParameter) === weekParameter
  )
    return { month: month ?? firstOfMonth(weekParameter), selected: { week: weekParameter } }
  return { month: month ?? firstOfMonth(day), selected: undefined }
}

/** The address for a month and a choice: only what differs from what the choice implies. */
function queryFor(month: DateOnly, selected: Selection, day: DateOnly): string {
  const next = new URLSearchParams()
  const implied =
    selected === undefined
      ? firstOfMonth(day)
      : 'day' in selected
        ? firstOfMonth(selected.day)
        : firstOfMonth(selected.week)
  if (month !== implied) next.set('month', month.slice(0, 7))
  if (selected !== undefined && 'day' in selected) next.set('day', selected.day)
  if (selected !== undefined && 'week' in selected) next.set('week', selected.week)
  return next.toString()
}

/** The tint under a chosen week (CalendarPage): light enough for every number on it to keep 4.5:1. */
const WEEK_BAND = 'bg-tint/12 dark:bg-tint/20'
/**
 * The capsule reaches 6pt past the grid at both ends, its content where it was, so the week's
 * number and Sunday are not pressed against its round ends.
 */
const BAND_OUT_LEFT = '-ml-1.5 pl-1.5'
const BAND_OUT_RIGHT = '-mr-1.5 pr-1.5'

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
  const todayButton = usePresence(month !== firstOfMonth(day))
  // Read during the first render, so the page never shows without its data.
  const [data, setData] = useState(() => read(repository))
  // The year whose months are offered in place of the days, as iOS's date picker turns its days
  // into a choice of month and year when its title is tapped; undefined while the days show.
  const [choosing, setChoosing] = useState<number>()
  // Set once a month is chosen there: the sheet sinks away.
  const [chosen, setChosen] = useState(false)
  // The month's name, for the choice to pop over it on an iPad or a computer.
  const [monthButton, setMonthButton] = useState<HTMLElement | null>(null)
  const closeChoice = useCallback(() => {
    setChoosing(undefined)
    setChosen(false)
  }, [])
  const load = useCallback(() => setData(read(repository)), [repository])
  useAnyChange(load)

  const { workouts, byDay, exercises } = data

  const selectedDay = selected !== undefined && 'day' in selected ? selected.day : undefined
  const selectedWeek = selected !== undefined && 'week' in selected ? selected.week : undefined

  /** The workouts under the calendar: the chosen day's or week's, or the whole month's. */
  const shown =
    selectedDay !== undefined
      ? (byDay.get(selectedDay) ?? [])
      : selectedWeek !== undefined
        ? workouts.filter((w) => w.date >= selectedWeek && w.date <= addDays(selectedWeek, 6))
        : workouts.filter((w) => w.date.slice(0, 7) === month.slice(0, 7))

  const show = (first: DateOnly, selection: Selection) => {
    // Replace, not push: stepping through months should not fill the history.
    const search = queryFor(first, selection, day)
    navigate(window.location.pathname + (search ? `?${search}` : ''), { replace: true })
  }

  const step = (months: number) => {
    const target = addMonths(month, months)
    show(target < FIRST_MONTH ? FIRST_MONTH : target > LAST_MONTH ? LAST_MONTH : target, undefined)
  }

  const swipe = useMonthSwipe(step, (direction) => (direction < 0 ? month > FIRST_MONTH : month < LAST_MONTH))

  const toggle = (date: DateOnly) => show(month, selectedDay === date ? undefined : { day: date })
  // A tap on a week's number chooses the whole week; a second one, the month again.
  const toggleWeek = (monday: DateOnly) => show(month, selectedWeek === monday ? undefined : { week: monday })

  const workoutHref = (workout: Workout) =>
    `/workouts/${workout.id}?back=${encodeURIComponent(
      `calendar?${queryFor(month, selected, day) || `month=${month.slice(0, 7)}`}`,
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
    // A chosen week lies on one tinted capsule, from its number to its Sunday, so it reads as one.
    const inWeek = selectedWeek !== undefined && date >= selectedWeek && date <= addDays(selectedWeek, 6)
    const band = inWeek
      ? `${WEEK_BAND} ${date === addDays(selectedWeek, 6) ? `rounded-r-full ${BAND_OUT_RIGHT}` : ''}`
      : ''
    // As iOS's calendar marks days: today's number red, the chosen day's in a filled circle, red
    // when it is today, else black (white in dark mode). Workouts are dots under the number.
    const number = (on: boolean) =>
      `flex size-[2.125rem] items-center justify-center rounded-full text-[1.0625rem] leading-none ${
        on
          ? isToday
            ? 'bg-red-600 font-semibold text-white'
            : 'bg-gray-900 font-semibold text-white dark:bg-white dark:text-black'
          : isToday
            ? 'font-semibold text-red-700 dark:text-red-300'
            : inMonth
              ? ''
              : 'text-label-2'
      }`
    if (dayWorkouts !== undefined && dayWorkouts.length > 0) {
      const on = selectedDay === date
      const label = `${formatDate(date, 'dddd d MMMM')}: ${
        dayWorkouts.length === 1 ? t('Calendar.OneWorkout') : t('Calendar.Workouts', dayWorkouts.length)
      }`
      return (
        <span key={date} role="gridcell" className={`flex justify-center ${band}`}>
          <button
            type="button"
            onClick={() => toggle(date)}
            aria-pressed={on ? 'true' : 'false'}
            aria-label={label}
            data-testid={live ? 'day' : undefined}
            data-date={date}
            className="flex h-14 w-full max-w-12 flex-col items-center justify-center gap-1 rounded-xl active:bg-fill focus-visible:outline-2 focus-visible:outline-blue-500"
          >
            <span className={number(on)}>{dayOf(date)}</span>
            <span className="flex h-1.5 gap-0.5" aria-hidden="true">
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
      <span key={date} role="gridcell" className={`flex justify-center ${band}`}>
        <span className="flex h-14 w-full max-w-12 flex-col items-center justify-center gap-1">
          <span className={number(false)}>{dayOf(date)}</span>
          {/* The dots' row, empty, so every number sits at the same height. */}
          <span className="h-1.5" aria-hidden="true" />
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
              className={`flex items-center justify-center ${selectedWeek === monday ? `${WEEK_BAND} rounded-l-full ${BAND_OUT_LEFT}` : ''}`}
            >
              <button
                type="button"
                onClick={() => toggleWeek(monday)}
                aria-pressed={selectedWeek === monday ? 'true' : 'false'}
                aria-label={`${t('Home.Week', weekNumber(monday))}, ${weekRange(monday)}`}
                data-testid={live ? 'week-number' : undefined}
                data-week={monday}
                className={`flex size-7 items-center justify-center rounded-full text-xs text-tint tabular-nums active:bg-fill focus-visible:outline-2 focus-visible:outline-blue-500 ${
                  selectedWeek === monday ? 'font-bold dark:text-white' : 'font-medium'
                }`}
              >
                {weekNumber(monday)}
              </button>
            </span>
            {Array.from({ length: 7 }, (_, i) => renderDay(addDays(monday, i), shownMonth, live))}
          </div>
        ))}
      </div>
    )
  }

  /** The months of a year as a grid, the year above with a year back and forward. */
  const monthChoice = (year: number) => {
    const firstYear = Number(FIRST_MONTH.slice(0, 4))
    const lastYear = Number(LAST_MONTH.slice(0, 4))
    const yearStep = (delta: number, label: string, path: string, testId: string) => (
      <button
        type="button"
        onClick={() => setChoosing(year + delta)}
        disabled={delta < 0 ? year <= firstYear : year >= lastYear}
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
    return (
      <div className="rounded-[1.625rem] bg-cell px-3 py-3" data-testid="month-choice">
        <div className="flex items-center justify-between">
          {yearStep(-1, t('Calendar.PreviousYear'), 'M15 18l-6-6 6-6', 'previous-year')}
          <span className="text-[1.0625rem] font-semibold tabular-nums" data-testid="choice-year">
            {year}
          </span>
          {yearStep(1, t('Calendar.NextYear'), 'M9 18l6-6-6-6', 'next-year')}
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {Array.from({ length: 12 }, (_, i) => {
            const first: DateOnly = `${year}-${String(i + 1).padStart(2, '0')}-01`
            const shown = first === month
            const current = first === firstOfMonth(day)
            const outside = first < FIRST_MONTH || first > LAST_MONTH
            return (
              <button
                key={first}
                type="button"
                disabled={outside}
                onClick={() => {
                  setChosen(true)
                  show(first, undefined)
                }}
                aria-pressed={shown}
                data-testid="choice-month"
                className={`h-11 rounded-full text-[1.0625rem] focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-30 ${
                  shown
                    ? 'bg-accent-600 font-semibold text-white'
                    : current
                      ? 'font-semibold text-tint active:bg-fill'
                      : 'active:bg-fill'
                }`}
              >
                {formatDate(first, 'MMMM')}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  const monthName = formatDate(month, 'MMMM yyyy')

  return (
    <>
      <h1 className="sr-only">{t('Calendar.Heading')}</h1>

      {/* As iOS's date picker: the month's name at the left, which turns the days into a choice of
          month and year for a longer way (monthChoice), a month back and forward at the right. Swiping
          the month turns it too; "today" in the bar returns to this month. */}
      <div className="flex items-center gap-1 pl-4" data-testid="calendar-nav">
        <h2 className="flex min-w-0 flex-1" aria-live="polite">
          <button
            type="button"
            onClick={(e) => {
              setMonthButton(e.currentTarget)
              setChoosing(Number(month.slice(0, 4)))
            }}
            aria-haspopup="dialog"
            aria-label={`${monthName}, ${t('Calendar.ChooseMonth')}`}
            data-testid="month-picker"
            className="-ml-2 flex min-w-0 items-center gap-1 rounded-lg px-2 py-1 text-lg font-semibold active:opacity-60 focus-visible:outline-2 focus-visible:outline-blue-500"
          >
            <span className="truncate first-letter:uppercase" data-testid="month">
              {monthName}
            </span>
            <svg
              className="size-4 shrink-0 text-tint"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </h2>
        {stepButton(-1, t('Calendar.PreviousMonth'), 'M15 18l-6-6 6-6', 'previous-month')}
        {stepButton(1, t('Calendar.NextMonth'), 'M9 18l6-6-6-6', 'next-month')}
      </div>
      {todayButton.present && (
        // In the bar, as iOS's calendar has its Today: there it never moves the month below. It
        // fades in as the month turns away from this one, and out as it turns back.
        <BarItem>
          <button
            type="button"
            onClick={() => show(firstOfMonth(day), undefined)}
            data-testid="this-month"
            data-leaving={todayButton.leaving ? 'true' : undefined}
            inert={todayButton.leaving}
            aria-label={t('Calendar.ThisMonth')}
            title={t('Calendar.ThisMonth')}
            className={`${GLASS_CAPSULE} ${todayButton.leaving ? 'pointer-events-none motion-safe:animate-[fade-out_200ms_ease-in_forwards]' : 'motion-safe:animate-[fade-in_200ms_ease-out]'}`}
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
            <div className="absolute top-0 right-full w-full px-3 py-2" inert aria-hidden="true">
              {grid(addMonths(month, -1), false)}
            </div>
          )}
          <div className="px-3 py-2">{grid(month, true)}</div>
          {month < LAST_MONTH && (
            <div className="absolute top-0 left-full w-full px-3 py-2" inert aria-hidden="true">
              {grid(addMonths(month, 1), false)}
            </div>
          )}
        </div>
      </div>

      {/* Choosing a month further away is a task of its own, in a sheet, as a choice is on iOS. */}
      {choosing !== undefined && (
        <ModalSheet
          title={t('Calendar.ChooseMonth')}
          onClose={closeChoice}
          dismissed={chosen}
          testId="month-sheet"
          fit
          anchor={monthButton}
        >
          {monthChoice(choosing)}
        </ModalSheet>
      )}

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
            {/* The list's header: the month, or the chosen day, as plain text as every section's
                header is; with a day chosen, the way back to the whole month at its right, as a
                section's own action (Visa alla on the home page). A second tap on the day does the
                same. The line keeps one height either way, so the list never moves. */}
            <div className="flex min-h-11 items-center justify-between gap-3 px-4 pb-1">
              <h3
                className="min-w-0 text-[1.0625rem] font-semibold text-label-2 first-letter:uppercase"
                data-testid="shown-heading"
              >
                {selectedDay !== undefined
                  ? formatDate(selectedDay, 'dddd d MMMM')
                  : selectedWeek !== undefined
                    ? `${t('Home.Week', weekNumber(selectedWeek))} · ${weekRange(selectedWeek)}`
                    : t('Calendar.AllInMonth', formatDate(month, 'MMMM'), shown.length)}
              </h3>
              {selected !== undefined && (
                <button
                  type="button"
                  onClick={() => show(month, undefined)}
                  data-testid="whole-month"
                  className="-my-2 -mr-2 shrink-0 px-2 py-2 text-[1.0625rem] text-tint active:opacity-60 focus-visible:outline-2 focus-visible:outline-blue-500"
                >
                  {t('Calendar.WholeMonth')}
                </button>
              )}
            </div>
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

      {/* The workouts deleted lately, last, as Photos and Notes keep their Recently Deleted: where
          to look for a workout that is gone. */}
      <Group className="mt-section">
        <li>
          <Link href="/trash" className={ROW} data-testid="trash-link">
            <svg
              className="size-6 shrink-0 text-tint"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3" />
            </svg>
            <span className="min-w-0 flex-1 text-[1.0625rem]">{t('Trash.Heading')}</span>
            <Chevron />
          </Link>
        </li>
      </Group>
    </>
  )
}
