// The app's tabs (TabBar.tsx), and the first page of each.

export const TABS = ['training', 'calendar', 'stats', 'library'] as const
export type Tab = (typeof TABS)[number]

export const TAB_ROOTS: Record<Tab, string> = {
  training: '/',
  calendar: '/calendar',
  stats: '/stats',
  library: '/library',
}
