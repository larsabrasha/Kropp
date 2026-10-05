import { NO_ILLUSTRATION, type Exercise } from '../training/model'
import { CATALOG, DEFAULTS } from './catalog'

/** The folder under public/exercises for an exercise's picture, or undefined for none. */
export function slugFor(exercise: Exercise | undefined): string | undefined {
  if (!exercise || exercise.illustration === NO_ILLUSTRATION) return undefined
  if (exercise.illustration !== undefined) return exercise.illustration in CATALOG ? exercise.illustration : undefined
  return DEFAULTS[exercise.name.trim().toLowerCase()]
}

/** The file shown for an illustration: its most legible frame. */
export const picture = (slug: string) => `/exercises/${slug}/frame-${CATALOG[slug]?.[1] ?? 1}.svg`

export const nameOf = (slug: string) => CATALOG[slug]?.[0] ?? slug

export const ALL_SLUGS = Object.keys(CATALOG)

/** Fetches files so the service worker caches them for offline use. Offline, a failure is simply ignored. */
export async function prefetch(urls: readonly string[]) {
  await Promise.allSettled(urls.map((u) => fetch(u).then((r) => (r.ok ? r.blob() : null))))
}
