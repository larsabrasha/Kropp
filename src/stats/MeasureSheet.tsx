import type { ReactNode } from 'react'
import { ModalSheet } from '../ui/ModalSheet'
import { HueIcon } from './HueIcon'
import type { Hue } from './hues'

// A measure of the statistics opened from its tile, as Health opens one of its own: the figure
// large in its colour, what it covers, what it means, and what makes it up below.

export function MeasureSheet({
  label,
  value,
  unit,
  hue,
  sub,
  about,
  onClose,
  children,
}: {
  label: string
  value: string
  unit?: string
  hue: Hue
  /** The days it covers. */
  sub: string
  /** What the measure means and how it is counted. */
  about: string
  onClose: () => void
  children?: ReactNode
}) {
  return (
    <ModalSheet title={label} onClose={onClose} testId="measure-sheet" closeTestId="close-measure" fit>
      <div className="flex flex-col gap-section">
        <section className="px-4">
          <p className="flex items-center gap-1.5 text-[0.9375rem] font-semibold text-label-2">
            <HueIcon hue={hue} />
            {sub}
          </p>
          <p className="mt-0.5 leading-tight">
            <span className={`text-[2.125rem] font-bold ${hue.text}`} data-testid="measure-value">
              {value}
            </span>
            {unit !== undefined && <span className="ml-1 text-[1.0625rem] font-semibold text-label-2">{unit}</span>}
          </p>
          <p className="mt-3 text-[1.0625rem]" data-testid="measure-about">
            {about}
          </p>
        </section>
        {children}
      </div>
    </ModalSheet>
  )
}
