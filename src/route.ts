import { createElement, useMemo, useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react'

// A small router of its own, as in bygg: the URL is the state, read with useLocation and changed
// with navigate or a Link. Paths are absolute ("/workouts/<id>").

const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

if (typeof window !== 'undefined') window.addEventListener('popstate', notify)

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const snapshot = () => window.location.pathname + window.location.search

export interface Location {
  path: string
  query: URLSearchParams
}

export function useLocation(): Location {
  const url = useSyncExternalStore(subscribe, snapshot)
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
  if (options.replace) window.history.replaceState(null, '', to)
  else {
    window.history.pushState(null, '', to)
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }
  notify()
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
