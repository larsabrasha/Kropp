import { useCallback, useEffect, useRef } from 'react'
import { flushSync } from 'react-dom'

/**
 * A ref for an input that calls onCommit with its value on the DOM's change event: when the user
 * leaves the field or presses Enter, and for a number field also on its arrows. Not on every key,
 * as React's onChange would, so a half-typed value is never saved. Pair it with defaultValue and a
 * key on the value, so a value changed from outside resets the field.
 *
 * The change is rendered at once (flushSync). Leaving a field by tapping a button fires change
 * just before the button's click; without it, the click's handler could still see the page from
 * before the change and save over it.
 */
export function useCommit<E extends HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
  onCommit: (value: string, element: E) => void,
) {
  const latest = useRef(onCommit)
  useEffect(() => {
    latest.current = onCommit
  })
  return useCallback((element: E | null) => {
    if (!element) return
    const changed = () => flushSync(() => latest.current(element.value, element))
    element.addEventListener('change', changed)
    return () => element.removeEventListener('change', changed)
  }, [])
}
