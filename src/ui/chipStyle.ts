/**
 * One look for every choice chip: template choices and categories alike, capsules as on iOS.
 * Chosen is filled with the accent and white text; not chosen is a grey fill that shows on white
 * and on a tinted card alike. Neither has a border, so choosing never changes a chip's size.
 */
export function chipStyle(on: boolean): string {
  return (
    'inline-flex min-h-10 shrink-0 items-center rounded-full px-4 text-[0.9375rem] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed ' +
    (on ? 'bg-accent-600 text-white' : 'bg-fill text-gray-900 active:opacity-70 dark:text-white')
  )
}
