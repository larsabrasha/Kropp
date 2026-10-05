// The app's look, taken from iOS 26 and 27: capsule buttons, and the cards and rows of inset
// grouped lists (List.tsx).

type ButtonKind = 'filled' | 'tinted' | 'gray' | 'destructive' | 'destructiveFilled' | 'green'
type ButtonSize = 'small' | 'regular' | 'large'

const KINDS: Record<ButtonKind, string> = {
  filled: 'bg-accent-600 text-white',
  tinted: 'bg-tint/15 text-tint',
  gray: 'bg-fill text-gray-900 dark:text-white',
  destructive: 'bg-red-500/15 text-red-600 dark:text-red-400',
  destructiveFilled: 'bg-red-600 text-white',
  green: 'bg-green-600 text-white',
}

const SIZES: Record<ButtonSize, string> = {
  small: 'min-h-9 px-4 text-[0.9375rem]',
  regular: 'min-h-11 px-5 text-[1.0625rem]',
  large: 'min-h-[3.25rem] px-6 text-[1.0625rem]',
}

/**
 * A button as iOS draws one: a capsule, filled with the accent for the one main action, tinted or
 * grey for the others, red for deleting. It dims a little while pressed, and fades when disabled.
 */
export function button(kind: ButtonKind, size: ButtonSize = 'regular'): string {
  return `inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-semibold transition-[transform,opacity] duration-150 active:scale-[0.97] active:opacity-80 disabled:opacity-50 disabled:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${KINDS[kind]} ${SIZES[size]}`
}

/** A card in a list's shape, for content that is not a list of rows. */
export const CARD = 'rounded-[1.625rem] bg-cell'

/**
 * One row of a grouped list: 52pt at the least, as iOS 26 and 27's, and greyed while pressed. A row
 * with a picture is taller, by the picture.
 */
export const ROW =
  'flex min-h-[3.25rem] items-center gap-3 px-4 py-3 active:bg-cell-pressed focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500'

/**
 * A row that starts with a picture (THUMB). The picture sits the same 12pt from the row's edges on
 * every side, so in the list's first and last row its corners run parallel to the list's own:
 * 26pt − 12pt = 14pt, concentric, as iOS 26 shapes nest. Its separator starts 12pt past the picture.
 */
export const PICTURE_ROW =
  'flex items-center gap-3 p-3 active:bg-cell-pressed focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500'

/** The picture at the start of a PICTURE_ROW; give it a size. */
export const THUMB = 'shrink-0 overflow-hidden rounded-[0.875rem] bg-fill'
