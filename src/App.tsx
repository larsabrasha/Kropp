import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { CalendarPage } from './calendar/CalendarPage'
import { ExercisePage } from './exercises/ExercisePage'
import { ExercisesPage } from './exercises/ExercisesPage'
import { HomePage } from './home/HomePage'
import { FixedLocation, match, navigate, setTransitions, useLocation, type Transition } from './route'
import { SettingsPage } from './settings/SettingsPage'
import { TemplatePage } from './templates/TemplatePage'
import { TemplatesPage } from './templates/TemplatesPage'
import { TrashPage } from './trash/TrashPage'
import { Layout, Sheet, StackInfo } from './ui/Layout'
import { WorkoutPage } from './workout/WorkoutPage'

// The pages as iOS stacks them. The workouts are the app's own stack: the list, and a workout
// pushed onto it. Calendar and settings open as sheets over it, each a stack of its own: settings
// with templates, exercises and the trash pushed inside, the calendar with the workouts opened
// from it. depth orders the pages of one stack, so a change of page knows to push or pop: a
// workout lies one above the list, or one above the calendar in its sheet.

interface Route {
  pattern: string
  page: (params: Record<string, string>) => ReactNode
  depth: number
  sheet: boolean | ((query: URLSearchParams) => boolean)
}

const fromCalendar = (query: URLSearchParams) => /^\/?calendar(\?|$)/.test(query.get('back') ?? '')

const routes: Route[] = [
  { pattern: '/', page: () => <HomePage />, depth: 0, sheet: false },
  { pattern: '/workouts/:id', page: ({ id }) => <WorkoutPage key={id} id={id!} />, depth: 1, sheet: fromCalendar },
  { pattern: '/calendar', page: () => <CalendarPage />, depth: 1, sheet: true },
  { pattern: '/settings', page: () => <SettingsPage />, depth: 1, sheet: true },
  { pattern: '/templates', page: () => <TemplatesPage />, depth: 2, sheet: true },
  { pattern: '/templates/:id', page: ({ id }) => <TemplatePage key={id} id={id!} />, depth: 3, sheet: true },
  { pattern: '/exercises', page: () => <ExercisesPage />, depth: 2, sheet: true },
  { pattern: '/exercises/:id', page: ({ id }) => <ExercisePage key={id} id={id!} />, depth: 3, sheet: true },
  { pattern: '/trash', page: () => <TrashPage />, depth: 2, sheet: true },
]

interface Found {
  url: string
  page: ReactNode
  depth: number
  sheet: boolean
}

function find(url: string): Found | undefined {
  const [path = '/', search = ''] = url.split('?')
  const query = new URLSearchParams(search)
  for (const route of routes) {
    const params = match(route.pattern, path)
    if (!params) continue
    const sheet = typeof route.sheet === 'function' ? route.sheet(query) : route.sheet
    const depth = sheet && route.pattern === '/workouts/:id' ? 2 : route.depth
    return { url, page: route.page(params), depth, sheet }
  }
  return undefined
}

const isSheetUrl = (href: string) => find(href)?.sheet === true

setTransitions((from, to): Transition | undefined => {
  const a = find(from)
  const b = find(to)
  if (!a || !b) return undefined
  if (!a.sheet && b.sheet) return 'sheet-open'
  if (a.sheet && !b.sheet) return 'sheet-close'
  if (b.depth === a.depth) return undefined
  if (b.depth > a.depth) return a.sheet ? 'sheet-push' : 'push'
  return a.sheet ? 'sheet-pop' : 'pop'
})

// The page below a sheet: the last page of the workouts' stack shown. Opened straight into a
// sheet, the page it leads back to when that is one of the workouts' stack, else the list.
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

  const sheet = found?.sheet ? found : undefined
  const closeHref = sheet ? belowFor(sheet, last) : '/'
  const base = sheet ? find(closeHref) : found
  const stack = useMemo(() => ({ inSheet: true, closeHref, isSheetUrl }), [closeHref])

  // The page below keeps its place in the tree whether a sheet covers it or not, so opening and
  // closing a sheet never loses what it was showing.
  return (
    <>
      <Layout under={sheet !== undefined}>{base && <FixedLocation url={base.url}>{base.page}</FixedLocation>}</Layout>
      {sheet && (
        <StackInfo value={stack}>
          <Sheet pageKey={path}>{sheet.page}</Sheet>
        </StackInfo>
      )}
    </>
  )
}
