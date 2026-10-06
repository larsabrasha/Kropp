import { useEffect, useRef, useState, type ReactNode } from 'react'

// A row of a list that slides aside to show its actions, as iOS 26's lists do: pulled to the left,
// the actions appear at its right as capsules with a symbol, inset from the row's edges on the
// list's own ground, Radera red. Let go past half of them and they stay open; a tap on the row, a
// pull back, or opening another row closes them. Pulled on, past the actions the row moves slower,
// and at half its width the outermost action takes the whole gap with a little bounce, its symbol
// by the row: let go there and that action is done, as a full swipe does on iOS (a phone would
// also tick; a web page may not). Pulled back before letting go, nothing is done. A shortcut
// only: every action is also on the page the row leads to, as nothing may be found by a gesture
// alone. A mouse drags the same way. A pull that moved the row is never a tap on it.

export interface SwipeAction {
  /** Its name, for screen readers and as a tooltip; the capsule shows the symbol. */
  label: string
  icon: ReactNode
  onAction: () => void
  /** Red, as iOS draws deleting; grey otherwise. */
  destructive?: boolean
  testId?: string
}

/** Each capsule's room, and the room at the row's right edge, in px. */
const ACTION_WIDTH = 64
const EDGE = 8
const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'
const SPRING = `transform 300ms ${EASE}`
/** How far, as a share of the row's width, a pull must go for the full swipe. */
const FULL_SWIPE = 0.5
/** How much of a pull past the actions moves the row: less, so it feels held back. */
const PAST = 0.6

// The row open now: opening another closes it, as iOS keeps one open at a time.
let closeOpen: (() => void) | undefined
const forgetOpen = () => {
  closeOpen = undefined
}

export function SwipeActions({
  actions,
  children,
  testId,
}: {
  actions: SwipeAction[]
  children: ReactNode
  testId?: string
}) {
  const row = useRef<HTMLDivElement>(null)
  // Hidden until the row moves, so nothing of them shows at its edges while it rests.
  const behind = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  // Closes the row from an action's tap, as a pull back would, capsules and all.
  const closeRow = useRef<() => void>(undefined)
  // The actions as last rendered, for the full swipe to do the outermost one.
  const latest = useRef(actions)
  useEffect(() => {
    latest.current = actions
  })
  const width = actions.length * ACTION_WIDTH + EDGE

  useEffect(() => {
    const el = row.current
    if (!el) return
    let start: { x: number; y: number; from: number } | undefined
    let moving = false
    let offset = 0
    let rowWidth = 0
    // Past the full swipe's mark: let go, and the outermost action is done.
    let armed = false
    const capsules = () => [...(behind.current?.children ?? [])] as HTMLElement[]
    const grow = `flex-grow 220ms ${EASE}, margin 220ms ${EASE}, padding 220ms ${EASE}`

    const place = (x: number, animate: boolean) => {
      offset = x
      el.style.transition = animate ? SPRING : 'none'
      el.style.transform = x === 0 ? '' : `translateX(${x}px)`
      // The capsules follow the finger, as iOS 26 grows them: they fill the gap the row leaves,
      // narrow and faint at first, full at their room, and wider past it.
      const back = behind.current
      if (!back) return
      if (x !== 0) back.style.visibility = 'visible'
      back.style.transition = animate ? SPRING.replace('transform', 'width') : 'none'
      back.style.width = `${Math.max(0, -x)}px`
      const all = capsules()
      all.forEach((capsule, i) => {
        capsule.style.transition = animate ? `opacity 300ms ease, ${grow}` : grow
        const hidden = armed && i < all.length - 1
        capsule.style.opacity = hidden ? '0' : String(Math.min(1, Math.max(0, -x / width)))
      })
    }
    /** Into or out of the full swipe: the outermost capsule takes the gap, or gives it back. */
    const arm = (on: boolean) => {
      if (on === armed) return
      armed = on
      const all = capsules()
      all.forEach((capsule, i) => {
        if (i < all.length - 1) {
          capsule.style.flexGrow = on ? '0' : ''
          capsule.style.marginLeft = on ? '0' : ''
          capsule.style.opacity = on ? '0' : '1'
          return
        }
        capsule.style.justifyContent = on ? 'flex-start' : ''
        capsule.style.paddingLeft = on ? '1.25rem' : ''
        const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
        if (on && !still && typeof capsule.animate === 'function')
          capsule.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }], {
            duration: 240,
            easing: 'ease-out',
          })
      })
    }
    // Back at rest, the actions hide again.
    const rest = () => {
      if (offset === 0 && behind.current) behind.current.style.visibility = 'hidden'
    }
    const close = () => {
      place(0, true)
      setOpen(false)
      if (closeOpen === close) closeOpen = undefined
    }
    closeRow.current = close
    const begin = (x: number, y: number) => {
      start = { x, y, from: offset }
      moving = false
      rowWidth = el.offsetWidth
    }
    /** True while the move is the row's rather than the page's scroll. */
    const move = (x: number, y: number): boolean => {
      if (!start) return false
      const dx = x - start.x
      const dy = y - start.y
      if (!moving) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return false
        if (Math.abs(dy) > Math.abs(dx) || (start.from === 0 && dx > 0)) {
          start = undefined
          return false
        }
        moving = true
        if (closeOpen && closeOpen !== close) closeOpen()
      }
      // Past the actions it moves slower, and never past its own width.
      const next = start.from + dx
      const to = Math.max(-rowWidth, next < -width ? -width + (next + width) * PAST : Math.min(0, next))
      arm(rowWidth > 0 && -to >= rowWidth * FULL_SWIPE)
      place(to, false)
      return true
    }
    const end = () => {
      const was = moving
      start = undefined
      moving = false
      if (!was) return
      // A pull is no keyboard's: the row it moved shows no focus ring for it.
      if (document.activeElement instanceof HTMLElement && el.contains(document.activeElement))
        document.activeElement.blur()
      // The click that ends a pull is not a tap on the row.
      const stop = (c: MouseEvent) => {
        c.stopPropagation()
        c.preventDefault()
      }
      window.addEventListener('click', stop, { capture: true, once: true })
      setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 0)
      if (armed) {
        // Let go in the full swipe: the row slides back and the outermost action is done.
        arm(false)
        close()
        latest.current.at(-1)?.onAction()
        return
      }
      if (offset < -width / 2) {
        place(-width, true)
        setOpen(true)
        closeOpen = close
      } else close()
    }

    const touchStart = (e: TouchEvent) => {
      const t = e.touches[0]
      if (e.touches.length === 1 && t) begin(t.clientX, t.clientY)
    }
    const touchMove = (e: TouchEvent) => {
      const t = e.touches[0]
      if (t && move(t.clientX, t.clientY)) e.preventDefault()
    }
    const mouseDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return
      begin(e.clientX, e.clientY)
      const mouseMove = (m: PointerEvent) => move(m.clientX, m.clientY)
      const mouseUp = () => {
        window.removeEventListener('pointermove', mouseMove)
        window.removeEventListener('pointerup', mouseUp)
        end()
      }
      window.addEventListener('pointermove', mouseMove)
      window.addEventListener('pointerup', mouseUp)
    }
    // Open, a tap on the row closes it rather than following it.
    const tapWhileOpen = (e: MouseEvent) => {
      if (offset === 0) return
      e.preventDefault()
      e.stopPropagation()
      close()
    }

    el.addEventListener('touchstart', touchStart, { passive: true })
    el.addEventListener('touchmove', touchMove, { passive: false })
    el.addEventListener('touchend', end)
    el.addEventListener('touchcancel', end)
    el.addEventListener('pointerdown', mouseDown)
    el.addEventListener('click', tapWhileOpen, { capture: true })
    el.addEventListener('transitionend', rest)
    return () => {
      el.removeEventListener('transitionend', rest)
      el.removeEventListener('touchstart', touchStart)
      el.removeEventListener('touchmove', touchMove)
      el.removeEventListener('touchend', end)
      el.removeEventListener('touchcancel', end)
      el.removeEventListener('pointerdown', mouseDown)
      el.removeEventListener('click', tapWhileOpen, { capture: true })
      if (closeOpen === close) closeOpen = undefined
    }
  }, [width])

  const shut = () => {
    closeRow.current?.()
    forgetOpen()
  }

  return (
    <div className="relative overflow-hidden" data-testid={testId}>
      {/* Behind the row, at its right; reachable only while shown. */}
      <div
        ref={behind}
        className="absolute inset-y-0 right-0 flex items-stretch overflow-hidden bg-cell py-1.5 pr-2"
        style={{ width: 0, visibility: 'hidden' }}
        aria-hidden={!open}
      >
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            tabIndex={open ? 0 : -1}
            onClick={() => {
              shut()
              action.onAction()
            }}
            aria-label={action.label}
            title={action.label}
            data-testid={action.testId}
            className={`ml-2 flex min-w-0 flex-1 items-center justify-center overflow-hidden rounded-full text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${
              action.destructive ? 'bg-red-600 dark:bg-red-500' : 'bg-gray-500 dark:bg-gray-500'
            }`}
          >
            {action.icon}
          </button>
        ))}
      </div>
      <div ref={row} className="relative touch-pan-y bg-cell">
        {children}
      </div>
    </div>
  )
}
