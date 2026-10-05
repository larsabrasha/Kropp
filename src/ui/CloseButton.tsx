import { t } from '../i18n/i18n'

/**
 * The way out of every editor and panel: the same filled button and size everywhere, a word
 * without an icon, so it is never taken for marking something done. className is for placement only.
 */
export function CloseButton({
  onClick,
  testId,
  className = '',
}: {
  onClick: () => void
  testId?: string
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${className}`}
    >
      {t('Common.Close')}
    </button>
  )
}
