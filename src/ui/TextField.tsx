import { useCommit } from './useCommit'

const FIELD =
  'w-full min-w-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100'

/**
 * A labelled text field that reports its text, trimmed and undefined for empty, when the user
 * leaves it. maxLength comes from Limits: see there which kind of text gets what.
 */
export function TextField({
  label,
  value,
  placeholder,
  onChange,
  maxLength,
  multiline = false,
}: {
  label: string
  value: string | undefined
  placeholder?: string
  onChange: (value: string | undefined) => void
  maxLength: number
  multiline?: boolean
}) {
  const ref = useCommit<HTMLInputElement & HTMLTextAreaElement>((text) => {
    const trimmed = text.trim()
    onChange(trimmed === '' ? undefined : trimmed)
  })
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs text-gray-600 dark:text-gray-400">
      <span className="pl-inset">{label}</span>
      {multiline ? (
        <textarea
          key={value ?? ''}
          ref={ref}
          rows={3}
          defaultValue={value ?? ''}
          maxLength={maxLength}
          placeholder={placeholder}
          className={`${FIELD} resize-y`}
        />
      ) : (
        <input
          key={value ?? ''}
          ref={ref}
          type="text"
          defaultValue={value ?? ''}
          maxLength={maxLength}
          placeholder={placeholder}
          className={FIELD}
        />
      )}
    </label>
  )
}

/** A labelled number field that reports its raw text when the user leaves it. */
export function NumberField({
  label,
  value,
  step = '1',
  onChange,
  max,
}: {
  label: string
  value: string
  step?: string
  onChange: (value: string) => void
  max: number
}) {
  const ref = useCommit<HTMLInputElement>(onChange)
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs text-gray-600 dark:text-gray-400">
      <span className="pl-inset">{label}</span>
      <input
        key={value}
        ref={ref}
        type="number"
        inputMode="decimal"
        min="0"
        max={max}
        step={step}
        defaultValue={value}
        className={FIELD}
      />
    </label>
  )
}
