import { registerSW } from 'virtual:pwa-register'

/**
 * Registers the service worker (production build only), so the app starts without a network and
 * can be added to the home screen. A new version takes over at once: everything is saved locally
 * as it is typed, so a reload loses nothing.
 */
export function startPwa() {
  registerSW({ immediate: true })
  void removeOldCaches()
}

/**
 * The .NET version's service worker kept its files in offline-cache-<version>. Nothing reads them
 * since this version took over, so they only take up room on the phone.
 */
async function removeOldCaches() {
  try {
    const names = await caches.keys()
    await Promise.all(names.filter((n) => n.startsWith('offline-cache-')).map((n) => caches.delete(n)))
  } catch {
    // No CacheStorage (an insecure origin): nothing to remove.
  }
}
