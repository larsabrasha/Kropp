import type { Hue } from './hues'

/** The measure's icon before its label, in its colour. */
export function HueIcon({ hue }: { hue: Hue }) {
  return (
    <svg
      className={`size-4 shrink-0 ${hue.text}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={hue.icon} />
    </svg>
  )
}
