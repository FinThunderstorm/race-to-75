import { chartWindow, prepareMeasurementHistory, type RaceParticipant } from './prepareRace'
import { bicepsIndex, bmiIndex, prepareScoreHistory, type ScoreComponents } from './raceIndices'

export type RaceMode = 'classic' | 'bmi' | 'biceps' | 'score'
export const raceModeOrder: RaceMode[] = ['classic', 'bmi', 'biceps', 'score']
export function parseRaceMode(value: string | null): RaceMode {
  return raceModeOrder.find((mode) => mode === value) ?? 'classic'
}

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
    unit: 'pts',
    metric: 'BMI index',
    reference: 100,
    title: 'Group BMI index history',
    referenceLabel: '100 PTS — BMI 18.5–25'
  },
  biceps: {
    label: 'Biceps',
    unit: 'pts',
    metric: 'biceps index',
    reference: null,
    title: 'Group biceps index history',
    referenceLabel: null
  },
  score: {
    label: 'Score',
    unit: 'pts',
    metric: 'race score',
    reference: null,
    title: 'Group race score history',
    referenceLabel: null
  }
} as const

export type RaceViewParticipant = Omit<RaceParticipant, 'points' | 'latest' | 'startWeight'> & {
  points: { date: string; value: number; period: 'week' | 'day' }[]
  latest: { date: string; value: number } | null
  startValue: number | null
  needsHeight: boolean
  rawLatest: number | null
  scoreComponents: ScoreComponents | null
}

export function createRaceView(
  participants: RaceParticipant[],
  mode: RaceMode,
  now = new Date()
): RaceViewParticipant[] {
  return participants.map(({ points, latest, startWeight, ...person }) => {
    const height = person.heightCm
    const needsHeight =
      mode !== 'classic' && (!height || !Number.isFinite(height) || height < 50 || height > 300)
    const base = {
      ...person,
      needsHeight,
      rawLatest: null,
      scoreComponents: null,
      points: [],
      latest: null,
      startValue: null,
      change: 0,
      streak: 0,
      personalLow: false
    }
    if (needsHeight) {
      return base
    }
    if (mode === 'score') {
      const history = prepareScoreHistory({ ...person, points, latest, startWeight }, height!, now)
      return {
        ...base,
        points: history.points,
        latest: history.latest,
        startValue: history.startValue,
        change: history.change,
        scoreComponents: history.scoreComponents
      }
    }
    if (mode === 'biceps') {
      const history = prepareMeasurementHistory(
        (person.bicepsMeasurements ?? []).map(({ measuredAt, circumferenceCm }) => ({
          measuredAt,
          value: circumferenceCm
        })),
        now
      )
      return {
        ...base,
        points: history.points.map((point) => ({
          ...point,
          value: bicepsIndex(point.value, height!)
        })),
        latest: history.latest && {
          ...history.latest,
          value: bicepsIndex(history.latest.value, height!)
        },
        startValue: history.startValue === null ? null : bicepsIndex(history.startValue, height!),
        change: bicepsIndex(history.change, height!),
        rawLatest: history.latest?.value ?? null
      }
    }
    const divisor = mode === 'bmi' ? (height! / 100) ** 2 : 1
    const convert = (weight: number) => (mode === 'bmi' ? bmiIndex(weight / divisor) : weight)
    const previous = person.dailyWeights.at(-2)
    return {
      ...base,
      points: points.map(({ weight, ...point }) => ({ ...point, value: convert(weight) })),
      latest: latest && { date: latest.date, value: convert(latest.weight) },
      startValue: startWeight === null ? null : convert(startWeight),
      change: latest && previous ? convert(latest.weight) - convert(previous.weight) : 0,
      rawLatest: latest ? latest.weight / divisor : null,
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
  let minValue: number = reference ?? Number.POSITIVE_INFINITY
  let maxValue: number = reference ?? Number.NEGATIVE_INFINITY
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
  if (!Number.isFinite(minValue)) {
    minValue = 15
    maxValue = 25
  }
  const bottom = mode === 'classic' ? minValue - 2 : Math.max(0, minValue - 1)
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
