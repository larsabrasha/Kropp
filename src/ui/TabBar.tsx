import type { MouseEvent } from 'react'
import { t } from '../i18n/i18n'
import { navigate } from '../route'
import { TAB_ROOTS, TABS, type Tab } from './tabs'

// The app's tabs, as iOS 26 and 27 draw a tab bar: a capsule of glass floating over the bottom of
// the page, an icon over a word for each tab, the chosen one in the tint on a lens of its own.
// Each tab is a stack of its own and keeps where it was: going to a tab shows its page as it was
// left, scrolled as it was; a tap on the tab already chosen goes back to its first page, and on
// that page scrolls to the top.

const ICONS: Record<Tab, string> = {
  training: 'M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11',
  calendar:
    'M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v10a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5zM4 10h16M8.5 3v4M15.5 3v4',
  stats: 'M4 20h16M7 16.5v-4M12 16.5V7.5M17 16.5v-7',
  // Books on a shelf, as the libraries of Music and Books draw theirs.
  library: 'M4.5 5v14M9 5v14M13.5 6.5l4.2 12.6M3 20h18',
}

const LABELS = {
  training: 'Home.Title',
  calendar: 'Calendar.Heading',
  stats: 'Stats.Heading',
  library: 'Library.Heading',
} as const

const label = (tab: Tab) => t(LABELS[tab])

export function TabBar({ current, last }: { current: Tab | undefined; last: Partial<Record<Tab, string>> }) {
  const go = (tab: Tab) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    const root = TAB_ROOTS[tab]
    if (tab !== current) return navigate(last[tab] ?? root, { restoreScroll: true })
    const here = window.location.pathname + window.location.search
    if (here !== root) navigate(root)
    else window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <nav
      aria-label={t('Tabs.Label')}
      className="tab-bar pointer-events-none fixed inset-x-0 z-20 flex justify-center px-5"
      data-testid="tab-bar"
    >
      <ul className="glass pointer-events-auto flex w-full max-w-sm items-center gap-1 rounded-full p-1">
        {TABS.map((tab) => {
          const chosen = tab === current
          return (
            <li key={tab} className="min-w-0 flex-1">
              <a
                href={chosen ? TAB_ROOTS[tab] : (last[tab] ?? TAB_ROOTS[tab])}
                onClick={go(tab)}
                aria-current={chosen ? 'page' : undefined}
                data-testid={`tab-${tab}`}
                className={`flex h-[3.375rem] flex-col items-center justify-center gap-0.5 rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500 ${
                  chosen ? 'bg-fill text-tint' : 'text-gray-900 active:bg-fill dark:text-white'
                }`}
              >
                <svg
                  className="size-6"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={chosen ? 2.2 : 1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d={ICONS[tab]} />
                </svg>
                <span className="truncate text-[0.625rem] leading-3 font-semibold">{label(tab)}</span>
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
