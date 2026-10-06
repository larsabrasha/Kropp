import { useCallback, useState } from 'react'
import { capitalize, formatDate, t } from '../i18n/i18n'
import { Link, navigate, useLocation } from '../route'
import { useAnyChange, useRepository } from '../services'
import type { LocalRepository } from '../sync/localRepo'
import { daysBetween, today } from '../training/dates'
import type { Exercise, Workout } from '../training/model'
import { result } from '../training/text'
import { BackLink, BarItem, GLASS_CAPSULE } from '../ui/Layout'
import { Chevron, Group } from '../ui/List'
import { Segmented } from '../ui/Segmented'
import { CARD, ROW } from '../ui/styles'
import { LineChart } from './Charts'
import { METRIC_UNITS, metricNumber, metricText, periodOptions, rangeText } from './format'
import { ChartIcon } from './StatsPage'
import {
  bestOf,
  DEFAULT_PERIOD,
  isPeriod,
  logged,
  metricsFor,
  occasionsOf,
  rangeOf,
  seriesOf,
  type Metric,
  type Period,
} from './stats'

// One exercise over time, as Health shows one measurement: a measure and a period to choose, the
// line of it through every workout it was done in, its bests, and every time it was done.

interface Data {
  exercise?: Exercise
  workouts: Workout[]
  error?: string
}

function read(repository: LocalRepository, id: string): Data {
  try {
    return { exercise: repository.peek('exercise', id), workouts: logged(repository.peekAll('workout'), today()) }
  } catch (e) {
    console.error(`Could not read statistics for ${id}`, e)
    return { workouts: [], error: t('Home.LoadFailed') }
  }
}

export function ExerciseStatsPage({ id: routeId }: { id: string }) {
  const id = routeId.toLowerCase()
  const repository = useRepository()
  const { query } = useLocation()
  const [data, setData] = useState(() => read(repository, id))
  const load = useCallback(() => setData(read(repository, id)), [repository, id])
  useAnyChange(load)

  const askedPeriod = query.get('period')
  const period: Period = isPeriod(askedPeriod) ? askedPeriod : DEFAULT_PERIOD
  // The same page in the library and in the statistics: back to the one it was opened in.
  const fromLibrary = query.get('from') === 'library'
  const back = fromLibrary ? '/exercises' : `/stats${period === DEFAULT_PERIOD ? '' : `?period=${period}`}`
  const { exercise, workouts, error } = data

  if (!exercise)
    return (
      <>
        <BackLink href={back} label={fromLibrary ? t('Library.Exercises') : t('Stats.Heading')} testId="back" />
        <div
          className="flex flex-col items-center gap-3 px-6 py-14 text-center text-[1.0625rem] text-label-2"
          data-testid="not-found"
        >
          <ChartIcon className="size-12" />
          <p>{error ?? t('Exercises.NotFound')}</p>
        </div>
      </>
    )

  const metrics = metricsFor(exercise)
  const askedMetric = query.get('metric')
  const metric: Metric = metrics.find((m) => m === askedMetric) ?? metrics[0]!
  // Both choices live in the URL, as the overview's period does; neither is a step back.
  const choose = (next: { period?: Period; metric?: Metric }) => {
    const p = next.period ?? period
    const m = next.metric ?? metric
    const params = new URLSearchParams()
    if (fromLibrary) params.set('from', 'library')
    if (p !== DEFAULT_PERIOD) params.set('period', p)
    if (m !== metrics[0]) params.set('metric', m)
    const search = params.toString()
    navigate(`/stats/exercises/${id}${search ? `?${search}` : ''}`, { replace: true })
  }

  const day = today()
  const occasions = occasionsOf(workouts, id)
  const range = rangeOf(period, day, occasions[0]?.date)
  const all = seriesOf(metric, occasions)
  const inRange = all.filter((p) => p.date >= range.start && p.date <= range.end)
  const days = Math.max(1, daysBetween(range.start, range.end))
  const at = (date: string) => daysBetween(range.start, date) / days
  const latest = inRange.at(-1)
  const change = latest && inRange.length > 1 ? latest.value - inRange[0]!.value : undefined
  const changeText =
    change === undefined
      ? undefined
      : `${change > 0 ? '+' : change < 0 ? '−' : '±'}${metricNumber(metric, Math.abs(change))} ${METRIC_UNITS[metric]}`

  const unit = METRIC_UNITS[metric]
  const kind = exercise.kind
  const history = [...occasions].reverse()
  const backHere = `stats/exercises/${id}${fromLibrary ? '?from=library' : ''}`

  return (
    <>
      <BackLink href={back} label={fromLibrary ? t('Library.Exercises') : t('Stats.Heading')} testId="back" />
      {/* What the exercise is, its name, kind and picture, changed in a sheet over its progress, as
          Health has a measurement's details behind the page that charts it. */}
      <BarItem side="trailing">
        <Link
          href={`/exercises/${id}`}
          aria-label={t('Entry.EditExercise')}
          data-testid="edit-exercise"
          className={GLASS_CAPSULE}
        >
          {t('Entry.Edit')}
        </Link>
      </BarItem>
      <h1 className="large-title">{exercise.name}</h1>
      <p className="text-[0.9375rem] text-label-2" data-testid="exercise-meta">
        {t(`Exercise.Kind.${kind}`)}
        {occasions.length > 0 &&
          ` · ${
            occasions.length === 1
              ? t('Stats.ExerciseMetaOne', formatDate(occasions[0]!.date, 'd MMM yyyy'))
              : t('Stats.ExerciseMeta', occasions.length, formatDate(occasions.at(-1)!.date, 'd MMM yyyy'))
          }`}
      </p>

      {occasions.length === 0 ? (
        <div
          className="mt-4 flex flex-col items-center gap-3 px-6 py-14 text-center text-[1.0625rem] text-label-2"
          data-testid="exercise-stats-empty"
        >
          <ChartIcon className="size-12" />
          <p>{t('Stats.ExerciseEmpty')}</p>
        </div>
      ) : (
        <>
          {metrics.length > 1 && (
            <Segmented
              options={metrics.map((m) => ({ value: m, label: t(`Stats.Metric.${m}`) }))}
              value={metric}
              onChange={(m) => choose({ metric: m })}
              label={t('Stats.Metric')}
              testId="metric"
              className="mt-4"
            />
          )}
          <Segmented
            options={periodOptions()}
            value={period}
            onChange={(p) => choose({ period: p })}
            label={t('Stats.Period')}
            testId="period"
            className="mt-3"
          />

          <section className="mt-5">
            {latest === undefined ? (
              <p className={`${CARD} p-4 text-[0.9375rem] text-label-2`} data-testid="no-data">
                {t('Stats.NoData')}
              </p>
            ) : (
              <LineChart
                // A new period or measure starts with nothing picked.
                key={`${period}-${metric}`}
                testId="exercise-chart"
                points={inRange.map((p) => ({
                  at: at(p.date),
                  value: p.value,
                  title: capitalize(formatDate(p.date, 'ddd d MMM yyyy')),
                }))}
                format={(v) => metricNumber(metric, v)}
                unit={unit}
                summary={{
                  label: t('Stats.Latest'),
                  value: metricNumber(metric, latest.value),
                  unit,
                  sub: changeText === undefined ? rangeText(range) : t('Stats.Change', changeText),
                }}
                axis={[
                  { at: 0, text: formatDate(range.start, 'd MMM') },
                  { at: 1, text: formatDate(range.end, 'd MMM') },
                ]}
                caption={`${t(`Stats.Metric.${metric}`)}, ${unit}`}
                pickedLabel={t(`Stats.Metric.${metric}`)}
              />
            )}
            <p className="px-4 pt-1.5 text-[0.8125rem] text-label-2">{t(`Stats.MetricHelp.${metric}`)}</p>
          </section>

          {/* Each measure's best ever, the date it was set. */}
          <Group className="mt-section" header={t('Stats.Best')} testId="bests">
            {metrics.map((m) => {
              const best = bestOf(m, seriesOf(m, occasions))
              return (
                best && (
                  <li key={m} className={`${ROW} justify-between`}>
                    <span className="min-w-0">
                      <span className="block truncate text-[1.0625rem]">{t(`Stats.Metric.${m}`)}</span>
                      <span className="block text-[0.8125rem] text-label-2">{formatDate(best.date, 'd MMM yyyy')}</span>
                    </span>
                    <span className="shrink-0 text-[1.0625rem] font-semibold tabular-nums" data-testid={`best-${m}`}>
                      {metricText(m, best.value)}
                    </span>
                  </li>
                )
              )
            })}
          </Group>

          <Group className="mt-section" header={t('Stats.History')} testId="history">
            {history.map((o) => (
              <li key={o.workoutId}>
                <Link href={`/workouts/${o.workoutId}?back=${encodeURIComponent(backHere)}`} className={ROW}>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[1.0625rem] first-letter:uppercase">
                      {formatDate(o.date, 'ddd d MMM yyyy')}
                    </span>
                    <span className="block truncate text-[0.9375rem] text-label-2" data-testid="history-result">
                      {o.entries.map((e) => result(e, kind)).join(' · ')}
                    </span>
                  </span>
                  <Chevron />
                </Link>
              </li>
            ))}
          </Group>
        </>
      )}
    </>
  )
}
