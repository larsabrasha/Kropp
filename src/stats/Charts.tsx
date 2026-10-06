import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { CARD } from '../ui/styles'
import type { Hue } from './hues'
import { niceDomain, niceScale } from './stats'

// Charts as iOS 26's Health draws them: in a card, the number read out large above the plot, the
// plot in the app's tint on hairline gridlines, the axis's values at the right. Touched or dragged
// across, the plot picks the bar or point under the finger and the readout shows it, as Health
// does; the arrow keys do the same. Every value is also in a table for screen readers. No library:
// the bars are boxes, the line is an SVG stretched over the plot with a stroke that does not stretch.

export interface Readout {
  label: string
  value: string
  unit?: string
  sub: string
}

function ReadoutView({ label, value, unit, sub, hue }: Readout & { hue?: Hue }) {
  return (
    <div aria-live="polite" data-testid="readout">
      <p className="text-[0.8125rem] font-semibold text-label-2 uppercase">{label}</p>
      <p className="mt-0.5 leading-tight">
        <span className={`text-[1.75rem] font-bold ${hue?.text ?? ''}`} data-testid="readout-value">
          {value}
        </span>
        {unit !== undefined && <span className="ml-1 text-[0.9375rem] font-semibold text-label-2">{unit}</span>}
      </p>
      <p className="text-[0.9375rem] text-label-2" data-testid="readout-sub">
        {sub}
      </p>
    </div>
  )
}

/**
 * The bar or point picked by touch, pointer or arrow keys; a tap on the one picked lets it go.
 * indexAt turns a place across the plot (0 to 1) into the index there.
 */
function usePick(count: number, indexAt: (fraction: number) => number) {
  const [picked, setPicked] = useState<number>()
  // Set when the press began on the one already picked: let go without moving, it is unpicked.
  const release = useRef(false)
  const down = useRef(false)
  const at = (e: PointerEvent<HTMLElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    return indexAt(Math.min(1, Math.max(0, (e.clientX - box.left) / Math.max(box.width, 1))))
  }
  const current = picked !== undefined && picked < count ? picked : undefined
  return {
    picked: current,
    clear: () => setPicked(undefined),
    handlers: {
      onPointerDown: (e: PointerEvent<HTMLElement>) => {
        if (count === 0) return
        down.current = true
        const index = at(e)
        release.current = index === current
        setPicked(index)
        e.currentTarget.setPointerCapture?.(e.pointerId)
      },
      onPointerMove: (e: PointerEvent<HTMLElement>) => {
        if (!down.current) return
        const index = at(e)
        if (index !== current) release.current = false
        setPicked(index)
      },
      onPointerUp: () => {
        down.current = false
        if (release.current) setPicked(undefined)
        release.current = false
      },
      onPointerCancel: () => {
        down.current = false
        release.current = false
      },
      onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
        if (count === 0) return
        if (e.key === 'Escape') return setPicked(undefined)
        const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
        if (step === 0) return
        e.preventDefault()
        setPicked(current === undefined ? (step > 0 ? 0 : count - 1) : Math.min(count - 1, Math.max(0, current + step)))
      },
    },
  }
}

const AXIS_TEXT = 'text-[0.6875rem] leading-none text-label-2 tabular-nums'

/** The plot with its gridlines and their values at its right, and the labels under it. */
function Frame({
  ticks,
  toY,
  format,
  marker,
  below,
  plotProps,
  label,
  children,
}: {
  ticks: number[]
  /** Where a value sits, 0 at the bottom to 1 at the top. */
  toY: (value: number) => number
  format: (value: number) => string
  /** A line of its own across the plot, such as a goal, with its label at the right. */
  marker?: { value: number; label: string }
  below: ReactNode
  plotProps: ReturnType<typeof usePick>['handlers']
  label: string
  children: ReactNode
}) {
  const near = (tick: number) =>
    marker !== undefined && Math.abs(toY(tick) - toY(marker.value)) < 0.12 && tick !== ticks[0]
  return (
    <>
      <div className="mt-4 flex">
        <div
          {...plotProps}
          tabIndex={0}
          role="group"
          aria-label={label}
          className="relative h-40 flex-1 cursor-pointer touch-pan-y select-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-500"
          data-testid="plot"
        >
          {ticks.map((tick) => (
            <div
              key={tick}
              className="pointer-events-none absolute inset-x-0 border-t border-separator"
              style={{ bottom: `${toY(tick) * 100}%` }}
            />
          ))}
          {marker !== undefined && (
            <div
              className="pointer-events-none absolute inset-x-0 border-t-[1.5px] border-dashed border-gray-900/70 dark:border-white/70"
              style={{ bottom: `${toY(marker.value) * 100}%` }}
              data-testid="goal-line"
            />
          )}
          {children}
        </div>
        <div className="relative w-11 shrink-0" aria-hidden="true">
          {ticks
            .filter((tick) => !near(tick))
            .map((tick) => (
              <span
                key={tick}
                className={`absolute left-2 translate-y-1/2 ${AXIS_TEXT}`}
                style={{ bottom: `${toY(tick) * 100}%` }}
              >
                {format(tick)}
              </span>
            ))}
          {marker !== undefined && (
            <span
              className={`absolute left-2 translate-y-1/2 font-semibold ${AXIS_TEXT}`}
              style={{ bottom: `${toY(marker.value) * 100}%` }}
            >
              {marker.label}
            </span>
          )}
        </div>
      </div>
      <div className="relative mt-1.5 mr-11 h-3.5" aria-hidden="true">
        {below}
      </div>
    </>
  )
}

/** Every value of a chart, as a table only screen readers see. */
function Table({ caption, rows }: { caption: string; rows: { title: string; value: string }[] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            <th scope="row">{row.title}</th>
            <td>{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export interface Bar {
  value: number
  /** What the bar covers, in the readout when picked: "v. 38 · 14–20 sep". */
  title: string
  /** Its label under the plot, if any. */
  axis?: string
}

/**
 * Bars from a baseline, one for each week or month of a period. summary is the readout with no bar
 * picked; a picked bar reads out as pickedLabel and its value.
 */
export function BarChart({
  bars,
  format,
  unit,
  summary,
  pickedLabel,
  goal,
  whole = false,
  caption,
  hue,
  testId,
}: {
  bars: Bar[]
  format: (value: number) => string
  unit?: string
  summary: Readout
  pickedLabel: string
  goal?: { value: number; label: string }
  /** Counted things: whole steps on the axis. */
  whole?: boolean
  caption: string
  /** The measure's colour, for its bars and figure; the app's tint without one. */
  hue?: Hue
  testId?: string
}) {
  const top = Math.max(0, ...bars.map((b) => b.value), goal?.value ?? 0)
  const scale = niceScale(top, 3, whole)
  const ticks = Array.from({ length: Math.round(scale.max / scale.step) + 1 }, (_, i) => i * scale.step)
  const toY = (value: number) => value / scale.max
  const n = bars.length
  const { picked, handlers } = usePick(n, (f) => Math.min(n - 1, Math.floor(f * n)))
  const bar = picked === undefined ? undefined : bars[picked]
  const readout = bar ? { label: pickedLabel, value: format(bar.value), unit, sub: bar.title } : summary

  return (
    <div className={`${CARD} p-4`} data-testid={testId}>
      <ReadoutView {...readout} hue={hue} />
      <Frame
        ticks={ticks}
        toY={toY}
        format={format}
        marker={goal}
        plotProps={handlers}
        label={caption}
        below={bars.map(
          (b, i) =>
            b.axis !== undefined && (
              <span key={i} className={`absolute top-0 ${AXIS_TEXT}`} style={{ left: `${(i / n) * 100}%` }}>
                {b.axis}
              </span>
            ),
        )}
      >
        <div className="pointer-events-none absolute inset-0 flex items-end">
          {bars.map((b, i) => (
            <div key={i} className="flex h-full min-w-0 flex-1 items-end justify-center">
              <div
                className={`w-[62%] max-w-6 rounded-t-[4px] ${hue?.fill ?? 'bg-tint'} transition-opacity duration-150 ${
                  picked !== undefined && picked !== i ? 'opacity-35' : ''
                }`}
                style={{ height: `${toY(b.value) * 100}%`, minHeight: b.value > 0 ? 2 : 0 }}
                data-testid="bar"
                data-picked={picked === i ? '' : undefined}
              />
            </div>
          ))}
        </div>
      </Frame>
      <Table
        caption={caption}
        rows={bars.map((b) => ({ title: b.title, value: `${format(b.value)} ${unit ?? ''}` }))}
      />
    </div>
  )
}

export interface LinePoint {
  /** Where across the period, 0 at its first day to 1 at its last. */
  at: number
  value: number
  title: string
}

/** One value over time, as Health draws a weight: a line through the points, its axis around them. */
export function LineChart({
  points,
  format,
  unit,
  summary,
  pickedLabel,
  axis,
  caption,
  testId,
}: {
  points: LinePoint[]
  format: (value: number) => string
  unit?: string
  summary: Readout
  /** The readout's label for a point picked: what the line measures. */
  pickedLabel: string
  axis: { at: number; text: string }[]
  caption: string
  testId?: string
}) {
  const values = points.map((p) => p.value)
  const domain = niceDomain(Math.min(...values), Math.max(...values))
  const ticks = Array.from(
    { length: Math.round((domain.max - domain.min) / domain.step) + 1 },
    (_, i) => domain.min + i * domain.step,
  )
  const toY = (value: number) => (value - domain.min) / (domain.max - domain.min)
  const nearest = (f: number) =>
    points.reduce((best, p, i) => (Math.abs(p.at - f) < Math.abs(points[best]!.at - f) ? i : best), 0)
  const { picked, handlers } = usePick(points.length, nearest)
  const point = picked === undefined ? undefined : points[picked]
  const readout = point ? { label: pickedLabel, value: format(point.value), unit, sub: point.title } : summary
  const line = points.map((p) => `${p.at * 100},${(1 - toY(p.value)) * 100}`).join(' ')
  const dots = points.length <= 40

  return (
    <div className={`${CARD} p-4`} data-testid={testId}>
      <ReadoutView {...readout} />
      <Frame
        ticks={ticks}
        toY={toY}
        format={format}
        plotProps={handlers}
        label={caption}
        below={axis.map((a, i) => (
          <span
            key={i}
            className={`absolute top-0 whitespace-nowrap ${AXIS_TEXT} ${a.at > 0.85 ? '-translate-x-full' : ''}`}
            style={{ left: `${a.at * 100}%` }}
          >
            {a.text}
          </span>
        ))}
      >
        <svg
          className="pointer-events-none absolute inset-0 size-full overflow-visible text-tint"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {points.length > 1 && (
            <>
              <polygon
                points={`${points[0]!.at * 100},100 ${line} ${points.at(-1)!.at * 100},100`}
                fill="currentColor"
                opacity="0.1"
              />
              <polyline
                points={line}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}
        </svg>
        {point && (
          <div
            className="pointer-events-none absolute inset-y-0 w-px -translate-x-1/2 bg-label-3"
            style={{ left: `${point.at * 100}%` }}
          />
        )}
        {points.map(
          (p, i) =>
            (dots || i === picked || points.length === 1) && (
              <span
                key={i}
                className={`pointer-events-none absolute -translate-x-1/2 translate-y-1/2 rounded-full bg-tint ring-2 ring-cell ${
                  i === picked ? 'size-3' : 'size-2'
                }`}
                style={{ left: `${p.at * 100}%`, bottom: `${toY(p.value) * 100}%` }}
                data-testid="point"
              />
            ),
        )}
      </Frame>
      <Table
        caption={caption}
        rows={points.map((p) => ({ title: p.title, value: `${format(p.value)} ${unit ?? ''}` }))}
      />
    </div>
  )
}

/** A value per category as bars across, longest first, each named at its left: sets per body area. */
export function HorizontalBars({
  rows,
  format,
  hue,
  testId,
}: {
  rows: { label: string; value: number }[]
  format: (value: number) => string
  hue?: Hue
  testId?: string
}) {
  const top = Math.max(1, ...rows.map((r) => r.value))
  return (
    <ul className={`${CARD} space-y-3 p-4`} data-testid={testId}>
      {rows.map((row) => (
        <li key={row.label} className="flex items-center gap-3">
          <span className="w-20 shrink-0 truncate text-[0.9375rem]">{row.label}</span>
          <span className="flex min-w-0 flex-1 items-center gap-2" aria-hidden="true">
            <span
              className={`h-2.5 rounded-r-[4px] ${hue?.fill ?? 'bg-tint'}`}
              style={{ width: `${(row.value / top) * 100}%`, minWidth: 2 }}
            />
          </span>
          <span className="w-12 shrink-0 text-right text-[0.9375rem] text-label-2 tabular-nums" data-testid="area-sets">
            {format(row.value)}
          </span>
        </li>
      ))}
    </ul>
  )
}
