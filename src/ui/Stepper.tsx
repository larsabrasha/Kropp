import { t } from '../i18n/i18n'
import { invariant, parseDecimal } from '../training/text'
import { useCommit } from './useCommit'

const BUTTON =
  'flex size-11 shrink-0 items-center justify-center rounded-xl bg-gray-200 text-2xl font-medium text-gray-800 hover:bg-gray-300 active:bg-gray-400 disabled:opacity-40 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700'

/**
 * A number with large − and + buttons, for adjusting reps and weight with a thumb. The label sits
 * above, as on every field. The field is still a field, for typing an exact value. Values never go
 * below min (0 unless given).
 *
 * max: the highest value + goes to. start: what + gives an empty field, where one step from zero
 * is no use (a pulse of 1).
 */
export function Stepper({
  label,
  value,
  step = 1,
  onChange,
  max,
  min = 0,
  start,
}: {
  label: string
  value: number | undefined
  step?: number
  onChange: (value: number | undefined) => void
  max?: number
  min?: number
  start?: number
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
    <div className="flex flex-col gap-1" data-testid="stepper" data-label={label}>
      <span className="pl-inset text-xs text-gray-600 dark:text-gray-400">{label}</span>
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
          className="h-11 w-full max-w-32 min-w-0 rounded-xl border border-gray-300 bg-white px-3 text-left text-lg font-semibold text-gray-900 tabular-nums dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
        />
        <div className="flex shrink-0 gap-3">
          <button
            type="button"
            onClick={() => change(-step)}
            disabled={value === undefined || value <= min}
            aria-label={t('Stepper.Decrease', label)}
            title={t('Stepper.Decrease', label)}
            data-testid="decrease"
            className={BUTTON}
          >
            −
          </button>
          <button
            type="button"
            onClick={() => change(step)}
            disabled={max !== undefined && value !== undefined && value >= max}
            aria-label={t('Stepper.Increase', label)}
            title={t('Stepper.Increase', label)}
            data-testid="increase"
            className={BUTTON}
          >
            +
          </button>
        </div>
      </div>
    </div>
  )
}
