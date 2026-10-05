import { useEffect, useState } from 'react'
import { t, type MessageKey } from '../i18n/i18n'
import { Link } from '../route'
import { useRepository } from '../services'
import {
  DEFAULT_SETTINGS,
  MAX_SESSIONS_PER_WEEK,
  MIN_SESSIONS_PER_WEEK,
  SETTINGS_ID,
  daysBetweenSessions,
  type UserSettings,
} from '../training/model'
import { BackLink } from '../ui/Layout'
import { Stepper } from '../ui/Stepper'

const CARD_LINK =
  'mt-3 flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800'

export function SettingsPage() {
  const repository = useRepository()
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    repository.get('settings', SETTINGS_ID).then(
      (stored) => {
        if (live) setSettings(stored ?? DEFAULT_SETTINGS)
      },
      (e) => {
        console.error('Could not read settings', e)
        if (!live) return
        setSettings(DEFAULT_SETTINGS)
        setError(t('Home.LoadFailed'))
      },
    )
    return () => {
      live = false
    }
  }, [repository])

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

  const days = settings && daysBetweenSessions(settings)

  return (
    <>
      <BackLink href="/" />
      <h1 className="text-xl font-semibold">{t('Settings.Heading')}</h1>

      {settings === null ? (
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">{t('Common.Loading')}</p>
      ) : (
        <>
          <section className="mt-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            <h2 className="mb-3 text-base font-semibold">{t('Settings.Planning')}</h2>
            <Stepper
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
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-300" data-testid="settings-effect">
              {days === 1 ? t('Settings.EffectOneDay') : t('Settings.Effect', days!)}
            </p>
            {error !== null && (
              <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">
                {error}
              </p>
            )}
          </section>

          <CardLink href="/templates" testId="templates-link" heading="Templates.Heading" help="Templates.Help" />
          <CardLink href="/exercises" testId="exercises-link" heading="Exercises.Heading" help="Exercises.Help" />
          <CardLink href="/trash" testId="trash-link" heading="Trash.Heading" help="Trash.Help" />
        </>
      )}
    </>
  )
}

function CardLink({
  href,
  testId,
  heading,
  help,
}: {
  href: string
  testId: string
  heading: MessageKey
  help: MessageKey
}) {
  return (
    <Link href={href} className={CARD_LINK} data-testid={testId}>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{t(heading)}</span>
        <span className="block text-sm text-gray-500 dark:text-gray-400">{t(help)}</span>
      </span>
      <svg
        className="size-5 shrink-0 text-gray-400"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="M9 6l6 6-6 6" />
      </svg>
    </Link>
  )
}
