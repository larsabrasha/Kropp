import { useCallback, useState, type ReactNode } from 'react'
import { formatDate, t } from '../i18n/i18n'
import { navigate, useLocation } from '../route'
import { useAnyChange, useRepository } from '../services'
import type { LocalRepository } from '../sync/localRepo'
import { addDays, maxDate, mondayOf, today } from '../training/dates'
import { DEFAULT_SETTINGS, SETTINGS_ID, type Exercise, type Workout } from '../training/model'
import { Group } from '../ui/List'
import { SectionHeader } from '../ui/SectionHeader'
import { Segmented } from '../ui/Segmented'
import { CARD, ROW } from '../ui/styles'
import { Chevron } from '../ui/List'
import { BarChart, HorizontalBars } from './Charts'
import { ExerciseLink } from '../library/ExerciseListPage'
import { HueIcon } from './HueIcon'
import { HUES, type Hue } from './hues'
import { MeasureSheet } from './MeasureSheet'
import {
  axisLabel,
  formatOne,
  gainText,
  formatWhole,
  goalLabel,
  metricText,
  periodOptions,
  rangeText,
  spanTitle,
} from './format'
import {
  bestWeek,
  bucketsOf,
  DEFAULT_PERIOD,
  exercisesBy,
  isPeriod,
  latestRecords,
  logged,
  perBucket,
  rangeOf,
  recordsIn,
  setsPerArea,
  totalsOf,
  volumeOf,
  workoutVolume,
  type Period,
} from './stats'

// The statistics of all training, as iOS's Health and Fitness sum up theirs: a period to choose at
// the top, the totals of it as tiles, then charts of workouts and kilograms per week or month,
// what the sets went to, the latest personal records and every exercise, each a tap away from its
// own progress.

interface Data {
  workouts: Workout[]
  exercises: Exercise[]
  goal: number
  error?: string
}

function read(repository: LocalRepository): Data {
  try {
    const day = today()
    const exercises = repository.peekAll('exercise')
    const settings = repository.peek('settings', SETTINGS_ID) ?? DEFAULT_SETTINGS
    return { workouts: logged(repository.peekAll('workout'), day), exercises, goal: settings.sessionsPerWeek }
  } catch (e) {
    console.error('Could not read statistics', e)
    return { workouts: [], exercises: [], goal: DEFAULT_SETTINGS.sessionsPerWeek, error: t('Home.LoadFailed') }
  }
}

const RECORDS = 5
/** Exercises listed under a measure. */
const TOP = 5

type Measure = 'workouts' | 'perWeek' | 'records' | 'exercises' | 'lifted' | 'cardio' | 'sets'

/** Kilograms, in tonnes once they grow long, as they do in a few months. */
function kgText(kg: number): { value: string; unit: string } {
  return kg >= 10_000
    ? { value: formatOne(kg / 1000), unit: t('Stats.Tonnes') }
    : { value: formatWhole(kg), unit: 'kg' }
}

// Things to weigh the kilograms against, heaviest first: the first there are two of is named.
const WEIGHTS = [
  ['whale', 150_000],
  ['elephant', 6_000],
  ['car', 1_500],
  ['piano', 250],
] as const

/** "As heavy as 12 elephants", or nothing below two pianos. */
function comparison(kg: number): string | undefined {
  const found = WEIGHTS.find(([, weight]) => kg / weight >= 2)
  if (!found) return undefined
  const [thing, weight] = found
  return t('Stats.Compare', t(`Stats.Compare.${thing}`, formatWhole(Math.floor(kg / weight))))
}

export function StatsPage() {
  const repository = useRepository()
  const { query } = useLocation()
  const asked = query.get('period')
  const period: Period = isPeriod(asked) ? asked : DEFAULT_PERIOD
  // Read during the first render, so the page never shows without its data.
  const [data, setData] = useState(() => read(repository))
  // The measure whose tile was tapped, open in a sheet.
  const [open, setOpen] = useState<Measure>()
  const load = useCallback(() => setData(read(repository)), [repository])
  useAnyChange(load)

  // The period lives in the URL, so a way back from an exercise finds the same one; not a step back.
  const choose = (p: Period) => navigate(p === DEFAULT_PERIOD ? '/stats' : `/stats?period=${p}`, { replace: true })

  const { workouts, exercises, goal, error } = data
  const day = today()
  const byId = new Map(exercises.map((e) => [e.id, e]))
  const find = (id: string) => byId.get(id)
  const range = rangeOf(period, day, workouts[0]?.date)
  // Averages count from the first week trained, not from weeks before there was anything to log.
  const first = workouts[0] === undefined ? range.start : mondayOf(workouts[0].date)
  const totals = totalsOf(workouts, { start: maxDate(range.start, first), end: range.end }, find)
  const per = t(`Stats.Per.${range.unit}`)

  const count = perBucket(workouts, range, (ws) => ws.length).map(({ span, value }) => ({
    value,
    title: spanTitle(span, range.unit),
    axis: axisLabel(span, range.unit),
  }))
  // The first bar with the first week trained in it: monthly averages start there too.
  const firstBar = Math.max(
    0,
    bucketsOf(range).findIndex((b) => b.end >= first),
  )
  const volume = perBucket(workouts, range, (ws) => ws.reduce((s, w) => s + workoutVolume(w, find), 0)).map(
    ({ span, value }) => ({ value, title: spanTitle(span, range.unit), axis: axisLabel(span, range.unit) }),
  )
  const liftsEver = workouts.some((w) => workoutVolume(w, find) > 0)
  const areas = setsPerArea(workouts, range, find)
  const records = latestRecords(workouts, exercises).slice(0, RECORDS)
  const recordsInRange = recordsIn(workouts, exercises, range)
  const recordCount = recordsInRange.length

  const periodQuery = period === DEFAULT_PERIOD ? '' : `?period=${period}`
  const periodText = period === 'All' ? t('Stats.Since', formatDate(first, 'd MMM yyyy')) : rangeText(range)

  // The period's tiles: workouts and how often, what came of it (records, else the exercises done),
  // and what there is to weigh (kilograms, else minutes of cardio, else sets). Never a zero.
  const tiles: Measure[] = [
    'workouts',
    'perWeek',
    recordCount > 0 ? 'records' : 'exercises',
    totals.volumeKg > 0 ? 'lifted' : totals.cardioMinutes > 0 ? 'cardio' : 'sets',
  ]

  function measure(key: Measure): { label: string; value: string; unit?: string; hue: Hue; testId: string } {
    switch (key) {
      case 'workouts':
        return {
          label: t('Stats.Workouts'),
          value: formatWhole(totals.workouts),
          hue: HUES.workouts,
          testId: 'total-workouts',
        }
      case 'perWeek':
        return {
          label: t('Stats.PerWeek'),
          value: formatOne(totals.perWeek),
          hue: HUES.perWeek,
          testId: 'total-per-week',
        }
      case 'records':
        return {
          label: t('Stats.RecordCount'),
          value: formatWhole(recordCount),
          hue: HUES.records,
          testId: 'total-records',
        }
      case 'exercises':
        return {
          label: t('Stats.Exercises'),
          value: formatWhole(totals.exercises),
          hue: HUES.exercises,
          testId: 'total-exercises',
        }
      case 'lifted':
        return { label: t('Stats.Lifted'), ...kgText(totals.volumeKg), hue: HUES.lifted, testId: 'total-volume' }
      case 'cardio':
        return {
          label: t('Stats.Cardio'),
          value: formatWhole(totals.cardioMinutes),
          unit: 'min',
          hue: HUES.cardio,
          testId: 'total-cardio',
        }
      case 'sets':
        return { label: t('Stats.SetsTotal'), value: formatWhole(totals.sets), hue: HUES.sets, testId: 'total-sets' }
    }
  }

  /** The exercises that make a measure up, each a tap away from its progress. */
  const ranking = (header: string, rows: { exercise: Exercise; value: number }[], text: (value: number) => string) =>
    rows.length === 0 ? null : (
      <Group header={header} separatorInset="3.75rem" testId="measure-exercises">
        {rows.map((r) => (
          <li key={r.exercise.id}>
            <ExerciseLink
              exercise={r.exercise}
              href={`/stats/exercises/${r.exercise.id}${periodQuery}`}
              detail={text(r.value)}
            />
          </li>
        ))}
      </Group>
    )
  const workoutCount = (n: number) => (n === 1 ? t('Stats.WorkoutCountOne') : t('Stats.WorkoutCount', formatWhole(n)))
  const kgLine = (kg: number) => {
    const { value, unit } = kgText(kg)
    return `${value} ${unit}`
  }

  function details(key: Measure): ReactNode {
    switch (key) {
      case 'workouts':
        return ranking(t('Stats.MostDone'), exercisesBy(workouts, range, find, 'workouts').slice(0, TOP), workoutCount)
      case 'exercises':
        return ranking(t('Stats.MostDone'), exercisesBy(workouts, range, find, 'workouts'), workoutCount)
      case 'perWeek': {
        const best = bestWeek(workouts, range)
        return (
          best && (
            <Group footer={t('Stats.GoalIs', goal)} testId="best-week">
              <li className={`${ROW} justify-between`}>
                <span className="min-w-0">
                  <span className="block text-[1.0625rem] font-semibold">{t('Stats.BestWeek')}</span>
                  <span className="block truncate text-[0.9375rem] text-label-2">
                    {spanTitle({ start: best.monday, end: addDays(best.monday, 6) }, 'week')}
                  </span>
                </span>
                <span className="shrink-0 text-[1.0625rem] font-semibold tabular-nums">
                  {workoutCount(best.workouts)}
                </span>
              </li>
            </Group>
          )
        )
      }
      case 'records':
        return (
          <Group header={t('Stats.RecordsInPeriod')} separatorInset="3.75rem" testId="measure-records">
            {recordsInRange.map((r) => (
              <li key={`${r.exercise.id}-${r.point.workoutId}`}>
                <ExerciseLink
                  exercise={r.exercise}
                  href={`/stats/exercises/${r.exercise.id}${periodQuery}`}
                  detail={`${formatDate(r.point.date, 'd MMM yyyy')} · ${t('Stats.Previous', metricText(r.metric, r.previous))}`}
                  gain={gainText(r.metric, r.point.value, r.previous)}
                  trailing={metricText(r.metric, r.point.value)}
                />
              </li>
            ))}
          </Group>
        )
      case 'lifted': {
        const compared = comparison(totals.volumeKg)
        return (
          <>
            {compared !== undefined && (
              <p className="-mt-6 px-4 text-[1.0625rem]" data-testid="measure-compare">
                {compared}
              </p>
            )}
            {ranking(t('Stats.MostLifted'), exercisesBy(workouts, range, find, volumeOf).slice(0, TOP), kgLine)}
          </>
        )
      }
      case 'cardio':
        return ranking(
          t('Stats.MostCardio'),
          exercisesBy(workouts, range, find, (e) => e.durationMinutes ?? 0).slice(0, TOP),
          (m) => `${formatWhole(m)} min`,
        )
      case 'sets':
        return ranking(
          t('Stats.MostSets'),
          exercisesBy(workouts, range, find, (e) => (find(e.exerciseId)?.kind === 'Cardio' ? 0 : e.sets.length)).slice(
            0,
            TOP,
          ),
          (n) => `${formatWhole(n)} set`,
        )
    }
  }

  return (
    <>
      <h1 className="large-title">{t('Stats.Heading')}</h1>

      {error !== undefined && (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

      {workouts.length === 0 ? (
        <div
          className="mt-4 flex flex-col items-center gap-3 px-6 py-14 text-center text-[1.0625rem] text-label-2"
          data-testid="stats-empty"
        >
          <ChartIcon className="size-12" />
          <p className="text-[1.375rem] font-bold text-gray-900 dark:text-white">{t('Stats.Empty')}</p>
          <p className="text-[0.9375rem]">{t('Stats.EmptyHelp')}</p>
        </div>
      ) : null}
      {workouts.length === 0 ? null : (
        <>
          <Segmented
            options={periodOptions()}
            value={period}
            onChange={choose}
            label={t('Stats.Period')}
            testId="period"
            className="mt-section"
          />
          <p className="mt-2 px-4 text-[0.9375rem] text-label-2" data-testid="range">
            {periodText}
          </p>

          {/* The period's totals, as Fitness lays out its own: tiles two by two, each measure in its
              colour. What counts is showing up: workouts and how often, then what came of it. */}
          <ul className="mt-4 grid grid-cols-2 gap-3" data-testid="totals">
            {tiles.map((key) => (
              <Tile key={key} {...measure(key)} onOpen={() => setOpen(key)} />
            ))}
          </ul>
          {open !== undefined && tiles.includes(open) && (
            <MeasureSheet
              {...measure(open)}
              sub={periodText}
              about={t(`Stats.About.${open}`)}
              onClose={() => setOpen(undefined)}
            >
              {details(open)}
            </MeasureSheet>
          )}

          <section className="mt-section">
            <SectionHeader>{t('Stats.Workouts')}</SectionHeader>
            <BarChart
              testId="workouts-chart"
              hue={HUES.workouts}
              bars={count}
              format={formatWhole}
              whole
              summary={{
                label: t('Stats.Average'),
                value: formatOne(
                  range.unit === 'week' ? totals.perWeek : totals.workouts / Math.max(count.length - firstBar, 1),
                ),
                unit: per,
                sub: rangeText(range),
              }}
              pickedLabel={t('Stats.Total')}
              goal={range.unit === 'week' ? { value: goal, label: goalLabel(goal) } : undefined}
              caption={`${t('Stats.Workouts')} ${per}`}
            />
          </section>

          {liftsEver && (
            <section className="mt-section">
              <SectionHeader>{t('Stats.Volume')}</SectionHeader>
              <BarChart
                testId="volume-chart"
                hue={HUES.lifted}
                bars={volume}
                format={formatWhole}
                unit="kg"
                summary={{
                  label: t('Stats.Total'),
                  value: formatWhole(totals.volumeKg),
                  unit: 'kg',
                  sub: rangeText(range),
                }}
                pickedLabel={t('Stats.Total')}
                caption={`${t('Stats.Volume')} ${per}, kg`}
              />
            </section>
          )}

          <section className="mt-section">
            <SectionHeader>{t('Stats.Areas')}</SectionHeader>
            {areas.length === 0 ? (
              <p className={`${CARD} p-4 text-[0.9375rem] text-label-2`} data-testid="areas-empty">
                {t('Stats.AreasEmpty')}
              </p>
            ) : (
              <HorizontalBars
                testId="areas"
                hue={HUES.sets}
                rows={areas.map((a) => ({ label: t(`BodyArea.${a.area}`), value: a.sets }))}
                format={formatWhole}
              />
            )}
            <p className="px-4 pt-1.5 text-[0.8125rem] text-label-2">{t('Stats.AreasHelp')}</p>
          </section>

          {records.length > 0 && (
            <section className="mt-section">
              <SectionHeader>{t('Stats.Records')}</SectionHeader>
              <Group separatorInset="3.75rem" testId="records" footer={t('Stats.RecordsHelp')}>
                {records.map((r) => (
                  <li key={r.exercise.id}>
                    <ExerciseLink
                      exercise={r.exercise}
                      href={`/stats/exercises/${r.exercise.id}${periodQuery}`}
                      detail={`${formatDate(r.point.date, 'd MMM yyyy')} · ${t('Stats.Previous', metricText(r.metric, r.previous))}`}
                      gain={gainText(r.metric, r.point.value, r.previous)}
                      trailing={metricText(r.metric, r.point.value)}
                    />
                  </li>
                ))}
              </Group>
            </section>
          )}
        </>
      )}
    </>
  )
}

interface FigureProps {
  label: string
  value: string
  unit?: string
  hue: Hue
  testId: string
}

/** A measure's label after its icon, and its figure large, both in its colour. */
function FigureText({ label, value, unit, hue }: Omit<FigureProps, 'testId'>) {
  return (
    <>
      <p className="flex items-center gap-1.5 text-[0.9375rem] font-semibold text-label-2">
        <HueIcon hue={hue} />
        <span className="truncate">{label}</span>
      </p>
      <p className="mt-0.5 truncate leading-tight">
        <span className={`text-[1.75rem] font-bold ${hue.text}`} data-testid="tile-value">
          {value}
        </span>
        {unit !== undefined && <span className="ml-1 text-[0.9375rem] font-semibold text-label-2">{unit}</span>}
      </p>
    </>
  )
}

/** A tile of the period: a button that opens what the measure means and what makes it up. */
function Tile({ testId, onOpen, ...figure }: FigureProps & { onOpen: () => void }) {
  return (
    <li data-testid={testId}>
      <button
        type="button"
        onClick={onOpen}
        aria-haspopup="dialog"
        className={`${CARD} relative block w-full px-4 py-3 text-left transition-transform duration-150 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500`}
      >
        {/* On the figure's line, where there is room: the label needs the tile's whole width. */}
        <span className="absolute right-4 bottom-[1.375rem]">
          <Chevron />
        </span>
        <FigureText {...figure} />
      </button>
    </li>
  )
}

/** Bars rising, as the statistics' button and empty state show them. */
export function ChartIcon({ className = 'size-[1.375rem]' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 20h16M7 16.5v-4M12 16.5V7.5M17 16.5v-7" />
    </svg>
  )
}
