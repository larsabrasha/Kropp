import { picture } from '../illustrations/illustrations'

export function PlanIcon({ slug }: { slug: string | undefined }) {
  return (
    <span className="size-12 shrink-0 overflow-hidden rounded-lg bg-white dark:bg-gray-800" aria-hidden="true">
      {slug && <img src={picture(slug)} alt="" className="illustration size-full object-contain p-1" />}
    </span>
  )
}
