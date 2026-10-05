import { useEffect, type RefObject } from 'react'

// Pulling a sheet down to close it, as on iOS: anywhere on it, by its bar always and by its page
// once that is scrolled to the top. The sheet follows the finger; let go far or fast enough and it
// closes (dismiss, which lowers it the rest of the way), else it springs back. A mouse drags it the
// same way. A pull may begin on a button or a row, as on iOS; it then does not count as a tap.
//
// Touch events, not pointer events: once the page could scroll, the browser takes a pointer for
// itself, while a touchmove can still be stopped from scrolling when it pulls the sheet instead.

const SPRING = 'transform 320ms cubic-bezier(0.32, 0.72, 0, 1)'

interface Pull {
  y: number
  x: number
  time: number
  /** Whether a pull down may move the sheet: from its bar, or with its page at the top. */
  canPull: boolean
  pulling: boolean
  dy: number
}

export function useSheetDrag(
  sheet: RefObject<HTMLElement | null>,
  bar: RefObject<HTMLElement | null>,
  page: RefObject<HTMLElement | null>,
  dismiss: () => void,
) {
  useEffect(() => {
    const el = sheet.current
    if (!el) return
    let pull: Pull | null = null

    const start = (x: number, y: number, time: number, target: EventTarget | null) => {
      const fromBar = target instanceof Node && !!bar.current?.contains(target)
      const atTop = (page.current?.scrollTop ?? 0) <= 0
      pull = { x, y, time, canPull: fromBar || atTop, pulling: false, dy: 0 }
    }

    /** True while the move belongs to the sheet rather than to the page's scroll. */
    const move = (x: number, y: number): boolean => {
      if (!pull) return false
      const dy = y - pull.y
      const dx = x - pull.x
      if (!pull.pulling) {
        if (Math.abs(dy) < 6 && Math.abs(dx) < 6) return false
        if (!pull.canPull || dy <= 0 || Math.abs(dx) > dy) {
          pull = null
          return false
        }
        pull.pulling = true
        el.style.transition = 'none'
      }
      pull.dy = Math.max(0, dy)
      el.style.transform = `translateY(${pull.dy}px)`
      return true
    }

    // A pull that began on a button is not a tap on it: the click that ends it is swallowed.
    const swallowClick = () => {
      const stop = (c: MouseEvent) => {
        c.stopPropagation()
        c.preventDefault()
      }
      window.addEventListener('click', stop, { capture: true, once: true })
      setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 0)
    }

    const end = (time: number) => {
      const p = pull
      pull = null
      if (!p?.pulling) return
      swallowClick()
      const speed = p.dy / Math.max(time - p.time, 1)
      if (p.dy > el.offsetHeight * 0.3 || speed > 0.5) {
        // Lowered the rest of the way by the sheet's closing transition, from where it is now.
        dismiss()
        return
      }
      el.style.transition = SPRING
      el.style.transform = ''
    }

    const touchStart = (e: TouchEvent) => {
      const t = e.touches[0]
      if (e.touches.length !== 1 || !t) {
        pull = null
        return
      }
      start(t.clientX, t.clientY, e.timeStamp, e.target)
    }
    const touchMove = (e: TouchEvent) => {
      const t = e.touches[0]
      if (t && move(t.clientX, t.clientY)) e.preventDefault()
    }
    const touchEnd = (e: TouchEvent) => end(e.timeStamp)

    const mouseDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return
      // Anywhere, buttons and rows too, as on iOS; only a text field keeps its own drag, to select.
      if (e.target instanceof Element && e.target.closest('input:not([type=date]), select, textarea')) return
      start(e.clientX, e.clientY, e.timeStamp, e.target)
      // No text selected on the way.
      e.preventDefault()
      const mouseMove = (m: PointerEvent) => move(m.clientX, m.clientY)
      const mouseUp = (u: PointerEvent) => {
        window.removeEventListener('pointermove', mouseMove)
        window.removeEventListener('pointerup', mouseUp)
        end(u.timeStamp)
      }
      window.addEventListener('pointermove', mouseMove)
      window.addEventListener('pointerup', mouseUp)
    }

    el.addEventListener('touchstart', touchStart, { passive: true })
    el.addEventListener('touchmove', touchMove, { passive: false })
    el.addEventListener('touchend', touchEnd)
    el.addEventListener('touchcancel', touchEnd)
    el.addEventListener('pointerdown', mouseDown)
    return () => {
      el.removeEventListener('touchstart', touchStart)
      el.removeEventListener('touchmove', touchMove)
      el.removeEventListener('touchend', touchEnd)
      el.removeEventListener('touchcancel', touchEnd)
      el.removeEventListener('pointerdown', mouseDown)
    }
  }, [sheet, bar, page, dismiss])
}
