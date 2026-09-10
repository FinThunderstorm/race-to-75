import { useLayoutEffect, useRef, useState } from 'react'

type Coordinates = Record<string, number>

export function useAnimatedCoordinates(target: Coordinates, mode: string) {
  const [coordinates, setCoordinates] = useState(target)
  const displayed = useRef(target)
  const previousMode = useRef(mode)
  const animating = useRef(false)

  useLayoutEffect(() => {
    const from = displayed.current
    const animate =
      (previousMode.current !== mode || animating.current) &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    previousMode.current = mode
    const update = (next: Coordinates) => {
      displayed.current = next
      setCoordinates(next)
    }
    if (!animate) {
      animating.current = false
      update(target)
      return
    }

    // Interpolate screen positions, so each racer's height conversion and the new
    // axis range move together. An interrupted transition starts at its current frame.
    animating.current = true
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 600)
      const eased = progress * progress * (3 - 2 * progress)
      update(
        progress === 1
          ? target
          : Object.fromEntries(
              Object.entries(target).map(([key, value]) => [
                key,
                (from[key] ?? value) + (value - (from[key] ?? value)) * eased
              ])
            )
      )
      if (progress < 1) {
        frame = requestAnimationFrame(tick)
      } else {
        animating.current = false
      }
    }
    tick(start)
    return () => cancelAnimationFrame(frame)
  }, [target, mode])

  return coordinates
}
