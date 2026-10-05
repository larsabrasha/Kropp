import { t } from '../i18n/i18n'
import { button } from './styles'

/**
 * The way out of every editor and panel: the same filled capsule and size everywhere, a word
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
      className={`${button('filled', 'small')} ${className}`}
    >
      {t('Common.Close')}
    </button>
  )
}
