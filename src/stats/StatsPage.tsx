import { useCallback, useState } from 'react'
import { formatDate, t } from '../i18n/i18n'
import { navigate, useLocation } from '../route'
import { useAnyChange, useRepository } from '../services'
import type { LocalRepository } from '../sync/localRepo'
import { maxDate, mondayOf, today } from '../training/dates'
import { DEFAULT_SETTINGS, SETTINGS_ID, type Exercise, type Workout } from '../training/model'
import { Group } from '../ui/List'
import { SectionHeader } from '../ui/SectionHeader'
import { Segmented } from '../ui/Segmented'
import { CARD } from '../ui/styles'
import { BarChart, HorizontalBars } from './Charts'
import { ExerciseLink } from '../library/ExerciseListPage'
import { axisLabel, formatOne, formatWhole, goalLabel, metricText, periodOptions, rangeText, spanTitle } from './format'
import {
  bucketsOf,
  DEFAULT_PERIOD,
  goalStreak,
  isPeriod,
  latestRecords,
  logged,
  perBucket,
  rangeOf,
  setsPerArea,
  totalsOf,
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

export function StatsPage() {
  const repository = useRepository()
  const { query } = useLocation()
  const asked = query.get('period')
  const period: Period = isPeriod(asked) ? asked : DEFAULT_PERIOD
  // Read during the first render, so the page never shows without its data.
  const [data, setData] = useState(() => read(repository))
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
  const streak = goalStreak(workouts, day, goal)
  const records = latestRecords(workouts, exercises).slice(0, RECORDS)

  const periodQuery = period === DEFAULT_PERIOD ? '' : `?period=${period}`

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
            className="mt-4"
          />
          <p className="mt-2 px-4 text-[0.9375rem] text-label-2" data-testid="range">
            {rangeText(range)}
          </p>

          {/* The period's totals, as Fitness lays out its own: tiles two by two. */}
          <ul className="mt-4 grid grid-cols-2 gap-3" data-testid="totals">
            <Tile label={t('Stats.Workouts')} value={formatWhole(totals.workouts)} testId="total-workouts" />
            <Tile label={t('Stats.PerWeek')} value={formatOne(totals.perWeek)} testId="total-per-week" />
            <Tile label={t('Stats.Sets')} value={formatWhole(totals.sets)} testId="total-sets" />
            <Tile label={t('Stats.Lifted')} value={formatWhole(totals.volumeKg)} unit="kg" testId="total-volume" />
          </ul>

          <section className="mt-section">
            <SectionHeader>{t('Stats.Workouts')}</SectionHeader>
            <BarChart
              testId="workouts-chart"
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
            <p className="px-4 pt-1.5 text-[0.8125rem] text-label-2" data-testid="streak">
              {streak === 0
                ? t('Stats.StreakNone', goal)
                : streak === 1
                  ? t('Stats.StreakOne', goal)
                  : t('Stats.Streak', streak, goal)}
            </p>
          </section>

          {liftsEver && (
            <section className="mt-section">
              <SectionHeader>{t('Stats.Volume')}</SectionHeader>
              <BarChart
                testId="volume-chart"
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

function Tile({ label, value, unit, testId }: { label: string; value: string; unit?: string; testId: string }) {
  return (
    <li className={`${CARD} px-4 py-3`} data-testid={testId}>
      <p className="text-[0.9375rem] font-semibold text-label-2">{label}</p>
      <p className="mt-0.5 leading-tight">
        <span className="text-[1.75rem] font-bold" data-testid="tile-value">
          {value}
        </span>
        {unit !== undefined && <span className="ml-1 text-[0.9375rem] font-semibold text-label-2">{unit}</span>}
      </p>
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
