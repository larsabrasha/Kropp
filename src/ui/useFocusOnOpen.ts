import { useEffect, type RefObject } from 'react'

/**
 * Focuses a field in a sheet as the sheet opens, with the keyboard up as it rises, as iOS does.
 * iOS opens the keyboard only for a focus during a tap, and moves the page so the field shows where
 * it is at that moment: still under the screen, as the sheet has only begun to rise, so once it is
 * up the field is far above the screen. So a stand-in at the top of the screen takes the focus at
 * once, and hands it to the field when the sheet is in place; a focus moved from one field to
 * another keeps the keyboard.
 */
export function useFocusOnOpen(field: RefObject<HTMLElement | null>, enabled = true) {
  useEffect(() => {
    const input = field.current
    if (!enabled || !input) return
    const rising = input.closest<HTMLElement>('[role=dialog]')?.getAnimations?.() ?? []
    if (rising.length === 0) {
      input.focus({ preventScroll: true })
      return
    }
    const standIn = document.createElement('input')
    standIn.setAttribute('aria-hidden', 'true')
    standIn.tabIndex = -1
    standIn.style.cssText =
      'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;border:0;padding:0;pointer-events:none'
    document.body.append(standIn)
    standIn.focus({ preventScroll: true })
    let done = false
    const handOver = () => {
      if (done) return
      done = true
      if (document.activeElement === standIn) input.focus({ preventScroll: true })
      standIn.remove()
    }
    void Promise.allSettled(rising.map((a) => a.finished)).then(handOver)
    return handOver
  }, [field, enabled])
}
