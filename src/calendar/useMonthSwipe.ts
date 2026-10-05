import { useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react'
import { flushSync } from 'react-dom'

// Swiping between months, as in iOS's calendar: the month follows the finger sideways, with the
// next one beside it (the page draws the months on either side), and let go far or fast enough the
// next slides all the way in and becomes the month; else it springs back. Vertical moves are left
// to the page's scroll (touch-action: pan-y on the element). Past the first or last month the app
// accepts, the month only gives a little and springs back.

const DURATION = 280
const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'

type Direction = 1 | -1

interface Drag {
  x: number
  y: number
  time: number
  width: number
  pointer: number
  horizontal?: boolean
}

/**
 * The props for the element that swipes. go shows the next month (1) or the previous one (-1);
 * can tells whether there is one.
 */
export function useMonthSwipe(go: (direction: Direction) => void, can: (direction: Direction) => boolean) {
  const [offset, setOffset] = useState(0)
  const [animating, setAnimating] = useState(false)
  const drag = useRef<Drag | null>(null)
  // A swipe ends in a click on the day under the finger; it must not choose that day.
  const swiped = useRef(false)
  const busy = useRef(false)

  const slide = (to: number, then: () => void) => {
    setAnimating(true)
    setOffset(to)
    setTimeout(then, DURATION)
  }

  const springBack = () => slide(0, () => setAnimating(false))

  const turn = (direction: Direction, width: number) => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setOffset(0)
      go(direction)
      return
    }
    busy.current = true
    slide(-direction * width, () => {
      // In one render: the next month becomes the month on screen just as it moves back to the
      // middle, so nothing jumps.
      flushSync(() => {
        go(direction)
        setAnimating(false)
        setOffset(0)
      })
      busy.current = false
    })
  }

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (busy.current || (e.pointerType === 'mouse' && e.button !== 0)) return
    swiped.current = false
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      time: e.timeStamp,
      width: e.currentTarget.offsetWidth,
      pointer: e.pointerId,
    }
  }

  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current
    if (!d || d.pointer !== e.pointerId) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (d.horizontal === undefined) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      d.horizontal = Math.abs(dx) > Math.abs(dy)
      if (!d.horizontal) {
        drag.current = null
        return
      }
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        // Without capture the swipe still works while the finger stays on the month.
      }
    }
    swiped.current = true
    setOffset(can(dx < 0 ? 1 : -1) ? dx : dx / 3)
  }

  const onPointerUp = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current
    drag.current = null
    if (!d?.horizontal) return
    const dx = e.clientX - d.x
    const speed = Math.abs(dx) / Math.max(e.timeStamp - d.time, 1)
    const direction: Direction = dx < 0 ? 1 : -1
    if (can(direction) && (Math.abs(dx) > d.width / 4 || speed > 0.4)) turn(direction, d.width)
    else springBack()
  }

  const onPointerCancel = () => {
    if (!drag.current?.horizontal) return
    drag.current = null
    springBack()
  }

  const onClickCapture = (e: MouseEvent<HTMLElement>) => {
    if (!swiped.current) return
    swiped.current = false
    e.stopPropagation()
    e.preventDefault()
  }

  const style: CSSProperties = {
    transform: offset === 0 ? undefined : `translateX(${offset}px)`,
    transition: animating ? `transform ${DURATION}ms ${EASE}` : undefined,
  }

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClickCapture, style }
}
