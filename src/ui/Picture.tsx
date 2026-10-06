import { picture } from '../illustrations/illustrations'

// An exercise's or a workout's picture, drawn one way wherever it is, as Apple draws its own: a
// rounded tile of the system's translucent fill (bg-fill), which follows the surface it lies on,
// a little darker on the grey page than on a white row and right in dark mode by itself, with the
// figure inset by the same share at every size. Never white on one surface and grey on another.

const SIZES = {
  /** 36pt, in a list's rows: the picker, the statistics, the next workout's exercises. */
  list: 'size-9 p-0.5',
  /** 44pt, at the start of a workout's row and an exercise's card. */
  row: 'size-11 p-1',
  /** 48pt, for a template or a planned workout. */
  plan: 'size-12 p-1',
  /** 56pt, by the workout's title. */
  header: 'size-14 p-1.5',
  /** As wide as its cell, in the grid of pictures to choose from. */
  grid: 'aspect-square w-full p-1',
  /** Large, to look at: in the exercise's sheet and on its page. */
  large: 'mx-auto aspect-square w-full max-w-44 p-3',
} as const

export type PictureSize = keyof typeof SIZES

export function Picture({
  slug,
  size,
  alt = '',
  lazy = false,
  className = '',
  testId,
  imageTestId,
}: {
  /** The picture's folder; an empty tile when undefined. */
  slug: string | undefined
  size: PictureSize
  /** Its name, where the picture says something of its own; empty where a text beside it does. */
  alt?: string
  lazy?: boolean
  className?: string
  testId?: string
  imageTestId?: string
}) {
  // The small tiles' corners: 26pt rounded lists less a row's 12pt inset, so in the first and last
  // row they run parallel to the list's own, as iOS 26 nests shapes. A large one stands alone, as a card.
  const radius = size === 'large' ? 'rounded-[1.625rem]' : 'rounded-[0.875rem]'
  return (
    <span
      className={`block shrink-0 overflow-hidden bg-fill ${radius} ${SIZES[size]} ${className}`}
      aria-hidden={alt === '' ? true : undefined}
      data-testid={testId}
    >
      {slug !== undefined && (
        <img
          src={picture(slug)}
          alt={alt}
          loading={lazy ? 'lazy' : undefined}
          className="illustration size-full object-contain"
          data-testid={imageTestId}
        />
      )}
    </span>
  )
}
