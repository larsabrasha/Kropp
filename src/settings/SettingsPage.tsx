import { useState } from 'react'
import { t } from '../i18n/i18n'
import { useRepository } from '../services'
import type { LocalRepository } from '../sync/localRepo'
import {
  DEFAULT_SETTINGS,
  MAX_SESSIONS_PER_WEEK,
  MIN_SESSIONS_PER_WEEK,
  SETTINGS_ID,
  daysBetweenSessions,
  type UserSettings,
} from '../training/model'
import { BackLink } from '../ui/Layout'
import { Group } from '../ui/List'
import { Stepper } from '../ui/Stepper'
import { SyncRow } from '../ui/SyncRow'

/** The settings, from the repository's memory, or the defaults and a message when they could not be read. */
function read(repository: LocalRepository): { settings: UserSettings; error: string | null } {
  try {
    return { settings: repository.peek('settings', SETTINGS_ID) ?? DEFAULT_SETTINGS, error: null }
  } catch (e) {
    console.error('Could not read settings', e)
    return { settings: DEFAULT_SETTINGS, error: t('Home.LoadFailed') }
  }
}

export function SettingsPage() {
  const repository = useRepository()
  // Read during the first render, so the page never shows without its data.
  const [initial] = useState(() => read(repository))
  const [settings, setSettings] = useState<UserSettings>(initial.settings)
  const [error, setError] = useState<string | null>(initial.error)

  const save = async (next: UserSettings) => {
    const previous = settings
    setSettings(next)
    setError(null)
    try {
      await repository.save('settings', SETTINGS_ID, next)
    } catch (e) {
      console.error('Could not save settings', e)
      setSettings(previous)
      setError(t('Home.SaveFailed'))
    }
  }

  const days = daysBetweenSessions(settings)

  return (
    <>
      <BackLink href="/" />
      <h1 className="large-title">{t('Settings.Heading')}</h1>

      <>
        <Group
          className="mt-5"
          header={t('Settings.Planning')}
          footer={
            <span data-testid="settings-effect">
              {days === 1 ? t('Settings.EffectOneDay') : t('Settings.Effect', days)}
            </span>
          }
        >
          <li>
            <Stepper
              row
              label={t('Settings.SessionsPerWeek')}
              value={settings.sessionsPerWeek}
              min={MIN_SESSIONS_PER_WEEK}
              max={MAX_SESSIONS_PER_WEEK}
              onChange={(v) =>
                void save({
                  ...settings,
                  sessionsPerWeek: Math.trunc(
                    Math.min(
                      Math.max(v ?? DEFAULT_SETTINGS.sessionsPerWeek, MIN_SESSIONS_PER_WEEK),
                      MAX_SESSIONS_PER_WEEK,
                    ),
                  ),
                })
              }
            />
          </li>
        </Group>
        {error !== null && (
          <p className="mt-3 px-4 text-[0.9375rem] text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        )}

        <Group className="mt-section" header={t('Settings.Sync')}>
          <SyncRow />
        </Group>
      </>
    </>
  )
}
