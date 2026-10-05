import type { ReactNode, SelectHTMLAttributes } from 'react'
import { useCommit } from './useCommit'

// The rows of an iOS form, for a Group (List.tsx): the label at the left in the row's own text,
// the value or control at the right. A text field is the row's right part, a choice is a menu that
// shows its value in grey with iOS's up-and-down chevron, a yes or no is a switch.

const LABEL = 'shrink-0 text-[1.0625rem]'

/**
 * A text field as a form row: the label at the left, the text to its right. Saves as TextField.
 * multiline puts the label above a box for a few lines, as iOS sets a note.
 */
export function TextRow({
  label,
  value,
  placeholder,
  onChange,
  maxLength,
  testId,
  multiline = false,
}: {
  label: string
  value: string | undefined
  placeholder?: string
  onChange: (value: string | undefined) => void
  maxLength: number
  testId?: string
  multiline?: boolean
}) {
  const ref = useCommit<HTMLInputElement & HTMLTextAreaElement>((text) => {
    const trimmed = text.trim()
    onChange(trimmed === '' ? undefined : trimmed)
  })
  if (multiline)
    return (
      <li>
        <label className="flex flex-col gap-1 px-4 pt-2.5 pb-2">
          <span className="text-[0.8125rem] text-label-2">{label}</span>
          <textarea
            key={value ?? ''}
            ref={ref}
            rows={3}
            defaultValue={value ?? ''}
            maxLength={maxLength}
            placeholder={placeholder}
            data-testid={testId}
            className="w-full resize-y bg-transparent text-[1.0625rem] outline-none placeholder:text-label-3"
          />
        </label>
      </li>
    )
  return (
    <li>
      <label className="flex min-h-[3.25rem] items-center gap-4 px-4">
        <span className={LABEL}>{label}</span>
        <input
          key={value ?? ''}
          ref={ref}
          type="text"
          defaultValue={value ?? ''}
          maxLength={maxLength}
          placeholder={placeholder}
          data-testid={testId}
          className="min-w-0 flex-1 bg-transparent py-2.5 text-right text-[1.0625rem] text-label-2 outline-none placeholder:text-label-3 focus:text-gray-900 dark:focus:text-white"
        />
      </label>
    </li>
  )
}

/** A number as a form row: the label at the left, the number to its right. Reports its raw text. */
export function NumberRow({
  label,
  value,
  max,
  onChange,
}: {
  label: string
  value: string
  max: number
  onChange: (value: string) => void
}) {
  const ref = useCommit<HTMLInputElement>(onChange)
  return (
    <li>
      <label className="flex min-h-[3.25rem] items-center gap-4 px-4">
        <span className={LABEL}>{label}</span>
        <input
          key={value}
          ref={ref}
          type="number"
          inputMode="numeric"
          min="0"
          max={max}
          defaultValue={value}
          className="min-w-0 flex-1 [appearance:textfield] bg-transparent py-2.5 text-right text-[1.0625rem] text-label-2 tabular-nums outline-none focus:text-gray-900 dark:focus:text-white [&::-webkit-inner-spin-button]:appearance-none"
        />
      </label>
    </li>
  )
}

/** A day as a form row: the label at the left, iOS's compact date picker at the right. */
export function DateRow({
  label,
  value,
  text,
  min,
  max,
  onChange,
}: {
  label: string
  value: string
  /** The day as words, shown in the picker's grey pill. */
  text: string
  min: string
  max: string
  onChange: (value: string) => void
}) {
  const ref = useCommit<HTMLInputElement>(onChange)
  return (
    <li className="flex min-h-12 items-center justify-between gap-4 px-4">
      <span className={LABEL}>{label}</span>
      {/* A transparent date input over the pill. A click on a date input's text only focuses a part
          of the date in desktop browsers, so the click opens the picker itself. */}
      <label className="relative inline-flex min-h-9 cursor-pointer items-center rounded-lg bg-fill px-3 text-[1.0625rem] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-blue-500">
        <span className="inline-block whitespace-nowrap first-letter:uppercase">{text}</span>
        <input
          type="date"
          key={value}
          ref={ref}
          defaultValue={value}
          min={min}
          max={max}
          aria-label={label}
          onClick={(e) => {
            try {
              e.currentTarget.showPicker()
            } catch {
              // Not every browser has showPicker; the input still opens on its own there.
            }
          }}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
      </label>
    </li>
  )
}

/** A choice as a form row: the label at the left, and at the right a menu showing the value. */
export function SelectRow({
  label,
  children,
  ...select
}: { label: string; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement> & { 'data-testid'?: string }) {
  return (
    <li>
      <label className="relative flex min-h-[3.25rem] items-center gap-4 px-4">
        <span className={`${LABEL} flex-1`}>{label}</span>
        <select
          {...select}
          className="max-w-[60%] cursor-pointer appearance-none bg-transparent py-2.5 pr-5 text-right text-[1.0625rem] text-label-2 outline-none [text-align-last:right] focus-visible:text-gray-900 dark:focus-visible:text-white"
        >
          {children}
        </select>
        <svg
          className="pointer-events-none absolute right-4 size-3.5 text-label-2"
          viewBox="0 0 12 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 6l3-3 3 3M3 10l3 3 3-3" />
        </svg>
      </label>
    </li>
  )
}

/** A yes or no as a form row: the label at the left, iOS's switch at the right. */
export function SwitchRow({
  label,
  checked,
  onChange,
  testId,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  testId?: string
}) {
  return (
    <li>
      <label className="flex min-h-[3.25rem] items-center gap-4 px-4 py-1.5">
        <span className="min-w-0 flex-1 text-[1.0625rem]">{label}</span>
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          data-testid={testId}
          className="ios-switch"
        />
      </label>
    </li>
  )
}

/** Any content as a row of a form, padded as the others: chips, a picture. */
export function FreeRow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <li className={`px-4 py-3 ${className}`}>{children}</li>
}
