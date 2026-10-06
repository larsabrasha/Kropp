import { t } from '../i18n/i18n'
import type { Backup } from '../sync/backup'
import type { Workout } from '../training/model'
import { ModalSheet } from '../ui/ModalSheet'
import { button, GROUP } from '../ui/styles'
import { dateRange } from './backupText'

/** What an export holds, before it is handed on: how many of each, and the file's name. */
export function ExportSheet({
  backup,
  fileName,
  pendingCount,
  busy,
  onExport,
  onClose,
}: {
  backup: Backup
  fileName: string
  /** Changes not yet synced, which the file holds all the same. */
  pendingCount: number
  busy: boolean
  onExport: () => void
  onClose: () => void
}) {
  const count = (type: string) => backup.records.filter((r) => r.type === type).length
  const dates = backup.records.filter((r) => r.type === 'workout').map((r) => (r.data as Workout).date)
  const range = dateRange(dates)
  const trashed = count('trashedWorkout')

  return (
    <ModalSheet title={t('Backup.ExportTitle')} onClose={onClose} testId="export-sheet" fit>
      <ul className={GROUP} data-testid="export-summary">
        <Row label={t('Backup.Workouts')} value={count('workout')} detail={range} />
        <Row label={t('Backup.Exercises')} value={count('exercise')} />
        <Row label={t('Backup.Templates')} value={count('template')} />
        {trashed > 0 && <Row label={t('Backup.TrashedCount')} value={trashed} />}
      </ul>
      <p className="px-4 pt-1.5 text-[0.8125rem] text-label-2">
        {t('Backup.FileName', fileName)}
        {pendingCount > 0 && ` ${t('Backup.PendingIncluded', pendingCount)}`}
      </p>
      <button
        type="button"
        className={`${button('filled', 'large')} mt-5 w-full`}
        disabled={busy}
        onClick={onExport}
        data-testid="confirm-export"
      >
        {busy ? t('Backup.Exporting') : t('Backup.ExportAction')}
      </button>
    </ModalSheet>
  )
}

/** A row of a summary: what, and how many, with a line under it when there is more to tell. */
export function Row({ label, value, detail }: { label: string; value: number | string; detail?: string }) {
  return (
    <li className="flex min-h-[3.25rem] items-center gap-3 px-4 py-2.5">
      <span className="min-w-0 flex-1">
        <span className="block text-[1.0625rem]">{label}</span>
        {detail !== undefined && <span className="block text-[0.8125rem] text-label-2">{detail}</span>}
      </span>
      <span className="text-[1.0625rem] text-label-2 tabular-nums">{value}</span>
    </li>
  )
}
