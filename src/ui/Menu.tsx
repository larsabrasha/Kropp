import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { GLASS_CIRCLE } from './Layout'

// A page's actions behind "⋯", as iOS 26 and 27 offer them: a glass button in the bar, and a menu
// that grows out of it, its items in groups, the destructive one red. A tap outside or Escape closes
// it; choosing an item closes it and then does the item.

export interface MenuItem {
  label: string
  /** A symbol before the item's text, as iOS 26 and 27 set it. */
  icon?: ReactNode
  onSelect: () => void
  destructive?: boolean
  disabled?: boolean
  testId?: string
}

export function MenuButton({ label, groups, testId }: { label: string; groups: MenuItem[][]; testId?: string }) {
  const [anchor, setAnchor] = useState<{ top: number; right: number }>()
  const button = useRef<HTMLButtonElement>(null)

  const open = () => {
    const box = button.current?.getBoundingClientRect()
    if (box) setAnchor({ top: box.bottom + 8, right: window.innerWidth - box.right })
  }
  const close = () => setAnchor(undefined)

  useEffect(() => {
    if (!anchor) return
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setAnchor(undefined)
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [anchor])

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={() => (anchor ? close() : open())}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={anchor !== undefined}
        data-testid={testId}
        className={GLASS_CIRCLE}
      >
        <svg className="size-[1.375rem]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5.5" cy="12" r="1.9" />
          <circle cx="12" cy="12" r="1.9" />
          <circle cx="18.5" cy="12" r="1.9" />
        </svg>
      </button>
      {anchor &&
        createPortal(
          <>
            <div className="fixed inset-0 z-50" onClick={close} aria-hidden="true" />
            <div
              role="menu"
              aria-label={label}
              style={{ top: anchor.top, right: anchor.right }}
              className="menu fixed z-50 w-64 origin-top-right overflow-hidden rounded-[1.625rem] py-1.5 motion-safe:animate-[menu-in_320ms_cubic-bezier(0.32,0.72,0,1)]"
            >
              {groups.map((group, g) => (
                <div key={g} className={g > 0 ? 'mt-1.5 border-t-[6px] border-black/5 pt-1.5 dark:border-white/5' : ''}>
                  {group.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      role="menuitem"
                      disabled={item.disabled}
                      onClick={() => {
                        close()
                        item.onSelect()
                      }}
                      data-testid={item.testId}
                      className={`flex min-h-11 w-full items-center gap-3 px-4 text-left text-[1.0625rem] active:bg-black/5 disabled:opacity-35 dark:active:bg-white/10 ${item.destructive ? 'text-red-600 dark:text-red-500' : ''}`}
                    >
                      {item.icon && (
                        <span className="flex size-5 shrink-0 items-center justify-center">{item.icon}</span>
                      )}
                      {item.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </>,
          document.body,
        )}
    </>
  )
}
