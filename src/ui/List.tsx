import type { CSSProperties, ReactNode } from 'react'

// Inset grouped lists as iOS 26 and 27 draw them: rounded, with hairlines between rows, and a
// chevron on every row that leads further in. Rows take ROW from styles.ts.

/**
 * An inset grouped list. header and footer stand above and below it in small grey, as iOS sets
 * them. separatorInset is where the hairlines between rows start: where the rows' text starts.
 */
export function Group({
  header,
  footer,
  children,
  separatorInset = '1rem',
  testId,
  className = '',
}: {
  header?: ReactNode
  footer?: ReactNode
  children: ReactNode
  separatorInset?: string
  testId?: string
  className?: string
}) {
  return (
    <section className={className}>
      {header !== undefined && <h2 className="px-4 pb-2 text-[1.0625rem] font-semibold text-label-2">{header}</h2>}
      <ul
        className="ios-list overflow-hidden rounded-[1.625rem] bg-cell"
        style={{ '--separator-inset': separatorInset } as CSSProperties}
        data-testid={testId}
      >
        {children}
      </ul>
      {footer !== undefined && <p className="px-4 pt-1.5 text-[0.8125rem] text-label-2">{footer}</p>}
    </section>
  )
}

/** The chevron at the end of a row that leads to a page of its own. */
export function Chevron() {
  return (
    <svg
      className="h-3.5 w-2.5 shrink-0 text-label-3"
      viewBox="0 0 10 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 2l6 6-6 6" />
    </svg>
  )
}
