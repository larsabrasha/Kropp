// The app's tabs (TabBar.tsx), and the first page of each.

export const TABS = ['training', 'calendar', 'stats', 'library'] as const
export type Tab = (typeof TABS)[number]

/**
 * The calendar and the templates belong to their own tabs, but opened from the training tab's
 * first page (its week, its templates) they are pushed onto its stack instead, as iOS pushes a
 * row's page in the tab it is tapped in: their address then says so, and so do those of the pages
 * opened from them.
 */
export const FROM_TRAINING = 'from=training'
export const isFromTraining = (query: URLSearchParams) => query.get('from') === 'training'
/** The query to add to an address so that it stays in the training tab's stack, or ''. */
export const fromTrainingQuery = (query: URLSearchParams) => (isFromTraining(query) ? FROM_TRAINING : '')

export const TAB_ROOTS: Record<Tab, string> = {
  training: '/',
  calendar: '/calendar',
  stats: '/stats',
  library: '/library',
}
