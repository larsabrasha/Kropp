import type { InputHTMLAttributes, Ref } from 'react'

/**
 * A search field as iOS 26 and 27 draw one: a grey capsule with a magnifying glass at its start.
 * Everything else is the input's own; give it a placeholder, which is also its name.
 */
export function SearchField({
  className = '',
  ref,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement>; 'data-testid'?: string }) {
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
        ref={ref}
        type="search"
        autoComplete="off"
        aria-label={input.placeholder}
        {...input}
        className="h-11 w-full rounded-full bg-fill pr-4 pl-10 text-[1.0625rem] text-gray-900 outline-none placeholder:text-label-2 focus-visible:ring-2 focus-visible:ring-tint/50 dark:text-white"
      />
    </label>
  )
}
