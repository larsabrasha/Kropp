import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { CalendarPage } from './calendar/CalendarPage'
import { ExercisePage } from './exercises/ExercisePage'
import { HomePage } from './home/HomePage'
import { FixedLocation, match, navigate, setTransitions, useLocation, type Transition } from './route'
import { SettingsPage } from './settings/SettingsPage'
import { ExerciseStatsPage } from './stats/ExerciseStatsPage'
import { StatsPage } from './stats/StatsPage'
import { TemplatePage } from './templates/TemplatePage'
import { TemplatesPage } from './templates/TemplatesPage'
import { TrashPage } from './trash/TrashPage'
import { Layout, Sheet, StackInfo } from './ui/Layout'
import { TabBar } from './ui/TabBar'
import type { Tab } from './ui/tabs'
import { WorkoutPage } from './workout/WorkoutPage'

// The pages as iOS stacks them. Three tabs at the bottom, each a stack of its own: the workouts,
// with a workout pushed onto the list; the calendar, with the workouts opened from it and the
// recently deleted; and the statistics, with an exercise's progress and the workouts opened from
// it. The profile, the templates and an exercise's details open as sheets over whichever tab is
// shown: tasks to finish and close, as iOS presents them. depth orders the pages of one stack, so a change of page knows to push or pop; a change
// of tab neither pushes nor pops.

interface Route {
  pattern: string
  page: (params: Record<string, string>) => ReactNode
  depth: number
  /** The tab whose stack the page is in; none for the pages of the settings' sheet. */
  tab?: Tab | ((query: URLSearchParams) => Tab)
}

/** A workout belongs to the tab it was opened from, which its way back names. */
const tabOfWorkout = (query: URLSearchParams): Tab => {
  const back = (query.get('back') ?? '').replace(/^\/+/, '')
  return back.startsWith('calendar') ? 'calendar' : back.startsWith('stats') ? 'stats' : 'training'
}

const routes: Route[] = [
  { pattern: '/', page: () => <HomePage />, depth: 0, tab: 'training' },
  { pattern: '/workouts/:id', page: ({ id }) => <WorkoutPage key={id} id={id!} />, depth: 1, tab: tabOfWorkout },
  { pattern: '/calendar', page: () => <CalendarPage />, depth: 0, tab: 'calendar' },
  { pattern: '/stats', page: () => <StatsPage />, depth: 0, tab: 'stats' },
  {
    pattern: '/stats/exercises/:id',
    page: ({ id }) => <ExerciseStatsPage key={id} id={id!} />,
    depth: 1,
    tab: 'stats',
  },
  { pattern: '/trash', page: () => <TrashPage />, depth: 1, tab: 'calendar' },
  { pattern: '/settings', page: () => <SettingsPage />, depth: 1 },
  { pattern: '/templates', page: () => <TemplatesPage />, depth: 1 },
  { pattern: '/templates/:id', page: ({ id }) => <TemplatePage key={id} id={id!} />, depth: 2 },
  { pattern: '/exercises/:id', page: ({ id }) => <ExercisePage key={id} id={id!} />, depth: 3 },
]

interface Found {
  url: string
  page: ReactNode
  depth: number
  /** Undefined for a page in the settings' sheet. */
  tab?: Tab
  sheet: boolean
}

function find(url: string): Found | undefined {
  const [path = '/', search = ''] = url.split('?')
  const query = new URLSearchParams(search)
  for (const route of routes) {
    const params = match(route.pattern, path)
    if (!params) continue
    const tab = typeof route.tab === 'function' ? route.tab(query) : route.tab
    // A workout lies one above the page it was opened from.
    const depth = route.pattern === '/workouts/:id' ? backDepth(query) + 1 : route.depth
    return { url, page: route.page(params), depth, tab, sheet: tab === undefined }
  }
  return undefined
}

/** The depth of the page a workout leads back to: a tab's first page, or an exercise's statistics. */
function backDepth(query: URLSearchParams): number {
  const back = `/${(query.get('back') ?? '').replace(/^\/+/, '')}`
  const [path = '/'] = back.split('?')
  return routes.find((r) => r.pattern !== '/workouts/:id' && r.tab && match(r.pattern, path))?.depth ?? 0
}

const isSheetUrl = (href: string) => find(href)?.sheet === true

setTransitions((from, to): Transition | undefined => {
  const a = find(from)
  const b = find(to)
  if (!a || !b) return undefined
  if (!a.sheet && b.sheet) return 'sheet-open'
  if (a.sheet && !b.sheet) return 'sheet-close'
  // Another tab is shown as it was, with no move.
  if (!a.sheet && a.tab !== b.tab) return undefined
  if (b.depth === a.depth) return undefined
  if (b.depth > a.depth) return a.sheet ? 'sheet-push' : 'push'
  return a.sheet ? 'sheet-pop' : 'pop'
})

// The page below a sheet: the last page of a tab shown. Opened straight into a sheet, the page it
// leads back to when that is a tab's, else the list of workouts.
function belowFor(sheet: Found, last: string | undefined): string {
  if (last !== undefined) return last
  const back = new URLSearchParams(sheet.url.split('?')[1] ?? '').get('back')
  const target = back && `/${back.replace(/^\/+/, '')}`
  return target && find(target)?.sheet === false ? target : '/'
}

/** The page for the current URL: in the layout, or in a sheet over the page below. */
export function App() {
  const { path, query } = useLocation()
  const url = query.size > 0 ? `${path}?${query}` : path
  const found = find(url)

  useEffect(() => {
    if (!found) navigate('/', { replace: true })
  }, [found])

  // The page heading takes focus on navigation, so a screen reader announces the new page.
  useEffect(() => {
    const heading = document.querySelector<HTMLElement>('.sheet h1') ?? document.querySelector<HTMLElement>('main h1')
    if (!heading) return
    heading.tabIndex = -1
    heading.focus({ preventScroll: true })
  }, [path])

  const [last, setLast] = useState<string>()
  if (found && !found.sheet && found.url !== last) setLast(found.url)
  // Where each tab was left, to show it as it was when it is chosen again.
  const [tabs, setTabs] = useState<Partial<Record<Tab, string>>>({})
  if (found?.tab && tabs[found.tab] !== found.url) setTabs({ ...tabs, [found.tab]: found.url })

  const sheet = found?.sheet ? found : undefined
  const closeHref = sheet ? belowFor(sheet, last) : '/'
  const base = sheet ? find(closeHref) : found
  const stack = useMemo(() => ({ inSheet: true, closeHref, isSheetUrl }), [closeHref])

  // The page below keeps its place in the tree whether a sheet covers it or not, so opening and
  // closing a sheet never loses what it was showing.
  return (
    <>
      <Layout
        under={sheet !== undefined}
        root={base !== undefined && base.depth === 0}
        tabBar={<TabBar current={base?.tab} last={tabs} />}
      >
        {base && <FixedLocation url={base.url}>{base.page}</FixedLocation>}
      </Layout>
      {sheet && (
        <StackInfo value={stack}>
          <Sheet pageKey={path}>{sheet.page}</Sheet>
        </StackInfo>
      )}
    </>
  )
}
