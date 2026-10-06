import { formatDate, t } from '../i18n/i18n'
import { BACKUP_VERSION, isImported, type ImportItem, type ImportKind, type ParsedBackup } from '../sync/backup'
import { ModalSheet } from '../ui/ModalSheet'
import { button, GROUP } from '../ui/styles'
import { localDate } from './backupText'
import { Row } from './ExportSheet'

/**
 * What an import would do, before it does it. It follows sync's rule and asks nothing: what the
 * app lacks is added, what is newer in the file is updated, and everything else is kept, also
 * what is newer here or was deleted here.
 */
export function ImportSheet({
  parsed,
  items,
  busy,
  onImport,
  onClose,
}: {
  parsed: ParsedBackup
  items: readonly ImportItem[]
  busy: boolean
  onImport: () => void
  onClose: () => void
}) {
  const count = (...kinds: ImportKind[]) => items.filter((i) => kinds.includes(i.kind)).length
  const imported = items.filter((i) => isImported(i.kind)).length
  const exported = parsed.exportedAt && t('Backup.ExportedOn', formatDate(localDate(parsed.exportedAt), 'd MMM yyyy'))

  return (
    <ModalSheet title={t('Backup.ImportTitle')} onClose={onClose} testId="import-sheet" fit>
      <ul className={GROUP} data-testid="import-summary">
        <Row label={t('Backup.Added')} value={count('new')} />
        <Row label={t('Backup.Updated')} value={count('newerInFile')} />
        <Row label={t('Backup.Kept')} value={count('same', 'newerHere', 'deletedHere')} />
      </ul>
      <p className="px-4 pt-1.5 text-[0.8125rem] text-label-2">
        {[exported, parsed.version < BACKUP_VERSION && t('Backup.OlderVersion'), t('Backup.KeptHelp')]
          .filter(Boolean)
          .join(' ')}
      </p>
      <button
        type="button"
        className={`${button('filled', 'large')} mt-5 w-full`}
        disabled={busy || imported === 0}
        onClick={onImport}
        data-testid="confirm-import"
      >
        {busy
          ? t('Backup.Importing')
          : imported === 0
            ? t('Backup.NothingToImport')
            : t('Backup.ImportCount', imported)}
      </button>
    </ModalSheet>
  )
}
