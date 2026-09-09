import { chartWindow, type RaceParticipant } from './prepareRace'

export type RaceMode = 'classic' | 'bmi'

export const raceModes = {
  classic: {
    label: 'Classic',
    unit: 'kg',
    metric: 'weight',
    reference: 75,
    title: 'The race to 75 kilograms',
    referenceLabel: '75.0 KG — GOAL LINE'
  },
  bmi: {
    label: 'BMI',
    unit: 'BMI',
    metric: 'BMI',
    reference: 25,
    title: 'Group BMI history',
    referenceLabel: '25.0 BMI — REFERENCE'
  }
} as const

export type RaceViewParticipant = Omit<RaceParticipant, 'points' | 'latest' | 'startWeight'> & {
  points: { date: string; value: number; period: 'week' | 'day' }[]
  latest: { date: string; value: number } | null
  startValue: number | null
  needsHeight: boolean
}

export function createRaceView(
  participants: RaceParticipant[],
  mode: RaceMode
): RaceViewParticipant[] {
  return participants.map(({ points, latest, startWeight, ...person }) => {
    const height = person.heightCm
    const needsHeight =
      mode === 'bmi' && (!height || !Number.isFinite(height) || height < 50 || height > 300)
    const divisor = mode === 'bmi' && !needsHeight ? (height! / 100) ** 2 : 1
    return {
      ...person,
      needsHeight,
      points: needsHeight
        ? []
        : points.map(({ weight, ...point }) => ({ ...point, value: weight / divisor })),
      latest: needsHeight || !latest ? null : { date: latest.date, value: latest.weight / divisor },
      startValue: needsHeight || startWeight === null ? null : startWeight / divisor,
      change: needsHeight ? 0 : person.change / divisor,
      streak: mode === 'classic' ? person.streak : 0,
      personalLow: mode === 'classic' && person.personalLow
    }
  })
}

export function raceViewBounds(
  participants: RaceViewParticipant[],
  mode: RaceMode,
  now = new Date()
) {
  const reference = raceModes[mode].reference
  let minValue: number = reference
  let maxValue: number = reference
  for (const person of participants) {
    for (const point of person.points) {
      minValue = Math.min(minValue, point.value)
      maxValue = Math.max(maxValue, point.value)
    }
    if (person.points.length && person.latest) {
      minValue = Math.min(minValue, person.latest.value)
      maxValue = Math.max(maxValue, person.latest.value)
    }
  }
  const bottom = mode === 'classic' ? reference - 2 : Math.max(0, minValue - 1)
  const top = maxValue + 0.5
  const targetStep = (top - bottom) / 6
  const magnitude = 10 ** Math.floor(Math.log10(targetStep))
  const step = [1, 2, 5, 10].find((value) => value * magnitude >= targetStep)! * magnitude
  const ticks = []
  for (let tick = Math.ceil(bottom / step) * step; tick < top; tick += step) {
    const value = Number(tick.toFixed(6))
    if (value !== reference) {
      ticks.push(value)
    }
  }
  return { bottom, top, ticks, ...chartWindow(now) }
}
