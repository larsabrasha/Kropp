import { useEffect, useState } from 'react'

/** How long a control takes to fade out (index.css, fade-out). */
export const FADE_OUT_MS = 200

/**
 * Whether something shown and hidden is still on screen: it appears at once, and stays for its
 * fade out once hidden, as iOS fades a bar's button in and out. leaving is that last part, for the
 * fade's class and to take it out of reach. With reduced motion it goes at once.
 */
export function usePresence(show: boolean, ms = FADE_OUT_MS) {
  const [present, setPresent] = useState(show)
  if (show && !present) setPresent(true)
  useEffect(() => {
    if (show || !present) return
    const reduce =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const id = setTimeout(() => setPresent(false), reduce ? 0 : ms)
    return () => clearTimeout(id)
  }, [show, present, ms])
  return { present, leaving: present && !show }
}
