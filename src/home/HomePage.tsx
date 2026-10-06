import { useCallback, useRef, useState } from 'react'
import { compareText, t } from '../i18n/i18n'
import { highlight, Link } from '../route'
import { useAnyChange, useRepository } from '../services'
import type { LocalRepository } from '../sync/localRepo'
import { daysBetween, isDateOnly, today } from '../training/dates'
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
import { Group } from '../ui/List'
import { SECTION_ACTION, SectionHeader } from '../ui/SectionHeader'
import { ModalSheet } from '../ui/ModalSheet'
import { PICTURE_ROW } from '../ui/styles'
import { dayText, relativeDay } from './dayText'
import { NextWorkoutCard } from './NextWorkoutCard'
import { PlanList } from './PlanList'
import { WeekStrip } from './WeekStrip'
import { WorkoutRow } from './WorkoutRow'

interface Data {
  workouts: Workout[]
  exercises: Map<string, Exercise>
  templates: WorkoutTemplate[]
  upcoming: Workout | undefined
}

const NO_DATA: Data = { workouts: [], exercises: new Map(), templates: [], upcoming: undefined }

/** How many workouts the page lists, of those planned and of the latest; the rest are in the calendar. */
const RECENT = 3

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
  // Set once a workout is added from the sheet, which then sinks away.
  const [planned, setPlanned] = useState(false)
  const [planDate, setPlanDate] = useState<DateOnly>(initial.planDate ?? day)
  // The template being planned, while it saves.
  const [planning, setPlanning] = useState<string>()
  const planningRef = useRef(false)
  const [error, setError] = useState<string | undefined>(initial.error)

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
  const closePlanning = useCallback(() => {
    setPlanningOpen(false)
    setPlanned(false)
  }, [])

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

  // The button plans the chosen template on the day shown. The page stays, as iOS stays where a
  // thing was added: the sheet sinks away and the new workout's row lights up where it lands.
  const plan = async (template: WorkoutTemplate) => {
    if (planningRef.current) return
    planningRef.current = true
    setPlanning(template.id)
    setError(undefined)
    try {
      const history = workouts
      let added = planFrom(template, newId(), planDate, nextSessionNumber(history), history)
      if (template.id === EMPTY_ID) added = { ...added, templateId: undefined }
      added = withDerivedStatus(added, today())
      highlight(`/workouts/${added.id}`)
      await repository.save('workout', added.id, added)
      // Only the sheet sinks away; planned on the page, it just becomes the next workout.
      if (planningOpen) setPlanned(true)
    } catch (e) {
      console.error('Could not plan from template', e)
      setError(t('Home.SaveFailed'))
    } finally {
      planningRef.current = false
      setPlanning(undefined)
    }
  }

  // Below the card: the other workouts still to do, soonest first, and the three latest of the rest.
  // All of them are in the calendar, a tap away.
  const toDo = (w: Workout) => w.date >= day && statusOf(w, day) !== 'Done'
  const plannedLater = workouts
    .filter((w) => toDo(w) && w.id !== upcoming?.id)
    .reverse()
    .slice(0, RECENT)
  const recent = workouts.filter((w) => !toDo(w)).slice(0, RECENT)

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
          first page; the app's name and mark are on the home screen. Scrolled away, it does not
          come back small in the bar: the first page needs no reminder of where it is. */}
      <h1 className="large-title mb-4" data-testid="title" data-no-bar-title>
        {t('Home.Title')}
      </h1>

      {/* What is next, as the large card the app is opened for (NextWorkoutCard), headed by how
          far away it is: "I dag", "I morgon", "Om 3 dagar". */}
      {upcoming !== undefined && (
        <section data-testid="next" aria-label={t('Next.Heading')}>
          <SectionHeader testId="upcoming-when">{relativeDay(upcoming.date, day)}</SectionHeader>
          <NextWorkoutCard workout={upcoming} exercises={exercises} history={workouts} day={day} />
        </section>
      )}

      {upcoming === undefined && planList(t('Next.PlanNext'))}

      {/* The workouts planned after the next, and with a workout already planned, a row to add
          another, last in the list as iOS adds to its own lists (Health's "Lägg till data"): what
          is ahead together, under the card. With nothing more planned, the row stands right
          under the card. The week and what was done come after. */}
      {(plannedLater.length > 0 || upcoming !== undefined) && (
        <section className={plannedLater.length > 0 ? 'mt-section' : 'mt-3'}>
          {plannedLater.length > 0 && <SectionHeader>{t('Home.Planned')}</SectionHeader>}
          <Group separatorInset="4.25rem">
            {plannedLater.map((workout) => (
              <li key={workout.id} data-testid="planned-row">
                <WorkoutRow workout={workout} exercises={exercises} today={day} />
              </li>
            ))}
            {upcoming !== undefined && (
              <li>
                <button
                  type="button"
                  onClick={() => {
                    // A workout planned on the page before has nothing to do with this sheet.
                    setPlanned(false)
                    setPlanningOpen(true)
                  }}
                  aria-haspopup="dialog"
                  aria-expanded={planningOpen}
                  data-testid="open-planning"
                  className={`${PICTURE_ROW} w-full text-left text-[1.0625rem] text-tint`}
                >
                  <span className="flex size-11 shrink-0 items-center justify-center" aria-hidden="true">
                    <svg
                      className="size-6"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    >
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </span>
                  {t('Next.PlanAnother')}
                </button>
              </li>
            )}
          </Group>
        </section>
      )}

      {workouts.length > 0 && <WeekStrip workouts={workouts} exercises={exercises} day={day} />}

      <section className="mt-section">
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
        {/* The latest few, as iOS's Fitness lists its latest workouts; all of them in the calendar. */}
        {recent.length > 0 && (
          <>
            <SectionHeader
              action={
                <Link href="/calendar" data-testid="show-all" className={SECTION_ACTION}>
                  {t('Home.ShowAll')}
                </Link>
              }
            >
              {t('Home.Recent')}
            </SectionHeader>
            <ul
              className="ios-list overflow-hidden rounded-[1.625rem] bg-cell"
              style={{ '--separator-inset': '4.25rem' } as React.CSSProperties}
              data-testid="workout-list"
            >
              {recent.map((workout) => (
                <li key={workout.id}>
                  <WorkoutRow workout={workout} exercises={exercises} today={day} />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {upcoming !== undefined && planningOpen && (
        <ModalSheet title={t('Next.Another')} onClose={closePlanning} dismissed={planned} testId="planning-sheet" fit>
          {planList()}
        </ModalSheet>
      )}
    </>
  )
}
