import { picture } from '../illustrations/illustrations'
import { THUMB } from './styles'

/** A workout's or template's picture, 48pt; rounded as a THUMB (styles.ts) unless told otherwise. */
export function PlanIcon({ slug, className = THUMB }: { slug: string | undefined; className?: string }) {
  return (
    <span className={`size-12 ${className}`} aria-hidden="true">
      {slug && <img src={picture(slug)} alt="" className="illustration size-full object-contain p-1" />}
    </span>
  )
}
