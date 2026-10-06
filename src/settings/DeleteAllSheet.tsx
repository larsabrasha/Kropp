import { useState } from 'react'
import { t } from '../i18n/i18n'
import { ActionSheet } from '../ui/ActionSheet'
import { ModalSheet } from '../ui/ModalSheet'
import { button, GROUP } from '../ui/styles'
import { Row } from './ExportSheet'

export interface DeleteCounts {
  workouts: number
  exercises: number
  templates: number
  trashed: number
}

/**
 * Deleting all data asks twice, as iOS asks before erasing a phone: this sheet first tells what
 * goes, that it goes everywhere and for good, and offers an export; its red button then asks once
 * more, at the bottom of the screen, before anything is deleted.
 */
export function DeleteAllSheet({
  counts,
  busy,
  onExportFirst,
  onDelete,
  onClose,
}: {
  counts: DeleteCounts
  busy: boolean
  onExportFirst: () => void
  onDelete: () => void
  onClose: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const total = counts.workouts + counts.exercises + counts.templates + counts.trashed

  return (
    <>
      <ModalSheet title={t('Backup.DeleteAll')} onClose={onClose} testId="delete-all-sheet" fit>
        <p className="px-4 pb-4 text-[1.0625rem]" data-testid="delete-all-warning">
          {t('Backup.DeleteAllWarning')}
        </p>
        <ul className={GROUP} data-testid="delete-all-summary">
          <Row label={t('Backup.Workouts')} value={counts.workouts} />
          <Row label={t('Backup.Exercises')} value={counts.exercises} />
          <Row label={t('Backup.Templates')} value={counts.templates} />
          {counts.trashed > 0 && <Row label={t('Backup.TrashedCount')} value={counts.trashed} />}
        </ul>
        <p className="px-4 pt-1.5 text-[0.8125rem] text-label-2">{t('Backup.DeleteAllKept')}</p>
        <button
          type="button"
          className={`${button('gray', 'large')} mt-5 w-full`}
          disabled={busy}
          onClick={onExportFirst}
          data-testid="export-first"
        >
          {t('Backup.ExportFirst')}
        </button>
        <button
          type="button"
          className={`${button('destructiveFilled', 'large')} mt-3 w-full`}
          disabled={busy || total === 0}
          onClick={() => setConfirming(true)}
          data-testid="delete-all"
        >
          {busy ? t('Backup.Deleting') : t('Backup.DeleteAll')}
        </button>
      </ModalSheet>
      {confirming && (
        <ActionSheet
          message={t('Backup.DeleteAllConfirm')}
          action={t('Backup.DeleteAllAction')}
          busy={busy}
          onAction={() => {
            setConfirming(false)
            onDelete()
          }}
          onCancel={() => setConfirming(false)}
          actionTestId="confirm-delete-all"
        />
      )}
    </>
  )
}
