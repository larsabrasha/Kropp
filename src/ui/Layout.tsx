import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { t } from '../i18n/i18n'
import { Link, navigate, useLocation } from '../route'
import { useSheetDrag } from './useSheetDrag'

// The frame of every page, drawn as iOS 26 and 27 do: no bar across the top, only buttons of
// liquid glass floating over the page, which scrolls under them and fades out at the top edge.
// The page's own way back sits at the bar's left (BackLink), the app's buttons at its right.
// Calendar and settings open as a sheet over the page (Sheet), with a bar of their own: a way back
// at its left, the cross that closes it at its right.

interface Slots {
  leading: HTMLElement | null
  trailing: HTMLElement | null
}

/** Where a page's BackLink goes: the left of the bar above it, or the right for a sheet's cross. */
const BarSlots = createContext<Slots>({ leading: null, trailing: null })

export interface Stack {
  /** True inside a sheet. */
  inSheet: boolean
  /** Where closing the sheet leads: the page below it. */
  closeHref: string
  /** Whether a URL opens inside a sheet; a way back out of one closes the sheet. */
  isSheetUrl: (href: string) => boolean
}

const StackContext = createContext<Stack>({ inSheet: false, closeHref: '/', isSheetUrl: () => false })

/** Tells the pages inside where they are: in a sheet or not, and where closing it leads. */
export function StackInfo({ value, children }: { value: Stack; children: ReactNode }) {
  return <StackContext.Provider value={value}>{children}</StackContext.Provider>
}

/** A round button of glass in a bar: 44pt, as iOS's smallest tap target. */
export const GLASS_CIRCLE =
  'glass flex size-11 shrink-0 items-center justify-center rounded-full text-gray-900 transition-transform duration-200 active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:text-white'

/** A word on glass in a bar, such as the calendar's Today. */
export const GLASS_CAPSULE =
  'glass flex h-11 shrink-0 items-center rounded-full px-4 text-[1.0625rem] font-medium text-tint transition-transform duration-200 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500'

/** iOS 26's confirming button: round, in the app's colour, where the bar's other buttons are glass. */
export const CONFIRM_CIRCLE =
  'flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-600 text-white shadow-[0_1px_3px_rgb(0_0_0/0.12),0_8px_28px_rgb(0_0_0/0.14)] transition-transform duration-200 active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500'

/** The checkmark on CONFIRM_CIRCLE. */
export const CheckSymbol = () => (
  <svg
    className="size-[1.375rem]"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
)

/**
 * Done, as iOS 26 and 27 draw it in a bar: a round checkmark in the app's colour, where the bar's
 * other buttons are glass. Ends a mode, such as a list's edit mode.
 */
export function DoneButton({ onClick, testId }: { onClick: () => void; testId?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t('Common.Done')}
      title={t('Common.Done')}
      data-testid={testId}
      className={CONFIRM_CIRCLE}
    >
      <CheckSymbol />
    </button>
  )
}

const ICON_IN_GROUP =
  'flex size-11 items-center justify-center rounded-full text-gray-900 active:bg-black/10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500 dark:text-white dark:active:bg-white/15'

/**
 * The page's title once its large title has scrolled up under the bar, as iOS shows it then: small
 * and centred in the bar. scroller is what scrolls (the window, or a sheet's page); the title is
 * the first visible h1 in content, unless it asks to stay out of the bar (data-no-bar-title).
 */
function useInlineTitle(
  scroller: RefObject<HTMLElement | null> | 'window',
  content: RefObject<HTMLElement | null>,
  bar: RefObject<HTMLElement | null>,
) {
  const [title, setTitle] = useState<{ text: string; shown: boolean }>({ text: '', shown: false })
  // Looked for again on every page: the h1 and the scroller are new.
  const { path } = useLocation()
  useEffect(() => {
    const target = scroller === 'window' ? window : scroller.current
    if (!target) return
    const check = () => {
      const h1 = content.current?.querySelector<HTMLElement>('h1:not(.sr-only):not([data-no-bar-title])')
      const barBox = bar.current?.getBoundingClientRect()
      const under = !!h1 && !!barBox && h1.getBoundingClientRect().bottom <= barBox.bottom
      setTitle((t) => (under ? { text: h1.textContent, shown: true } : t.shown ? { ...t, shown: false } : t))
    }
    check()
    target.addEventListener('scroll', check, { passive: true })
    return () => target.removeEventListener('scroll', check)
  }, [scroller, content, bar, path])
  return title
}

function NavBar({
  className,
  leading,
  trailing,
  trailingSlot,
  title,
  ref,
  children,
}: {
  className: string
  leading: (el: HTMLElement | null) => void
  trailing?: ReactNode
  trailingSlot?: (el: HTMLElement | null) => void
  title: { text: string; shown: boolean }
  ref?: React.Ref<HTMLElement>
  children?: ReactNode
}) {
  return (
    <header className={className} ref={ref}>
      <div className="nav-edge" aria-hidden="true" />
      {children}
      <div className="relative mx-auto flex h-14 max-w-2xl items-center justify-between gap-3 px-4">
        <div
          className="pointer-events-none absolute inset-x-28 inset-y-0 flex items-center justify-center"
          aria-hidden="true"
        >
          <span
            className={`truncate text-[1.0625rem] font-semibold transition-opacity duration-200 ${title.shown ? 'opacity-100' : 'opacity-0'}`}
          >
            {title.text}
          </span>
        </div>
        <div ref={leading} className="flex min-w-0 items-center" />
        {trailing}
        {trailingSlot && <div ref={trailingSlot} className="flex shrink-0 items-center" />}
      </div>
    </header>
  )
}

const Icon = ({ d, className = 'size-[1.375rem]' }: { d: string; className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={d} />
  </svg>
)

const CALENDAR =
  'M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v10a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5zM4 10h16M8.5 3v4M15.5 3v4'
const GEAR =
  'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'

/** The app's buttons, together in one capsule of glass at the right of the bar. */
function Toolbar() {
  return (
    <div className="glass flex shrink-0 items-center rounded-full" data-testid="toolbar">
      <Link
        href="/calendar"
        aria-label={t('Calendar.Heading')}
        title={t('Calendar.Heading')}
        data-testid="calendar-link"
        className={ICON_IN_GROUP}
      >
        <Icon d={CALENDAR} />
      </Link>
      <Link
        href="/settings"
        aria-label={t('Settings.Heading')}
        title={t('Settings.Heading')}
        data-testid="settings-link"
        className={ICON_IN_GROUP}
      >
        <Icon d={GEAR} />
      </Link>
    </div>
  )
}

/**
 * The page and its bar. under is set while a sheet covers the page: it then dims where it is, as
 * iOS 26 and 27 leave the page under a sheet, and takes no input.
 */
export function Layout({ children, under = false }: { children: ReactNode; under?: boolean }) {
  const [leading, setLeading] = useState<HTMLElement | null>(null)
  // The page's own buttons go at the right of the bar, before the app's (BarItem).
  const [pageTrailing, setPageTrailing] = useState<HTMLElement | null>(null)
  const slots = useMemo(() => ({ leading, trailing: pageTrailing }), [leading, pageTrailing])
  const bar = useRef<HTMLElement>(null)
  const main = useRef<HTMLElement>(null)
  const title = useInlineTitle('window', main, bar)
  return (
    <div className={`min-h-dvh bg-ground text-gray-900 dark:text-white ${under ? 'sheet-under' : ''}`} inert={under}>
      <NavBar
        ref={bar}
        title={title}
        className="app-navbar sticky top-0 z-20 pt-[env(safe-area-inset-top)]"
        leading={setLeading}
        trailing={
          <div className="flex shrink-0 items-center gap-2">
            <div ref={setPageTrailing} className="flex items-center" />
            <Toolbar />
          </div>
        }
      />
      <main ref={main} className="mx-auto max-w-2xl px-5 pt-1 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        <BarSlots.Provider value={slots}>{children}</BarSlots.Provider>
      </main>
    </div>
  )
}

/**
 * A page as an iOS sheet, risen over the page below: rounded at the top, with a grabber, a bar of
 * its own and its own scroll. Pulled down, it closes (useSheetDrag). pageKey is the page shown;
 * each page starts at the top.
 */
export function Sheet({ children, pageKey }: { children: ReactNode; pageKey: string }) {
  const { closeHref } = useContext(StackContext)
  const [leading, setLeading] = useState<HTMLElement | null>(null)
  const [trailing, setTrailing] = useState<HTMLElement | null>(null)
  const slots = useMemo(() => ({ leading, trailing }), [leading, trailing])
  const sheet = useRef<HTMLDivElement>(null)
  const bar = useRef<HTMLElement>(null)
  const page = useRef<HTMLDivElement>(null)
  const title = useInlineTitle(page, page, bar)
  const close = useCallback(() => navigate(closeHref), [closeHref])
  useSheetDrag(sheet, bar, page, close)

  return (
    <div
      ref={sheet}
      role="dialog"
      aria-modal="true"
      className="sheet fixed inset-x-0 bottom-0 z-30 flex flex-col overflow-hidden rounded-t-[2.375rem] bg-ground text-gray-900 shadow-[0_-4px_40px_rgb(0_0_0/0.2)] dark:text-white"
      data-testid="sheet"
    >
      <NavBar
        ref={bar}
        title={title}
        className="sheet-navbar absolute inset-x-0 top-0 z-20 touch-none pt-2"
        leading={setLeading}
        trailingSlot={setTrailing}
      >
        <div
          className="absolute top-1.5 left-1/2 h-[0.3125rem] w-9 -translate-x-1/2 rounded-full bg-label-3"
          aria-hidden="true"
        />
      </NavBar>
      <div key={pageKey} ref={page} className="sheet-page min-h-0 flex-1 overflow-y-auto overscroll-contain bg-ground">
        <div className="mx-auto max-w-2xl px-5 pt-[4.75rem] pb-[calc(2rem+env(safe-area-inset-bottom))]">
          <BarSlots.Provider value={slots}>{children}</BarSlots.Provider>
        </div>
      </div>
    </div>
  )
}

const CHEVRON = 'M15 5l-7 7 7 7'
const XMARK = 'M6.5 6.5l11 11M17.5 6.5l-11 11'

/**
 * The way back from a page, at the left of the bar above it: a chevron, as on iOS. Inside a sheet,
 * a way out of it is a cross at the bar's right that closes the sheet and leads back to the page below. label is the
 * name of where it leads, for screen readers and as a tooltip; "Alla pass" unless given.
 */
export function BackLink({ href, label, testId }: { href: string; label?: string; testId?: string }) {
  const slots = useContext(BarSlots)
  const stack = useContext(StackContext)
  const closes = stack.inSheet && !stack.isSheetUrl(href)
  const slot = closes ? slots.trailing : slots.leading
  const name = closes ? t('Common.Close') : (label ?? t('Workout.Back'))
  if (!slot) return null
  return createPortal(
    <Link href={closes ? stack.closeHref : href} data-testid={testId} title={name} className={GLASS_CIRCLE}>
      <Icon d={closes ? XMARK : CHEVRON} className={closes ? 'size-5' : 'size-6'} />
      <span className="sr-only">{name}</span>
    </Link>,
    slot,
  )
}

/**
 * A page's own button in the bar above it, where nothing else is: at the left of a sheet's first
 * page (its cross is at the right), or at the right of any other page, before the app's buttons.
 */
export function BarItem({ side = 'leading', children }: { side?: 'leading' | 'trailing'; children: ReactNode }) {
  const slot = useContext(BarSlots)[side]
  return slot ? createPortal(children, slot) : null
}
