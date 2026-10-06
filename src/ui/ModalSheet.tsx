import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { t } from '../i18n/i18n'
import { CheckSymbol, CONFIRM_CIRCLE, GLASS_CIRCLE } from './Layout'
import { useSheetDrag } from './useSheetDrag'

// A sheet for a task inside a page, such as choosing an exercise to add: it rises over the page,
// which dims, and has a grabber, a title and a cross at the right. A row in it may lead further in
// (pushed): that page slides in from the right inside the same sheet, with a way back at the left
// of its bar, as iOS pushes inside a sheet rather than stacking one sheet on another. Pulled down, a tap outside it,
// the cross or Escape closes it, and it sinks away before onClose runs. Unlike the calendar's and
// the settings' sheets (Layout's Sheet) it has no URL of its own: it belongs to the page under it.

const CLOSE_MS = 280

// On an iPad or a computer, a small choice opened from a control shows as a popover beside it, as
// iPadOS presents one: glass, as wide as it needs, pointing at what opened it, with nothing dimmed.
const REGULAR_WIDTH = '(min-width: 768px)'
const POPOVER_WIDTH = 352

interface Place {
  left: number
  top?: number
  bottom?: number
  maxHeight: number
}

/** Below the anchor when there is room, else above it; never past the window's edges. */
function placeBy(anchor: HTMLElement): Place {
  const box = anchor.getBoundingClientRect()
  const left = Math.min(
    Math.max(box.left + box.width / 2 - POPOVER_WIDTH / 2, 12),
    window.innerWidth - POPOVER_WIDTH - 12,
  )
  const below = window.innerHeight - box.bottom - 20
  const above = box.top - 20
  return below >= 320 || below >= above
    ? { left, top: box.bottom + 8, maxHeight: below }
    : { left, bottom: window.innerHeight - box.top + 8, maxHeight: above }
}

export function ModalSheet({
  title,
  onClose,
  children,
  testId,
  closeTestId,
  fit = false,
  portal = true,
  dismissed = false,
  confirm = false,
  anchor,
  pushed,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  testId?: string
  /**
   * As tall as its content rather than the screen, floating 8pt off the sides and bottom with all
   * its corners round, as iOS 26 and 27 draw a sheet at its medium height.
   */
  fit?: boolean
  closeTestId?: string
  /**
   * Drawn into the page's body, over everything; false draws it where it is used, so it stays part
   * of what it edits (an exercise's card). Fixed either way, so it still covers the screen.
   */
  portal?: boolean
  /** Set when the task is done (a workout added): the sheet sinks away, then onClose runs. */
  dismissed?: boolean
  /**
   * The sheet changes something, saved as it is changed: it closes with Done, a checkmark in the
   * app's colour, as iOS 26 ends an edit, rather than a cross, which reads as leaving it undone.
   */
  confirm?: boolean
  /**
   * What opened it, for a small choice (a set, a month): on an iPad or a computer the sheet is
   * then a popover beside it. On a phone it is a sheet either way.
   */
  anchor?: HTMLElement | null
  /** A page pushed inside the sheet over children, with its own title; onBack leaves it. */
  pushed?: { title: string; content: ReactNode; onBack: () => void }
}) {
  const [closing, setClosing] = useState(false)
  // Which way the content last moved, to slide it in from that side: in from the right when a
  // page is pushed, back from the left when it is left. Nothing moves on the first render.
  const isPushed = pushed !== undefined
  const [moved, setMoved] = useState<{ pushed: boolean; way?: 'push' | 'pop' }>({ pushed: isPushed })
  if (moved.pushed !== isPushed) setMoved({ pushed: isPushed, way: isPushed ? 'push' : 'pop' })
  const sheet = useRef<HTMLDivElement>(null)
  const bar = useRef<HTMLElement>(null)
  const page = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)
  // Where it pops over; undefined for a sheet. Measured again whenever the window changes size, so
  // it turns from one into the other while open, and a popover follows what opened it.
  const placeNow = useCallback(
    () =>
      anchor?.isConnected && typeof matchMedia === 'function' && matchMedia(REGULAR_WIDTH).matches
        ? placeBy(anchor)
        : undefined,
    [anchor],
  )
  const [place, setPlace] = useState<Place | undefined>(placeNow)
  const placeRef = useRef(place)
  useEffect(() => {
    placeRef.current = place
  }, [place])
  useEffect(() => {
    const update = () => setPlace(placeNow())
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [placeNow])
  const canDrag = useCallback(() => placeRef.current === undefined, [])

  const close = useCallback(() => {
    if (dismissed) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return onClose()
    setClosing(true)
    setTimeout(onClose, CLOSE_MS)
  }, [onClose, dismissed])

  useSheetDrag(sheet, bar, page, close, canDrag)

  // Done from inside: sinks away as when closed; close above ignores a tap meanwhile.
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const sinking = closing || (dismissed && !reduced)
  useEffect(() => {
    if (!dismissed) return
    const timer = setTimeout(onClose, reduced ? 0 : CLOSE_MS)
    return () => clearTimeout(timer)
  }, [dismissed, onClose, reduced])

  // A pull on this sheet is this sheet's alone, also when it is drawn inside another that can be
  // pulled (an exercise opened in the settings' sheet).
  useEffect(() => {
    const el = root.current
    if (!el) return
    const stop = (e: Event) => e.stopPropagation()
    const events = ['touchstart', 'touchmove', 'touchend', 'pointerdown'] as const
    for (const name of events) el.addEventListener(name, stop)
    return () => {
      for (const name of events) el.removeEventListener(name, stop)
    }
  }, [])

  useEffect(() => {
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [close])

  const content = (
    <div ref={root} className="fixed inset-0 z-50">
      <div
        className={
          place
            ? 'absolute inset-0'
            : `absolute inset-0 bg-black/30 dark:bg-black/50 ${sinking ? 'motion-safe:animate-[fade-out_280ms_ease-in_forwards]' : 'motion-safe:animate-[fade-in_300ms_ease-out]'}`
        }
        onClick={close}
        aria-hidden="true"
      />
      <div
        ref={sheet}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid={testId}
        style={
          place
            ? {
                left: place.left,
                top: place.top,
                bottom: place.bottom,
                maxHeight: place.maxHeight,
                width: POPOVER_WIDTH,
              }
            : undefined
        }
        className={
          place
            ? `popover menu absolute flex flex-col overflow-hidden rounded-[1.625rem] text-gray-900 dark:text-white ${place.top !== undefined ? 'origin-top' : 'origin-bottom'} ${sinking ? 'motion-safe:animate-[fade-out_200ms_ease-in_forwards]' : 'motion-safe:animate-[menu-in_320ms_cubic-bezier(0.32,0.72,0,1)]'}`
            : `modal-sheet absolute flex flex-col overflow-hidden ${fit ? 'modal-sheet-fit inset-x-2 rounded-[2.375rem]' : 'inset-x-0 bottom-0 rounded-t-[2.375rem]'} bg-ground text-gray-900 shadow-[0_-4px_40px_rgb(0_0_0/0.2)] dark:text-white ${sinking ? 'motion-safe:animate-[sheet-down_280ms_cubic-bezier(0.32,0.72,0,1)_forwards]' : 'motion-safe:animate-[sheet-up_420ms_cubic-bezier(0.32,0.72,0,1)]'}`
        }
      >
        <header ref={bar} className={`relative shrink-0 touch-none ${place ? '' : 'pt-2'}`}>
          <div
            className={`sheet-grabber absolute ${place ? 'hidden' : ''} top-1.5 left-1/2 h-[0.3125rem] w-9 -translate-x-1/2 rounded-full bg-label-3`}
            aria-hidden="true"
          />
          <div className="mx-auto flex h-14 max-w-2xl items-center gap-3 px-4">
            {pushed ? (
              <button
                type="button"
                onClick={pushed.onBack}
                title={title}
                data-testid="sheet-back"
                className={GLASS_CIRCLE}
              >
                <svg
                  className="size-6"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M15 5l-7 7 7 7" />
                </svg>
                <span className="sr-only">{title}</span>
              </button>
            ) : (
              <span className="size-11 shrink-0" aria-hidden="true" />
            )}
            <h2 className="min-w-0 flex-1 truncate text-center text-[1.0625rem] font-semibold">
              {pushed ? pushed.title : title}
            </h2>
            <button
              type="button"
              onClick={close}
              title={confirm ? t('Common.Done') : t('Common.Close')}
              data-testid={closeTestId}
              className={confirm ? CONFIRM_CIRCLE : GLASS_CIRCLE}
            >
              {confirm ? (
                <CheckSymbol />
              ) : (
                <svg
                  className="size-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
                </svg>
              )}
              <span className="sr-only">{confirm ? t('Common.Done') : t('Common.Close')}</span>
            </button>
          </div>
        </header>
        <div ref={page} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div
            key={isPushed ? 'pushed' : 'first'}
            className={`mx-auto max-w-2xl pt-2 ${place ? 'px-4 pb-4' : fit ? 'px-5 pb-5' : 'px-5 pb-[calc(2rem+env(safe-area-inset-bottom))]'} ${
              moved.way === 'push'
                ? 'motion-safe:animate-[page-in-over_350ms_cubic-bezier(0.32,0.72,0,1)]'
                : moved.way === 'pop'
                  ? 'motion-safe:animate-[page-from-under_350ms_cubic-bezier(0.32,0.72,0,1)]'
                  : ''
            }`}
          >
            {pushed ? pushed.content : children}
          </div>
        </div>
      </div>
    </div>
  )
  return portal ? createPortal(content, document.body) : content
}
