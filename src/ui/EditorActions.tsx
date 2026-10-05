import { CloseButton } from './CloseButton'

/**
 * The last row of an editor on a card: delete far left, close far right. Delete has symbol and
 * word both, so it is never taken for something else.
 */
export function EditorActions({
  onDone,
  onDelete,
  deleteLabel,
  deleteTestId,
}: {
  onDone: () => void
  onDelete?: () => void
  deleteLabel?: string
  deleteTestId?: string
}) {
  return (
    <div className="flex items-center gap-2">
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          data-testid={deleteTestId}
          className="flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-red-500 dark:text-red-400 dark:hover:bg-red-950"
        >
          <svg
            className="size-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3" />
          </svg>
          {deleteLabel}
        </button>
      )}
      <CloseButton onClick={onDone} testId="close-editor" className="ml-auto" />
    </div>
  )
}

export function DoneRow({ onDone, children }: { onDone: () => void; children?: React.ReactNode }) {
  return (
    <div className="mt-2 flex items-center justify-end gap-2">
      {children}
      <CloseButton onClick={onDone} />
    </div>
  )
}
