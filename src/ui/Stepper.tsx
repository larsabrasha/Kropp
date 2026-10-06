import { t } from '../i18n/i18n'
import { invariant, parseDecimal } from '../training/text'
import { useCommit } from './useCommit'

// The two halves of iOS's stepper: one grey capsule, split by a hairline.
const BUTTON =
  'flex h-11 w-14 shrink-0 items-center justify-center text-gray-900 active:bg-black/10 disabled:opacity-30 dark:text-white dark:active:bg-white/15'

/** − and + as drawn symbols, so they sit in the middle of their halves; a font's glyphs do not. */
const Sign = ({ d }: { d: string }) => (
  <svg
    className="size-5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.6"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <path d={d} />
  </svg>
)

/**
 * A number with large − and + buttons, for adjusting reps and weight with a thumb. The label sits
 * above, as on every field. The field is still a field, for typing an exact value. Values never go
 * below min (0 unless given).
 *
 * max: the highest value + goes to. start: what + gives an empty field, where one step from zero
 * is no use (a pulse of 1). row lays it out as a row of an iOS form (List.tsx): the label at the
 * left, the value and the capsule at the right.
 */
export function Stepper({
  label,
  value,
  step = 1,
  onChange,
  max,
  min = 0,
  start,
  row = false,
}: {
  label: string
  value: number | undefined
  step?: number
  onChange: (value: number | undefined) => void
  max?: number
  min?: number
  start?: number
  row?: boolean
}) {
  // A typed value kept within min and max, as − and + keep it.
  const clamp = (v: number | undefined) => (v === undefined ? undefined : Math.min(Math.max(v, min), max ?? Infinity))
  const ref = useCommit<HTMLInputElement>((text) => onChange(clamp(parseDecimal(text))))

  const change = (delta: number) => {
    if (value === undefined && delta > 0 && start !== undefined) return onChange(start)
    // A step lands on the step's grid, so 21 + 2.5 is 22.5 rather than 23.5 after a typed value.
    const current = value ?? 0
    let next = delta > 0 ? Math.floor(current / step) * step + step : Math.ceil(current / step) * step - step
    next = Math.max(min, Math.round(next * 100) / 100)
    if (max !== undefined) next = Math.min(max, next)
    onChange(next)
  }

  return (
    <div
      className={row ? 'flex min-h-[3.25rem] items-center gap-3 px-4 py-1.5' : 'flex flex-col gap-1'}
      data-testid="stepper"
      data-label={label}
    >
      <span className={row ? 'min-w-0 flex-1 text-[1.0625rem]' : 'pl-inset text-[0.8125rem] text-label-2'}>
        {label}
      </span>
      <div className="flex items-center gap-2">
        <input
          key={invariant(value)}
          ref={ref}
          type="number"
          inputMode="decimal"
          min={invariant(min)}
          max={invariant(max)}
          step={invariant(step)}
          defaultValue={invariant(value)}
          aria-label={label}
          className={
            row
              ? 'h-11 w-12 min-w-0 bg-transparent text-right text-[1.0625rem] text-label-2 tabular-nums outline-none focus:text-gray-900 dark:focus:text-white'
              : 'h-11 w-full max-w-32 min-w-0 rounded-xl bg-fill px-3 text-left text-lg font-semibold text-gray-900 tabular-nums dark:text-white'
          }
        />
        <div className="flex shrink-0 items-center overflow-hidden rounded-full bg-fill">
          <button
            type="button"
            onClick={() => change(-step)}
            disabled={value === undefined || value <= min}
            aria-label={t('Stepper.Decrease', label)}
            title={t('Stepper.Decrease', label)}
            data-testid="decrease"
            className={BUTTON}
          >
            <Sign d="M6 12h12" />
          </button>
          <span className="h-5 w-px bg-separator" aria-hidden="true" />
          <button
            type="button"
            onClick={() => change(step)}
            disabled={max !== undefined && value !== undefined && value >= max}
            aria-label={t('Stepper.Increase', label)}
            title={t('Stepper.Increase', label)}
            data-testid="increase"
            className={BUTTON}
          >
            <Sign d="M6 12h12M12 6v12" />
          </button>
        </div>
      </div>
    </div>
  )
}
