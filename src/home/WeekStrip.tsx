import { formatDate, t } from '../i18n/i18n'
import { Link } from '../route'
import { addDays, mondayOf, weekNumber } from '../training/dates'
import { shortWorkoutName, type ExerciseMap } from '../training/categories'
import { statusOf } from '../training/editing'
import type { DateOnly, Workout } from '../training/model'
import { Chevron } from '../ui/List'
import { SectionHeader } from '../ui/SectionHeader'

// A week at a glance, as iOS's Fitness shows a week of rings: Monday to Sunday, a filled green dot
// with a check for a day with a workout done, a green ring for one planned, grey for the rest, and
// what the day's workout trains in a word under it, and the count below. Always this week; other
// weeks are in the calendar, which a tap opens with this week chosen. Weeks start on Monday and are
// numbered by ISO 8601, as Swedish calendars number them.

type Mark = 'done' | 'planned' | 'none'

export function WeekStrip({
  workouts,
  exercises,
  day,
}: {
  workouts: readonly Workout[]
  exercises: ExerciseMap
  day: DateOnly
}) {
  const monday = mondayOf(day)

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

  const strip = (week: DateOnly) => {
    const { days, markOf, nameOf, summary } = marks(week)
    return (
      <>
        <ol className="grid grid-cols-7 gap-1 text-center" aria-hidden="true">
          {days.map((date) => {
            const mark = markOf(date)
            const name = nameOf(date)
            return (
              <li key={date} className="flex min-w-0 flex-col items-center gap-1.5" data-mark={mark}>
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
                  data-testid={name !== undefined ? 'day-name' : undefined}
                >
                  {name}
                </span>
              </li>
            )
          })}
        </ol>
        <span className="mt-2.5 flex items-center justify-between gap-2 px-1">
          <span className="text-[0.9375rem] text-label-2" data-testid="week-summary">
            {summary}
          </span>
          <Chevron />
        </span>
      </>
    )
  }

  const heading = t('Home.ThisWeek')
  const { summary } = marks(monday)

  return (
    <section className="mt-section" data-testid="week-strip">
      <SectionHeader testId="week-heading">
        {heading}
        <span className="ml-2 text-[1.0625rem] font-normal text-label-2">{t('Home.Week', weekNumber(monday))}</span>
      </SectionHeader>
      <div className="overflow-hidden rounded-[1.625rem] bg-cell">
        <Link
          href={`/calendar?week=${monday}`}
          aria-label={`${heading}: ${summary}. ${t('Calendar.Heading')}`}
          data-testid="week-link"
          className="block px-3 py-3 active:bg-cell-pressed focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500"
        >
          {strip(monday)}
        </Link>
      </div>
    </section>
  )
}
