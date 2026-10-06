import type { KeyboardEvent } from 'react'

/**
 * A segmented control, as iOS 26 draws one: a grey capsule, the chosen segment a raised capsule
 * inside it. One choice of a few, all in view, like Health's D W M 6M Y. Arrow keys move the choice.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  testId,
  className = '',
}: {
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  /** What is chosen, for screen readers. */
  label: string
  testId?: string
  className?: string
}) {
  const keyDown = (e: KeyboardEvent) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (step === 0) return
    e.preventDefault()
    const index = options.findIndex((o) => o.value === value)
    const next = options[(index + step + options.length) % options.length]!
    onChange(next.value)
    e.currentTarget.querySelector<HTMLElement>(`[data-value="${next.value}"]`)?.focus()
  }
  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={keyDown}
      data-testid={testId}
      className={`flex rounded-full bg-fill p-0.5 ${className}`}
    >
      {options.map((option) => {
        const chosen = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={chosen}
            tabIndex={chosen ? 0 : -1}
            data-value={option.value}
            onClick={() => onChange(option.value)}
            className={`min-h-8 min-w-0 flex-1 truncate rounded-full px-2 text-[0.9375rem] transition-colors duration-200 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500 ${
              chosen
                ? 'bg-white font-semibold shadow-[0_1px_4px_rgb(0_0_0/0.12)] dark:bg-[#636366]'
                : 'font-medium active:opacity-60'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
