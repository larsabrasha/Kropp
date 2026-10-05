import type { ReactNode } from 'react'
import { t } from '../i18n/i18n'
import { Link } from '../route'
import { SyncStatusBar } from './SyncStatusBar'

const ICON_LINK =
  'rounded-md p-1.5 text-gray-600 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-gray-400 dark:hover:bg-gray-800'

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-gray-100 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/90 pt-[env(safe-area-inset-top)] backdrop-blur dark:border-gray-800 dark:bg-gray-950/90">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-3">
          {/* The logo and name always lead home, from any page. */}
          <Link
            href="/"
            className="-ml-1 flex items-center gap-2 rounded-lg px-1 py-0.5 focus-visible:outline-2 focus-visible:outline-blue-500"
            data-testid="home-link"
          >
            <svg className="size-8 shrink-0" viewBox="0 0 32 32" aria-hidden="true">
              <rect width="32" height="32" rx="8" className="fill-accent-600" />
              <g stroke="#fff" strokeWidth="2.6" strokeLinecap="round">
                <path d="M10.5 10v12M21.5 10v12M7 13v6M25 13v6M10.5 16h11" />
              </g>
            </svg>
            <span className="text-lg font-semibold">{t('App.Title')}</span>
          </Link>
          <div className="flex items-center gap-1">
            <SyncStatusBar />
            <Link
              href="/calendar"
              aria-label={t('Calendar.Heading')}
              title={t('Calendar.Heading')}
              data-testid="calendar-link"
              className={ICON_LINK}
            >
              <svg
                className="size-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="5" width="18" height="16" rx="2" />
                <path d="M3 10h18M8 3v4M16 3v4" />
              </svg>
            </Link>
            <Link
              href="/settings"
              aria-label={t('Settings.Heading')}
              title={t('Settings.Heading')}
              data-testid="settings-link"
              className={ICON_LINK}
            >
              <svg
                className="size-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
              </svg>
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 pt-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">{children}</main>
    </div>
  )
}

/** The link back at the top of a page, "Tillbaka" unless label says otherwise. */
export function BackLink({ href, label, testId }: { href: string; label?: string; testId?: string }) {
  return (
    <Link
      href={href}
      data-testid={testId}
      className="mb-1 inline-flex items-center gap-1 rounded-lg py-2 pr-2 text-sm text-blue-700 hover:underline dark:text-blue-300"
    >
      <svg
        className="size-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="M15 18l-6-6 6-6" />
      </svg>
      {label ?? t('Workout.Back')}
    </Link>
  )
}
