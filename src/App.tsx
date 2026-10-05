import { useEffect, type ReactNode } from 'react'
import { CalendarPage } from './calendar/CalendarPage'
import { ExercisePage } from './exercises/ExercisePage'
import { ExercisesPage } from './exercises/ExercisesPage'
import { HomePage } from './home/HomePage'
import { match, navigate, useLocation } from './route'
import { SettingsPage } from './settings/SettingsPage'
import { TemplatePage } from './templates/TemplatePage'
import { TemplatesPage } from './templates/TemplatesPage'
import { TrashPage } from './trash/TrashPage'
import { Layout } from './ui/Layout'
import { WorkoutPage } from './workout/WorkoutPage'

const routes: [string, (params: Record<string, string>) => ReactNode][] = [
  ['/', () => <HomePage />],
  ['/calendar', () => <CalendarPage />],
  ['/workouts/:id', ({ id }) => <WorkoutPage key={id} id={id!} />],
  ['/templates', () => <TemplatesPage />],
  ['/templates/:id', ({ id }) => <TemplatePage key={id} id={id!} />],
  ['/exercises', () => <ExercisesPage />],
  ['/exercises/:id', ({ id }) => <ExercisePage key={id} id={id!} />],
  ['/trash', () => <TrashPage />],
  ['/settings', () => <SettingsPage />],
]

/** The page for the current URL, inside the layout. */
export function App() {
  const { path } = useLocation()
  const found = routes.map(([pattern, page]) => [match(pattern, path), page] as const).find(([params]) => params)

  useEffect(() => {
    if (!found) navigate('/', { replace: true })
  }, [found])

  // The page heading takes focus on navigation, so a screen reader announces the new page.
  useEffect(() => {
    const heading = document.querySelector<HTMLElement>('main h1')
    if (!heading) return
    heading.tabIndex = -1
    heading.focus({ preventScroll: true })
  }, [path])

  return <Layout>{found ? found[1](found[0]!) : null}</Layout>
}
