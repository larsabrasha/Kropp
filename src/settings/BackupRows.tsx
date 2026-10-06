import { useRef, useState } from 'react'
import { t } from '../i18n/i18n'
import { useServices } from '../services'
import {
  BackupError,
  createBackup,
  parseBackup,
  importedChanges,
  planImport,
  type Backup,
  type ImportItem,
  type ParsedBackup,
} from '../sync/backup'
import { today } from '../training/dates'
import { Group } from '../ui/List'
import { ROW } from '../ui/styles'
import { ExportSheet } from './ExportSheet'
import { DeleteAllSheet, type DeleteCounts } from './DeleteAllSheet'
import { ImportSheet } from './ImportSheet'

// Export and import of everything on the device, as one JSON file. Each shows first what it would
// do, in a sheet. Export then hands the file to the share sheet, where iOS offers Save to Files.

type Message = { text: string; isError: boolean }

const PROBLEMS = {
  NotABackup: 'Backup.NotABackup',
  NewerVersion: 'Backup.NewerVersion',
  Invalid: 'Backup.Invalid',
} as const

const ROW_BUTTON = `${ROW} w-full text-left text-[1.0625rem] text-tint disabled:opacity-50`

export function BackupRows() {
  const { repository, coordinator } = useServices()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'export' | 'import' | 'delete' | null>(null)
  const [exporting, setExporting] = useState<{ backup: Backup; fileName: string; pendingCount: number } | null>(null)
  const [importing, setImporting] = useState<{ parsed: ParsedBackup; items: ImportItem[] } | null>(null)
  const [message, setMessage] = useState<Message | null>(null)
  const [deleting, setDeleting] = useState<DeleteCounts | null>(null)

  const previewExport = async () => {
    setBusy('export')
    setMessage(null)
    try {
      const backup = await createBackup(repository.store)
      const pendingCount = (await repository.store.getPending()).filter((r) => !r.isDeleted).length
      setExporting({ backup, fileName: `kropp-${today()}.json`, pendingCount })
    } catch (e) {
      console.error('Could not export', e)
      setMessage({ text: t('Backup.ExportFailed'), isError: true })
    } finally {
      setBusy(null)
    }
  }

  // Built before the tap, so the share sheet opens within it, as Safari demands.
  const exportFile = async () => {
    if (!exporting) return
    setBusy('export')
    try {
      const file = new File([JSON.stringify(exporting.backup, null, 2)], exporting.fileName, {
        type: 'application/json',
      })
      if (await share(file)) {
        setExporting(null)
        setMessage({ text: t('Backup.Exported'), isError: false })
      }
    } catch (e) {
      console.error('Could not export', e)
      setExporting(null)
      setMessage({ text: t('Backup.ExportFailed'), isError: true })
    } finally {
      setBusy(null)
    }
  }

  const choose = async (file: File | undefined) => {
    if (input.current) input.current.value = ''
    if (!file) return
    setMessage(null)
    let parsed: ParsedBackup
    try {
      parsed = parseBackup(await file.text())
    } catch (e) {
      console.warn('Could not read the backup', e)
      const key = e instanceof BackupError ? PROBLEMS[e.problem] : 'Backup.ReadFailed'
      setMessage({ text: t(key), isError: true })
      return
    }
    setBusy('import')
    try {
      // Compared with what the server has too, where it can be reached, so the summary tells it as it is.
      await coordinator?.syncNow()
      setImporting({ parsed, items: await planImport(repository.store, parsed) })
    } catch (e) {
      console.error('Could not compare the backup', e)
      setMessage({ text: t('Home.LoadFailed'), isError: true })
    } finally {
      setBusy(null)
    }
  }

  const askToDelete = () => {
    setMessage(null)
    try {
      setDeleting({
        workouts: repository.peekAll('workout').length,
        exercises: repository.peekAll('exercise').length,
        templates: repository.peekAll('template').length,
        trashed: repository.peekAll('trashedWorkout').length,
      })
    } catch (e) {
      console.error('Could not count the data', e)
      setMessage({ text: t('Home.LoadFailed'), isError: true })
    }
  }

  const deleteAll = async () => {
    setBusy('delete')
    try {
      await repository.deleteAll()
      setMessage({ text: t('Backup.Deleted'), isError: false })
    } catch (e) {
      console.error('Could not delete all data', e)
      setMessage({ text: t('Home.SaveFailed'), isError: true })
    } finally {
      setBusy(null)
      setDeleting(null)
    }
  }

  const importData = async () => {
    if (!importing) return
    setBusy('import')
    try {
      const stored = await repository.restore(importedChanges(importing.items))
      setMessage({ text: t('Backup.Imported', stored), isError: false })
    } catch (e) {
      console.error('Could not import', e)
      setMessage({ text: t('Home.SaveFailed'), isError: true })
    } finally {
      setBusy(null)
      setImporting(null)
    }
  }

  return (
    <>
      <Group className="mt-section" header={t('Backup.Heading')} footer={t('Backup.Help')}>
        <li>
          <button
            type="button"
            className={ROW_BUTTON}
            disabled={busy !== null}
            onClick={() => void previewExport()}
            data-testid="export-data"
          >
            {busy === 'export' && !exporting ? t('Common.Loading') : t('Backup.Export')}
          </button>
        </li>
        <li>
          <button
            type="button"
            className={ROW_BUTTON}
            disabled={busy !== null}
            onClick={() => input.current?.click()}
            data-testid="import-data"
          >
            {busy === 'import' && !importing ? t('Common.Loading') : t('Backup.Import')}
          </button>
          <input
            ref={input}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => void choose(e.target.files?.[0])}
            data-testid="import-file"
          />
        </li>
      </Group>
      {/* Apart from the rest, as iOS keeps an action that cannot be undone. */}
      <Group className="mt-section">
        <li>
          <button
            type="button"
            className={`${ROW} w-full text-left text-[1.0625rem] text-red-600 disabled:opacity-50 dark:text-red-500`}
            disabled={busy !== null}
            onClick={askToDelete}
            data-testid="delete-all-data"
          >
            {t('Backup.DeleteAll')}
          </button>
        </li>
      </Group>
      {message !== null && (
        <p
          className={`mt-3 px-4 text-[0.9375rem] ${message.isError ? 'text-red-600 dark:text-red-400' : 'text-label-2'}`}
          role={message.isError ? 'alert' : 'status'}
          data-testid="backup-message"
        >
          {message.text}
        </p>
      )}
      {deleting && (
        <DeleteAllSheet
          counts={deleting}
          busy={busy === 'delete'}
          onExportFirst={() => {
            setDeleting(null)
            void previewExport()
          }}
          onDelete={() => void deleteAll()}
          onClose={() => setDeleting(null)}
        />
      )}
      {exporting && (
        <ExportSheet
          {...exporting}
          busy={busy === 'export'}
          onExport={() => void exportFile()}
          onClose={() => setExporting(null)}
        />
      )}
      {importing && (
        <ImportSheet
          parsed={importing.parsed}
          items={importing.items}
          busy={busy === 'import'}
          onImport={() => void importData()}
          onClose={() => setImporting(null)}
        />
      )}
    </>
  )
}

/**
 * Hands the file to the share sheet where there is one with files (iOS, Android, Safari on the
 * Mac), and downloads it elsewhere or when the browser refuses to share. @returns false when the
 * user closed the share sheet without choosing.
 */
async function share(file: File): Promise<boolean> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return true
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return false
      if (!(e instanceof DOMException && e.name === 'NotAllowedError')) throw e
    }
  }
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
  return true
}
