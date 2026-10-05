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

/** Calls listener after a sync stored data from the server, so a page can reload what it shows. */
export function useRemoteChange(listener: () => void) {
  const { engine } = useServices()
  const latest = useRef(listener)
  useEffect(() => {
    latest.current = listener
  })
  useEffect(() => engine.onDataChange(() => latest.current()), [engine])
}

/** Calls listener after every local save, as well as after a sync stored data. */
export function useAnyChange(listener: () => void) {
  const { repository, engine } = useServices()
  const latest = useRef(listener)
  useEffect(() => {
    latest.current = listener
  })
  useEffect(() => {
    const stopLocal = repository.onChange(() => latest.current())
    const stopRemote = engine.onDataChange(() => latest.current())
    return () => {
      stopLocal()
      stopRemote()
    }
  }, [repository, engine])
}

export function useSyncStatus(): SyncStatus {
  const { engine } = useServices()
  return useSyncExternalStore(
    (listener) => engine.onStatusChange(listener),
    () => engine.status,
  )
}
