import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { t } from '../i18n/i18n'

/**
 * A question before something that cannot be undone, as iOS's action sheet asks it: at the bottom
 * of the screen, the question in small grey over the red action, and Cancel apart below them. A
 * tap outside or Escape cancels. The action is the sheet's first button.
 */
export function ActionSheet({
  message,
  action,
  busy = false,
  onAction,
  onCancel,
  actionTestId,
}: {
  message: string
  action: string
  busy?: boolean
  onAction: () => void
  onCancel: () => void
  actionTestId?: string
}) {
  useEffect(() => {
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [onCancel])

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/30 motion-safe:animate-[fade-in_250ms_ease-out] dark:bg-black/50"
        onClick={onCancel}
        aria-hidden="true"
      />
      <div
        role="alertdialog"
        aria-label={message}
        className="absolute inset-x-2 bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] mx-auto flex max-w-md flex-col gap-2 motion-safe:animate-[sheet-up_380ms_cubic-bezier(0.32,0.72,0,1)]"
      >
        <div className="action-sheet-group overflow-hidden rounded-[1.75rem]">
          <p className="px-4 py-3.5 text-center text-[0.8125rem] text-label-2">{message}</p>
          <button
            type="button"
            onClick={onAction}
            disabled={busy}
            data-testid={actionTestId}
            className="h-14 w-full border-t-[0.5px] border-separator text-[1.25rem] text-red-600 active:bg-cell-pressed disabled:opacity-50 dark:text-red-500"
          >
            {busy ? t('Common.Loading') : action}
          </button>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="action-sheet-group h-14 rounded-[1.75rem] text-[1.25rem] font-semibold text-tint active:bg-cell-pressed"
        >
          {t('Common.Cancel')}
        </button>
      </div>
    </div>,
    document.body,
  )
}
