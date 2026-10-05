import { formatTime, t } from '../i18n/i18n'
import { useServices, useSyncStatus } from '../services'
import { button } from './styles'

// Sync, out of the way in the settings: a cloud that tells the state, the state in words, and a
// button that syncs now. Sync runs on its own; this is only for a look, or a nudge.

const CLOUD = 'M7 18.5h10.5a4 4 0 0 0 .4-7.98A6 6 0 0 0 6.3 9.6 4.5 4.5 0 0 0 7 18.5z'
const ICONS = {
  synced: [CLOUD, 'M9.5 13.5l2 2 3.5-3.5'],
  pending: [CLOUD, 'M12 16v-4.5M10 13.5l2-2 2 2'],
  failed: [CLOUD, 'M12 11v2.5M12 16h.01'],
  offline: [
    'M7 18.5h10.5a4 4 0 0 0 2.2-.66M20.8 15.2a4 4 0 0 0-2.9-4.68A6 6 0 0 0 9.5 6.3M6.6 9.4A4.5 4.5 0 0 0 7 18.5',
    'M4 4l16 16',
  ],
  idle: [CLOUD],
  syncing: ['M20 12a8 8 0 1 1-2.34-5.66', 'M20 4.5v4h-4'],
}

export function SyncRow() {
  const { coordinator, engine } = useServices()
  const status = useSyncStatus()
  const syncing = status.state === 'Syncing'

  const state: keyof typeof ICONS =
    status.state === 'Offline'
      ? 'offline'
      : status.state === 'Failed'
        ? 'failed'
        : syncing
          ? 'syncing'
          : status.pendingCount > 0
            ? 'pending'
            : status.lastSyncedAt
              ? 'synced'
              : 'idle'

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

  const colour =
    state === 'failed'
      ? 'text-red-600 dark:text-red-400'
      : state === 'pending'
        ? 'text-amber-600 dark:text-amber-400'
        : ''

  return (
    <li className="flex min-h-[3.25rem] items-center gap-3 px-4 py-2.5">
      <svg
        className={`size-6 shrink-0 ${colour || 'text-label-2'} ${syncing ? 'animate-spin' : ''}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {ICONS[state].map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
      <span className="min-w-0 flex-1 text-[1.0625rem]" role="status" aria-live="polite" data-testid="sync-status">
        {text}
      </span>
      <button
        type="button"
        className={button('tinted', 'small')}
        disabled={syncing}
        onClick={() => void (coordinator ? coordinator.syncNow() : engine.sync())}
        data-testid="sync-now"
      >
        {t('Sync.SyncNow')}
      </button>
    </li>
  )
}
