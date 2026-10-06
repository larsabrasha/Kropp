import { useEffect, type RefObject } from 'react'

// Pulling a sheet down to close it, as on iOS: anywhere on it, by its bar always and by its page
// once that is scrolled to the top. The sheet follows the finger, and what is below it brightens
// as it goes (onPull). Let go, and the finger's speed at that moment decides: thrown or pulled far
// enough, the sheet carries on down at that speed and closes (dismiss, told it is already gone, so
// nothing animates the close a second time); else it springs back. Pulled up by its bar, it gives
// a little and no more, as iOS's sheets do at their top. A mouse drags it the same way. A pull may
// begin on a button or a row, as on iOS; it then does not count as a tap.
//
// Touch events, not pointer events: once the page could scroll, the browser takes a pointer for
// itself, while a touchmove can still be stopped from scrolling when it pulls the sheet instead.

/**
 * A spring back, as iOS settles a sheet: critically damped, sampled into CSS's linear() so the
 * compositor runs it. Duration and curve together; the start is steep, as a spring's is.
 */
const SPRING_MS = 480
const SPRING = `transform ${SPRING_MS}ms ${springEasing()}`

function springEasing(): string {
  // x(t) = 1 − (1 + ωt)·e^(−ωt), critically damped, settled at the end of SPRING_MS.
  const omega = 9
  const points = Array.from({ length: 24 }, (_, i) => {
    const t = i / 23
    const x = 1 - (1 + omega * t) * Math.exp(-omega * t)
    return (i === 23 ? 1 : x).toFixed(4)
  })
  return `linear(${points.join(', ')})`
}

/** How far back the speed is read at letting go: the last moment of the pull, not all of it. */
const SPEED_WINDOW_MS = 80
/** A throw at this speed closes the sheet however far it went, in px per ms. */
const THROW = 0.9
/** Where the sheet would come to rest, carried on at its speed for this long, decides otherwise. */
const PROJECT_MS = 200

interface Pull {
  y: number
  x: number
  /** Whether a pull down may move the sheet: from its bar, or with its page at the top. */
  canPull: boolean
  fromBar: boolean
  pulling: boolean
  dy: number
  /** The latest positions, to read the speed at letting go. */
  samples: { time: number; y: number }[]
}

/** iOS's give at an edge: it moves less the further it goes, and never past d. */
const rubberBand = (x: number, d: number) => (1 - 1 / ((x * 0.55) / d + 1)) * d

export function useSheetDrag(
  sheet: RefObject<HTMLElement | null>,
  bar: RefObject<HTMLElement | null>,
  page: RefObject<HTMLElement | null>,
  /** Closes the sheet; dragged when the pull has already taken it off the screen. */
  dismiss: (dragged: boolean) => void,
  /** Whether it may be pulled now: not while it shows as a popover (ModalSheet). */
  canDrag: () => boolean = () => true,
  /** How far it is pulled, 0 at rest to 1 gone, for what is below to follow. */
  onPull: (progress: number, animateMs?: number) => void = () => {},
) {
  useEffect(() => {
    const el = sheet.current
    if (!el) return
    let pull: Pull | null = null

    const place = (dy: number) => {
      el.style.transform = dy === 0 ? '' : `translateY(${dy}px)`
      onPull(Math.max(0, dy) / Math.max(el.offsetHeight, 1))
    }

    const start = (x: number, y: number, time: number, target: EventTarget | null) => {
      if (!canDrag()) {
        pull = null
        return
      }
      const fromBar = target instanceof Node && !!bar.current?.contains(target)
      const atTop = (page.current?.scrollTop ?? 0) <= 0
      pull = { x, y, canPull: fromBar || atTop, fromBar, pulling: false, dy: 0, samples: [{ time, y }] }
    }

    /** True while the move belongs to the sheet rather than to the page's scroll. */
    const move = (x: number, y: number, time: number): boolean => {
      if (!pull) return false
      const dy = y - pull.y
      const dx = x - pull.x
      if (!pull.pulling) {
        if (Math.abs(dy) < 6 && Math.abs(dx) < 6) return false
        // Down from the bar or the page's top; up only from the bar, where it can only give.
        const down = dy > 0 && pull.canPull
        const up = dy < 0 && pull.fromBar
        if (Math.abs(dx) > Math.abs(dy) || (!down && !up)) {
          pull = null
          return false
        }
        pull.pulling = true
        el.style.transition = 'none'
        el.getAnimations?.().forEach((a) => a.cancel())
      }
      pull.dy = dy
      pull.samples.push({ time, y })
      while (pull.samples.length > 2 && time - pull.samples[0]!.time > SPEED_WINDOW_MS) pull.samples.shift()
      place(dy >= 0 ? dy : -rubberBand(-dy, Math.max(el.offsetHeight, 1) * 0.1))
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
      const first = p.samples[0]!
      const last = p.samples.at(-1)!
      const speed = (last.y - first.y) / Math.max(time - first.time, 1)
      const height = el.offsetHeight
      const projected = p.dy + speed * PROJECT_MS
      if (p.dy > 0 && speed > -0.1 && (speed > THROW || projected > height * 0.5)) {
        // Carried on down at the speed it was let go, never slower than a brisk close.
        const rest = Math.max(height - p.dy, 1)
        const ms = Math.round(Math.min(Math.max(rest / Math.max(speed, 1.2), 140), 320))
        el.style.transition = `transform ${ms}ms cubic-bezier(0.2, 0.6, 0.35, 1)`
        el.style.transform = `translateY(${height + 40}px)`
        onPull(1, ms)
        setTimeout(() => dismiss(true), ms)
        return
      }
      el.style.transition = SPRING
      el.style.transform = ''
      onPull(0, SPRING_MS)
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
      if (t && move(t.clientX, t.clientY, e.timeStamp)) e.preventDefault()
    }
    const touchEnd = (e: TouchEvent) => end(e.timeStamp)

    const mouseDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return
      // Anywhere, buttons and rows too, as on iOS; only a text field keeps its own drag, to select.
      if (e.target instanceof Element && e.target.closest('input:not([type=date]), select, textarea')) return
      start(e.clientX, e.clientY, e.timeStamp, e.target)
      // No text selected on the way.
      e.preventDefault()
      const mouseMove = (m: PointerEvent) => move(m.clientX, m.clientY, m.timeStamp)
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
  }, [sheet, bar, page, dismiss, canDrag, onPull])
}
