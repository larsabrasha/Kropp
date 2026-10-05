import {
  createContext,
  createElement,
  useContext,
  useMemo,
  useSyncExternalStore,
  type AnchorHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { flushSync } from 'react-dom'

// A small router of its own, as in bygg: the URL is the state, read with useLocation and changed
// with navigate or a Link. Paths are absolute ("/workouts/<id>").

const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

/**
 * How a change of page moves, as on iOS; index.css draws each. push slides the new page in from
 * the right over the old, pop slides the page away to the right and uncovers the one below.
 * sheet-open raises a sheet from the bottom over the page, which sinks back and dims; sheet-close
 * lowers it again. sheet-push and sheet-pop are push and pop inside a sheet.
 */
export type Transition = 'push' | 'pop' | 'sheet-open' | 'sheet-close' | 'sheet-push' | 'sheet-pop'

let transitionFor: (from: string, to: string) => Transition | undefined = () => undefined

/** Which changes of page animate; App decides, so the router knows nothing of its pages. */
export function setTransitions(rule: (from: string, to: string) => Transition | undefined) {
  transitionFor = rule
}

const here = () => window.location.pathname + window.location.search

// The URL of the page on screen: on popstate the URL has already changed when the event comes.
let shown: string | undefined
// Which transition owns data-transition; a newer one takes it over before the older one ends.
let running = 0

/**
 * Shows the page at to, whose URL is already in place. React renders it at once, inside a view
 * transition when the rule asks for one and the browser and the user allow it; scroll runs just
 * before, so the transition captures the old page where the user left it. A sheet scrolls on its
 * own and leaves the page below it where it was, so no change of page in or out of one scrolls.
 */
function show(from: string, to: string, toTop: () => void) {
  shown = to
  const transition = transitionFor(from, to)
  const scroll = transition?.startsWith('sheet') ? () => {} : toTop
  if (!transition || !document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {
    scroll()
    notify()
    return
  }
  const root = document.documentElement
  const id = ++running
  root.dataset.transition = transition
  const done = document.startViewTransition(() => {
    scroll()
    flushSync(notify)
  })
  // Skipped when another change of page comes first: the page has still changed, only not animated.
  done.ready.catch(() => {})
  void done.finished.finally(() => {
    if (running === id) delete root.dataset.transition
  })
}

if (typeof window !== 'undefined')
  window.addEventListener('popstate', (e) => {
    const to = here()
    // A swipe back in Safari has already animated the change; a second animation would repeat it.
    if (e.hasUAVisualTransition || shown === undefined) {
      shown = to
      notify()
    } else show(shown, to, () => {})
  })

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export interface Location {
  path: string
  query: URLSearchParams
}

const Fixed = createContext<string | undefined>(undefined)

/** Pages inside read url as their location instead of the window's: the page below a sheet. */
export function FixedLocation({ url, children }: { url: string; children: ReactNode }) {
  return createElement(Fixed.Provider, { value: url }, children)
}

export function useLocation(): Location {
  const fixed = useContext(Fixed)
  const current = useSyncExternalStore(subscribe, here)
  const url = fixed ?? current
  return useMemo(() => {
    const [path, search = ''] = url.split('?')
    return { path: path!, query: new URLSearchParams(search) }
  }, [url])
}

/**
 * Goes to a page of the app. replace swaps the current history entry, for a change that should
 * not be a step of its own on the way back (a filter, a month in the calendar).
 */
export function navigate(to: string, options: { replace?: boolean } = {}) {
  const from = here()
  // The page already there is no new step back: a second tap while a transition starts.
  const same = new URL(to, window.location.href).href === window.location.href
  if (options.replace || same) window.history.replaceState(null, '', to)
  else window.history.pushState(null, '', to)
  show(from, here(), () => {
    if (!options.replace) window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  })
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; replace?: boolean }

/** An <a> that changes page without reloading the app; a modified click still opens a new tab. */
export function Link({ href, replace, onClick, ...props }: LinkProps) {
  const click = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e)
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    navigate(href, { replace })
  }
  return createElement('a', { href, onClick: click, ...props })
}

/** The parameters of a pattern like "/workouts/:id", or null when path is not one of it. */
export function match(pattern: string, path: string): Record<string, string> | null {
  const want = pattern.split('/')
  const got = path.replace(/\/+$/, '').split('/')
  if (path === '/' && pattern === '/') return {}
  if (want.length !== got.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < want.length; i++) {
    const w = want[i]!
    const g = got[i]!
    if (w.startsWith(':')) params[w.slice(1)] = decodeURIComponent(g)
    else if (w !== g) return null
  }
  return params
}
