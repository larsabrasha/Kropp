import { useState } from 'react'
import { formatDate, t } from '../i18n/i18n'
import {
  BACKUP_VERSION,
  defaultChoice,
  isConflict,
  restoresOf,
  type Choice,
  type ImportItem,
  type ImportKind,
  type ParsedBackup,
} from '../sync/backup'
import { keyOf } from '../sync/localStore'
import type { ExerciseMap } from '../training/categories'
import { ModalSheet } from '../ui/ModalSheet'
import { Segmented } from '../ui/Segmented'
import { button, GROUP } from '../ui/styles'
import { describe, localDate } from './backupText'
import { Row } from './ExportSheet'

const KIND_TEXT = {
  newerInFile: 'Backup.NewerInFile',
  newerHere: 'Backup.NewerHere',
  deletedHere: 'Backup.DeletedHere',
} as const

type AllChoice = 'newest' | Choice | 'mixed'

/**
 * What an import would do, before it does it: what is new, what is here already, and every
 * conflict, where the device holds another version than the file. Each conflict keeps the newer
 * copy unless the user chooses; a choice for all sets each, and each can then be changed.
 */
export function ImportSheet({
  parsed,
  items,
  exercises,
  busy,
  onImport,
  onClose,
}: {
  parsed: ParsedBackup
  items: readonly ImportItem[]
  exercises: ExerciseMap
  busy: boolean
  onImport: (choices: ReadonlyMap<string, Choice>) => void
  onClose: () => void
}) {
  const conflicts = items.filter((i) => isConflict(i.kind))
  const keyOfItem = (i: ImportItem) => keyOf(i.change.type, i.change.id)
  const [choices, setChoices] = useState<ReadonlyMap<string, Choice>>(
    () => new Map(conflicts.map((i) => [keyOfItem(i), defaultChoice(i.kind)])),
  )
  const count = (kind: (k: ImportKind) => boolean) => items.filter((i) => kind(i.kind)).length
  const toStore = restoresOf(items, choices).length

  const all: AllChoice = conflicts.every((i) => choices.get(keyOfItem(i)) === defaultChoice(i.kind))
    ? 'newest'
    : conflicts.every((i) => choices.get(keyOfItem(i)) === 'here')
      ? 'here'
      : conflicts.every((i) => choices.get(keyOfItem(i)) === 'file')
        ? 'file'
        : 'mixed'
  const chooseAll = (choice: AllChoice) =>
    setChoices(
      new Map(
        conflicts.map((i) => [
          keyOfItem(i),
          choice === 'newest' || choice === 'mixed' ? defaultChoice(i.kind) : choice,
        ]),
      ),
    )

  return (
    <ModalSheet title={t('Backup.ImportTitle')} onClose={onClose} testId="import-sheet">
      <ul className={GROUP} data-testid="import-summary">
        <Row label={t('Backup.New')} value={count((k) => k === 'new')} />
        <Row label={t('Backup.Same')} value={count((k) => k === 'same')} />
        <Row label={t('Backup.Conflicts')} value={conflicts.length} />
      </ul>
      <p className="px-4 pt-1.5 text-[0.8125rem] text-label-2">
        {parsed.exportedAt !== undefined &&
          t('Backup.ExportedOn', formatDate(localDate(parsed.exportedAt), 'd MMM yyyy'))}
        {parsed.version < BACKUP_VERSION && ` ${t('Backup.OlderVersion')}`}
      </p>

      {conflicts.length > 0 && (
        <section className="mt-section">
          <h2 className="px-4 pb-2 text-[1.0625rem] font-semibold text-label-2">{t('Backup.Conflicts')}</h2>
          <Segmented<AllChoice>
            label={t('Backup.KeepAll')}
            value={all}
            onChange={chooseAll}
            options={[
              { value: 'newest', label: t('Backup.Newest') },
              { value: 'here', label: t('Backup.Here') },
              { value: 'file', label: t('Backup.File') },
            ]}
            testId="choose-all"
            className="mb-3"
          />
          <ul className={GROUP} data-testid="conflicts">
            {conflicts.map((item) => {
              const key = keyOfItem(item)
              const kind = item.kind as keyof typeof KIND_TEXT
              return (
                <li key={key} className="flex min-h-[3.25rem] items-center gap-3 px-4 py-2.5" data-testid="conflict">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[1.0625rem]">{describe(item.change, exercises)}</span>
                    <span className="block text-[0.8125rem] text-label-2">{t(KIND_TEXT[kind])}</span>
                  </span>
                  <Segmented<Choice>
                    label={t('Backup.Keep')}
                    value={choices.get(key) ?? defaultChoice(item.kind)}
                    onChange={(choice) => setChoices(new Map(choices).set(key, choice))}
                    options={[
                      { value: 'here', label: t('Backup.Here') },
                      { value: 'file', label: t('Backup.File') },
                    ]}
                    className="w-36 shrink-0"
                  />
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <button
        type="button"
        className={`${button('filled', 'large')} mt-5 w-full`}
        disabled={busy || toStore === 0}
        onClick={() => onImport(choices)}
        data-testid="confirm-import"
      >
        {busy ? t('Backup.Importing') : toStore === 0 ? t('Backup.NothingToImport') : t('Backup.ImportCount', toStore)}
      </button>
    </ModalSheet>
  )
}
