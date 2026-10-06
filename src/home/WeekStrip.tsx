import { useState } from 'react'
import { useMonthSwipe } from '../calendar/useMonthSwipe'
import { formatDate, t } from '../i18n/i18n'
import { Link } from '../route'
import { addDays, dayOf, mondayOf, monthOf, weekNumber } from '../training/dates'
import { shortWorkoutName, type ExerciseMap } from '../training/categories'
import { statusOf } from '../training/editing'
import type { DateOnly, Workout } from '../training/model'
import { Chevron } from '../ui/List'

// A week at a glance, as iOS's Fitness shows a week of rings: Monday to Sunday, a filled green dot
// with a check for a day with a workout done, a green ring for one planned, grey for the rest, and
// what the day's workout trains in a word under it, and the count below. It opens on this week; swiped sideways it turns to the weeks before and
// after, as the calendar turns its months (useMonthSwipe), as far as there are workouts. A tap opens
// the calendar on the week shown. Weeks start on Monday and are numbered by ISO 8601, as Swedish
// calendars number them.

type Mark = 'done' | 'planned' | 'none'

function weekRange(monday: DateOnly): string {
  const sunday = addDays(monday, 6)
  return monthOf(monday) === monthOf(sunday)
    ? `${dayOf(monday)}–${dayOf(sunday)} ${formatDate(sunday, 'MMM')}`
    : `${formatDate(monday, 'd MMM')} – ${formatDate(sunday, 'd MMM')}`
}

export function WeekStrip({
  workouts,
  exercises,
  day,
}: {
  workouts: readonly Workout[]
  exercises: ExerciseMap
  day: DateOnly
}) {
  const thisMonday = mondayOf(day)
  const [monday, setMonday] = useState(thisMonday)

  // As far back as the first workout, and forward to the last one planned.
  const dates = workouts.map((w) => w.date)
  const first = dates.length > 0 ? mondayOf(dates.reduce((a, b) => (a < b ? a : b))) : thisMonday
  const lastWorkout = dates.length > 0 ? mondayOf(dates.reduce((a, b) => (a > b ? a : b))) : thisMonday
  const last = lastWorkout > thisMonday ? lastWorkout : thisMonday
  const can = (direction: 1 | -1) => (direction < 0 ? monday > first : monday < last)
  const swipe = useMonthSwipe(
    (direction) => setMonday((m) => addDays(m, 7 * direction)),
    (direction) => can(direction),
  )

  const marks = (week: DateOnly) => {
    const days = Array.from({ length: 7 }, (_, i) => addDays(week, i))
    const inWeek = workouts.filter((w) => w.date >= week && w.date <= days[6]!)
    const done = inWeek.filter((w) => statusOf(w, day) === 'Done')
    // Planned: still to do, today or later. One for a day gone by and never done is neither.
    const planned = inWeek.filter((w) => statusOf(w, day) !== 'Done' && w.date >= day)
    const markOf = (date: DateOnly): Mark =>
      done.some((w) => w.date === date) ? 'done' : planned.some((w) => w.date === date) ? 'planned' : 'none'
    // What the day's workout trains, in a word: the one done, else the one planned.
    const nameOf = (date: DateOnly) => {
      const w = done.find((x) => x.date === date) ?? planned.find((x) => x.date === date)
      return w === undefined ? undefined : (shortWorkoutName(w, exercises) ?? t('Home.WorkoutShort'))
    }
    const summary =
      done.length === 0 && planned.length === 0
        ? t('Home.WeekNone')
        : [
            done.length === 1 ? t('Home.WeekDoneOne') : t('Home.WeekDone', done.length),
            planned.length > 0
              ? planned.length === 1
                ? t('Home.WeekPlannedOne')
                : t('Home.WeekPlanned', planned.length)
              : undefined,
          ]
            .filter((x) => x !== undefined)
            .join(' · ')
    return { days, markOf, nameOf, summary }
  }

  const strip = (week: DateOnly, live: boolean) => {
    const { days, markOf, nameOf, summary } = marks(week)
    return (
      <>
        <ol className="grid grid-cols-7 gap-1 text-center" aria-hidden="true">
          {days.map((date) => {
            const mark = markOf(date)
            const name = nameOf(date)
            return (
              <li key={date} className="flex min-w-0 flex-col items-center gap-1.5" data-mark={live ? mark : undefined}>
                <span
                  className={`text-[0.8125rem] ${date === day ? 'font-bold text-gray-900 dark:text-white' : 'text-label-2'}`}
                >
                  {formatDate(date, 'ddd').charAt(0).toLocaleUpperCase()}
                </span>
                <span
                  className={`flex size-7 items-center justify-center rounded-full ${
                    mark === 'done'
                      ? 'bg-green-600 text-white dark:bg-green-500'
                      : mark === 'planned'
                        ? 'ring-2 ring-green-600 ring-inset dark:ring-green-500'
                        : 'bg-fill'
                  }`}
                >
                  {mark === 'done' && (
                    <svg
                      className="size-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  )}
                </span>
                {/* The type in a word, under its day; a line kept for every day, so the dots stay in a row. */}
                <span
                  className="-mt-0.5 h-4 w-full truncate text-[0.6875rem] leading-4 text-label-2"
                  data-testid={live && name !== undefined ? 'day-name' : undefined}
                >
                  {name}
                </span>
              </li>
            )
          })}
        </ol>
        <span className="mt-2.5 flex items-center justify-between gap-2 px-1">
          <span className="text-[0.9375rem] text-label-2" data-testid={live ? 'week-summary' : undefined}>
            {summary}
          </span>
          <Chevron />
        </span>
      </>
    )
  }

  const isThisWeek = monday === thisMonday
  const heading = isThisWeek ? t('Home.ThisWeek') : t('Home.Week', weekNumber(monday))
  const { summary } = marks(monday)

  return (
    <section className="mt-6" data-testid="week-strip">
      <div className="flex items-baseline justify-between gap-3 px-4 pb-2">
        <h2 className="text-[1.0625rem] font-semibold text-label-2" data-testid="week-heading">
          {heading}
          <span className="ml-2 font-normal">
            {isThisWeek ? t('Home.Week', weekNumber(monday)) : weekRange(monday)}
          </span>
        </h2>
        {/* Away from this week, the way back to it, as the calendar has its Today. */}
        {!isThisWeek && (
          <button
            type="button"
            onClick={() => setMonday(thisMonday)}
            data-testid="this-week"
            className="-my-2 -mr-2 shrink-0 px-2 py-2 text-[1.0625rem] text-tint active:opacity-60"
          >
            {t('Next.Today')}
          </button>
        )}
      </div>
      <div className="overflow-hidden rounded-[1.625rem] bg-cell">
        <div {...swipe} className="relative touch-pan-y select-none">
          {can(-1) && (
            <div className="absolute top-0 right-full w-full px-3 py-3" inert aria-hidden="true">
              {strip(addDays(monday, -7), false)}
            </div>
          )}
          <Link
            href={`/calendar?day=${isThisWeek ? day : monday}`}
            aria-label={`${heading}: ${summary}. ${t('Calendar.Heading')}`}
            data-testid="week-link"
            className="block px-3 py-3 active:bg-cell-pressed focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500"
          >
            {strip(monday, true)}
          </Link>
          {can(1) && (
            <div className="absolute top-0 left-full w-full px-3 py-3" inert aria-hidden="true">
              {strip(addDays(monday, 7), false)}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
