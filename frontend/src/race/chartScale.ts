export function paddedChartRange(min: number, max: number) {
  // A single distinct value still needs a nonzero range around it.
  const span = max - min || Math.abs(max) || 1
  const padding = span * 0.05
  return { bottom: min - padding, top: max + padding }
}
