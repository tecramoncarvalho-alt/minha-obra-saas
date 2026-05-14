import { useEffect } from 'react'

const SPEED_PX_PER_SEC = 40
const PAUSE_BOTTOM_MS = 4000
const RESUME_AFTER_MANUAL_MS = 8000

export function useAutoScroll(ref: { current: HTMLElement | null }) {
  useEffect(() => {
    const el = ref.current
    if (!el) return

    let animId: number
    let manualTimeout: ReturnType<typeof setTimeout> | null = null
    let paused = false
    let atBottom = false
    let bottomStart = 0
    let lastTime: number | null = null

    const tick = (now: number) => {
      if (paused) {
        lastTime = null
        animId = requestAnimationFrame(tick)
        return
      }

      const maxScroll = el.scrollHeight - el.clientHeight

      if (maxScroll <= 0) {
        animId = requestAnimationFrame(tick)
        return
      }

      if (atBottom) {
        if (now - bottomStart >= PAUSE_BOTTOM_MS) {
          el.scrollTop = 0
          atBottom = false
          lastTime = null
        }
        animId = requestAnimationFrame(tick)
        return
      }

      if (lastTime !== null) {
        el.scrollTop += (SPEED_PX_PER_SEC * (now - lastTime)) / 1000
      }
      lastTime = now

      if (el.scrollTop >= maxScroll - 1) {
        el.scrollTop = maxScroll
        atBottom = true
        bottomStart = now
        lastTime = null
      }

      animId = requestAnimationFrame(tick)
    }

    const onManual = () => {
      paused = true
      lastTime = null
      if (manualTimeout) clearTimeout(manualTimeout)
      manualTimeout = setTimeout(() => {
        paused = false
        atBottom = false
      }, RESUME_AFTER_MANUAL_MS)
    }

    el.addEventListener('wheel', onManual, { passive: true })
    el.addEventListener('touchstart', onManual, { passive: true })

    animId = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(animId)
      if (manualTimeout) clearTimeout(manualTimeout)
      el.removeEventListener('wheel', onManual)
      el.removeEventListener('touchstart', onManual)
    }
  }, [ref])
}
