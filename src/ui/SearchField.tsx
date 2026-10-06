import { useRef, type InputHTMLAttributes, type Ref } from 'react'
import { t } from '../i18n/i18n'

/**
 * A search field as iOS 26 and 27 draw one: a grey capsule with a magnifying glass at its start,
 * and while it holds text, a grey round clear button at its end that empties it and keeps the
 * focus. The browser's own clear button is hidden (index.css), so it is the same everywhere.
 * Everything else is the input's own; give it a placeholder, which is also its name.
 */
export function SearchField({
  className = '',
  ref,
  value,
  onValueChange,
  ...input
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  ref?: Ref<HTMLInputElement>
  value: string
  onValueChange: (value: string) => void
  'data-testid'?: string
}) {
  const own = useRef<HTMLInputElement | null>(null)
  const setRef = (element: HTMLInputElement | null) => {
    own.current = element
    if (typeof ref === 'function') ref(element)
    else if (ref) ref.current = element
  }

  return (
    <label className={`relative block ${className}`}>
      <svg
        className="pointer-events-none absolute top-1/2 left-3.5 size-[1.125rem] -translate-y-1/2 text-label-2"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="M15.5 15.5L20 20" />
      </svg>
      <input
        ref={setRef}
        type="search"
        autoComplete="off"
        aria-label={input.placeholder}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        {...input}
        className={`h-11 w-full rounded-full bg-fill pl-10 text-[1.0625rem] text-gray-900 outline-none placeholder:text-label-2 focus-visible:ring-2 focus-visible:ring-tint/50 dark:text-white ${value === '' ? 'pr-4' : 'pr-11'}`}
      />
      {value !== '' && (
        <button
          type="button"
          aria-label={t('Common.Clear')}
          onClick={() => {
            onValueChange('')
            own.current?.focus()
          }}
          className="absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-full"
          data-testid="search-clear"
        >
          <svg className="size-[1.0625rem] text-label-3" viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="10" cy="10" r="10" fill="currentColor" />
            <path d="M6.75 6.75l6.5 6.5M13.25 6.75l-6.5 6.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </label>
  )
}
