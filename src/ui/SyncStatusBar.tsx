import { formatTime, t } from '../i18n/i18n'
import { useServices, useSyncStatus } from '../services'

export function SyncStatusBar() {
  const { coordinator, engine } = useServices()
  const status = useSyncStatus()
  const syncing = status.state === 'Syncing'

  const dot =
    status.state === 'Offline'
      ? 'bg-gray-400'
      : status.state === 'Failed'
        ? 'bg-red-500'
        : syncing
          ? 'bg-blue-500'
          : status.pendingCount > 0
            ? 'bg-amber-500'
            : 'bg-green-500'

  const main =
    status.state === 'Offline'
      ? t('Sync.Offline')
      : status.state === 'Failed'
        ? t('Sync.Failed')
        : syncing
          ? t('Sync.Syncing')
          : status.pendingCount > 0
            ? t('Sync.SavedLocally')
            : status.lastSyncedAt
              ? t('Sync.Synced', formatTime(status.lastSyncedAt))
              : t('Sync.NotSynced')
  const text = status.pendingCount > 0 ? `${main} · ${t('Sync.Pending', status.pendingCount)}` : main

  return (
    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400" role="status" aria-live="polite">
      <span className={`size-2 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
      <span data-testid="sync-status">{text}</span>
      <button
        type="button"
        className="rounded-md p-1.5 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-40 dark:hover:bg-gray-800"
        aria-label={t('Sync.SyncNow')}
        title={t('Sync.SyncNow')}
        disabled={syncing}
        onClick={() => void (coordinator ? coordinator.syncNow() : engine.sync())}
      >
        <svg
          className={`size-4 ${syncing ? 'animate-spin' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <path d="M21 3v6h-6" />
        </svg>
      </button>
    </div>
  )
}
