/* eslint-disable react-refresh/only-export-components -- the hooks belong beside their provider */
import { createContext, useContext, useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react'
import type { SyncCoordinator } from './sync/coordinator'
import type { SyncEngine, SyncStatus } from './sync/engine'
import type { LocalRepository } from './sync/localRepo'

/**
 * What the pages read and write through. Pages never call the API: they read and save locally,
 * and the coordinator syncs in the background. Tests provide the same with a store in memory.
 */
export interface Services {
  repository: LocalRepository
  engine: SyncEngine
  /** Undefined in tests, where nothing syncs on its own. */
  coordinator?: SyncCoordinator
}

const ServicesContext = createContext<Services | null>(null)

export function ServicesProvider({ services, children }: { services: Services; children: ReactNode }) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>
}

export function useServices(): Services {
  const services = useContext(ServicesContext)
  if (!services) throw new Error('useServices outside ServicesProvider')
  return services
}

export const useRepository = () => useServices().repository

/**
 * Keeps the repository's memory current with what a sync stores, as the app and the tests both
 * need. Returns the unsubscribe.
 */
export function followSync(repository: LocalRepository, engine: SyncEngine): () => void {
  return engine.onDataChange(() => {
    repository.refresh().catch((error: unknown) => console.error('Could not read what sync stored', error))
  })
}

/**
 * Calls listener after a sync stored data from the server and the repository has read it into
 * memory (followSync), so a page can show it.
 */
export function useRemoteChange(listener: () => void) {
  const { repository } = useServices()
  const latest = useRef(listener)
  useEffect(() => {
    latest.current = listener
  })
  useEffect(() => repository.onRemoteChange(() => latest.current()), [repository])
}

/** Calls listener after every local save, with the repository's memory already updated. */
export function useLocalChange(listener: () => void) {
  const { repository } = useServices()
  const latest = useRef(listener)
  useEffect(() => {
    latest.current = listener
  })
  useEffect(() => repository.onChange(() => latest.current()), [repository])
}

/** Calls listener after every local save, as well as after a sync stored data. */
export function useAnyChange(listener: () => void) {
  const { repository } = useServices()
  const latest = useRef(listener)
  useEffect(() => {
    latest.current = listener
  })
  useEffect(() => {
    const stopLocal = repository.onChange(() => latest.current())
    const stopRemote = repository.onRemoteChange(() => latest.current())
    return () => {
      stopLocal()
      stopRemote()
    }
  }, [repository])
}

export function useSyncStatus(): SyncStatus {
  const { engine } = useServices()
  return useSyncExternalStore(
    (listener) => engine.onStatusChange(listener),
    () => engine.status,
  )
}
