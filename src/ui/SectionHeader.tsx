import type { ReactNode } from 'react'

/**
 * The header of a section of a summary page (the home page), as iOS 26's Health sets its own:
 * the title large and bold, 16pt in from the card's edge, its baseline 19pt above the card, and
 * the section's own action at the right, in the tint (Visa alla, I dag), as Health has its Ändra.
 * Measured in Health on an iPhone 17 Pro. Lists of settings keep Group's small grey header.
 */
export function SectionHeader({
  children,
  action,
  testId,
}: {
  children: ReactNode
  action?: ReactNode
  testId?: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 pb-3">
      <h2 className="min-w-0 text-[1.375rem] leading-7 font-bold" data-testid={testId}>
        {children}
      </h2>
      {action}
    </div>
  )
}

/** A section's own action in its header: a word in the tint, with room to tap around it. */
export const SECTION_ACTION =
  '-my-2 -mr-2 shrink-0 px-2 py-2 text-[1.0625rem] text-tint active:opacity-60 focus-visible:outline-2 focus-visible:outline-blue-500'
